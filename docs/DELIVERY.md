# Delivery plan

## Product contract

One conversation, independent reviewed actions. Proposed progression:
request -> clarify -> draft -> verify capabilities -> quote -> review -> user authorization -> submitted -> receipt reconciliation -> completed / failed / unknown.

Every action is bound to a chain, wallet, exact contract, amounts, recipient, policy version, expiry and quote where applicable. A timeout never implies failure and must not trigger a blind resubmission. Paying the service never authorizes a wallet operation.

## Next implementation milestones

1. Supply a verified Elysium RPC and 0G key/model through local configuration. Verify deployed bytecode/linkage and run read-only simulation with a user-provided wallet address. Confirm commercial use of the compute-credit allocation.
2. Validate the implemented wallet approval/submission/recovery against the configured provider and verified chain. Resolve dependency advisories before enabling live sending. Local implementation and mock tests are complete; no background signing.
3. Add real buy/sell quotes and UniversalRouter 2.2.0 V4_SWAP encoding, including minHopPriceX36. Use exact allowances via Permit2, output minimum, quote expiry, simulation and post-receipt balance/events. Never approve router directly.
4. Add creator escrow discovery from trusted events, claimable reads and claim transactions to fixed recipients.
5. Choose a verified holdings locker; specify quantity, beneficiary, UTC unlock time and cancellation semantics. Never confuse token locking with LP locking.
6. Verify supported token burn semantics. Show totalSupply reduction separately from irrevocable sink transfers. Every burn needs explicit irreversible-action review.
7. Identify what DEX service the user wants and its official purchase API/invoice. Listing, enhanced profile, advertising and liquidity are separate capabilities. No invented provider wallets or paid-listing guarantees.
8. NEAR: start with read-only catalog and dry quotes for supported routes. Confirm canonical Elysium bridge availability with Ascend before proposing a multistep funding path. Service fees can settle via NEAR separately, but that alone is not a strong chain-abstraction demonstration.
9. Integrate metadata publishing after launch using the official authorization flow. A token onchain does not mean its image/links have been published.
10. Public demo and submission only after repeatable end-to-end evidence; retain raw receipts and disclose testnet/simulation distinctions.

## Commercial model to validate

Transparent service fees, optional creator subscription, and Ascend builder fees only after approval. Count independently paying creators, successful launches, repeat creator actions and attributable trading separately from inference calls. Do not manufacture activity or promise trading demand from deployment counts.

## Current external requirements

- Configured Elysium RPC and server-only 0G key/model.
- 0G grant permission for serving paying customers.
- Ascend partner discussion for indexer access, bridge access and builder fee eligibility; no outreach sent.
- User clarification of paid DEX service.

## Local testing

Six domain tests and one HTTP integration test. No live funds or transactions. No configured secrets. Browser initialization failed; visual QA remains outstanding.

## Agent-access milestone

Added local discovery, instructions, structured request API and terminal CLI. Human and agent calls share planning, launch validation and simulation. Marketplace integration details and remaining onboarding are in NEAR-MARKETPLACE.md. Marketplace payments do not require an Elysium bridge. The current test count is 13; the earlier six-plus-one entry records the initial milestone.

## Human workspace implementation — 6 November 2026
- Added a guided seven-setting launch conversation and editable progress summary.
- Added a service dashboard with explicit preparation/development status.
- Drafts persist only in sessionStorage for the browser tab; no wallet secrets requested.
- Review validates server-side; edits discard stale review/simulation cards.
- JSON exports match the existing agent/CLI input shape.
- Browser verification: completed launch with invalid fee correction, explicit false CTO, blocked simulation without RPC, refreshed draft recovery, fee edits, service navigation, 390px mobile overflow check.
- 15 automated tests pass. Screenshots under output/playwright/.
- Still pending: configured 0G inference, verified RPC live simulation, wallet execution/receipt reconciliation, NEAR marketplace worker/payment integration.

## Wallet readiness — 6 November 2026
- Browser-injected wallet connection uses account authorization plus account/chain reads only.
- Deployer and recipient fill from the connected account only through explicit chat choices.
- Wallet account, chain and disconnect events invalidate existing reviews/simulations without overwriting draft addresses.
- Wrong-chain and account-mismatch states block the human simulation action until corrected.
- Browser script syntax checks now run as part of npm test; fixed the New conversation syntax regression.
- 19 tests pass. Playwright mock-wallet flow covers initial account event, connected-account choices, review invalidation, unchanged draft on account switch, disconnect, and mobile overflow.
- This is mock-provider verification, not live-wallet or live-chain evidence. No signing/broadcast methods are implemented.
- Provider behavior reference: https://eips.ethereum.org/EIPS/eip-1193

## Embedded wallet onboarding — implementation in progress
Email and X replace external-wallet-first onboarding. SDK integration mounts separately from the chat app and passes an embedded provider into the same account/chain readiness checks. Public app ID and public RPC have separate configuration; private server RPC is never exported. No backend authentication claims are inferred from browser events. Privy dashboard setup and live login verification remain required; see EMBEDDED-WALLETS.md.

Embedded-wallet local milestone complete: bundle build and browser module import pass; 22 application tests pass. Email/X onboarding requires actual Privy app configuration and live flow validation. Dependency audit remains 29 advisories (18 high, 11 moderate) after a non-forced fix attempt; resolve before production. Details in EMBEDDED-WALLETS.md.

## Receipt verification milestone — 6 November 2026
Implemented the read-only launch verifier and My launches tracking view. It binds transaction calldata, sender, destination, canonical block, trusted launch/factory events, recipient, ruleset and escrow mapping to the expected draft; two confirmations are required for verified. Agents/CLI use the same verifier. Missing receipts do not trigger resubmission, and restored local records never retain a verified status.

Validation: 29 tests pass; desktop/mobile browser tracking, malformed hash handling, disabled RPC check, and reload behavior verified. No live receipt checked. Signing and receipt-polling/recovery for transactions sent by this app remain future implementation. npm run readiness confirms no local Privy/RPC/0G configuration yet.

## Wallet approval and recovery milestone — latest, 6 November 2026
Human launch submission is implemented behind ENABLE_LIVE_LAUNCH=false. The browser validates encoded transaction settings, expiry and wallet state; saves the pending operation before requesting approval; and blocks retries after an ambiguous result. Recovery binds receipts to the exact original calldata. My launches and the pending banner share current receipt observations. Older milestone sections above record earlier implementation states.

40 automated tests pass. Mock browser coverage includes the disabled gate, one wallet send, pending/confirming/verified transitions, timeout, refresh without wallet calls, hash recovery and mobile overflow. No real wallet or chain transaction was used. Live provider/RPC/0G configuration, dependency remediation and NEAR marketplace integration remain open. See README for persistence and replacement limitations.

## Dependency remediation follow-up
Patched vulnerable ws 8.x copies without downgrading Privy. Current audit: 28 affected packages (21 high, 7 moderate). Added build metadata and reproducible exposure report; decoder and UUID code are absent from this auth bundle, but Zod v3 from x402 is included. 40 tests and browser module import pass. Unresolved compatibility changes and live provider configuration remain blockers; see DEPENDENCY-REMEDIATION.md.
