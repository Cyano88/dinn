# Dinn inference setup

Configured November 6, 2026 using the 0G Router at https://router-api.0g.ai/v1.

- Dedicated key: dinn-development; Private routing.
- Total spending cap: 10 0G, no reset. Expiry: December 6, 2026.
- Allowed models: 0gm-1.0-35b-a3b and glm-5.3.
- Active model: 0gm-1.0-35b-a3b. GLM is permitted for evaluation, not automatic fallback.
- Credentials live only in ignored .env. Never copy them into docs or frontend assets.
- Everyday chat disables model thinking and limits output to 600 tokens. Only final content is returned; no reasoning trace is exposed.
- The model explains operations. Deterministic code builds action suggestions and validates launch settings; model output never authorizes transactions.

Verified: live private inference, live local /api/plan response, and browser typing indicator followed by a real 0G answer. Browser rendering check used a simulated auth event in the isolated test browser, not a real authenticated wallet. All 43 repository tests passed.

Still pending: confirmed draft-edit proposals and server-side user authorization/rate limits before public deployment. The server currently binds to localhost only. Transaction sending remains disabled.

## Conversation memory and streaming

Human chat uses /api/chat with a bounded, account-scoped history in sessionStorage. Up to six completed exchanges and 12,000 history characters are retained for the current browser tab. Current launch fields are validated and supplied as context; they do not authorize edits or execution. New launch clears the conversation after confirmation when a draft or history exists. Account changes clear the visible conversation and cancel in-flight work.

The server translates 0G SSE answer deltas into NDJSON. It never forwards reasoning fields, tools, raw provider errors, or credential metadata. The UI renders text safely as textContent and offers Stop. Incomplete or cancelled answers are marked and excluded from memory. Browser disconnect aborts the provider request; already consumed inference may still be billed. Existing terminal /api/plan behavior remains compatible.

Validation: 49 tests passed, including stream fragmentation, UTF-8, injected roles, invalid context, incomplete replies, cancellation, and history bounds. Additional HTTP chat checks passed. Real 0G browser checks confirmed follow-up recall; fixture accounts confirmed account isolation and cancellation while a reply was in progress.

## Conversation quality correction

The human and terminal prompts now share a single definition. Dinn can assist with general questions, coding, writing, brainstorming and project planning while distinguishing these from executable operations. The prompt explicitly separates personal identity from token identity and enumerates real editable fields. Founder-name fields must never be invented. Numeric requests combining market cap and supply with a request to set a target receive a clarification before model inference; no currency or draft mutation is assumed.

Live checks: unknown-name replies no longer use GOK as the personal name; founder-name requests state that no launch field exists; broader-help replies cover writing and brainstorming. All 52 tests passed. Evaluated GLM-5.3 without changing the active model; it emitted reasoning inside answer content, so it was not selected. Active model remains 0gm-1.0-35b-a3b.
