# Dinn integration candidate assessment - 2026-11-07

## Recommendation
Choose Ascend as the first direct token-launch integration and ecosystem-partnership target. Choose Agora as the first trading/portfolio API candidate to validate next; it is an aggregator, not a substitute launchpad partnership. Keep Eleos as a direct-integration/data fallback. Do not enable swaps or change network settings based on this discovery pass.

## Evidence obtained directly
- Read-only JSON-RPC requests to https://rpc.boxa.club and https://node.eleos.fun returned chain 99901.
- Both returned matching runtime code hashes for Ascend factory and launchpad, UniversalRouter, V4Quoter, BOXA hook, Eleos launcher/router, Agora router/executor (9 addresses). Raw results: output/research/launchpad-rpc-verification.json.
- These are two community endpoints, not proof of independent infrastructure or canonical finality. Reads used each endpoint's current head. BOXA confirmed head was 1868843; Eleos relayed/live head was 1911748. Their documentation distinguishes confirmed and live state; do not interpret the head difference alone as an outage or stale service.
- Ascend factory.launchpad matched the documented launchpad. launchpad.poolManager matched the documented PoolManager. owner matched the documented Safe; getThreshold returned 3 and getOwners returned 5 addresses. Raw reads: output/research/launchpad-ownership.json. This does not constitute a contract audit.
- Agora public API returned HTTP 200 for tokens, launchpads, wallet holdings, OpenAPI spec and a buy quote. Quote was for 0.001 HYPE using a public dummy recipient, not a user wallet; no signing or send. It returned amountOut/minAmountOut, feeBps 50, venues and transaction.to matching the documented AgoraRouter, chainId 99901. Raw responses: output/research/agora-*.json and candidate-source-3.txt.
- Eleos status and contract-discovery JSON endpoints returned HTTP 200; status reported current indexed head. Its integrate guide publishes addresses, event/quote/swap interfaces and open metadata endpoints. These are service/operator claims except where independently read above.
- Ascend ABI file fetch returned HTTP 403 (Cloudflare challenge). That response was HTML, not an ABI: no ABI digest match was asserted. Need official ABI handoff/access before production verification.
- ElysPump documentation access returned a mixed bridge/launch page with an RPC-sync warning and contradictory old/new swap descriptions. Deployment and reliability were not verified to the same depth; request a current versioned integration bundle before ranking it as primary.
- BOXA has published integration information and code was observed for its documented hook. Current developer page extraction was incomplete. Its RPC distinguishes live and confirmed state.

## Candidate fit
Ascend: strongest first launch partner for existing Dinn flow and incubator objective. Direct factory integration plus published contract relationships. Co-marketing, support and funding are not promised or confirmed for Dinn.
Agora: strongest documented API fit for multi-pad trading, portfolio discovery, holders, charts and builder attribution. Documented 0.5% trading fee is additional to venue fees/taxes. Builder share is 30% of Agora's trading fee, with a 10% user fee discount. Coin-to-coin routes do not earn builder attribution per current docs. These commercial terms are documented, not contracted with Dinn.
Eleos: strong public integration/data alternative, but a larger set of custom coin modes and tax behavior to support. Its own docs say no external audit yet.
BOXA/ElysPump: keep shortlisted; this pass did not produce a stronger verified third-party integration proposition than Agora or stronger launch/accelerator fit than Ascend.

## Conditions before production
- Obtain current source/ABIs and verify deployed runtime, router destinations, calldata, recipient, approvals, minimum received, expiration and all extra fees. API-returned calldata is untrusted until validated.
- Run fork buy/sell tests, then user-approved small live trades on verified mainnet. This pass executed no swaps and establishes no execution success or safety guarantee.
- Confirm canonical versus relayed state/receipt semantics, infrastructure availability, metadata rights, API versioning/rate limits, builder terms and support contacts.
- Agora docs disclose no external audit firm audit yet and owner powers over pauses/fees; validate those permissions against source and deployment.
- Keep Dinn adapters separate so launch, price/indexing and swap providers can be replaced independently.

## Primary sources
https://ascendlaunch.gitbook.io/docs/developers/mainnet-contracts
https://ascendlaunch.gitbook.io/docs
https://docs.agoradex.app/developers
https://docs.agoradex.app/reference/contracts
https://docs.agoradex.app/reference/fees
https://eleos.fun/docs/integrate
https://eleos.fun/docs
https://boxa.club/developers
https://docs.elyspump.com/?real=1
