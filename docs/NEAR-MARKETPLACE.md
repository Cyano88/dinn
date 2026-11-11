# Dinn / NEAR Agent Market integration

Verified 11 November 2026 against https://docs.market.near.ai/ and https://market.near.ai/llms.txt. These documents describe protocols; they do not authorize registering identities, posting, messaging, hiring or spending.

## Implemented foundation

The current public agent contract is `src/agent-access.mjs`, served by `server.mjs`. Discovery is `/.well-known/dinn.json`, with the old launchflow URL retained as an alias. See `public/agent-guide.md` for exact service inputs and output semantics.

Implemented: Pons token research, balances on Robinhood/Base/Arbitrum, Pons launch options, same-chain swap quotes and Base/Arbitrum-to-Robinhood bridge quotes. All are read-only. Missing inputs and provider failures cannot become completed research. Research returns Markdown plus exact JSON evidence and a SHA-256 content hash. This hash is not a signature or payment receipt.

Legacy `src/agent-service.mjs` is retained for historical tests; it is not the active HTTP contract. Its Ascend services must not be advertised as current Dinn capabilities.

The direct agent API is currently a free public preview. No marketplace listing, worker identity, price or real paid settlement is configured. Account input is a public query target, not authenticated wallet ownership. No personal drafts or signing permissions are exposed.

## First proposed paid deliverable

A live report for one supported Pons v2 token on Robinhood Chain: launch phase, bonding progress when available, reference market metrics, and fees explicitly scoped to the requested wallet or labelled creator recipient. Include source address, chain block/time, machine-readable evidence and unavailable fields. Do not sell it as a contract audit, proof of liquidity/sellability, lifetime earnings report or executed transaction.

## Worker foundation implemented

`src/near-market-client.mjs`, `src/near-worker-store.mjs`, and `src/near-worker.mjs` implement the self-hosted pull worker against the current marketplace OpenAPI contract. PostgreSQL stores assignment leases, exact prepared deliverables and an event trail. The poll interval is 45 seconds.

The worker is disabled unless `NEAR_WORKER_ENABLED=true`, `DATABASE_URL`, `NEAR_AGENT_ID`, a server-side `NEAR_AGENT_TOKEN`, and owner-chosen `NEAR_WORKER_ESCROW_TOKEN` (`USD` or `USDC`) plus `NEAR_WORKER_MIN_ESCROW` are configured. Assignments below the configured minimum or in another currency are ignored. Never put the token in the browser or repository. No HTTP endpoint exposes it. There is no local marketplace credential or registered ID, so the worker is currently off.

For safety, automatic delivery only recognizes a non-test, public, non-competition assignment with a positive USD/USDC escrow, title exactly `Dinn Pons Token Research`, no attachments and exactly one explicit token address in its description. It binds the worker ID, job ID and assignment ID, starts the assignment, waits briefly for the marketplace's award/funding race, refreshes the assignment, creates and persists the evidence report, then refreshes status again before submitting. It leaves other jobs and all rework untouched.

A submit timeout is recoverable: the exact report is stored before submission; retrying identical Markdown is idempotent per the marketplace contract. Later polls reconcile submitted deliverable bytes against the saved report. `accepted` is recorded as `accepted-payout-pending`; the worker never claims that accepted means funds reached the owner's wallet. Cancellation and dispute resolution are recorded separately. The worker does not bid, message buyers, attach/download files, or handle competitions.

This is an executable local foundation, not a listed or paid integration. Marketplace docs note an assignment may briefly appear before escrow funding completes; start is followed by a delay and state recheck, but the `aat_` token does not expose the owner's wallet or a separate escrow ledger proof. A real paid demonstration and confirmation of settlement to the owner remain required.

## Proposed Agent Market listing copy

**Name:** Dinn Pons Token Research

**Description:** Get a current, evidence-backed report for one Pons v2 token on Robinhood Chain. The report covers launch phase, bonding progress where available, reference market data and fee balances with their wallet scope clearly stated. It includes the checked chain block and source links. It is not a security audit or investment recommendation. To request a report, use the exact job title `Dinn Pons Token Research` and include exactly one Robinhood token contract address in the job description. No wallet connection or transaction is needed.

This copy promises only the service the worker can currently deliver. The handle and price remain owner decisions; check handle availability in Agent Market before committing to it.

## Remaining marketplace work

1. The owner registers Dinn through the Agent Market, chooses the immutable handle, description, scope, price and delivery SLA, and stores the issued agent ID/token in Render secrets. The owner must choose the price; the code does not invent it. Set the same minimum amount/currency in the server secrets before enabling the worker.
2. Publish the exact supported job title and tell buyers to include one Robinhood Pons token address in the description. Ensure the listing's offered price/currency satisfies the worker's USD/USDC escrow rule.
3. Exercise an actual hire. Confirm the assignment is handled once, the report matches its stored evidence, and the marketplace records delivery.
4. Confirm buyer acceptance and separately verify the owner's payout through the owner's marketplace account. Also observe cancellation, request-changes and an ambiguous submission response. Current worker intentionally does not auto-handle rework.
5. Only then advertise the listing and paid workflow. Marketplace hosts its A2A endpoint; do not invent one under Dinn's hostname.

## Hackathon scope

Candidate primary track: Agent Economy. A working hire -> evidence report -> verified settlement workflow would make NEAR Agent Market materially responsible for agent-to-agent commerce. Generic HTTP access by itself does not demonstrate that integration.

Rules checked at https://nearhackathon.com/HACKATHON.md: existing products are allowed, but only the NEAR work in the development window is judged. Deadline 14 November 2026, 23:59 UTC. Disclose baseline and new work; public repository, reproducible instructions and a public demo post are required. No submission has been made by this work.

Baseline for this iteration: `29003cd1377e0d9c8fef95552cf04ac053f479d1`. New implementation is isolated on `feat/near-agent-access`. Earlier Dinn work and NEAR research documents must be disclosed as prior foundation; this baseline is not a claim about the original hackathon eligibility date.
