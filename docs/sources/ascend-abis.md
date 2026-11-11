> For the complete documentation index, see [llms.txt](https://ascendlaunch.gitbook.io/docs/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://ascendlaunch.gitbook.io/docs/developers/abis-and-events.md).

# ABIs and events

## The ABI file

`ascend-v5-99901-422319.json` is one JSON file for this release: chain 99901, deployment block 422319. For each contract type it holds the full ABI, the ABI's SHA-256 and the mainnet addresses of that type (`deployed`). It also carries the contracts each launch creates: `CreatorEscrow` (one per pool), `CreatorSeatV5` (one per Holder Rewards or Buyback coin) and `AscendTokenV5` (every launched coin).

Types with an empty `deployed` list and no per-launch role are staking contracts. They are not live in this release.

Download it from [ascendlaunch.xyz/abis/ascend-v5-99901-422319.json](https://ascendlaunch.xyz/abis/ascend-v5-99901-422319.json). Its SHA-256 is `195d9572a792070ce236d4b3ee759f06e3d24f6c9d7c3a4912febe818789d5c8`.

Multicall3, TokenFactory and BurnSink have no entry. Use Multicall3's standard ABI. Integrators do not call the other two.

## Functions and events integrators use

These fragments are human-readable ABI. They parse with viem's `parseAbi`. The full ABIs are in the file above.

### Launchpad

`0xe0dEF4221b9840a610D4e7d55812a79A6431a8eC`

```solidity
function currentFee(bytes32 poolId) view returns (uint24)
function quoteConfig(address quote) view returns ((bool allowed, int24 startTick, uint128 maxClip))
function poolCreator(bytes32 poolId) view returns (address)
function poolLaunchedAt(bytes32 poolId) view returns (uint40)
function poolTokenIs0(bytes32 poolId) view returns (bool)
function poolStartTick(bytes32 poolId) view returns (int24)
function accruedFees(bytes32) view returns (uint256)
function emaSqrtPrice(bytes32 poolId) view returns (uint160)
function bidInventory(bytes32 poolId) view returns (uint256)
function paused() view returns (bool)
function launchFeeWindowSeconds() pure returns (uint256)
function escrowFactory() view returns (address)
function poolManager() view returns (address)
event Launched(bytes32 indexed poolId, address indexed token, address indexed creator, address quote, uint256 supplySeeded, uint256 devBuyTokens, uint24 fee, uint24 builderFee)
event HookSwap(bytes32 indexed poolId, address indexed sender, int128 amount0, int128 amount1, uint128 hookLPfeeAmount0, uint128 hookLPfeeAmount1)
event QuoteConfigSet(address indexed quote, bool allowed, int24 startTick, uint128 maxClip)
event PausedSet(bool paused)
event BidFunded(bytes32 indexed poolId, address indexed funder, uint256 amount)
event Filled(bytes32 indexed poolId, uint256 tokensIn, uint256 feeQuote, uint256 quotePaid)
event TokensAccumulated(bytes32 indexed poolId, address indexed token, uint8 indexed source, uint256 amount)
event Collected(bytes32 indexed poolId, uint256 tokenFees, uint256 quoteFees, uint256 tokensBurned, uint256 flywheelQuote)
```

### EscrowFactory

`0x63f6a8A8d0257c0363251a50cdE8A8b1046e4d19`

```solidity
function launch((string name, string symbol, address quote, uint256 devBuyQuote, uint256 minDevOut, bytes32 salt, address creator, uint24 fee, uint24 builderFee) p, (address recipient, address dev, address builder, bool cto) r) returns (address token, bytes32 poolId, address escrow)
function launchChecked((string name, string symbol, address quote, uint256 devBuyQuote, uint256 minDevOut, bytes32 salt, address creator, uint24 fee, uint24 builderFee) p, (address recipient, address dev, address builder, bool cto) r, address expectedRuleSet, int24 expectedStartTick) returns (address token, bytes32 poolId, address escrow)
function predict(address payer, (string name, string symbol, address quote, uint256 devBuyQuote, uint256 minDevOut, bytes32 salt, address creator, uint24 fee, uint24 builderFee) p, (address recipient, address dev, address builder, bool cto) r) view returns (address escrow, address token)
function escrowOf(bytes32) view returns (address)
function ruleSet() view returns (address)
function pendingRuleSet() view returns (address)
function ruleSetReadyAt() view returns (uint256)
function builderFeeCap(address) view returns (uint24)
event EscrowLaunched(bytes32 indexed poolId, address indexed escrow, address indexed recipient, address dev, address builder, address ruleSet, bool cto)
event RuleSetQueued(address indexed ruleSet, uint256 readyAt)
event RuleSetSet(address indexed ruleSet)
event BuilderSet(address indexed builder, uint24 cap)
event PartnerLaunched(bytes32 indexed poolId, address indexed launcher, bytes32 indexed termsHash, address grantRecipient, uint256 supply, uint256 allocation)
```

### Seat factory

`0xBDB8d64452191041C4dAA3AD0f64bE4380FEA0b1`

```solidity
function launch((string name, string symbol, address quote, uint256 devBuyQuote, uint256 minDevOut, bytes32 salt, address creator, uint24 fee, uint24 builderFee) p, (uint16 holderBpsQuote, uint16 holderBpsToken, uint16 buybackBps, bool burnBought, address devBuyTo, address[] payees, uint16[] bps) c, bytes32 seatSalt, address builder) returns (address token, bytes32 poolId, address seat, address escrow)
function launchChecked((string name, string symbol, address quote, uint256 devBuyQuote, uint256 minDevOut, bytes32 salt, address creator, uint24 fee, uint24 builderFee) p, (uint16 holderBpsQuote, uint16 holderBpsToken, uint16 buybackBps, bool burnBought, address devBuyTo, address[] payees, uint16[] bps) c, bytes32 seatSalt, address builder, address expectedRuleSet, int24 expectedStartTick) returns (address token, bytes32 poolId, address seat, address escrow)
function predict(address deployer, (uint16 holderBpsQuote, uint16 holderBpsToken, uint16 buybackBps, bool burnBought, address devBuyTo, address[] payees, uint16[] bps) c, bytes32 salt) view returns (address)
event SeatDeployed(address indexed seat, address indexed deployer, address indexed primaryPayee, address devBuyTo, uint16 holderBpsQuote, uint16 holderBpsToken, uint16 buybackBps, bool burnBought, address[] payees, uint16[] bps, address[] exclusions)
```

### CreatorEscrow

One per pool. Find it with `EscrowFactory.escrowOf(poolId)` or the `EscrowLaunched` event.

```solidity
function settle()
function claim(address account) returns (uint256)
function claimable(address account) view returns (uint256 amount)
function withdrawTo(address to) returns (uint256)
function claimBuilder() returns (uint256 amount)
function flush()
event Settled(uint8 phase, uint8 band, uint256 arrived, uint256 builder, uint256 recipient, uint256 held, uint256 support, uint256 protocol, uint256 buyback)
event Credited(address indexed account, uint256 amount)
event Withdrawn(address indexed account, address indexed to, uint256 amount)
event BuilderPaid(address indexed builder, uint256 amount)
event Above(uint256 unlocked, uint8 band)
event Below(uint256 deadline)
event Forfeited(uint256 forfeited)
event RecipientTransferred(address indexed previous, address indexed next)
```

### ProtocolSplitter

`0xFDA2703Df09b23caFfC30dEe6C73b4A12FC82faf`

```solidity
function distribute(address asset)
function teamPpm() view returns (uint256)
function kntqBurnPpm() view returns (uint256)
function strategicKntqPpm() view returns (uint256)
function stakersPpm() view returns (uint256)
function strategicHypePpm() view returns (uint256)
function buybackPpm() view returns (uint256)
event Distributed(address indexed asset, uint256 team, uint256 kntqBurn, uint256 buyback, uint256 strategicKntq, uint256 stakers, uint256 strategicHype)
```

### RuleSet

`0xA9a627729D04576D8f79E3279bd17429C7794712`

```solidity
function rules() view returns ((uint16 liveBps, uint16 heldBps, uint16 extraLiveBps, uint24 baseFeePips, int24 gradTicks, uint32 holdSeconds, int24 deadTicks, uint16 deadVolumeBps, uint16 deadDays, uint32 deadlineSeconds, uint16 ruleVersion, int24[3] bandTicks, uint16[4] curveBps, uint16 supportBps, uint8 maxResets, uint32 handoffSeconds, uint16 listingBps, address splitter, address sharedBuyback, address ctoRegistry, address listingDesk))
event Published(uint16 indexed ruleVersion, (uint16 liveBps, uint16 heldBps, uint16 extraLiveBps, uint24 baseFeePips, int24 gradTicks, uint32 holdSeconds, int24 deadTicks, uint16 deadVolumeBps, uint16 deadDays, uint32 deadlineSeconds, uint16 ruleVersion, int24[3] bandTicks, uint16[4] curveBps, uint16 supportBps, uint8 maxResets, uint32 handoffSeconds, uint16 listingBps, address splitter, address sharedBuyback, address ctoRegistry, address listingDesk) rules)
```

### V4Quoter

`0x379F556c5a748BD7Cc9baF0F7A344094Ac1814f5`

```solidity
function quoteExactInputSingle(((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)
```

### UniversalRouter

`0x1B341FDD55d56F8E08409A2C25DDFad93Eb03C1a`

```solidity
function execute(bytes commands, bytes[] inputs, uint256 deadline) payable
```

### StateView

`0x27eD73aE0652fdCf71d6793412A7525f32bE9dfE`

```solidity
function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)
function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)
```

## Event sources

| Event                                      | Emitted by       | Use it to                                                                                  |
| ------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------ |
| `Launched`                                 | Launchpad        | Find each new coin, its pool, pair asset, fee and builder fee                              |
| `EscrowLaunched`                           | EscrowFactory    | Map each pool to its escrow, recipient, RuleSet and takeover opt-in                        |
| `SeatDeployed`                             | Seat factory     | Find a Holder Rewards or Buyback coin's seat and its split                                 |
| `HookSwap`                                 | Launchpad        | Read each swap's hook delta and fee. The fee sits in the pair asset's slot                 |
| `Swap`, `Initialize`                       | PoolManager      | Read the AMM's part of each swap and each pool's key                                       |
| `QuoteConfigSet`                           | Launchpad        | Follow which pair assets are allowed, with start tick and clip                             |
| `PausedSet`                                | Launchpad        | Follow whether launches are open                                                           |
| `BidFunded`, `Filled`, `TokensAccumulated` | Launchpad        | Follow each pool's standing bid: funding, fills and coins bought                           |
| `Settled`                                  | CreatorEscrow    | Read how each fee arrival split: builder, recipient, held, coin support, protocol, buyback |
| `Credited`, `Withdrawn`, `BuilderPaid`     | CreatorEscrow    | Follow creator and builder payouts                                                         |
| `Above`, `Below`, `Forfeited`              | CreatorEscrow    | Follow graduation and forfeits                                                             |
| `Distributed`                              | ProtocolSplitter | Read each leg's part of a distribution, per asset                                          |
| `RuleSetQueued`, `RuleSetSet`              | EscrowFactory    | Follow the rules that future launches copy                                                 |

The escrow's and the seat's own events carry no pool ID. Map each escrow to its pool with `EscrowLaunched` from the escrow factory above. Trust no escrow address without it.
