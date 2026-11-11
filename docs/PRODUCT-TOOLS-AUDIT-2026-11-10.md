# Dinn product-tool audit and wiring - 2026-11-10

Scope: preserve the original conversational UI, make its commands real, and connect AI to the supported Pons/Robinhood product tools. This is an application capability audit, not a Solidity security audit.

| Tool | Previous Ascend implementation | Active Pons/Robinhood wiring |
| --- | --- | --- |
| Chat clear/reset | Local command handlers in old public/app.js; omitted in replacement shell | Restored before AI/field parsing. Clear chat and bare clear remove transcript, retain draft; reset draft uses explicit confirmation and preserves transaction records |
| Launch setup | Seven-field conversation, live summary, review | Original UI preserved, with Pons-specific terms and explicit review/simulation/wallet approval |
| TS | Contract totalSupply and decimals reads | Read-only Robinhood inspector, pinned block and chain check |
| SC | Sourcify runtime-bytecode matching | Same verification logic on Robinhood; missing record remains unknown, not safe |
| Contract checks | Code, owner(), EIP-1967 slots, verified ABI control names | Connected to inspect_token; detailed evidence visible in chat |
| Wallet balance | Elysium native and token balances | Robinhood native ETH read wired to wallet_balance; token portfolio discovery not ported |
| Transaction status | Specific launch/swap/transfer receipt checks | General Robinhood canonical receipt read plus separate exact Pons launch verification |
| Launch rules | Ascend-specific economics | launch_options reads current Pons configs, fee cap, launch fee and wallet permission |
| Personal holdings lock | Blocked: no verified locker, beneficiary or unlock rules | Still unavailable. No arbitrary locker call added |
| LP-lock evidence | Inspector explicitly did not verify pool/lock ownership | Still unknown unless a dedicated pool/position verification adapter is implemented |
| Burn | Blocked: sink transfer not proof of supply decrease | Still unavailable; no token-specific burn adapter |
| Trading | Ascend quote paths and Montra execution paths | Elysium paused. Pons buy/sell adapter not connected |
| Creator fees | Ascend-specific escrow inspection/claim adapter | Paused. Pons token-stack/escrow binding not implemented |
| Transfer / funding | Elysium transfer, bridge/deposit paths behind gates | Paused; no Robinhood transfer or bridge adapter |
| DEX services / payments | Provider selection and payment integration absent | Unavailable |

Registry: src/tool-catalog.mjs is the active capability list and function schema. src/product-tools.mjs validates and runs read-only tools; src/product-chat.mjs supports bounded AI function calls (at most three reads across tool rounds), tool results and allowlisted UI buttons. Direct common requests also use the same tool implementations without an AI round trip. Tool output is data, never signing authorization. Unknown tool names, extra fields and foreign network requests are rejected. API/provider error URLs are not exposed.

Discovery: GET /api/tools. Execution: POST /api/tools/run with name, args and optional walletAccount (read-only public account context). No model tool can sign, send, approve, reset app data or provide arbitrary RPC/contract calldata. The wallet launch path remains behind explicit user review and approval.

Thinking indicator cycles one/two/three dots until first response delta; reduced-motion preference disables animation. Chat commands and token data edits do not depend on model claims. General AI text cannot clear data or mutate launch settings.

Validation completed: original chat UI preserved. Playwright verified real clear-chat persistence, bare launch intent, explicit draft reset, one/two/three animated dots and removal on first delta, live AI conversation, live balance tool, TS and SC follow-ups, evidence rendering, and mobile tool directory layout. A live AI function call fetched a fresh wallet balance rather than reusing history. A bounded current-factory event scan found a Pons token; its totalSupply/decimals read succeeded and its absent Sourcify record remained unknown. No financial transaction was submitted. Fixture data and browser routes were removed.

Tests cover strict tool arguments, absence of signing methods, chain/address routing, AI tool-call execution, no provider secret leakage, and refusal to publish a stale answer when an explicit tool request did not execute. Full final test suite: 169 passed. Syntax checks passed. Artifacts: output/playwright/ai-selected-tool.png, tools-mobile.png, tool-directory.png; output/research/pons-live-token-inspection.json.
