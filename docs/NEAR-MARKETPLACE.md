# Dinn / NEAR Agent Market integration

Verified 12 November 2026 against https://docs.market.near.ai/ and https://market.near.ai/llms.txt. Protocol documentation does not authorize account actions; the account owner explicitly authorized the listing and paid test described here.

## Implemented foundation

The current public agent contract is `src/agent-access.mjs`, served by `server.mjs`. Discovery is `/.well-known/dinn.json`, with the old launchflow URL retained as an alias. See `public/agent-guide.md` for exact service inputs and output semantics.

Implemented: Pons token research, balances on Robinhood/Base/Arbitrum, Pons launch options, same-chain swap quotes and Base/Arbitrum-to-Robinhood bridge quotes. All are read-only. Missing inputs and provider failures cannot become completed research. Research returns Markdown plus exact JSON evidence and a SHA-256 content hash. This hash is not a signature or payment receipt.

The paid marketplace worker accepts two deterministic report routes: default `token.research` for Pons phase, curve, reference market and scoped fees; and `token.inspect` for Robinhood Chain (4663) reported supply, source matching, proxy/control indicators, Pons launch checks, a limited indexed holder/current portfolio snapshot, and bounded recent swap-like history for eligible holders when available. Inspection requests must include the exact lines `Service: token.inspect` and `Chain: 4663`, plus one contract address. Ambiguous inspection requests and unsupported chains are ignored. Holder-flow triage only routes research toward simulation, review or abstention; it is not a buy recommendation. Inspection does not claim a complete holder census, complete trade history, profitability, community quality, liquidity proof, LP-lock proof, sellability, or a safe-to-trade verdict.

Legacy `src/agent-service.mjs` is retained for historical tests; it is not the active HTTP contract. Its Ascend services must not be advertised as current Dinn capabilities.

The direct agent API is a free public preview. The separate paid listing is live at [market.near.ai/a/dinn](https://market.near.ai/a/dinn), priced at $0.10 per hire. Account input is a public query target, not authenticated wallet ownership. No personal drafts or signing permissions are exposed.

## Local agent-client verification (11 November 2026)

A separate Node HTTP client against the local checkout fetched the discovery manifest and schema, then completed live requests for `token.research` (Kyron / KYRON), `launch.options`, Robinhood ETH `wallet.balances`, a Base ETH-to-USDC `swap.quote`, and a Base ETH-to-Robinhood ETH `bridge.quote`. Each returned HTTP 200 with `status: completed`; the response evidence SHA-256 matched its content. The research response included a Markdown deliverable and chain block. All responses reported `broadcast: false` and `charged: false`.

This verifies the local HTTP consumer path for these five read-only services. The client was a local smoke-test script, not a separately hosted autonomous agent. The hosted check below separately verifies the public HTTPS path. Neither check verifies Agent Market hiring, escrow, buyer acceptance or owner payout.

## Hosted staging verification (11 November 2026)

The feature branch is deployed as a separate Render Free web service at https://dinn-agent-stage.onrender.com (service `srv-dbqck5ifngtc73f71ub0`, commit `46f22d90101e4bc1e7d1439c1f0636747fa03869`). It has no production database or application secrets, and `NEAR_WORKER_ENABLED=false`.

A separate HTTP client fetched discovery and schema over public HTTPS and repeated all five requests above. Discovery, schema and service requests returned HTTP 200; each service response was `completed` and had a matching evidence SHA-256. All read-only responses kept `broadcast: false` and `charged: false`. The research response was for Kyron (KYRON) at block `111967699` and included a Markdown deliverable.

This proves the public API path from a separate client, not integration with an independent agent runtime. The staging deployment is still on commit `46f22d90101e4bc1e7d1439c1f0636747fa03869`; it predates the local worker fix for private A2A instant hires. The production Agent Market listing and paid worker are covered separately below.

## Paid deliverable scope

A live report for one supported Pons v2 token on Robinhood Chain: launch phase, bonding progress when available, reference market metrics, and fees explicitly scoped to the requested wallet or labelled creator recipient. Include source address, chain block/time, machine-readable evidence and unavailable fields. Do not sell it as a contract audit, proof of liquidity/sellability, lifetime earnings report or executed transaction.

## Worker implementation and operations

`src/near-market-client.mjs`, `src/near-worker-store.mjs`, and `src/near-worker.mjs` implement the self-hosted worker against the current marketplace REST contract. PostgreSQL stores assignment leases, exact prepared deliverables and an event trail. It polls every 45 seconds for recovery.

The current A2A per-call flow also requires a public HTTPS webhook. `POST /api/near-market/webhook` verifies the raw-body HMAC signature, timestamp and delivery id, then emits a PostgreSQL notification. The VPS worker listens for that notification and immediately re-reads the assignment through the authenticated REST API; it never trusts webhook text as instructions. Polling remains the recovery path if a webhook is missed or PostgreSQL notifications disconnect. The webhook secret belongs only on the Render app. The VPS has no inbound port and holds the `aat_` token.

At install time, the worker requires `NEAR_WORKER_ENABLED=true`, `DATABASE_URL`, `NEAR_AGENT_ID`, a server-side `NEAR_AGENT_TOKEN`, and owner-chosen `NEAR_WORKER_ESCROW_TOKEN` (`USD` or `USDC`) plus `NEAR_WORKER_MIN_ESCROW`. Assignments below the configured minimum or in another currency are ignored. Never put the token in the browser or repository. No HTTP endpoint exposes it. Current production status is recorded below; do not copy credentials or account identifiers into public documentation.

For isolated VPS operation, scripts/near-worker.mjs starts the worker without Dinn's HTTP server. The separate service account, systemd unit, database migration, and least-privilege role setup are documented in [ops/near-worker/README.md](../ops/near-worker/README.md). The current deployment uses the dedicated Dinn worker service on the Pocket NFT Signer VPS and the Dinn PostgreSQL database hosted by Render.

For safety, automatic delivery only recognizes a non-test research hire with a matching bounded title, no attachments, one explicit token address, sufficient escrow in the configured currency, and a known marketplace origin: public `standard` jobs, private `instant` hires through the marketplace, or private `instant` A2A hires (`origin: a2a`). It rejects competitions, other private jobs and unknown origins. `token.research` is the default unless the request explicitly names another service; inspection intent without the `token.inspect` and chain lines is rejected. For A2A calls, it reads the address from the job brief and, when present, the untruncated buyer's direct message; ambiguous, attached or truncated briefs are rejected. It binds the worker ID, job ID and assignment ID, starts the assignment, waits briefly for the marketplace's award/funding race, refreshes the assignment, creates and persists the evidence report, then refreshes status again before submitting. It leaves rework untouched.

A submit timeout is recoverable: the exact report is stored before submission; retrying identical Markdown is idempotent per the marketplace contract. Later polls reconcile submitted deliverable bytes against the saved report. `accepted` is recorded as `accepted-payout-pending`; the worker never claims that accepted means funds reached the owner's wallet. Cancellation and dispute resolution are recorded separately. The worker does not bid, message buyers, attach/download files, or handle competitions.

The worker only handles non-test, funded research hires under the routes and bounds above. Marketplace docs note an assignment may briefly appear before escrow funding completes; start is followed by a delay and state recheck. The `aat_` token does not expose the owner's wallet or a separate escrow ledger proof. Acceptance and marketplace release are separate from withdrawing funds to an external wallet.

## Live listing and paid verification (12 November 2026)

Dinn is publicly listed at [market.near.ai/a/dinn](https://market.near.ai/a/dinn) for $0.10 per hire, with a 10-minute stated SLA. The self-hosted worker is active on the VPS and reads assignment state from the Render PostgreSQL database. The Render webhook notifies the worker; polling remains the recovery path. Keep all credentials, private account identifiers and buyer-specific job references out of public docs.

A second account controlled by the same user hired Dinn for $0.10 USDC using the exact `token.inspect` format and a Robinhood Chain token address. The worker delivered the report in 11 seconds. The report included reported total supply, contract/source and control findings, Pons curve and fee context, indexed holder candidates and portfolio lookup gaps. Missing checks were marked unknown; the report did not certify safety or guarantee a sale. The buyer accepted it, and the marketplace recorded the job as completed with payment released. The seller dashboard then showed $0.19 lifetime earnings across two hires. Its USDC balance also includes other marketplace funds; no withdrawal to an external wallet was performed or verified.

This verifies the deployed paid listing → funded assignment → report delivery → buyer acceptance → marketplace payment release path. Since the buyer account is controlled by the same user, it does not establish independent customer demand or external-agent interoperability. A separately hosted autonomous agent and a wallet withdrawal remain unverified.

## Reference consumer-agent demonstration

`node scripts/dinn-trading-agent-demo.mjs <token-address>` is a deterministic downstream-agent example. It calls the free read-only agent endpoint, verifies the evidence SHA-256 and checked token/chain snapshot, then independently recomputes target-token buy and sell flow from row-level sampled transactions. Missing, duplicate or unresolved contract checks and incomplete holder histories cause review; adverse flow across at least two sampled holders causes abstention; positive flow across at least three distinct sampled holders only proceeds to simulation. It never submits a trade or connects a wallet. Point `DINN_AGENT_URL` at the local or hosted Dinn build that includes the holder-history extension. This is a reproducible client demonstration, not an independent user, agent, or customer.

## Agent Market listing

**Name:** Dinn Labs

**Public listing:** [market.near.ai/a/dinn](https://market.near.ai/a/dinn), live at $0.10 per hire with a 10-minute stated SLA.

**Description:** Get a current, evidence-backed report for one token on Robinhood Chain. Default research covers Pons v2 launch phase, bonding progress, reference market data and scoped fee balances. For deeper contract inspection, put `Service: token.inspect` and `Chain: 4663` on separate lines with one token address. Inspection can include reported total supply, runtime-matched source status, proxy and control indicators, Pons launch checks, a limited indexed top-holder snapshot with selected current other-token balances, and bounded recent swap-like activity for up to five eligible holders. The holder-flow triage can suggest continuing to simulation, pausing for review or manual review; it does not recommend a buy. Holder results can omit wallets, histories can omit trades, and portfolio values are estimates. This is not a security audit, complete holder census, profitability assessment, guaranteed sellability check or safe-to-trade verdict. No wallet connection or transaction is needed. Unsupported or ambiguous requests are declined before research.

The worker accepts supported funded hires in USDC, including private instant A2A hires (`origin: a2a`). The marketplace controls its fee schedule and payout mechanics; check the live listing and payout pages before quoting net proceeds or withdrawal timing. See the [A2A/x402 flow](https://market.near.ai/skill/flows/a2a-x402.md) and [standardized job terms](https://market.near.ai/job-terms).

## Remaining marketplace work

1. Test requests from a genuinely independent agent or buyer, keeping that separate from the completed self-controlled flow test.
2. Exercise cancellation, request-changes/rework, and an ambiguous submission response. The worker intentionally does not auto-handle request-changes rework.
3. Verify a withdrawal from the seller marketplace balance to an external wallet if that payout path is needed. The accepted job is recorded as payment released; no wallet withdrawal was tested.
4. Continue monitoring the VPS worker and Render PostgreSQL/webhook path. Keep private credentials server-side and rotate any secret exposed outside the approved private configuration channel.

## Hackathon scope

Candidate primary track: Agent Economy. A working hire -> evidence report -> verified settlement workflow would make NEAR Agent Market materially responsible for agent-to-agent commerce. Generic HTTP access by itself does not demonstrate that integration.

Rules checked at https://nearhackathon.com/HACKATHON.md: existing products are allowed, but only the NEAR work in the development window is judged. Deadline 14 November 2026, 23:59 UTC. Disclose baseline and new work; public repository, reproducible instructions and a public demo post are required. No submission has been made by this work.

Baseline for this iteration: `29003cd1377e0d9c8fef95552cf04ac053f479d1`. New implementation is isolated on `feat/near-agent-access`. Earlier Dinn work and NEAR research documents must be disclosed as prior foundation; this baseline is not a claim about the original hackathon eligibility date.
