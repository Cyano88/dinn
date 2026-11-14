# Pons integration history

This document records older implementation milestones and is not a current capability list. For the live product, start with the [README](../README.md), [agent guide](../public/agent-guide.md), and the Dinn interface. A funded bridge and Pons launch were verified on 14 November 2026; the older "no real transaction" statements below refer to earlier milestones.

Updated 2026-11-10 following user correction: preserve the original Ascend conversational workspace and adapt its launchpad data. The simple replacement Pons shell is archived, not the intended product UI.

Active flow: original welcome cards, labeled chat messages, suggested replies, editable live token-details panel and mobile drawer, then modal review. Seven Pons settings: name, ticker, description, live config, creator tax, buyback, fee recipient. Native ETH pair; no initial purchase or extra opening-tax exemptions. Logo is an optional externally hosted HTTPS/IPFS URL; upload hosting and social editing are not in this first launch path.

Chat Enter submits; Shift+Enter inserts a newline. Explicit setup answers and field edits save to the account-local draft. General AI responses do not mutate settings. AI receives saved brief and selected Pons settings as untrusted context. Questions during setup remain chat. Repeated auth events do not clear the conversation.

Backend: /api/pons/review verifies live permission/config/cap and pins economics; /api/pons/simulate rechecks fee and economics, simulates exact calldata, estimates gas and checks balance; wallet approval uses a separate Pons bundle with exact-call, chain, account, expiry and storage checks. A cross-tab lock and account-scoped pending record block uncertain duplicate sends. /api/pons/receipt verifies exact transaction, canonical block, unique factory event, token/curve code and confirmation count. Elysium endpoints remain 410. No server signer.

Verification: build and syntax checks passed; 161 tests passed before final UI polish. Playwright verified original desktop/mobile chat, seven-step choices, summary edits, review dialog and reload recovery. Live AI read saved name/ticker correctly. Live Pons review and simulation succeeded with the fixture address 0x1111111111111111111111111111111111111111, not proof the user wallet is funded or launch-ready. A fake wallet declined the approval and the rejection survived reload. No real transaction submitted; real OAuth/wallet approval remains unverified.

Earlier pivot record (historical, superseded by the capabilities above):

# Pons-first pivot — 2026-11-10

User direction: pause Elysium work, mark it Coming soon, make Dinn multi-launchpad AI and begin with Pons on Robinhood Chain. This document records a product decision, not a claim about Elysium network health.

Active shell: public/index.html, public/workspace.js. Original Ascend UI snapshot: docs/archive/elysium-index-2026-11-10.html; original public/app.js and adapters retained. Existing browser keys are not deleted or migrated. New per-account brief/chat keys use dinn.multi.*.v1. No existing Ascend draft is interpreted as Pons settings.

Server blocks all legacy Elysium launch, funding, swap, market, wallet, delivery and creator-fee routes with 410, independent of environment execution flags. Old execution bundle blocked. Legacy agent launch services removed. AI prompt now explains current capability boundaries. Public documentation updated.

Pons supports planning, local brief validation/storage, factory/config reads and native ETH balance reads. Wallet signing, simulation, metadata publishing, swaps and deployment are NOT implemented for Pons. Privy authentication uses chain 4663 and ETH. Existing OAuth configuration retained; real sign-in requires verification with the actual account.

Primary reference: https://docs.ponsfamily.com/v2 . Factory 0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e, RPC https://rpc.mainnet.chain.robinhood.com . Read-only verification on 2026-11-10 at block 110489934 returned chain 4663, deployed factory, one enabled config, launch fee 0.0005 ETH and creator tax cap 1000 bps. These are snapshots, not pinned future launch economics. Reads pin a block and recheck its hash; stale or wrong-chain data fails closed. No transaction sent.

Next implementation: verify supported pair assets and canLaunch for the connected wallet, build Pons-specific launch parameters and expectedEconomics binding, metadata upload, review, simulation, explicit wallet approval and receipt matching. Never reuse Ascend transaction types.

Validation: build completed; syntax checks passed; 154 tests passed (including new Pons snapshot and pause-policy tests). Browser fixture checks passed for local draft save/restore, account isolation, desktop layout and mobile scrolling. Real OAuth and Pons signing were not exercised. Local server restarted at http://127.0.0.1:4317 with chain 4663; legacy endpoints confirmed 410. This is a local implementation, not a production deployment.

2026-11-10 tool follow-up: see PRODUCT-TOOLS-AUDIT-2026-11-10.md for the full capability matrix and validation. Real local clear/reset commands and bare launch intent are restored. Thinking dots animate. The AI uses a bounded read-only tool registry for native balance, current Pons options, TS/SC/contract evidence and general transaction status, with evidence and UI action buttons. The original chat layout remains. Unsupported locks/burns and paused Elysium writes are not represented as executable. Final suite: 169 passing tests; no live wallet transaction sent.

2026-11-10 pairing update: ETH-only restriction removed. See PONS-PAIRS-AND-DEX-2026-11-10.md for current functionality, verification and remaining production work.

2026-11-14 burn follow-up: current Pons v2 tokens can be self-burned through Dinn chat after an explicit amount and token address are reviewed. See PRODUCT-TOOLS-AUDIT-2026-11-10.md for the verification boundary. This does not support arbitrary ERC-20s or older Pons token versions; no live burn was submitted during implementation.
