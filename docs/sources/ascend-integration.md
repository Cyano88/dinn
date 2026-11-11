> For the complete documentation index, see [llms.txt](https://ascendlaunch.gitbook.io/docs/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://ascendlaunch.gitbook.io/docs/developers/integration-guide.md).

# Integration guide

This guide covers Elysium mainnet, chain 99901. Addresses are on [Mainnet contracts](https://ascendlaunch.gitbook.io/docs/developers/mainnet-contracts). Signatures are on [ABIs and events](https://ascendlaunch.gitbook.io/docs/developers/abis-and-events).

## Read a launch pool

Each launch pool is a Uniswap v4 pool with this key:

| Field                    | Value                                                       |
| ------------------------ | ----------------------------------------------------------- |
| `currency0`, `currency1` | The coin and its pair asset, lower address first            |
| `fee`                    | `0x800000`, the dynamic-fee flag                            |
| `tickSpacing`            | 200                                                         |
| `hooks`                  | The launchpad, `0xe0dEF4221b9840a610D4e7d55812a79A6431a8eC` |

The pool ID is `keccak256(abi.encode(poolKey))`.

| To read                                    | Call                                                     |
| ------------------------------------------ | -------------------------------------------------------- |
| The pool's fee, in pips (1,000,000 = 100%) | `currentFee(poolId)` on the launchpad                    |
| Price and tick                             | `getSlot0(poolId)` on StateView                          |
| When it launched                           | `poolLaunchedAt(poolId)` on the launchpad                |
| Whether the coin is `currency0`            | `poolTokenIs0(poolId)` on the launchpad                  |
| Its escrow                                 | `escrowOf(poolId)` on the EscrowFactory                  |
| The rules it launched with                 | `EscrowLaunched.ruleSet`, then `rules()` on that RuleSet |
| A pair asset's settings                    | `quoteConfig(asset)` on the launchpad                    |
| Whether launches are open                  | `paused()` on the launchpad                              |

Each pool's fee is set at launch and never changes. The creator picks 1% to 10%. An approved builder may add up to 1% on top. `currentFee` returns the whole fee. A standard launch mints 1,000,000,000 coins with 18 decimals.

The pool's stored LP fee is 0. `getSlot0` and the PoolManager's `Swap` event both report 0. The hook takes the fee through its swap return deltas.

Find pools from the launchpad's `Launched` events, or from the PoolManager's `Initialize` events whose `hooks` is the launchpad. The hook refuses every other initialize, every liquidity add and every donation. The launch position is the pool's whole book.

## Launch a coin

Every launch goes through the EscrowFactory. Each pool's creator role is its own new CreatorEscrow.

```solidity
EscrowFactory.launchChecked(LaunchParams p, Route r, address expectedRuleSet, int24 expectedStartTick)
  returns (address token, bytes32 poolId, address escrow)
```

`launchChecked` reverts if the RuleSet or the pair asset's start tick changed after you read them. `launch(p, r)` is the same call without that check.

| `LaunchParams` field | Value                                                                               |
| -------------------- | ----------------------------------------------------------------------------------- |
| `name`               | The coin's name, 1 to 40 characters                                                 |
| `symbol`             | The ticker, as typed. Any characters except control characters                      |
| `quote`              | The pair asset: USDC, WHYPE or KNTQ                                                 |
| `devBuyQuote`        | The pair asset to spend on the dev buy, in base units. 0 for none                   |
| `minDevOut`          | The fewest coins the dev buy may return                                             |
| `salt`               | A fresh random `bytes32`. A salt already used with the same name and symbol reverts |
| `creator`            | Always the zero address. The factory makes the escrow the creator                   |
| `fee`                | The creator's fee in pips, 10,000 to 100,000                                        |
| `builderFee`         | The builder's fee in pips, up to the builder's cap. 0 without a builder             |

| `Route` field | Value                                        |
| ------------- | -------------------------------------------- |
| `recipient`   | Who the escrow pays                          |
| `dev`         | Who receives the dev buy                     |
| `builder`     | The approved builder, or the zero address    |
| `cto`         | Whether the pool accepts community takeovers |

The factory takes no value. The dev buy is an ERC-20 `transferFrom` from the caller. Approve the factory for `devBuyQuote` of the pair asset first. For a HYPE pair, wrap HYPE into WHYPE before the approval. The factory refunds what the dev buy does not spend in the same call. The dev buy pays no fee.

`predict(payer, p, r)` returns the escrow and coin addresses before you send.

Holder Rewards and Buyback coins launch through the seat factory: `SeatFactoryV5.launch(p, seatConfig, seatSalt, builder)` or `launchChecked(...)`. It deploys the seat and launches through the EscrowFactory in one call. Approve the seat factory for the dev buy.

After the receipt, read `Launched` from the launchpad and `EscrowLaunched` from the factory. Together they name the coin, the pool, the escrow, the recipient and the RuleSet.

```js
import { createPublicClient, http, parseAbi, zeroAddress, toHex } from 'viem';

const rpc = process.env.ELYSIUM_RPC_URL; // your own Elysium provider
const client = createPublicClient({ transport: http(rpc) });
const factory = '0x63f6a8A8d0257c0363251a50cdE8A8b1046e4d19';
const launchpad = '0xe0dEF4221b9840a610D4e7d55812a79A6431a8eC';
const USDC = '0xb47c4C8F73F009CC0C0d3f92B388d13E293F0B65';

const abi = parseAbi([
  'function ruleSet() view returns (address)',
  'function quoteConfig(address quote) view returns ((bool allowed, int24 startTick, uint128 maxClip))',
  'function launchChecked((string name, string symbol, address quote, uint256 devBuyQuote, uint256 minDevOut, bytes32 salt, address creator, uint24 fee, uint24 builderFee) p, (address recipient, address dev, address builder, bool cto) r, address expectedRuleSet, int24 expectedStartTick) returns (address token, bytes32 poolId, address escrow)',
]);

const ruleSet = await client.readContract({ address: factory, abi, functionName: 'ruleSet' });
const { startTick } = await client.readContract({ address: launchpad, abi, functionName: 'quoteConfig', args: [USDC] });

const p = {
  name: 'Example', symbol: 'EXMPL', quote: USDC,
  devBuyQuote: 0n, minDevOut: 0n,
  salt: toHex(crypto.getRandomValues(new Uint8Array(32))),
  creator: zeroAddress, fee: 20_000, builderFee: 0, // 2%
};
const r = { recipient: account, dev: account, builder: zeroAddress, cto: true };

// Simulate first. Send the same request with a wallet client after it passes.
const { result, request } = await client.simulateContract({
  account, address: factory, abi, functionName: 'launchChecked', args: [p, r, ruleSet, startTick],
});
// result: [token, poolId, escrow]
```

## Buy and sell

Quote with the V4Quoter. Trade through the UniversalRouter. Pass empty `hookData` (`0x`): the hook reads none.

1. **Quote.** `quoteExactInputSingle({ poolKey, zeroForOne, exactAmount, hookData: '0x' })` through `eth_call`. It runs the hook, so the result includes the fee. `zeroForOne` is true when you pay `currency0`.
2. **Allow.** ERC-20 inputs go through Permit2. Approve Permit2 on the token, then `Permit2.approve(token, router, amount, expiration)`, or sign a permit for the router's `PERMIT2_PERMIT` command. Do not approve the router directly.
3. **Swap.** `execute(commands, inputs, deadline)` on the UniversalRouter, with one `V4_SWAP` command (`0x10`). Its actions are `SWAP_EXACT_IN_SINGLE` (`0x06`), `SETTLE_ALL` (`0x0c`) and `TAKE_ALL` (`0x0f`). Set `amountOutMinimum` from the quote and your slippage. Set a deadline.
4. **Confirm.** Wait for a successful receipt. Read `HookSwap` and your balances.

This UniversalRouter is Universal Router 2.2.0. Its `SWAP_EXACT_IN_SINGLE` parameters carry one more field than older v4 routers:

```solidity
(
  (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey,
  bool zeroForOne,
  uint128 amountIn,
  uint128 amountOutMinimum,
  uint256 minHopPriceX36, // per-hop price floor; 0 turns it off
  bytes hookData
)
```

A HYPE pair settles in WHYPE. Wrap HYPE with WHYPE's `deposit()` before a buy, and unwrap with `withdraw(amount)` after a sell. The router's wrapped native token is WHYPE.

### The fee

Every fee is taken in the pair asset, on buys and on sells. With `f = currentFee(poolId)` and `q` the pair asset the pool moves:

* exact-input buy: `ceil(in × f / 1e6)` of the pair asset paid in. The AMM swaps the rest;
* exact-input sell: `ceil(out × f / 1e6)` of the pair asset the AMM pays out;
* exact-output buy or sell: `ceil(q × f / (1e6 − f))` on top.

A swap that stops short at a price limit or the end of the curve pays only on what traded. Then apply normal v4 maths with an LP fee of 0.

### The standing bid

Each pool can hold a standing bid. It fills exact-input sells only, only while the price is within 5% of the pool's moving average, and it never leaves a seller worse off than the pool alone. A quote that ignores it is conservative. `Filled` records each fill.

## Follow the fees

All of it stays in the pool's pair asset.

1. A swap pays the fee to the launchpad. `HookSwap` carries it. `accruedFees(poolId)` shows what waits.
2. `settle()` on the pool's CreatorEscrow pulls the fees and splits them by the pool's RuleSet. `Settled` records the arrival and each part: builder, recipient, held, coin support, protocol and buyback.
3. Coin support funds the pool's own standing bid (`BidFunded`). The protocol part goes to the ProtocolSplitter. The buyback part goes to the ForfeitAllocator.
4. `distribute(asset)` on the ProtocolSplitter pays its balance of that asset to the six legs. `Distributed` records each leg's amount.
5. `claim(account)` on the escrow pays an account its credit. `claimBuilder()` pays the builder. `claimable(account)` previews a claim.

Anyone can call `settle`, `claim`, `claimBuilder`, `flush` and `distribute`. Funds go only to fixed destinations, never to the caller. Ascend's crank sends these calls when they are due.

Graduation and forfeits move through public calls on the escrow: `startHold()`, `breakHold()`, `graduate()`, `drop()`, `forfeit()` and `poke()`. Each reverts until its condition holds on chain. [Trading and creator fees](https://ascendlaunch.gitbook.io/docs/fees-and-revenue/trading-and-creator-fees) explains the rules.

## Index the chain

Start at block 422319. The [event table](https://ascendlaunch.gitbook.io/docs/developers/abis-and-events#event-sources) lists each event and its source.

* Key every coin and pool on its address and pool ID. Names and symbols repeat.
* Take `Launched` only from the launchpad above, and `EscrowLaunched` only from the escrow factory above.
* Read `HookSwap` for the fee and the hook's delta. Read the PoolManager's `Swap` for the AMM's part.
* Elysium produces blocks quickly. Page `eth_getLogs` in bounded ranges and handle reorgs by block hash.
* Creator-supplied names, descriptions and links are untrusted data.

## Before you send

Simulate the exact transaction: sender, calldata, value, minimum output and deadline. A hash means submitted. Wait for a successful receipt, then check the events and balances. After a timeout or a disconnect, look for the original transaction before you retry.
