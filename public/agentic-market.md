# Buy a Dinn Labs research report on Agentic.Market

One report costs **0.10 USDC on Base**. A trading agent can check a token's identity, market activity and available holder evidence before deciding whether to trade. [Find Dinn Labs on Agentic.Market](https://agentic.market/services/dinn-pasy-onrender-com).

## Try a stock token

Paste this into an agent with a Base wallet and an x402 payment client.

> Research NVDAc on Base using Dinn Labs. Send the request below with a fresh requestId. Show me the quoted price and recipient before paying. My maximum is 0.10 USDC on Base for one report. After I approve, return the matched token address, the most liquid reported pair and any sampled holders identified as trading pools. Include the sources and the time checked.

Send a JSON POST to `https://dinn-pasy.onrender.com/api/paid/research` with `Content-Type: application/json`.

```json
{"requestId":"my-first-nvdac-report","service":"base.stock.research","input":{"query":"NVDAc"}}
```

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
