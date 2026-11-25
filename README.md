# Dinn

Dinn is a conversational workspace for researching tokens and tokenized stocks on Base and Robinhood Chain. Creators can launch a token on Pons through chat. Trading agents can hire Dinn Labs for a sourced research report through two marketplaces.

[Open Dinn Chat](https://dinnlabs.com/) · [Using Dinn](https://dinnlabs.com/docs) · [Developer quickstart](https://dinnlabs.com/docs/integrate)

## Research coverage

| What you want to research | What to send | What Dinn checks |
| --- | --- | --- |
| Coinbase tokenized stock on Base | Company name, ticker such as `NVDAc`, or Base contract | Registry and onchain identity, dated reference value, transfer controls, market activity, and available holder and lock evidence. For supported equities, Dinn can surface dated company news and compare the stock move with a sampled token pool. |
| Stock-paired Bankr launch on Base | Launch token contract | Launch record, pool creation receipt and stock registry match. The report includes available pool liquidity and volume, fees, sampled holder activity, and creator vesting amounts and dates. Discovery can shortlist checked pairs by liquidity or 24-hour volume. |
| Pons launch on Robinhood Chain | Launch token contract | Launch age, trading pair, bonding curve progress, curve volume and fees, sampled holder buys and sells, and supported lock or vesting records. Stock-paired research examines the launch and its pairing stock separately. |
| Robinhood stock token | Ticker or Robinhood Chain contract | Registry and onchain identity, available reference price, and contract, holder and lock evidence where available. |

Reports identify sources, check times and coverage gaps. A lock schedule can reach its release date before the holder withdraws. A missing record leaves the lock status unknown. Price, liquidity and company news provide context; an executable quote requires a separate check.

## Dinn Chat

For a research-backed launch, try ?Is there a story worth launching around Tesla?? Set a question with ?Watch for ?? and return with ?Any update?? Dinn compares newly published coverage with the original brief. One watch is saved for the signed-in account on that device. ?Launch this pair? checks current Pons approval and carries a dated source into the editable project description when available.

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
