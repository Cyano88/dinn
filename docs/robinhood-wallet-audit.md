# Robinhood wallet migration verification — 2026-11-11

## Implemented scope

- Same-account auth/provider refresh preserves the active conversation, view and unsent text. An actual wallet change invalidates financial reviews.
- Quiet background draft sync: only errors and conflicts appear. Removed the redundant Workspace breadcrumb.
- Wallet balances on Robinhood Chain (4663), Base (8453), and Arbitrum (42161), with USD reference estimates and explicit partial/unavailable states. Robinhood token discovery uses authenticated Blockscout; indexed holdings are rechecked on chain.
- Native/ERC-20 sends on Robinhood Chain.
- Base/Arbitrum ETH, USDC and USDT bridges into Robinhood Chain.
- Same-network Base/Arbitrum swaps limited to ETH, USDC and USDT on both sides, enforced by backend and browser transaction validation.
- Robinhood swap choices include known Pons pairing candidates, held tokens and a custom contract address. A selection is not evidence of an executable market; every route must pass a live quote and wallet simulation.
- Inline chat review, wallet approval and receipt feedback. No new transaction review sheets.
- Legacy Ascend/Elysium wallet, swap and funding routes remain retired (HTTP 410); they are not silently redirected across chains.

## Execution and recovery checks

Transactions are reconstructed from the reviewed action, account, network, token, recipient/deposit address and exact amount. Extra transaction fields, stale reviews and changed wallets are rejected. Token amounts use integer precision. Review must match the requested selections. Source-network swaps cannot use custom token addresses.

Relay deposit routes bind the source payment, destination asset, minimum received, recipient and refund recipient. No arbitrary output calls are accepted. Source deposit confirmation is distinct from destination delivery. Completion requires a canonical successful destination receipt and matching payout with two confirmations. Refund reports remain unresolved until a payout is verified. Provider failures never authorize a resend.

Browser wallet prompts share an account lock across launch, purchase approval, fee claim and wallet operations. Pending wallet actions block launches/claims; pending launches and purchase approvals block wallet actions. Recovery is persisted before the wallet request. Unknown results and unreadable recovery storage fail closed. A failed switch back to Robinhood is reported.

## Evidence

- Final full automated suite: 301/301 passed.
- Final targeted wallet, launch and fee-claim suite: 40/40 passed, including regenerated Relay IDs and USDT empty-return compatibility.
- Browser fixtures: same-account refresh, stable navigation, unsent edits, unavailable balances, inline bridge review, exact Base/Arbitrum asset choices, Robinhood pair choices, embedded/external wallet selection, changed-wallet invalidation, resumed draft and inline DEX review passed.
- Live read-only checks: balances succeeded on all three networks; all six bridge inputs returned validated quotes; all 12 Base/Arbitrum swap directions returned validated quotes; Robinhood ETH/USDG quotes succeeded both ways.
- Relay did not return executable quotes for ETH/NVDA or NVDA/USDG in this check. Pons pairing eligibility does not imply Relay liquidity. Pre-graduation Pons curve trading is not implemented by this swap adapter.

## Remaining proof

No real user funds were moved, no paid launch was submitted, and no actual fee claim was signed for this audit. Funded end-to-end wallet/provider execution remains to be proven. Provider liquidity, RPC/indexer availability and live wallet balances can change. Reference USD values are estimates, not guaranteed execution prices.

Sources: Robinhood Chain bridging documentation (https://docs.robinhood.com/chain/bridging/), Relay quote v2 and intent-status v3 documentation (https://docs.relay.link/references/api/get-quote-v2, https://docs.relay.link/references/api/get-intents-status-v3).

