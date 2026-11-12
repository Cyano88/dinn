# Dinn

Dinn is an AI workspace for Pons token operations and agent research. People use chat to prepare and review Robinhood Chain launches, wallet actions and fee claims. Trading agents can hire Dinn Labs on the NEAR AI Agent Market for a sourced, read-only token report.

The agent research service covers Pons launch age and phase, bonding-curve activity and fees, indexed holders and sampled wallet history, market references, contract controls, and supported PinkLock records. Every report is tied to a checked Robinhood Chain block. Missing or partial data stays visible. Dinn does not trade, sign, verify wallet ownership, or certify a token as safe.

Production uses Render and PostgreSQL. The separate NEAR Agent Market worker runs on the Dinn VPS and reads its recovery state through the Render PostgreSQL database. The public agent preview is `https://dinn-pasy.onrender.com`; the paid listing is [Dinn Labs on NEAR AI Agent Market](https://market.near.ai/a/dinn).

## Run and verify

Use Node 22 or later:

```sh
npm ci
npm test
npm start
```

Copy `.env.example` to `.env` and configure local credentials there. Never commit or paste credentials. `npm test` builds the browser bundles, checks JavaScript syntax, and runs the unit and HTTP-boundary suite. The current suite passes 341 tests.

The live Grail check at `0x43468fc21c46d30cf765e1a1d0ed32ecb6bd89a4` verified the report hash and returned its on-curve NVDA state, partial holder data, market references and sellability limits. The paid $0.10 hire was accepted and recorded as released, but both buyer and seller accounts belonged to the same owner. This confirms the paid delivery path, not independent customer demand. A funded launch from the user's wallet and a withdrawal to an external wallet have not been verified.

See [the agent guide](public/agent-guide.md), [NEAR Agent Market integration](docs/NEAR-MARKETPLACE.md), and [the integration record](docs/PONS-INTEGRATION.md).

## Historical implementation notes

# Current direction: Pons-first multi-launchpad Dinn

As of 2026-11-10, Ascend and Montra on Elysium are paused and labelled Coming soon. The active workspace supports AI chat, per-account local Pons briefs, verified Pons configuration reads and Robinhood Chain ETH balance reads. The original conversational UI is preserved. Pons native-ETH review, simulation, explicit wallet approval and receipt verification are implemented. No real transaction has been sent in validation. See [current integration status](docs/PONS-INTEGRATION.md). Run `npm install`, `npm test`, then `npm start`; local app: http://127.0.0.1:4317. Configure `.env` from `.env.example`.

Everything below is historical Elysium implementation documentation, not the active product flow.

---

﻿# Launchflow (working name)

An independent conversational token-operations assistant for Ascend on Elysium. The intended product connects launch, funding, buy/sell, holdings locks, token burns, creator-fee claims and paid DEX services in one reviewed workflow.

## Latest UI — sign-in first

The current interface starts with an X/Google sign-in card. The workspace stays hidden until authentication; missing provider configuration keeps entry unavailable. Navigation is Assistant, Launches and Agent access. Drafts and tracked launches are scoped to the signed-in account in this tab. No placeholder service grid, fake metrics or pulse effects remain. See [UI workflow](docs/UI-WORKFLOW.md) for the current flow, references and browser evidence. Earlier milestones below describe the implementation history.

## Current implementation — 6 November 2026

This is a local engineering preview, NOT a live trading product or completed hackathon submission.

- Responsive conversational workspace, editable launch details, receipt dashboard and agent integration page.
- Deterministic guided intent detection; optional server-side 0G model explanations.
- Seven-step conversational launch setup with inline choices, validation, pause/resume, tab-scoped draft recovery, editable review and JSON export. Fixed 1 billion supply, zero builder fee and no initial buy.
- Ascend `launchChecked` read/simulation adapter. It checks chain 99901, contract code, factory linkage, launch pause and allowed pair; reads current rules/start tick; simulates the exact call; returns predicted addresses and unsigned calldata.
- Human wallet approval and launch submission are implemented behind ENABLE_LIVE_LAUNCH (off by default). No server signer, deposits, live trading or fee collection. A successful simulation is not a deployment.
- Buy/sell/claim are documented integration work, not implemented execution. Locks/burns/DEX services/funding are visibly unavailable until their adapters and terms are verified.

## Run

Requires Node 22+.

    npm ci
    npm test
    npm start

Open http://127.0.0.1:4317. The server listens only on localhost.

Copy `.env.example` to `.env` and configure values locally. Never put secrets in chat, the repository, or browser code. `OG_API_KEY` and `OG_MODEL` enable inference. `ELYSIUM_RPC_URL` enables read-only Elysium launch simulations. No private key is required or accepted.

A missing key selects visibly labeled guided mode. A missing RPC disables simulation; the app never fabricates a deployment receipt. Model output is explanation only and cannot authorize actions or generate transaction fields.

## Judge walkthrough — do X, see Y

1. Start the server with no credentials; open the page. See a guided preview and live-sending-disabled label.
2. After configured sign-in, select Create a token. Answer one question at a time; see the launch summary update. Open Agent access for integration instructions.
3. Configure a launch with a name/ticker, pair, 1–10% fee, two nonzero EVM addresses and explicit takeover choice. Select Review launch to see a readable configuration. Edit a setting to invalidate the previous review; reload to recover the draft.
4. Enter a zero address or a fee outside the range. See validation fail; no calldata is generated.
5. With an independently verified Elysium RPC, simulate. The server verifies deployment relationships and simulates before returning unsigned data. No transaction is sent.
6. Run `npm test`. See domain and HTTP boundary checks pass.

No AI inference or chain simulation has been live-tested in this checkout: credentials/RPC are not configured. Playwright browser QA passed for the seven-step flow, invalid fee recovery, review, edit invalidation, reload recovery, service navigation and mobile overflow. Desktop/mobile screenshots are in output/playwright/.

## Verified research and constraints

Source snapshots in `docs/sources/` were fetched from Ascend's official GitBook on 6 November 2026. These are documentation evidence, not independent onchain verification.

- Launch guide: https://ascendlaunch.gitbook.io/docs/developers/integration-guide
- Deployment addresses: https://ascendlaunch.gitbook.io/docs/developers/mainnet-contracts
- APIs/bridge: https://ascendlaunch.gitbook.io/docs/developers/apis-and-bridging
- NEAR catalog: https://1click.chaindefuser.com/v0/tokens
- 0G terms: https://pc.0g.ai/terms

The retrieved NEAR catalog contains no Elysium destination. Its HyperCore assets must not be confused with HyperEVM or Elysium assets. Ascend's bridge documentation describes partner-only access until public launch. Service payment and launch funding remain distinct.

Ascend standard launch liquidity is permanently locked; creator-held token locking is separate. BurnSink has no withdrawal function according to the docs, but transferring to a sink is not evidence of a reduction in ERC-20 totalSupply.

Approved builders may have a builder-fee cap set by Ascend. This project is not approved and always uses zero builder fee. No claim of an Ascend partnership.

0G promotional credits and traffic permissions depend on the actual grant/account agreement. No credits were consumed in this preview.

## Hackathon provenance

New NEAR agent-access and Agent Market worker source was created during the hackathon window. Dinn, Pons, its wallet routes, and earlier NEAR research are pre-existing product foundation; judges should evaluate only the new NEAR work on `feat/near-agent-access`. No Hash PayLink or PolyDesk implementation was copied. Third-party dependency: viem (MIT). Dinn Labs is publicly listed on NEAR Agent Market. A paid `token.inspect` hire from a second account controlled by the owner returned a report in 11 seconds; the buyer accepted it and the marketplace recorded payment released. This verifies the controlled hire-to-release flow, not independent customer demand, a separately hosted autonomous agent, or withdrawal to an external wallet. No hackathon submission or public demo post has been sent. Re-read https://nearhackathon.com/HACKATHON.md before submission.

## Human and agent entry points

The same planner, launch validator and simulation adapter serve both interfaces.

- Humans: chat workspace at `/`, including **Copy agent instructions**.
- Agents: `GET /.well-known/dinn.json` (legacy alias: `/.well-known/launchflow.json`), `/agent-guide.md`, `/llms.txt`, `/api/agent/schema`, and `POST /api/agent/request`.
- CLI: `node cli.mjs discover`, `node cli.mjs plan "Prepare my launch"`, `node cli.mjs review --file examples/launch.partial.json`.
- Agent responses have explicit `needs_input`, `draft`, `review_ready` or `simulated` states and a `next` instruction. No missing wallet, fee or takeover choice is inferred.
- Request IDs are correlation labels, not idempotency keys. No retries are automatic.

NEAR Agent Market is Dinn's discovery, hiring and payment channel; Ascend/Elysium is the execution venue; 0G is inference. The public Dinn Labs listing is $0.10 per hire. A direct bridge is not required to pay for the preparation service. Funding a customer's launch wallet is a separate feature.

Marketplace MCP is at https://market.near.ai/mcp. The registered listing and its A2A/x402 hire flow are live; the local JSON API remains a separate free, read-only agent preview and is not itself an A2A or x402 implementation. See [the NEAR marketplace record](docs/NEAR-MARKETPLACE.md) for the paid-job evidence and remaining interoperability checks.

The recorded foundation suite passed 15 tests, including CLI-to-HTTP discovery/review, human-agent parity, missing-field handling and rejection of private keys/payment claims/execution flags. The separate paid marketplace verification and its limits are documented in [the NEAR marketplace record](docs/NEAR-MARKETPLACE.md).


## Wallet connection
The human workspace supports an injected browser wallet through EIP-1193. Connection requests account access, then reads accounts and chain ID. The user can explicitly choose the connected address during setup. Draft addresses are never replaced by an account-change event. Chain/account changes clear old reviews. Wrong-chain and deployer-mismatch warnings must be resolved before the human flow simulates.

Connection itself only requests account access and reads chain/account state. The separate launch approval action can request eth_sendTransaction when explicitly enabled. No private keys, message signing or automatic chain-switch requests are used. Mobile requires a wallet browser exposing an injected provider; WalletConnect and multi-wallet discovery are not implemented. Wallet interaction was verified using a mock browser provider, not a real funded wallet.

Current verification: 19 passing tests plus browser walkthrough. npm test includes syntax checks for all browser modules.

## Email/X embedded wallets
The primary onboarding is now Google or X via a Privy React island inside the existing chat workspace. The signed-in UI uses the embedded wallet; injected-wallet fallback is not shown. See docs/EMBEDDED-WALLETS.md for setup and exact limitations.

Set PRIVY_APP_ID and a verified, browser-safe ELYSIUM_PUBLIC_RPC_URL in .env, enable the login methods in Privy's dashboard, build the frontend bundle with npm run build, and restart the server. Missing configuration leaves sign-in explicitly unavailable; draft preparation still works. No application secret is exposed or required by this frontend.

The account menu supports linking the other sign-in method, wallet backup through the provider's export UI, and sign-out. These flows require live provider validation before accepting user funds. Login alone grants no server-side access, trade permission or payout ownership.

## Launch receipt verification
My launches stores a transaction hash with an immutable snapshot of the expected draft in the current browser tab. Records restore as NOT VERIFIED. The Verify receipt button queries Elysium through the server; no transaction is signed or resent.

POST /api/launch/receipt accepts {hash, configuration, expectedData?}. Recovery supplies the original calldata as expectedData. The same verifier is available to agents as launch.verify and through node cli.mjs verify --file receipt-request.json.

The verifier requires chain 99901, the expected sender/factory, the exact supported launchChecked calldata, a canonical receipt block, matching Launched and EscrowLaunched events from the documented contracts, and the factory escrow mapping at that block. Two confirmations yield verified; one yields confirming. Reverted and missing receipts are separate outcomes. Verification is an observation at that moment, not irreversible finality.

Current validation: 29 passing tests, production bundle build, browser tracking/invalid-hash/reload checks and desktop/mobile visual inspection. Chain responses in automated tests are fixtures; no real launch receipt has been verified here because no RPC is configured. Human wallet submission is now implemented behind the disabled release gate; see the milestone below.

Run npm run readiness for a configuration-presence report that prints no credentials. Actual provider login and network checks remain separate.

## Wallet submission and recovery — latest milestone

40 tests pass, including encoded-transaction validation, expiry, account/network changes, duplicate requests, declined approvals, ambiguous outcomes and storage failure. Mock-wallet browser QA passes through approval, pending/confirming/verified receipts, refresh recovery and mobile layout. No real transaction or wallet signature was requested.

After review and simulation, the human flow can request approval in the connected wallet. ENABLE_LIVE_LAUNCH defaults to false and also requires ELYSIUM_RPC_URL. Privy wallet confirmation UI is explicitly enabled. Before enabling live sending, resolve the dependency audit, configure and validate actual email/X onboarding and RPC access, and run independent read-only chain checks.

The original calldata and pending operation are saved in localStorage before the wallet request; browser Web Locks prevent overlapping requests across tabs of this origin. The transaction hash is saved immediately when returned. Unknown outcomes block another launch. Recover using the actual hash from wallet activity; receipt checks must match the original calldata, including salt. No automatic resend or receipt polling occurs. Storage is browser-local, not an account backup; do not clear it while an operation is unresolved. Replaced/cancelled transactions without matching calldata require manual investigation; automatic reconciliation is not implemented.

My launches keeps receipt observations in memory and resets them on reload. Pending-operation status retains its last observation and labels verified as a snapshot. Both can be rechecked. Agent APIs remain preparation/simulation/read-only verification only; service payment never grants signing authority.

## Dependency remediation — latest status
The vulnerable ws 8.x copies are patched through a scoped override. The refreshed audit has 28 affected packages (21 high, 7 moderate); remaining roots are decoder, UUID and Zod dependencies. Build metadata and a reproducible bundle-exposure report now distinguish installed dependencies from shipped code. All 40 tests and the browser auth-module import pass. See [dependency remediation](docs/DEPENDENCY-REMEDIATION.md). Live release remains blocked.

## NEAR agent-access work (in progress)

The active agent contract and examples are in [the agent guide](public/agent-guide.md). Read-only services cover live Pons token research, wallet balances, launch options and available route quotes. Research artifacts include a content hash, not a signature or payment receipt.

The new work is isolated on `feat/near-agent-access`, starting from baseline `29003cd1377e0d9c8fef95552cf04ac053f479d1`. Existing Dinn chat, Pons execution, wallet routes and earlier NEAR research are prior foundation. The self-hosted Agent Market worker is active on the dedicated VPS and uses Dinn's Render PostgreSQL database. Dinn Labs is listed at $0.10 per hire; one controlled paid `token.inspect` hire was delivered, accepted and recorded as paid by the marketplace. Independent-agent interoperability, cancellation/rework handling and external-wallet withdrawal remain unverified. See [the integration contract](docs/NEAR-MARKETPLACE.md) for the supported assignment and remaining work.

Run the foundation checks with `node --test test/agent-access.test.mjs test/server.test.mjs`. Start the server with `npm start`; discover `GET /.well-known/dinn.json` and `GET /api/agent/schema`, then `POST /api/agent/request` using the guide's example. This phase does not require an agent's private key or wallet signature.


The worker in `src/near-worker.mjs` stores assignment recovery state in PostgreSQL and only accepts the documented Pons research job shape. The paid hire verified assignment handling, report delivery, buyer acceptance and marketplace payment release. Remaining proof is a genuinely independent agent or buyer, cancellation/rework and ambiguous-submission handling, and—if needed—a separate withdrawal to an external wallet. Marketplace acceptance alone does not prove an external-wallet withdrawal.
