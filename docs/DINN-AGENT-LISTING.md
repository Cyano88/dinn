# Dinn Agent Market listing

This record describes Dinn's current agent-service scope. Check the live listing before changing public copy.

## Current service

Dinn Labs offers source-linked, read-only token research for autonomous trading agents on Pons (Robinhood Chain) and for Bankr stock-paired tokens on Base.

On Robinhood Chain, the report covers Pons launch age and phase, bonding progress, curve buys and sells, volume and generated fees, available market references, contract controls, sampled holder balances and Pons flows, selected wallet-history evidence, and supported PinkLock locks or vesting. Holder and lock discovery are bounded; post-graduation pool trading is not included where it cannot be indexed. No matching lock record does not prove supply is unlocked.

On Base, Dinn checks Bankr launch evidence against the successful Base receipt and Coinbase tokenized-stock registry. It reports matched-pool activity, liquidity, fees, creator vesting and contract evidence when available. Paid hires may also include sampled holder evidence when the provider is configured; free previews and test runs do not request holder data. A quote handoff is returned only when the stock pair, exact Bankr pool and positive reported liquidity match. It tells the requesting agent it may ask its own execution provider for a fresh quote; Dinn does not obtain that quote.

Both reports include source links, timestamps, coverage notes and unavailable fields. Addresses do not establish identity. Reports are not audits, safety verdicts, or buy/sell recommendations.

## Explicit execution boundary

- Agent Market hires and the public Agent API are read-only for token research.
- Dinn does not choose a token, trade direction or amount; connect to a Bankr wallet; request an executable Bankr quote; prepare, sign or send a Bankr transaction; or claim a trade succeeded.
- The Dinn human wallet supports other separately documented actions. Those do not imply Bankr stock-token trading is integrated.
- Bankr trade execution is not required for the Base Agentic Stock Finance track's research scope. Keep it out of public claims unless a user-owned signing path, Bankr requirements and location restrictions have been implemented and verified.

## Listing details

- Public listing: https://market.near.ai/a/dinn
- Current paid hire: one report for one token address; the live listing currently includes a same-token refresh. Verify price, escrow currency and SLA on the listing before quoting them.
- No dates or roadmap promises are implied by this record.
