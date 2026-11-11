# Dinn on Render

Production origin: https://dinn-pasy.onrender.com
Repository: https://github.com/Cyano88/dinn (public by owner request).

The `dinn` Node web service and `dinn-db` PostgreSQL 18 instance run in Oregon. Build: `npm ci --include=dev && npm run build`. Start: `npm start`. Health check: `/api/status`. Automatic deploys are disabled; releases are triggered explicitly after checks.

Runtime credentials are configured in Render, never committed. PostgreSQL uses its internal connection URL. Accepted images are served at `/media/logos/<id>.png` from database bytes, using Render's permanent external origin. The original accepted local image was migrated and compared byte-for-byte. External database access was restored to its previous restriction after migration.

Logo generation remains a restricted pilot for verified user IDs. VIP staking/NFT membership remains planned. Public inference requires a verified Privy bearer token and limits each user to 12 requests per minute. Those counters are instance-local and reset on restart; they are not a distributed quota or billing system.

Privy must allow the production origin alongside local development origins. Google/X login must be tested by the user. Browser wallet connection, asset approval and launch signing remain user-controlled. A funded launch has not yet been completed.

Drafts and chat history now sync per verified Privy account in PostgreSQL. Opening the original local page imports its draft when the account has no saved draft. Conflicting copies require an explicit choice and keep a local recovery copy. Pending transaction records, wallet connection preferences and signing authority remain browser-origin-local.

The hosted legal pages are drafts unless permanent policy URLs are configured. Deployment is not a claim that public-launch legal/product review or funded end-to-end validation is complete.

## Verified deployment, 11 November 2026

Code commit `b85cb457514dd41fd13d1b0b6a7b677aafd3dc4d` is live. `/api/status` and Pons readiness returned HTTP 200; auth config reported chain 4663 and enabled sign-in. The accepted PNG returned HTTP 200 and matched the local bytes exactly. Anonymous chat returned HTTP 401. A real browser loaded Google/X sign-in controls without runtime errors. Privy allowed domains includes the Render origin. 265 tests passed before deployment; npm 10 clean-install validation passed after correcting the websocket override/lockfile mismatch.

The local development environment now uses the hosted public origin for accepted logo URLs. Reopening the logo step hydrates the accepted public URL into the existing local draft. With account draft sync enabled, reopening the local page also imports the draft through the authenticated hosted API.

## Account draft sync

`/api/drafts/get` and `/api/drafts/save` require a verified Privy bearer token. The server derives ownership from the token; callers cannot supply another owner. Writes use optimistic revisions, returning HTTP 409 when another tab has saved a newer copy. The browser retains three recovery snapshots when resolving conflicting copies and retries interrupted sync without dropping local edits.

Portable state includes token details, settings, links, selected logo references, chat, optional purchase and the active setup step. It excludes prepared/signed transactions, pending wallet records, wallet providers and wallet-selection preferences. Restoring a cloud draft invalidates any open review. The local server uses `DINN_DRAFT_SYNC_URL=https://dinn-pasy.onrender.com` to forward authenticated sync requests; database credentials never enter the browser.

### Draft-sync release verification

Commit `5d51eb3` is live on Render. The release passed 272 tests; browser fixtures verified local import, fresh-browser restoration, preserved logo URL and explicit conflict resolution with backup. An isolated test record in the actual Render PostgreSQL database verified insert, read and stale-revision rejection, then was removed. The temporary database IP allowlist entry was removed. Hosted and local draft endpoints reject anonymous requests; a request with an invalid token forwarded through the local proxy reaches the hosted verifier and returns 401. The hosted sign-in page loads without runtime errors.

The original user's local draft must be imported by refreshing its signed-in local tab and waiting for `Saved to your account`; that specific migration is not proven by the fixture checks.
