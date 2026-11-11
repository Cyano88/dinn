# Dinn / NEAR Agent Market integration

Verified 11 November 2026 against https://docs.market.near.ai/ and https://market.near.ai/llms.txt. These documents describe protocols; they do not authorize registering identities, posting, messaging, hiring or spending.

## Implemented foundation

The current public agent contract is `src/agent-access.mjs`, served by `server.mjs`. Discovery is `/.well-known/dinn.json`, with the old launchflow URL retained as an alias. See `public/agent-guide.md` for exact service inputs and output semantics.

Implemented: Pons token research, balances on Robinhood/Base/Arbitrum, Pons launch options, same-chain swap quotes and Base/Arbitrum-to-Robinhood bridge quotes. All are read-only. Missing inputs and provider failures cannot become completed research. Research returns Markdown plus exact JSON evidence and a SHA-256 content hash. This hash is not a signature or payment receipt.

Legacy `src/agent-service.mjs` is retained for historical tests; it is not the active HTTP contract. Its Ascend services must not be advertised as current Dinn capabilities.

The direct agent API is currently a free public preview. No marketplace listing, worker identity, price, escrow integration or paid settlement is implemented. Account input is a public query target, not authenticated wallet ownership. No personal drafts or signing permissions are exposed.

## First proposed paid deliverable

A live report for one supported Pons v2 token on Robinhood Chain: launch phase, bonding progress when available, reference market metrics, and fees explicitly scoped to the requested wallet or labelled creator recipient. Include source address, chain block/time, machine-readable evidence and unavailable fields. Do not sell it as a contract audit, proof of liquidity/sellability, lifetime earnings report or executed transaction.

## Required marketplace worker work

1. Owner-controlled listing with an actual immutable handle, authenticated worker ID and server-side credential. Price and delivery promise need to be set before accepting work.
2. Poll authenticated assignments or verify signed webhooks; re-fetch assignment state and payment hold before starting work. A webhook is not payment proof.
3. Persist assignment ID, worker identity, input revision, result evidence, submission state and provider response in PostgreSQL. Coordinate retries so ambiguous delivery responses cannot produce duplicate submissions.
4. Missing or unsupported requests require clarification/decline, not a fabricated report. Cancellation, refund and rework state must be reconciled before delivery.
5. Bind the report to the exact paid scope and authenticated assignment. Marketplace payment does not grant authority over any token wallet.
6. Exercise a genuine paid job and verified acceptance/settlement, plus cancellation, retry and recovery. Do not claim paid integration from fixtures.
7. Only publish marketplace discovery/A2A links after the actual listing and worker function. Marketplace hosts the paid A2A endpoint; do not invent one under Dinn's own hostname.

## Hackathon scope

Candidate primary track: Agent Economy. A working hire -> evidence report -> verified settlement workflow would make NEAR Agent Market materially responsible for agent-to-agent commerce. Generic HTTP access by itself does not demonstrate that integration.

Rules checked at https://nearhackathon.com/HACKATHON.md: existing products are allowed, but only the NEAR work in the development window is judged. Deadline 14 November 2026, 23:59 UTC. Disclose baseline and new work; public repository, reproducible instructions and a public demo post are required. No submission has been made by this work.

Baseline for this iteration: `29003cd1377e0d9c8fef95552cf04ac053f479d1`. New implementation is isolated on `feat/near-agent-access`. Earlier Dinn work and NEAR research documents must be disclosed as prior foundation; this baseline is not a claim about the original hackathon eligibility date.
