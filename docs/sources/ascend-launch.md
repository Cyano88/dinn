> For the complete documentation index, see [llms.txt](https://ascendlaunch.gitbook.io/docs/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://ascendlaunch.gitbook.io/docs/launching-on-ascend.md).

# Launching on Ascend

Ascend lets builders launch tokens on Elysium and **choose how their creator-fee allocation supports the project**. A deployer can direct that allocation to a recipient wallet, distribute a share to token holders, fund token buybacks, or combine these uses. The selected fee structure is configured as part of the launch.

A token's creator allocation is separate from Ascend's protocol allocation and any coin-support liquidity allocation. Choosing how to use creator fees does not redirect those other allocations.

## Launching a token in six steps

The [Ascend launch interface](https://app.ascendlaunch.xyz/launch) organizes standard launches into six stages:

1. **Identity:** Choose a token name, ticker, and image. A description and social or website links are optional. Review your metadata before launch, as the name and ticker are permanent and launch metadata is pinned to IPFS.
2. **Pair:** Choose the supported asset used for the token's trading pool.
3. **Fee:** Set the token's trading fee under the applicable launch schedule. The standard range documented here is **1% to 10%**.
4. **Coin type:** Decide what the token's creator-fee allocation will be used for: direct creator payouts, holder rewards, buybacks, or a combination.
5. **Payouts:** Configure the eligible payout recipients, holder-reward share, buyback share, and buyback treatment available for the selected coin type.
6. **Review:** Confirm the token details, trading pair, fee, coin type, payout configuration, and any initial purchase before signing the launch transaction.

The interface also provides a separate [Custom launch](https://app.ascendlaunch.xyz/launch?custom=1) path for approved partner configurations. Custom terms follow their own approval requirements.

## Launch pools and token structure

Standard Ascend launches use configured hook pools, sometimes called closed hook pools. Tokens launch into their pool framework without a separate bonding-curve migration step.

The standard launch interface shows a **fixed supply of 1,000,000,000 tokens** and **permanently locked liquidity**. The launch transaction creates the token, its market pool, and the fee-accounting configuration. An optional initial deployer purchase may be configured and reviewed before signing.

Hook rules govern pool initialization, trading fees, and how those fees reach their designated allocations. These pool and fee mechanisms are separate from a creator's chosen use of the creator-fee allocation.

## Supported pairing assets

Depending on supported pool configurations, Ascend's pairing options include:

* USDC
* HYPE
* KNTQ
* Real-world assets (RWAs)
* Stock-paired assets
* Additional approved assets

Availability depends on the specific asset, market, and pool configuration. Liquidity associated with the protocol's strategic KNTQ allocation is explained in [KNTQ and ecosystem support](/docs/protocol-economics/kntq-and-ecosystem-support.md).

## Choosing a trading fee

The standard base trading fee is **1%**. The fee schedule shows total trading-fee choices from **1% through 10%**, with any amount above the base 1% assigned to the token's **creator allocation**.

Within the base 1% fee, the creator allocation increases across market-cap bands, while coin support and the protocol receive their separately defined portions. The full schedule is in [Trading and creator fees](/docs/fees-and-revenue/trading-and-creator-fees.md).

**The creator allocation is the amount available to the fee configuration chosen at launch.** It does not always mean a direct payment to the deployer's wallet. For example, an allocation may be used for holder distributions or token buybacks instead.

## Creator-fee configurations

Deployers choose one of four fee-routing configurations when launching a standard token:

| Coin type             | What happens to the creator allocation                                                                                                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vanilla (Creator)** | Available creator fees are assigned to the designated recipient wallet, subject to the claim and release rules.                                                                                                               |
| **Holder Rewards**    | The configured holder share is distributed to eligible token holders. The remainder goes to the designated payout recipients.                                                                                                 |
| **Buyback**           | A chosen share funds purchases of the token through its own launch pool. The remainder is assigned to payout recipients. Purchased tokens are burned or directed to the designated recipient according to the launch setting. |
| **Custom mix**        | Divide the creator allocation among holder rewards, token buybacks, and designated payout recipients. The selected percentages determine how the creator allocation is used.                                                  |

These choices apply **only to the creator side of the trading fee**. Protocol fees and the separate coin-support allocation retain their documented uses.

### Holder Rewards

A deployer can dedicate a chosen portion of the creator allocation to **token-holder distributions**, with any remaining portion directed to the configured recipients.

Holder rewards are subject to the token's applicable eligibility, minimums, and processing rules. Configuring a holder share does not mean a separate payment is made after every trade or that any holder receives a fixed amount.

### Buybacks

A deployer can dedicate part of the creator allocation to **buying back the project's own token** through the Ascend launch pool.

The buyback configuration specifies whether purchased tokens are **burned** or sent to the designated recipient. Actual purchases follow the mechanism's execution limits and price protections; selecting buybacks does not guarantee a particular purchase frequency, token price, or price floor.

### Custom mix

Custom mix allows a project to divide the creator allocation among holder rewards, token buybacks, and designated payout recipients. The selected percentages determine how the creator allocation is used.

Custom mix is a standard coin-type option. It is separate from the approved-partner Custom launch process.

The configured holder and buyback portions cannot exceed the available creator allocation together.

**Holder distributions are generally prioritized.** The execution process also gives eligible buybacks scheduled opportunities to run, so ongoing holder distributions do not indefinitely delay buybacks.

Holder-reward and buyback balances remain separately allocated. Each follows its own execution conditions.

### Recipient wallets and fixed launch settings

Payout configurations that use recipient shares can allocate the remainder among **up to ten payout recipients** under the configured design. Each recipient's share must fit within the available creator allocation.

**The selected coin type, fee rate, distribution percentages, and buyback burn-or-recipient choice are set at launch.** Review them carefully before signing. Any permitted later recipient handoff is a separate process; it does not let a creator change the original coin type or allocation rules.

## Example: structuring creator fees

Assume a token trades **$100,000** while in the **$40,000–$1 million market-cap band**, with a **3% total trading fee**.

| Allocation from the trades           |     Amount |
| ------------------------------------ | ---------: |
| Creator allocation (2.50% of volume) | **$2,500** |
| Coin support (0.05%)                 |        $50 |
| Protocol allocation (0.45%)          |       $450 |
| **Total trading fees (3.00%)**       | **$3,000** |

The deployer decides how the **$2,500 creator allocation** is used within the permitted coin type. For example, in a Custom mix configuration with **40% holder rewards, 30% buybacks, and 30% recipient payouts**, the creator allocation would be designated as **$1,000 for holders, $750 for buybacks, and $750 for recipients**, before applicable settlement or execution conditions.

This example demonstrates how the creator-fee allocation can be structured. It does not imply that all funds are immediately claimable or that buybacks and holder distributions execute at the same time.

## When creator fees become available

The [creator fee release rules](/docs/fees-and-revenue/creator-fee-release-and-takeovers.md) determine when the creator allocation becomes available. Below a **$40,000 market cap**, only the specified immediate portion becomes available while the rest is held pending the graduation conditions. Held fees can also be subject to forfeiture.

**The selected coin type determines what happens once creator fees become available**: direct payout, holder distribution, buyback activity, or a combination. The fee-release rules and the fee-routing configuration are separate parts of the launch.

A Vanilla creator may claim fees that are available under its payout terms. Holder-reward and buyback configurations rely on their respective processing mechanisms and may not settle at the moment fees are accrued.

## Building after launch

A launch is the beginning of the project lifecycle. Continued product development, genuine holders, and sustained trading activity contribute to a project's eligibility for further support, subject to Ascend's quality checks.

See [Ascended status](/docs/project-growth/ascended-status.md), [Builder support](/docs/project-growth/builder-support.md), and [HyperCore and HIP-3](/docs/project-growth/hypercore-and-hip-3.md) for the stages and requirements that can follow a launch.

Selecting a higher trading fee or a particular coin type does not guarantee additional market access, project support, a token return, or a future listing.
