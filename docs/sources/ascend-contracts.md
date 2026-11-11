> For the complete documentation index, see [llms.txt](https://ascendlaunch.gitbook.io/docs/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://ascendlaunch.gitbook.io/docs/developers/mainnet-contracts.md).

# Mainnet contracts

These are Ascend's contracts on Elysium mainnet, chain 99901. The deployment starts at block 422319. Each address was read back from the chain on 4 Nov 2026: each has code, and each contract points at the others as listed.

Addresses are specific to chain 99901. Match the chain ID before you send a transaction.

## Trading infrastructure

Uniswap v4. Every launch pool and every open pool lives in this PoolManager.

| Contract        | Address                                      | Role                                                      |
| --------------- | -------------------------------------------- | --------------------------------------------------------- |
| UniversalRouter | `0x1B341FDD55d56F8E08409A2C25DDFad93Eb03C1a` | Swap execution                                            |
| V4Quoter        | `0x379F556c5a748BD7Cc9baF0F7A344094Ac1814f5` | Swap simulation and quotes                                |
| Permit2         | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | ERC-20 allowances for the router and the position manager |
| PoolManager     | `0xE2e105d3F7209A9DA11f83cCf3E7398a753823F1` | Custody and state for every pool                          |
| StateView       | `0x27eD73aE0652fdCf71d6793412A7525f32bE9dfE` | Pool, position and tick reads                             |
| PositionManager | `0x1d1C51b9d07fD27d36412A2b66CC23D19Eb3E518` | Positions in open pools                                   |
| Multicall3      | `0xcA11bde05977b3631167028862bE2a173976CA11` | Batched reads                                             |

## Ascend

| Contract      | Type              | Address                                      | Role                                                                                                         |
| ------------- | ----------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Launchpad     | AscendLaunchpadV5 | `0xe0dEF4221b9840a610D4e7d55812a79A6431a8eC` | The hook on every launch pool: fees, fee meters and standing bids                                            |
| EscrowFactory | EscrowFactory     | `0x63f6a8A8d0257c0363251a50cdE8A8b1046e4d19` | Launches every coin with its creator escrow                                                                  |
| Seat factory  | SeatFactoryV5     | `0xBDB8d64452191041C4dAA3AD0f64bE4380FEA0b1` | Launches Holder Rewards and Buyback coins with their seat                                                    |
| RuleSet       | RuleSet           | `0xA9a627729D04576D8f79E3279bd17429C7794712` | The fee plan's rules, version 2. Each new launch copies them; each escrow keeps the RuleSet it launched with |
| TokenFactory  | TokenFactory      | `0xCde2fffa95c9543dEC0dcEDdfe8d1182ECeE438f` | Deploys each launched coin                                                                                   |
| CTO registry  | CtoRegistryV5     | `0x8C26412796e7A759916D8EE0c2D91F2976e96dA8` | Community takeovers                                                                                          |
| Listing desk  | ListingDeskV5     | `0x0958974768E57368959af4e598E7A6b1E3026122` | Core listing elections. Enrollment opens once a verifier is set; until then `enroll()` reverts               |
| BurnSink      | BurnSink          | `0x9F0b0e3B362937b07Cd1E869b50687961e0c7741` | Receives the coins a Buyback seat buys to burn. It has no withdrawal function                                |

Each launched coin has its own address and its own CreatorEscrow. Neither is listed here. The `Launched` and `EscrowLaunched` events name them.

## Fee custody

Every fee is taken in the pool's pair asset and stays in it. The protocol's share goes to the ProtocolSplitter. Anyone can call `distribute(asset)` to pay the splitter's balance of that asset to its six fixed legs.

| Contract           | Type             | Address                                      | Receives                                                                       |
| ------------------ | ---------------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| ProtocolSplitter   | ProtocolSplitter | `0xFDA2703Df09b23caFfC30dEe6C73b4A12FC82faf` | The protocol share of every pool's fees                                        |
| TeamTreasury       | Treasury         | `0xE02058882FF23a98E722f3cD80c49Fe0e260394a` | 10% of the protocol share                                                      |
| KntqBurnTreasury   | Treasury         | `0xFE9846F8BCc99717547f4c0d18B7801F159aa621` | 28.8%, for KNTQ burns                                                          |
| EcosystemAllocator | Allocator        | `0xEe60f5c319F57a82B868651A2f996Bb99C5A3d89` | 43.2%, the strategic KNTQ leg                                                  |
| StakersLeg         | Treasury         | `0x1A847D9867122Ed051B9A3738fd268aB6ED522b6` | 9%, the stakers' HYPE leg                                                      |
| StrategicHypeLeg   | Treasury         | `0xAFB1545765bC63BEf623b78B3a81016D927bB621` | 9%, the protocol-owned HYPE leg                                                |
| ForfeitAllocator   | Allocator        | `0x87ac23Bd211dA79d270C25F40FD4426e545A2e68` | Forfeited creator fees and each escrow's buyback share. Its splitter leg is 0% |
| CohortTreasury     | Treasury         | `0xe1ec67254501505867CB6845Eb67452402D8e891` | Coins the standing bids buy: the cohort                                        |
| InventoryTreasury  | Treasury         | `0xdAAaCD9A44d201c43f86845264eb60814eC9234b` | Coins the standing bids buy: the inventory                                     |
| ListingTreasury    | Treasury         | `0xc0206bCC1Aff57Cd573243c71a6a4c4FeccE9e67` | Core listing custody                                                           |

The splitter's shares are fixed in its code. Read them with `teamPpm()`, `kntqBurnPpm()`, `strategicKntqPpm()`, `stakersPpm()`, `strategicHypePpm()` and `buybackPpm()`, in parts per million.

This release runs trading only. Staking is not live. The two HYPE legs hold their share in the pair asset, and no contract converts it.

## Pair assets

| Asset | Shown as | Address                                      | Decimals |
| ----- | -------- | -------------------------------------------- | -------- |
| USDC  | USDC     | `0xb47c4C8F73F009CC0C0d3f92B388d13E293F0B65` | 6        |
| WHYPE | HYPE     | `0xbA876237B0F021A6c6D852d6c26E107997cC5E81` | 18       |
| KNTQ  | KNTQ     | `0xe45a355d9e9cAd2aD85F2d03E3eE3102A036acF0` | 18       |

USDC is Circle USDC bridged from HyperEVM through the canonical bridge. Its HyperEVM original is upgradeable, pausable and blacklistable by its issuer. A HYPE pair quotes in WHYPE. Wrap HYPE with WHYPE's `deposit()`. KNTQ is Kinetiq's governance token.

The launchpad allows all three. Read `quoteConfig(asset)` on the launchpad for each asset's `allowed` flag, start tick and clip. The `QuoteConfigSet` event records every change.

## Owner

`0xb6832E477e9b34A826a9726D61690C8BAC8868b5` is a Safe 1.3.0 with a 3-of-5 threshold. It owns the launchpad, both factories, the CTO registry, both allocators and every treasury. No contract on this page is upgradeable: none is a proxy, and none can delegatecall or self-destruct.

The owner can:

* pause and unpause launches. A pause stops new launches only. Swaps, claims and settlements continue;
* allow or disallow a pair asset for future launches;
* queue a new RuleSet for future launches. It applies 48 hours after it is queued;
* set builder fee caps and approve partner launches;
* sweep the treasuries.

The owner cannot change a launched pool's fee or its RuleSet. A pool's recipient changes only through the recipient's own handoff, or through an approved community takeover on a pool that opted in at launch.

## Verify an address

Any EVM tool can check these addresses. With Foundry's `cast` and your Elysium RPC provider's URL in `ELYSIUM_RPC_URL`:

```bash
cast chain-id --rpc-url $ELYSIUM_RPC_URL
# 99901

cast call 0x63f6a8A8d0257c0363251a50cdE8A8b1046e4d19 "launchpad()(address)" --rpc-url $ELYSIUM_RPC_URL
# 0xe0dEF4221b9840a610D4e7d55812a79A6431a8eC

cast call 0xe0dEF4221b9840a610D4e7d55812a79A6431a8eC "poolManager()(address)" --rpc-url $ELYSIUM_RPC_URL
# 0xE2e105d3F7209A9DA11f83cCf3E7398a753823F1

cast call 0xe0dEF4221b9840a610D4e7d55812a79A6431a8eC "launchFeeWindowSeconds()(uint256)" --rpc-url $ELYSIUM_RPC_URL
# 0
```

`launchFeeWindowSeconds()` returns 0: the launchpad charges no opening tax. Each pool pays its own fee from the first swap.
