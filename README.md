# Dinn

Dinn is a conversational workspace for researching tokens and tokenized stocks on Base and Robinhood Chain. Creators can launch a token on Pons through chat. Trading agents can hire Dinn Labs for a sourced research report through two marketplaces.

[Open Dinn Chat](https://dinnlabs.com/) · [Using Dinn](https://dinnlabs.com/docs) · [Developer quickstart](https://dinnlabs.com/docs/integrate)

## Research coverage

Underlying stock research checks dated company news, selected financial newsroom feeds, Google News headlines from recognized outlets, and recent SEC 8-K, 10-Q and 10-K filings. Reports link to the available evidence. Publication time and the last stock quote determine which stories qualify for price-move analysis. A filing timestamp establishes when the filing was accepted.

| What you want to research | What to send | What Dinn checks |
| --- | --- | --- |
| Coinbase tokenized stock on Base | Company name, ticker such as `NVDAc`, or Base contract | Registry and onchain identity, dated reference value, transfer controls, market activity, and available holder and lock evidence. For supported equities, Dinn can surface dated company news and compare the stock move with a sampled token pool. |
| Stock-paired Bankr launch on Base | Launch token contract | Launch record, pool creation receipt and stock registry match. The report includes available pool liquidity and volume, fees, sampled holder activity, and creator vesting amounts and dates. Discovery can shortlist checked pairs by liquidity or 24-hour volume. |
| Pons launch on Robinhood Chain | Launch token contract | Launch age, trading pair, bonding curve progress, curve volume and fees, sampled holder buys and sells, and supported lock or vesting records. Stock-paired research examines the launch and its pairing stock separately. |
| Robinhood stock token | Ticker or Robinhood Chain contract | Registry and onchain identity, available reference price, and contract, holder and lock evidence where available. |

Reports identify sources, check times and coverage gaps. A lock schedule can reach its release date before the holder withdraws. A missing record leaves the lock status unknown. Price, liquidity and company news provide context; an executable quote requires a separate check.

## Dinn Chat

Ask ?What stock has a story worth launching around today?? to screen the verified company stocks in Dinn?s known Pons pair list for recent event headlines. Choose a ticker from the shortlist to investigate the evidence. Shortlisted pairs are checked against Pons on Robinhood Chain.

A recent sourced story can lead to an optional creator idea. The idea connects a community activity to a question people can follow. Pons checks its pair before setup; the Bankr path produces a Base creator brief for now.

For a research-backed launch, ask "Is there a story worth launching around Tesla?" Save a watch question and ask "Any update?" to compare new coverage with the original brief. After reviewing a launch idea, say "Share research" to preview its public Research feed entry. Confirm to get a link to that entry. The creator chooses the project website separately. Watches and shared findings use the account database.

Dinn's creator idea flow starts with a dated stock story. On request, 0G receives the sourced headline and a randomized shortlist of unused community actions and formats. It chooses a fit, suggests one token name and matching ticker alongside the activity, and Dinn attaches a research question grounded in the event. Postgres reserves the format per story and the normalized name and activity across creators before chat delivers the idea. Returning to the same story retrieves the creator's saved concept. Starting its Pons setup prefills the editable token name and ticker. Feed publication uses that same concept and requires confirmation.

- **Launch on Pons.** Choose a token name, ticker, enabled supply preset, pairing asset and fees. Add an optional logo and social links, or generate a logo and preview and publish a project website. Supported page features include a matching-pairs game and an art gallery using supplied image links. Choose an optional opening purchase, review the terms and approve the launch. Find supported Pons launches in **Launches** and open their research from the list.
- **Use a wallet.** Check balances, send supported assets, swap on available routes, or bridge supported Base assets to Robinhood Chain. Dinn guides the review and approval and shows transaction status. Bridge tracking distinguishes source confirmation from destination delivery.
- **Manage a Pons token.** Review supported buys and sells, check and claim eligible creator fees, or prepare a supported token burn. Dinn can check existing lock records and direct users to an external locker to create one.
- **Research on Base.** Ask about a stock or paste a Bankr launch address. Eligible stock reports can hand off to Bankr for its live quote and location checks. Bankr token creation through Dinn is planned.

## Agent access

| Entry point | Terms | Delivery |
| --- | --- | --- |
| [NEAR AI Agent Market](https://market.near.ai/a/dinn) | $0.10 per hire | Send the chain and target in the opening brief. One buyer-requested refresh for the same token is included on eligible reopened assignments. For reports with a saved baseline, the refresh leads with comparable changes in pool liquidity, Pons curve progress, sampled wallet activity and lock schedules. |
| [Agentic Market on Base](https://agentic.market/services/dinn-pasy-onrender-com) | 0.10 USDC per research request via x402 | An agent posts to the [paid endpoint](https://dinn-pasy.onrender.com/api/paid/research), follows the payment challenge and receives the report. A discovery shortlist and an individual token report are separate calls. [Buyer quickstart](https://dinnlabs.com/agentic-market.md) |
| [Public API](https://dinnlabs.com/.well-known/dinn.json) | Free read-only preview | Inspect the [request schema](https://dinnlabs.com/api/agent/schema) for supported services and fields. Paid and signed-in reports can include provider-backed holder data omitted from previews. |

Try a public research request without a wallet:

```sh
curl -X POST https://dinnlabs.com/api/agent/request \
  -H 'Content-Type: application/json' \
  -d '{"service":"base.stock.research","requestId":"stock-example-1","input":{"query":"NVDAc"}}'
```

A completed research response includes structured results, a readable report and an evidence content hash. Marketplace research is read-only. The calling agent controls any later trade and wallet approval.

## Run locally

Use Node.js 22 or newer. Install dependencies, build the browser bundles, run the tests and start the app:

```sh
npm ci
npm test
npm start
```

Open http://127.0.0.1:4317. See [.env.example](.env.example) for provider settings for authentication, inference and chain reads. Production uses Render and PostgreSQL. The [NEAR worker](ops/near-worker/README.md) runs separately on a VPS and uses PostgreSQL to recover marketplace jobs. 0G powers conversational inference. Research evidence comes from registry, chain, market and news sources.

## Integration and verification

- [Agent integration guide](public/agent-guide.md) and [reference research client](scripts/dinn-trading-agent-demo.mjs)
- [NEAR marketplace delivery and payment record](docs/NEAR-MARKETPLACE.md), including the distinction between controlled verification and independent demand
- [Funded Pons launch receipt](https://robinhoodchain.blockscout.com/tx/0x322354170e0fa42b45d4028dcdd2bc375d4b0ba2d276023b6960af7f32943a46) and [Pons integration notes](docs/PONS-INTEGRATION.md)
- [Agent Economy submission baseline](https://github.com/Cyano88/dinn/commit/29003cd1377e0d9c8fef95552cf04ac053f479d1), [NEAR integration changes](https://github.com/Cyano88/dinn/compare/29003cd1377e0d9c8fef95552cf04ac053f479d1...feat/near-agent-access) and [historical Ascend documentation](docs/README-HISTORY.md)

## License

[MIT](LICENSE)

### Bankr launch previews on Base

After a creator idea in chat, ask ?Can I launch this on Base?? Dinn checks the live Base factory through `@bankr/launch-sdk`. With a Dinn-approved launchpad configured in `DINN_BANKR_BASE_LAUNCHPAD_ID`, the preview matches the stock token across Coinbase and Bankr, checks the launchpad's quote permission, and plans and simulates from the selected wallet. This adapter is preview-only. Registration, wallet submission and receipt verification are separate steps. Bankr's own pad (ID 0) requires Bankr authorization.

The approved Base launchpad operator share is 1,000 bps (10%) of fees remaining after Bankr and any referrer. Register the Dinn treasury as the launchpad payee and configure its public address in `DINN_BANKR_BASE_FEE_RECIPIENT`. The preview checks the payee and exact steady and enabled decay shares in the SDK's resolved launch plan before simulation. The remaining 90% is the creator side, including any holder, liquidity or buyback allocations.
