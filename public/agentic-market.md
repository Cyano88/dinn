# Buy a Dinn Labs research report on Agentic.Market

Research **Coinbase tokenized stocks on Base** by ticker, name or contract address. Research **Bankr launches paired with those stocks** by launch token address, or discover pairs by liquidity or volume. Each report costs **0.10 USDC on Base**. [Find Dinn Labs on Agentic.Market](https://agentic.market/services/dinn-pasy-onrender-com).

Choose either example below for your agent. Send a JSON POST to `https://dinn-pasy.onrender.com/api/paid/research` with `Content-Type: application/json` and a fresh request ID.

## Research a Coinbase tokenized stock on Base

> Research NVDAc on Base with Dinn Labs. Verify its token address, show the Coinbase reference value and its timestamp if available, and compare that with trading activity in its most liquid reported pool. Show me the quote before paying. My maximum is 0.10 USDC for this report.

```json
{"requestId":"my-first-nvdac-report","service":"base.stock.research","input":{"query":"NVDAc"}}
```

## Research Bankr stock-paired launches on Base

> Use Dinn Labs to find Bankr stock-paired launches on Base. Rank the checked sample by liquidity. Show me the quote before paying. My maximum is 0.10 USDC for the shortlist. Return the launch addresses, their stock pairs and when the data was checked. Stop after the shortlist.

```json
{"requestId":"my-bankr-shortlist","service":"base.stock-paired.discover","input":{"metric":"liquidity"}}
```

To rank by 24-hour trading volume, use `volume` as the metric. Discovery checks a rotating sample. To research one result, use `base.stock-paired.research` with its launch token contract in `input.address` and a fresh request ID. Quote that follow-up separately. Discovery plus one follow-up costs **0.20 USDC total**.

## Review the payment

The first POST is free. HTTP 402 returns the payment terms. Check for **0.10 USDC on Base** and Dinn's recipient `0x6bA00289532F6Bcd742B920c00e29417b0b166D1`. After approval, your client repeats the POST with the signed payment. A completed response includes the report, its sources and a payment receipt. If the response times out, reuse the same request body and original signed payment to recover the result.

## What a buyer can learn

In Dinn's November 22, 2026 NVDAc report, a holder with **12.15% of total supply** matched the address of an NVDAc/USDC trading pool. An agent measuring whale concentration can account for those tokens as pool inventory. The snapshot covered the first 1,000 holders returned by the provider. [Pool from that report](https://dexscreener.com/base/0xf668e21993f0acd7ab00bb1cfbaed0df28a3c8ec)

## Choose another report

| Research question | Service | Input |
| --- | --- | --- |
| Which Coinbase stock token is this on Base? | `base.stock.research` | Exact ticker, company name or contract in `query` |
| What backs this Bankr stock-paired launch on Base? | `base.stock-paired.research` | Launch token contract in `address` |
| Which sampled Bankr stock pairs have the most liquidity or trading volume? | `base.stock-paired.discover` | `metric` set to `liquidity` or `volume` |
| What do the curve, holders and available lock records show for this Pons token on Robinhood Chain? | `token.research` | Token contract in `address` |

All four reports use the same Base payment flow. Coverage depends on the token and available sources. Trading decisions stay with the buyer.
