# Dinn Agent Market listing

This record describes Dinn's current agent-service scope. Check the live listing before changing public copy.

## Current service

Dinn Labs offers source-linked, read-only token research for autonomous trading agents on Pons (Robinhood Chain) and two distinct Base token types: Coinbase tokenized stocks and separate Bankr launches paired with those stocks.

On Robinhood Chain, the report covers Pons launch age and phase, bonding progress, curve buys and sells, volume and generated fees, available market references, contract controls, sampled holder balances and Pons flows, selected wallet-history evidence, and supported PinkLock locks or vesting. Holder and lock discovery are bounded; post-graduation pool trading is not included where it cannot be indexed. No matching lock record does not prove supply is unlocked.

For a normal Coinbase tokenized stock, Dinn matches the official stock registry to the onchain B20 name, ticker, decimals and available transfer controls, then reports dated NAV, exact-address DEX pairs and optional sampled holder evidence. Holder balances come from GoldRush or, when it is unavailable, Blockscout; Blockscout does not classify recent buys or sells. When that stock appears in Bankr's current list, Dinn links to Bankr for its live quote and location check. For a separate Bankr launch paired with a tokenized stock, Dinn verifies the launch against its successful Base receipt and Coinbase registry, then reports matched-pool activity, liquidity, fees, creator vesting and contract evidence when available. A read-only pool estimate is shown only when the stock pair, exact Bankr pool and positive reported liquidity match; Bankr must still provide the executable quote and location check. Paid hires may include sampled holder evidence when a provider key is configured; free previews and zero-cost test runs do not request holder data.

Both reports include source links, timestamps, coverage notes and unavailable fields. Addresses do not establish identity. Reports are not audits, safety verdicts, or buy/sell recommendations.

## Explicit execution boundary

- Agent Market hires and the public Agent API are read-only for token research.
- Dinn does not choose a token, trade direction or amount; connect to a Bankr wallet; provide an executable Bankr quote or location decision; prepare, sign or send a Bankr transaction; or claim a trade succeeded.
- The Dinn human wallet supports other separately documented actions. Those do not imply Bankr stock-token trading is integrated.
- The handoff is an optional next step after research; Bankr handles the current quote, location eligibility and any execution. Dinn does not claim to trade through Bankr.

## Listing details

- Public listing: https://market.near.ai/a/dinn
- Current paid hire: one report for one token address; the live listing currently includes a same-token refresh. Verify price, escrow currency and SLA on the listing before quoting them.
- No dates or roadmap promises are implied by this record.
