# Dinn on Render

Production origin: https://dinn-pasy.onrender.com
Repository: https://github.com/Cyano88/dinn (public by owner request).

The `dinn` Node web service and `dinn-db` PostgreSQL 18 instance run in Oregon. Build: `npm ci --include=dev && npm run build`. Start: `npm start`. Health check: `/api/status`. Automatic deploys are disabled; releases are triggered explicitly after checks.

Runtime credentials are configured in Render, never committed. PostgreSQL uses its internal connection URL. Accepted images are served at `/media/logos/<id>.png` from database bytes, using Render's permanent external origin. The original accepted local image was migrated and compared byte-for-byte. External database access was restored to its previous restriction after migration.

Logo generation remains a restricted pilot for verified user IDs. VIP staking/NFT membership remains planned. Public inference requires a verified Privy bearer token and limits each user to 12 requests per minute. Those counters are instance-local and reset on restart; they are not a distributed quota or billing system.

Privy must allow the production origin alongside local development origins. Google/X login must be tested by the user. Browser wallet connection, asset approval and launch signing remain user-controlled. A funded launch has not yet been completed.

Drafts and pending transaction records are browser-origin-local. Deploying the server does not transfer those records to the hosted origin. Keep the original local browser session for recovery; no wallet key or signing authority is transferred by deployment. PostgreSQL currently persists generated images and their usage records, not chat or draft history.

The hosted legal pages are drafts unless permanent policy URLs are configured. Deployment is not a claim that public-launch legal/product review or funded end-to-end validation is complete.

## Verified deployment, 11 November 2026

Code commit `b85cb457514dd41fd13d1b0b6a7b677aafd3dc4d` is live. `/api/status` and Pons readiness returned HTTP 200; auth config reported chain 4663 and enabled sign-in. The accepted PNG returned HTTP 200 and matched the local bytes exactly. Anonymous chat returned HTTP 401. A real browser loaded Google/X sign-in controls without runtime errors. Privy allowed domains includes the Render origin. 265 tests passed before deployment; npm 10 clean-install validation passed after correcting the websocket override/lockfile mismatch.

The local development environment now uses the hosted public origin for accepted logo URLs. Reopening the logo step hydrates the accepted public URL into the existing local draft. This does not transfer the draft to the hosted origin.
