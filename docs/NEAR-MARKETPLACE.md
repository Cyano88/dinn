# NEAR marketplace integration contract

Research verified 6 November 2026 against https://market.near.ai/llms.txt and the official buyer/worker guides saved in docs/sources/near-market-*.md. Documents are integration references, not permission to hire, post, message or spend.

## Product

One service, two callers: humans in chat and agents in their terminal. Both call the same planner, validation and Ascend adapters. Marketplace payment buys a clearly scoped deliverable; it never grants Elysium wallet permissions.

## Implemented local surface

GET /.well-known/launchflow.json
GET /agent-guide.md
GET /llms.txt
GET /api/agent/schema
POST /api/agent/request

Services: plan, launch.review, launch.simulate. The last requires an Elysium RPC. Explicit missing-fields responses enable caller-managed conversation. No secret-key, trading or broadcasting request is accepted. 0G explanations remain untrusted explanatory text, not executable configuration.

## Marketplace onboarding still required

1. Owner chooses final project identity and registers the worker in Agent Market. Capture the actual agent ID and immutable handle; keep the aat_ token server-side. No identity has been registered by this project.
2. Specify the exact initial deliverable and price. Candidate: launch configuration preparation/review. Do not promise live execution, trading or locks while they are unavailable. Confirm 0G commercial traffic permissions.
3. Implement authenticated assignment polling (30–60 seconds) or signed webhooks. Re-read the current API/OpenAPI schemas. Bind assignment IDs to the authenticated worker. Verify job state before doing billable work and before delivery. A hire.created webhook can arrive before its payment hold is established.
4. Persist each assignment, input revision, processing state and submitted version. Recover interrupted jobs without duplicate delivery or blind retries. Cancel/refund events must stop work. Refuse unsupported jobs explicitly rather than submit a planning note as proof of execution.
5. Use the existing agentRequest handler for the deliverable. An incomplete request needs a marketplace clarification message, not an invented wallet or a fabricated successful result.
6. Submit using POST /v1/assignments/{id}/submit with deliverableMarkdown and files. For A2A-originated jobs the docs say submission auto-accepts and settles payment: the worker must meet the paid contract BEFORE submitting, and clarify without submitting when information is missing.
7. Test a genuine paid hire, acceptance or settlement, cancellation/refund and rework. Publish discovery links only once the real listing and worker are functioning.

## Two buyer paths

MCP: https://market.near.ai/mcp, OAuth as the buying person. Discover runtime tools and quote the actual plan. A worker-bound aat_ token cannot hire. User authorizes the marketplace hire through its documented draft/approval flow.

A2A/x402: the marketplace hosts the registered agent's card and paid endpoint on its actual agent subdomain. The marketplace converts paid calls into worker assignments. Do not invent a Launchflow subdomain or impersonate a listed agent. The local API is separate and currently free.

## Architecture

Human chat or terminal agent
  -> Launchflow planner and validation
  -> explicit configuration review
  -> optional read-only Ascend simulation
  -> future separately authorized wallet execution
  -> verified receipt/deliverable

NEAR marketplace hire -> authenticated worker adapter -> same Launchflow planner/validation -> marketplace deliverable.

NEAR service fees and Elysium gas/dev-buy funds are independent. Neither 0G credit consumption nor marketplace payment proves a token was deployed.
