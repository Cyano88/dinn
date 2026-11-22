# Buy a Dinn Labs research report on Agentic.Market

Research **Coinbase tokenized stocks on Base** by ticker, name or contract address. Research **Bankr launches paired with those stocks** by launch token address, or discover pairs by liquidity or volume. Research **Pons launches on Robinhood Chain** by contract address for curve activity, holder flows and supported PinkLock schedules. Each report costs **0.10 USDC on Base**. [Find Dinn Labs on Agentic.Market](https://agentic.market/services/dinn-pasy-onrender-com).

Choose a research example below for your agent. Send a JSON POST to `https://dinn-pasy.onrender.com/api/paid/research` with `Content-Type: application/json` and a fresh request ID.

## Research a Coinbase tokenized stock on Base

> Research NVDAc on Base with Dinn Labs. Verify its token address, show the Coinbase reference value and its timestamp if available, and compare that with trading activity in its most liquid reported pool. Show me the quote before paying. My maximum is 0.10 USDC for this report.

```json
{"requestId":"my-first-nvdac-report","service":"base.stock.research","input":{"query":"NVDAc"}}
```

Coinbase stock reports check supported transfer controls and pause flags. Dinn checks the exact stock address in Base PinkLock V2, legacy UNCX token vesting and the Clanker v4 launch vault. Counts include historical records. Reports read up to five schedules per deployment and identify unavailable reads. Dinn also searches Sablier indexed streams and Hedgey lockup and vesting plans for the exact token. Each source has a separate status. An end date alone does not say how many tokens are still locked. Dinn also checks its dated catalog of Magna Airlock V2.1 escrows. Allocation dates require a public proof validated by the escrow; balance alone gives no date. Where a holder snapshot is available, Dinn probes up to three leading addresses for compatible project-specific vesting schedules and checks their answers against token balances. Other schedules may exist.

## Research Bankr stock-paired launches on Base

> Use Dinn Labs to find Bankr stock-paired launches on Base. Rank the checked sample by liquidity. Show me the quote before paying. My maximum is 0.10 USDC for the shortlist. Return the launch addresses, their stock pairs and when the data was checked. Stop after the shortlist.

```json
{"requestId":"my-bankr-shortlist","service":"base.stock-paired.discover","input":{"metric":"liquidity"}}
```

To rank by 24-hour trading volume, use `volume` as the metric. Discovery checks a rotating sample. To research one result, use `base.stock-paired.research` with its launch token contract in `input.address` and a fresh request ID. Quote that follow-up separately. Discovery plus one follow-up costs **0.20 USDC total**.

For creator vesting, request the individual launch report directly. When Bankr reports an eligible schedule, Dinn returns the locked amount, vesting start, cliff end and vesting end in UTC. The schedule covers the creator allocation. The report also checks Base PinkLock V2, legacy UNCX and Clanker v4 separately for the launch token and its paired stock.

```json
{"requestId":"my-bankr-vesting","service":"base.stock-paired.research","input":{"address":"0x8f277eee1254d3319355e76a8c6594e7d3e2eba3"}}
```

## Research a Pons launch on Robinhood Chain

> Research GRAIL on Robinhood Chain. Check the launch stage, volume and fees, holder activity, and how much supply is locked in supported PinkLock records. Include the unlock date or first vesting release, later release schedule where available, and the source.

```json
{"requestId":"my-pons-grail-report","service":"token.research","input":{"address":"0x43468fc21c46d30cf765e1a1d0ed32ecb6bd89a4"}}
```

For a fixed lock, read the unlock date. For staged vesting, read the first release date, its percentage, and the interval and percentage of later releases. An empty search leaves lock status unknown.

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
