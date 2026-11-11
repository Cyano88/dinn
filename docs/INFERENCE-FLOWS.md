# Inference-backed conversations

Active workspace chat goes through `/api/chat`. Launch answers and edits use inference to select structured `manage_launch_draft` arguments, backend validation, then a separate inference explanation. The browser applies returned draft state only after successful completion. Drafts remain account-scoped browser storage, not cross-device server storage.

The backend requires literal evidence from the current message for edits. Questions cannot alter settings. Pair approval, enabled configurations and creator-tax caps are checked against Pons. An inference failure, rejected update, cancelled request or changed draft revision must not apply a stale draft. Tool markup is rejected before display.

Token research, top holders, DEX preparation/order status, balances and transaction checks retain their evidence-backed tools. Missing-information and unavailable-feature responses use the guidance tool and inference. Ascend and Montra remain coming soon; unavailable trading, transfer, burn, lock, bridge and claims adapters are not enabled by conversational routing.

Explicit controls remain deterministic: clear/reset, form edits, review, simulation, wallet approval and canonical receipt verification. Chat tools never sign or broadcast. DEX checkout remains external; only chain and contract address are carried in its checkout link.

Regression coverage: `test/launch-draft.test.mjs` tests grounded edits, rejected guesses/questions, pair and fee validation, cross-flow routing, real dispatcher argument validation, inference/backend/inference order and offline behavior. Playwright live-inference checks use fixture authentication only and never authorize transactions.
