# Dinn / NEAR Agent Market integration

Verified 13 November 2026 against https://docs.market.near.ai/ and https://market.near.ai/llms.txt. Protocol documentation does not authorize account actions; the account owner explicitly authorized the listing and paid test described here.

## Implemented foundation

The current public agent contract is `src/agent-access.mjs`, served by `server.mjs`. Discovery is `/.well-known/dinn.json`, with the old launchflow URL retained as an alias. See `public/agent-guide.md` for exact service inputs and output semantics.

Implemented: Pons token research, balances on Robinhood/Base/Arbitrum, Pons launch options, same-chain swap quotes and Base/Arbitrum-to-Robinhood bridge quotes. All are read-only. Missing inputs and provider failures cannot become completed research. Research returns Markdown plus exact JSON evidence and a SHA-256 content hash. This hash is not a signature or payment receipt.

The paid marketplace worker delivers one expanded `token.research` report for Robinhood Chain (4663). One token address is enough; holder, contract, Pons and lock research are part of the default report, with no `Service:` or `Chain:` selectors. It includes Pons launch age and phase, curve progress, current reference market data, curve event volume and generated fee totals, contract/source/control checks, indexed top holders and their Pons curve buys/sells, selected other-token balances, and PinkLock token/vesting records from four listed shared adapter versions plus verified `PinkLock02` per-lock contracts among indexed top-holder candidates. Per-lock matches require Blockscout-verified source metadata and deployed-bytecode equality at the report block. Holder-index and source coverage are limited; other locker versions or unindexed lock contracts may be missed, and no matching record is not proof that supply is unlocked. Curve event totals stop at graduation; post-graduation Uniswap v4 activity is labeled as uncovered. The `token.inspect` API remains as a compatibility alias for the same expanded report. Coverage gaps are stated in the result. Holder addresses are not identities, holder lists are indexed samples, and flow evidence is not a buy recommendation or safe-to-trade verdict.

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

The worker polls the Agent Market API every 45 seconds and re-reads assignments through its authenticated REST API. This is the only active pickup path. Webhook delivery is switched off; a 45-second poll is within Dinn's 10-minute delivery window. The VPS has no inbound port and holds the `aat_` token. The listing editor/API currently retains the saved webhook URL when an owner submits it as blank or null, so it still appears in the editor even though no events are enabled or required.

At install time, the worker requires `NEAR_WORKER_ENABLED=true`, `DATABASE_URL`, `NEAR_AGENT_ID`, a server-side `NEAR_AGENT_TOKEN`, and owner-chosen `NEAR_WORKER_ESCROW_TOKEN` (`USD` or `USDC`) plus `NEAR_WORKER_MIN_ESCROW`. Assignments below the configured minimum or in another currency are ignored. Never put the token in the browser or repository. No HTTP endpoint exposes it. Current production status is recorded below; do not copy credentials or account identifiers into public documentation.

For isolated VPS operation, scripts/near-worker.mjs starts the worker without Dinn's HTTP server. The separate service account, systemd unit, database migration, and least-privilege role setup are documented in [ops/near-worker/README.md](../ops/near-worker/README.md). The current deployment uses the dedicated Dinn worker service on the Pocket NFT Signer VPS and the Dinn PostgreSQL database hosted by Render.

For safety, automatic delivery recognizes supported paid research hires and zero-cost test runs marked by the marketplace. The marketplace authorizes test runs for the agent owner or an allowed admin; the worker requires the authoritative `isTestRun: true` job flag and exactly zero escrow for these runs. A buyer brief cannot grant itself test-run status. Paid hires still require the configured minimum escrow and currency. Both paths require a matching bounded title, no attachments, one explicit token address, and a known marketplace origin: public `standard` jobs, private `instant` hires through the marketplace, or private `instant` A2A hires (`origin: a2a`). It rejects competitions, other private jobs and unknown origins. `token.research` is the default; it accepts normal holder, age, activity and lock questions without service selectors. An explicitly requested compatibility route may name `token.inspect` with `Chain: 4663`. For A2A calls, it reads the address from the job brief and, when present, the untruncated buyer's direct message; ambiguous, attached or truncated briefs are rejected. It binds the worker ID, job ID and assignment ID, starts the assignment, waits briefly for the marketplace's award/funding race, refreshes the assignment, creates and persists the evidence report, then refreshes status again before submitting. For request-changes rework, it recognizes an assignment returned to `in_progress` with `submittedAt` set, reads the latest buyer feedback (fetching the full thread if the poll row is truncated), posts an idempotent scope confirmation, and submits a complete version. One same-token refresh is included; a different token or attached request receives a scope note and the latest supported report without running extra research. Buyer text is never used as a model instruction or transaction input.

A submit timeout is recoverable: the exact report is stored before submission; retrying identical Markdown is idempotent per the marketplace contract. Rework acknowledgements use the marketplace's `clientRequestId` idempotency field. Later polls reconcile submitted deliverable bytes against the saved report. A paid job in `accepted` is recorded as `accepted-payout-pending`; an accepted test run is recorded as `accepted-test-run` with no payout. The worker never claims that accepted means funds reached the owner's wallet. Cancellation and dispute resolution are recorded separately. The worker does not bid, attach/download files, or handle competitions.

The worker handles paid hires under the routes and bounds above plus marketplace-authorized zero-cost test runs. Test runs are reported with no payout and do not create paid-job accounting states. Marketplace docs note a paid assignment may briefly appear before escrow funding completes; start is followed by a delay and state recheck. The `aat_` token does not expose the owner's wallet or a separate escrow ledger proof. Acceptance and marketplace release are separate from withdrawing funds to an external wallet.

## Live listing and paid verification (12 November 2026)

Dinn is publicly listed at [market.near.ai/a/dinn](https://market.near.ai/a/dinn) for $0.10 per hire, with a 10-minute stated SLA. The self-hosted worker is active on the VPS and reads assignment state from the Render PostgreSQL database. It polls every 45 seconds. Keep all credentials, private account identifiers and buyer-specific job references out of public docs.

A second account controlled by the same user hired Dinn for $0.10 USDC using the exact `token.inspect` format and a Robinhood Chain token address. The worker delivered the report in 11 seconds. The report included reported total supply, contract/source and control findings, Pons curve and fee context, indexed holder candidates and portfolio lookup gaps. Missing checks were marked unknown; the report did not certify safety or guarantee a sale. The buyer accepted it, and the marketplace recorded the job as completed with payment released. The seller dashboard then showed $0.19 lifetime earnings across two hires. Its USDC balance also includes other marketplace funds; no withdrawal to an external wallet was performed or verified.

On 13 November, the marketplace's `Send test event` returned HTTP 401 after the Render webhook secret was rotated and deployed. A separately signed `webhook.ping` request using the then-current secret returned HTTP 204 from the production handler, verifying that handler's HMAC path but not marketplace-generated delivery. Webhook delivery is now switched off. The owner API accepted attempts to clear the saved URL but returned it unchanged; authenticated 45-second polling remains the only active pickup path.

This verifies the deployed paid listing → funded assignment → report delivery → buyer acceptance → marketplace payment release path. Since the buyer account is controlled by the same user, it does not establish independent customer demand or external-agent interoperability. A separately hosted autonomous agent and a wallet withdrawal remain unverified.

## Reference consumer-agent demonstration

`node scripts/dinn-trading-agent-demo.mjs <token-address>` is a deterministic downstream-agent example. It calls the free read-only agent endpoint, verifies the evidence SHA-256 and checked token/chain snapshot, then independently recomputes target-token buy and sell flow from row-level sampled transactions. Missing, duplicate or unresolved contract checks and incomplete holder histories cause review; adverse flow across at least two sampled holders causes abstention; positive flow across at least three distinct sampled holders only proceeds to simulation. It never submits a trade or connects a wallet. Point `DINN_AGENT_URL` at the local or hosted Dinn build that includes the holder-history extension. This is a reproducible client demonstration, not an independent user, agent, or customer.

## Agent Market listing

**Name:** Dinn Labs

**Public listing:** [market.near.ai/a/dinn](https://market.near.ai/a/dinn), live at $0.10 per hire with a 10-minute stated SLA.

**Live listing description:** Get a current, evidence-backed report for one Robinhood Chain token. Dinn combines launch age and phase, bonding progress, curve trading volume and generated fees, market references, contract controls, top-holder balances and Pons buys/sells, selected other-token holdings, and PinkLock vesting records from shared adapters and verified per-lock `PinkLock02` contracts among indexed top holders. Each lock includes a PinkSale record link and an explorer link when found. Per-lock discovery depends on holder-index coverage and verified source bytecode; other locker versions or unindexed contracts may be missed, so no matching record does not prove supply is unlocked. Curve history ends at graduation until post-graduation pool indexing is added. Holder data is an indexed sample, a wallet address is not a person, and no report is a security audit or a safe-to-trade verdict. One contract address is all an agent needs; no wallet connection or transaction is required. The $0.10 hire includes one read-only refresh for the same token after a buyer request. Requests for another token, attachments, security audits, personal trading recommendations and transaction execution are outside scope.

The worker accepts supported funded hires in USDC, including private instant A2A hires (`origin: a2a`). The marketplace controls its fee schedule and payout mechanics; check the live listing and payout pages before quoting net proceeds or withdrawal timing. See the [A2A/x402 flow](https://market.near.ai/skill/flows/a2a-x402.md) and [standardized job terms](https://market.near.ai/job-terms).

## Remaining marketplace work

1. Test requests from a genuinely independent agent or buyer, keeping that separate from the completed self-controlled flow test.
2. Exercise request-changes/rework, cancellation and an ambiguous submission response against the deployed worker. Local state-machine coverage does not replace a live Marketplace rework.
3. Verify a withdrawal from the seller marketplace balance to an external wallet if that payout path is needed. The accepted job is recorded as payment released; no wallet withdrawal was tested.
4. Monitor the VPS worker and Render PostgreSQL polling path. Keep private credentials server-side and rotate any secret exposed outside the approved private configuration channel.

## Hackathon scope

Candidate primary track: Agent Economy. A working hire -> evidence report -> verified settlement workflow would make NEAR Agent Market materially responsible for agent-to-agent commerce. Generic HTTP access by itself does not demonstrate that integration.

Rules checked at https://nearhackathon.com/HACKATHON.md: existing products are allowed, but only the NEAR work in the development window is judged. Deadline 14 November 2026, 23:59 UTC. Disclose baseline and new work; public repository, reproducible instructions and a public demo post are required. No submission has been made by this work.

Baseline for this iteration: `29003cd1377e0d9c8fef95552cf04ac053f479d1`. New implementation is isolated on `feat/near-agent-access`. Earlier Dinn work and NEAR research documents must be disclosed as prior foundation; this baseline is not a claim about the original hackathon eligibility date.
