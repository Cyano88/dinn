# Dinn recovery - 11 November 2026

## Exact stopping point

Recovered session `01a1bf92-aef4-71b2-920e-32650793b0eb`, stored at `C:/Users/USER/.codex/sessions/2026/11/09/rollout-2026-11-09T10-10-23-01a1bf92-aef4-71b2-920e-32650793b0eb.jsonl`. Its final events are November 11 at 01:53 UTC. The last user report was that clearing chat and saying "I want to launch" silently resumed old LOKI configuration settings. The final fix offered Start new token / Resume saved token, preserved settings until selection, and reset setup only on an explicit new-token selection. Prior browser verification completed successfully; no unfinished tool call remained.

Workspace is `C:/Users/USER/launchflow`, separate from Hash PayLink. Current Git has unborn master, all project files untracked, and no remote. Do not infer a committed or published release. The November 9 recovery document is historical: its Ascend-first next steps were superseded in the recovered conversation.

## Current direction and constraints

- Multi-launchpad Dinn, Pons first on Robinhood Chain (4663), ETH native asset. Ascend/Montra remain coming soon; preserve their code and records.
- Preserve original chat UI and approved branding. Do not replace the workspace while changing integrations. X/Google Privy sign-in and user-owned embedded wallet remain the intended flow.
- Conversational flows use inference -> validated backend tool -> grounded inference reply -> applied structured state. Questions must not mutate settings. Clear/reset, review, simulation, signing approval and receipt verification remain deterministic.
- Explain each next launch choice automatically, in plain language, with choices and tradeoffs. Buttons are shortcuts; natural-language preferences must work. No raw internal field names or repetitive saved-draft statements.
- Supply is constrained by enabled protocol presets. Keep requested unsupported supply as a non-executable preference across follow-ups/reload; never silently substitute an enabled preset. Creator tax is separate from base fee. See CONFIG-CONVERSATION-FIX-2026-11-10.md.
- Clear conversation and discard token setup are distinct. Starting after clear with saved settings must offer explicit new/resume choices.
- Research includes Pons provenance/curve data, matched source/control evidence, holders and partial portfolios. Saved results show freshness/supersession; unknowns and partial coverage remain explicit. No blanket safety or guaranteed sellability claims.
- DEX Screener handoff prefills only chain/address. Other profile details are copyable and logos downloadable. User submits and pays externally; embedded payments are excluded from this release. Do not change Grail's existing profile or purchase a duplicate order.
- Metadata/review/simulation and post-launch research/DEX handoff exist locally. Actual funded Pons wallet execution is not proven. No new transaction authorization is inferred from recovery.
- Trading, transfers, funding, claims, locking and burning remain unavailable or coming soon in the active Pons product. Production authentication enforcement, durable storage/quotas and deployment remain outstanding.

## Fresh recovery evidence

- Restarted local server with `node --env-file-if-exists=.env server.mjs`, hidden window, at http://127.0.0.1:4317. Configuration presence checked without revealing secrets.
- `npm test` rebuilt bundles, passed syntax checks and all **233 tests**, zero failures/skips. Log: `output/recovery-2026-11-11-tests.log`.
- Re-ran `output/playwright/clear-launch-choice.js` with isolated fixture authentication and live backend/inference. Saved LOKI survived clear; both choices appeared; choice survived refresh; Start new token cleared old name/tax and asked for token name. Test account storage and auth interception were removed afterward. This does not verify real OAuth or funded wallet signing.
- Current status confirms Pons active and other launchpads paused. `rpcConfigured:false` in `/api/status` is hardcoded in `src/product-policy.mjs`, not a live connectivity measurement. Robinhood RPC configuration is present; do not interpret that status field as a provider outage.
- No source behavior changes, deployment, order, signature or transaction during this recovery. Generated bundles were rebuilt.

## Continue here

Open local Dinn and resume user acceptance of the Pons launch conversation. With a saved token, clear chat then say "I want to launch" and choose new/resume explicitly. Continue the supply/tax preference checks (including `10 b then 5% tax`), pair selection, automatic explanations, metadata, review and simulation. Do not claim live onchain completion from fixtures or simulations. The latest reported clear-chat bug is fixed and freshly reverified, not still pending implementation.
