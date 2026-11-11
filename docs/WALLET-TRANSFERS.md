# Wallet balances and transfers

Implemented 2026-11-07. The configured RPC was checked live: Elysium testnet, chain 99801. A read-only native-balance HTTP request succeeded. No real transfer was submitted during development.

## Current scope
- Wallet navigation and chat commands (`wallet`, `portfolio`, `send tokens`, or `send 0.1 HYPE to 0x...`).
- HYPE plus up to 12 manually added ERC-20 contracts. Balances are read at a stated block. Metadata/read failures remain errors, never zero balances. No automatic token discovery or fiat valuation.
- Native and standard ERC-20 sends: explicit recipient/amount, strict decimal precision, server simulation and balance/gas checks, 60-second review expiry, client calldata validation, provider simulation, fresh account/chain checks, and explicit wallet approval.
- Transfers use no token allowance. No approvals, swaps or arbitrary calldata can be supplied through this transfer API.
- Pending state is saved before the wallet call. A browser lock prevents concurrent wallet prompts. Unknown wallet results block retries and support hash recovery. The app never retries a send automatically.
- Receipt checks match sender, destination, value and calldata; ERC-20 checks also require the expected Transfer event. Canonical block checked and two confirmations required. Fee-on-transfer or nonstandard tokens can remain unverified and need manual investigation.
- Polling runs every 10 seconds for at most 12 follow-ups, then Check status remains available. Per-wallet recovery persists in localStorage. Added-token lists are scoped to user, network and wallet.
- Testnet sends enabled. Mainnet sends require ENABLE_WALLET_TRANSFERS=true independently of the launch gate. No mainnet release flag was enabled here.
- Wallet read/prepare/receipt endpoints have a process-wide 40-request/minute limit. These are local-preview controls, not authenticated per-user production quotas.

## Swap blocker
Ascend documents router 0x1B341FDD55d56F8E08409A2C25DDFad93Eb03C1a and quoter 0x379F556c5a748BD7Cc9baF0F7A344094Ac1814f5 on chain 99901. Both returned no code at those addresses on the configured chain 99801. Swaps are unavailable; there is no trading adapter enabled or fake quote. Need verified testnet deployments or mainnet RPC and deployment checks before implementing/activating quotes, Permit2 allowance stages and UniversalRouter execution.
Source: https://ascendlaunch.gitbook.io/docs/developers/mainnet-contracts

## Validation
71 tests pass across the repository. Transfer coverage includes precision, fee balances, network/release gates, ERC-20 false-return simulation, calldata/recipient tampering, account changes, persisted pending state, unknown-result no-retry, and receipt mismatch.
Mobile browser fixture: balances, send review, zero requests before approval, exactly one mocked wallet send, confirmed receipt UI, unavailable swaps, no horizontal overflow. Screenshots in output/playwright/dinn-transfer-review-mobile.png and dinn-wallet-mobile.png.

Before public rollout: verified backend account authentication/persistent quotas and real funded-wallet transfer validation remain required. The completed fixture is not evidence of a real onchain transfer.
