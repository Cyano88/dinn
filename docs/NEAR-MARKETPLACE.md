# Dinn / NEAR Agent Market integration

Verified 11 November 2026 against https://docs.market.near.ai/ and https://market.near.ai/llms.txt. These documents describe protocols; they do not authorize registering identities, posting, messaging, hiring or spending.

## Implemented foundation

The current public agent contract is `src/agent-access.mjs`, served by `server.mjs`. Discovery is `/.well-known/dinn.json`, with the old launchflow URL retained as an alias. See `public/agent-guide.md` for exact service inputs and output semantics.

Implemented: Pons token research, balances on Robinhood/Base/Arbitrum, Pons launch options, same-chain swap quotes and Base/Arbitrum-to-Robinhood bridge quotes. All are read-only. Missing inputs and provider failures cannot become completed research. Research returns Markdown plus exact JSON evidence and a SHA-256 content hash. This hash is not a signature or payment receipt.

Legacy `src/agent-service.mjs` is retained for historical tests; it is not the active HTTP contract. Its Ascend services must not be advertised as current Dinn capabilities.

The direct agent API is currently a free public preview. No marketplace listing, worker identity, price or real paid settlement is configured. Account input is a public query target, not authenticated wallet ownership. No personal drafts or signing permissions are exposed.

## Local agent-client verification (11 November 2026)

A separate Node HTTP client against the local checkout fetched the discovery manifest and schema, then completed live requests for `token.research` (Kyron / KYRON), `launch.options`, Robinhood ETH `wallet.balances`, a Base ETH-to-USDC `swap.quote`, and a Base ETH-to-Robinhood ETH `bridge.quote`. Each returned HTTP 200 with `status: completed`; the response evidence SHA-256 matched its content. The research response included a Markdown deliverable and chain block. All responses reported `broadcast: false` and `charged: false`.

This verifies the local HTTP consumer path for these five read-only services. The client was a local smoke-test script, not a separately hosted autonomous agent. The hosted check below separately verifies the public HTTPS path. Neither check verifies Agent Market hiring, escrow, buyer acceptance or owner payout.

## Hosted staging verification (11 November 2026)

The feature branch is deployed as a separate Render Free web service at https://dinn-agent-stage.onrender.com (service `srv-dbqck5ifngtc73f71ub0`, commit `46f22d90101e4bc1e7d1439c1f0636747fa03869`). It has no production database or application secrets, and `NEAR_WORKER_ENABLED=false`.

A separate HTTP client fetched discovery and schema over public HTTPS and repeated all five requests above. Discovery, schema and service requests returned HTTP 200; each service response was `completed` and had a matching evidence SHA-256. All read-only responses kept `broadcast: false` and `charged: false`. The research response was for Kyron (KYRON) at block `111967699` and included a Markdown deliverable.

This proves the public API path from a separate client, not integration with an independent agent runtime. The staging deployment is still on commit `46f22d90101e4bc1e7d1439c1f0636747fa03869`; it predates the local worker fix for private A2A instant hires. Agent Market still has no Dinn listing or paid assignment, and acceptance or owner payout has not been exercised.

## First proposed paid deliverable

A live report for one supported Pons v2 token on Robinhood Chain: launch phase, bonding progress when available, reference market metrics, and fees explicitly scoped to the requested wallet or labelled creator recipient. Include source address, chain block/time, machine-readable evidence and unavailable fields. Do not sell it as a contract audit, proof of liquidity/sellability, lifetime earnings report or executed transaction.

## Worker foundation implemented

`src/near-market-client.mjs`, `src/near-worker-store.mjs`, and `src/near-worker.mjs` implement the self-hosted pull worker against the current marketplace OpenAPI contract. PostgreSQL stores assignment leases, exact prepared deliverables and an event trail. The poll interval is 45 seconds.

The worker is disabled unless `NEAR_WORKER_ENABLED=true`, `DATABASE_URL`, `NEAR_AGENT_ID`, a server-side `NEAR_AGENT_TOKEN`, and owner-chosen `NEAR_WORKER_ESCROW_TOKEN` (`USD` or `USDC`) plus `NEAR_WORKER_MIN_ESCROW` are configured. Assignments below the configured minimum or in another currency are ignored. Never put the token in the browser or repository. No HTTP endpoint exposes it. There is no local marketplace credential or registered ID, so the worker is currently off.

For isolated VPS operation, scripts/near-worker.mjs starts the worker without Dinn's HTTP server. The separate service account, systemd unit, database migration, and least-privilege role setup are documented in [ops/near-worker/README.md](../ops/near-worker/README.md). The VPS deployment remains inactive until the registered agent credentials and Dinn database access are securely provisioned.

For safety, automatic delivery only recognizes a non-test research hire with title exactly `Dinn Pons Token Research`, no attachments, one explicit token address, sufficient escrow in the configured currency, and a known marketplace origin: public `standard` jobs, private `instant` hires through the marketplace, or private `instant` A2A hires (`origin: a2a`). It rejects competitions, other private jobs and unknown origins. For A2A calls, it reads the address from the job brief and, when present, the untruncated buyer's direct message; ambiguous, attached or truncated briefs are rejected. It binds the worker ID, job ID and assignment ID, starts the assignment, waits briefly for the marketplace's award/funding race, refreshes the assignment, creates and persists the evidence report, then refreshes status again before submitting. It leaves rework untouched.

A submit timeout is recoverable: the exact report is stored before submission; retrying identical Markdown is idempotent per the marketplace contract. Later polls reconcile submitted deliverable bytes against the saved report. `accepted` is recorded as `accepted-payout-pending`; the worker never claims that accepted means funds reached the owner's wallet. Cancellation and dispute resolution are recorded separately. The worker does not bid, message buyers, attach/download files, or handle competitions.

This is an executable local foundation, not a listed or paid integration. The A2A compatibility path is locally covered by six focused worker tests, but has not yet been deployed or exercised against an actual A2A hire. Marketplace docs note an assignment may briefly appear before escrow funding completes; start is followed by a delay and state recheck, but the `aat_` token does not expose the owner's wallet or a separate escrow ledger proof. A real paid demonstration and confirmation of settlement to the owner remain required.

## Proposed Agent Market listing copy

**Name:** Dinn Pons Token Research

**Description:** Get a current, evidence-backed report for one Pons v2 token on Robinhood Chain. The report covers launch phase, bonding progress where available, reference market data and fee balances with their wallet scope clearly stated. It includes the checked chain block and source links. It is not a security audit or investment recommendation. For A2A calls, include exactly one Robinhood token contract address in the request text. For a standard marketplace job, use the title `Dinn Pons Token Research` and include exactly one token contract address in the job description. No wallet connection or transaction is needed.

**Suggested handle:** `dinn-pons-token-research` (the public lookup currently returns not found; registration is the final availability check).

The marketplace's current A2A setup requires a live `per_call` pricing plan marked as default before the agent can go live. The plan price is USD and callers pay 1:1 in USDC through x402; the published platform fee is currently 5% of completed jobs. A2A private instant hires arrive with `origin: a2a`. The worker must be configured for USDC for this x402 route. Handle, price, delivery SLA and refund policy remain owner decisions. See the [A2A/x402 flow](https://market.near.ai/skill/flows/a2a-x402.md) and [standardized job terms](https://market.near.ai/job-terms).

## Remaining marketplace work

1. The account owner registers Dinn in the Agent Market web app with the chosen immutable handle, name `Dinn Pons Token Research`, and Research category. Registration mints an `aat_` token shown once; store it directly in Render, never in the repository or chat.
2. Create a live default `per_call` plan with the owner-approved USD price and SLA, then publish the listing. The marketplace hosts the A2A card and x402 endpoint; Dinn's direct JSON API is not that endpoint.
3. Configure the worker with isolated PostgreSQL storage, agent ID, `aat_` token, the approved minimum escrow and `USDC` for x402. It remains off until all settings are present.
4. Exercise an actual A2A hire. Confirm the private instant assignment is handled once, the report matches its stored evidence, and the marketplace records delivery.
5. Confirm payment settlement separately from delivery in the owner's marketplace account. Also observe cancellation and an ambiguous submission response. The worker intentionally does not auto-handle request-changes rework.
6. Only then advertise the listing and paid workflow.

## Hackathon scope

Candidate primary track: Agent Economy. A working hire -> evidence report -> verified settlement workflow would make NEAR Agent Market materially responsible for agent-to-agent commerce. Generic HTTP access by itself does not demonstrate that integration.

Rules checked at https://nearhackathon.com/HACKATHON.md: existing products are allowed, but only the NEAR work in the development window is judged. Deadline 14 November 2026, 23:59 UTC. Disclose baseline and new work; public repository, reproducible instructions and a public demo post are required. No submission has been made by this work.

Baseline for this iteration: `29003cd1377e0d9c8fef95552cf04ac053f479d1`. New implementation is isolated on `feat/near-agent-access`. Earlier Dinn work and NEAR research documents must be disclosed as prior foundation; this baseline is not a claim about the original hackathon eligibility date.
