# Ascend integration - 9 November 2026

Verified using current official documentation and read-only mainnet calls.

- Core deployed addresses match Dinn: factory, launchpad, router, quoter and Permit2 have code on chain 99901.
- Factory launchpad link and RuleSet match published addresses. At block 3011371 launches were unpaused and USDC, WHYPE and KNTQ were enabled.
- Standard zero-dev-buy launch simulation passed from the unfunded Dinn address at block 3012984. This was eth_call, not deployment. Predicted addresses are not deployed tokens.
- Simulation now pins code, configuration and execution to one fresh block and checks its hash again. Missing rule code and reorgs reject the review.
- Launch submissions now respect unresolved bridge, deposit, transfer and swap records.
- Creator fee API /api/ascend/fees and Launches > Creator fees validate the computed token/pair pool, factory escrow and launchpad creator linkage before reading wallet claimable credit.
- Live fee lookup succeeded at block 3013794 for token 0x5f8360dEd8eb7ba568d7A6D1Cb331B27C6f39055. Wallet credit was 0 WHYPE, unsettled pool fees 0.004 WHYPE. These are snapshots.
- Full ABI download returned HTTP 403; no unverified ABI bundle was adopted. Current documented function fragments are used.
- 141 automated tests passed. Live launch simulation and live fee reads passed; browser fee lookup inspected.

Remaining: verify an Ascend-capable broadcast route, implement claim settlement/submission and receipt handling, enable Ascend swap execution beyond the existing fork-preview adapter, obtain builder approval before nonzero builder attribution/fees, and arrange authenticated metadata publishing. No live launch, claim or Ascend swap was sent. The configured Montra path is not treated as proof that Ascend sends are supported.

Sources:
- https://ascendlaunch.gitbook.io/docs/developers/integration-guide
- https://ascendlaunch.gitbook.io/docs/developers/mainnet-contracts
- https://ascendlaunch.gitbook.io/docs/developers/abis-and-events

## General mainnet route and creator fee execution - 9 November, 16:47 UTC

This section supersedes the earlier submission-route blocker and read-only fee UI.

- Official Elysium network/building documentation updated November 9 publishes https://rpc.elysium.kinetiq.xyz and Alchemy mainnet endpoints, with standard EVM deployment support. The official public endpoint returned fresh chain 99901 blocks and recognized eth_sendRawTransaction; the probe used only invalid unsigned 0x bytes and could not execute. This is route capability evidence, not a funded transaction test.
- Local server/browser/market RPCs now use the official public endpoint. ENABLE_LIVE_LAUNCH and ENABLE_ASCEND_FEES are true locally. Recognized general routes are required; Montra-only or unknown/mixed connections cannot enable Ascend. Existing Montra/native transfer adapters continue to work with the general route without depending on Montra relay health.
- Launch approval performs server preflight on the exact prior simulated calldata, checks current execution and gas funding, then asks the wallet. Latest live simulation passed at block 3365950; wallet 0x1e6304087F981b8E88dAa89E8fc391217373d496 had 0 HYPE, and preflight correctly blocked for gas.
- Creator fees now support separate settle and claim reviews. Preparation verifies escrow linkage and balance, simulates the action, estimates gas and checks funding. The browser rechecks linkage and simulates before wallet approval. Unknown outcomes persist and block duplicate or conflicting actions after reload.
- Claims verify canonical transaction identity, Withdrawn destination and the matching quote-token Transfer. Settlement requires the escrow Settled event. Two confirmations are required. Receipt polling is bounded; unresolved actions expose manual checking and hash recovery. HYPE-pair claims pay WHYPE; no unwrap is silently added.
- These are standard CreatorEscrow operations, not SeatFactory holder-reward claims, builder claims or a new Ascend trading adapter. Metadata publishing and broader Ascend swaps remain open.
- Fresh full build/syntax/test run: 148 tests passed. New cases cover route gating, gas funding, exact receipt payouts, spoofed destinations/pools/calldata, stale reviews, storage failure, cross-operation conflicts and unknown outcomes. Existing launch own-record handling was corrected so resolved launches do not block themselves.
- Browser verification: live fee lookup succeeded after one transient public RPC failure. Isolated fixture claim: one simulated wallet send, confirmed receipt, mobile overflow false. Refresh recovery restored an ambiguous request with zero sends. Fixtures/routes were removed. Actual user login/signing and funded launch/claim are not claimed as tested.
- Local server restored at http://127.0.0.1:4317. No deployment, real signature, broadcast, or funds movement occurred. Public production access still needs dedicated provider capacity, backend identity/quota/storage work and policy completion.

Evidence: output/build/ascend-production-tests.log; output/playwright/production-fees-live.png; output/playwright/production-fee-review-mobile.png; test/ascend-fees-execution.test.mjs.
Sources: https://elysium.kinetiq.xyz/docs/connecting-to-elysium ; https://elysium.kinetiq.xyz/docs/building-on-elysium ; https://ascendlaunch.gitbook.io/docs/developers/integration-guide ; https://ascendlaunch.gitbook.io/docs/developers/abis-and-events ; https://montramarkets.xyz/docs/rpc.md .
