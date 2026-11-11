# Token logo integration — 11 November 2026

Local development is on this PC. Production target is Render with PostgreSQL; nothing was deployed as part of this work.

## Provider and access

The default image model is `z-image-turbo` through the existing 0G router. It uses the asynchronous image endpoint; Dinn saves the provider job handle before polling. Reopening a saved request polls that handle without submitting a new paid generation. Laya and Qwen3 Embedding are not image-generation alternatives. No image quality comparison has been completed.

The key initially returned HTTP 403 `model_not_allowed`. After the user updated access, a live Z-Image-Turbo generation completed successfully. `OG_IMAGE_API_KEY` takes precedence over `OG_API_KEY`; keep either key server-side.

## Local use

Run `npm ci`, then `npm start`. The local environment has `DINN_LOGOS_ENABLED=true`, `DINN_LOGO_LOCAL_TEST=true`, `DINN_LOGO_LOCAL_DB=.dinn-data/logos`, and a daily allowance of five requests. Sign-in is still required and access tokens are verified server-side. Local test eligibility is ignored on Render and in production.

Complete token details, open Logo & social links, describe a style and create a preview. A preview never replaces the existing logo automatically. Choose Use this logo to accept it or Keep my existing logo to discard the candidate. Z-Image-Turbo creates new images from text; reference-image revision is hidden for this model.

Local images persist in PGlite, an embedded PostgreSQL-compatible database. This is not a live Render PostgreSQL test. Accepted local images can be downloaded, but Dinn blocks their use in launch review until a public image URL is available. Use Keep my existing logo to continue with the original public logo.

## Render configuration

Use a Node web service with `npm ci && npm run build` and `npm start`, and connect Render PostgreSQL through `DATABASE_URL`. Set `NODE_ENV=production`, the existing Privy and 0G server credentials, and `OG_IMAGE_MODEL=z-image-turbo`. The server binds to Render's interface and port. Tables are initialized from `scripts/logo-schema.sql` on first database access.

Set `DINN_PUBLIC_URL` to the permanent HTTPS origin; otherwise `RENDER_EXTERNAL_URL` is used. Images are stored as normalized PNG bytes in PostgreSQL, not Render's temporary filesystem. Accepted images are served from `/media/logos/<id>.png`; unpublished previews require the owning user's verified token. Maintain database backups and the chosen domain because launch metadata references these URLs.

Keep `DINN_LOGOS_ENABLED=false` until live verification is complete. A restricted pilot can use `DINN_LOGO_TEST_USERS` containing exact Privy user IDs. This allowlist is not a VIP, staking, or NFT eligibility implementation. Future public copy remains: **Create with Dinn · Planned — AI-generated token logos for Dinn VIP Club members. Membership details will be announced.**

## Verification and limitations

Automated tests cover persistent storage, ownership, quotas, request idempotency, publication on acceptance, provider failure handling, normalized image validation, production eligibility, and async job recovery without another provider submission. Browser fixtures cover preview acceptance, refresh recovery, failure preservation, local-only launch blocking, and the accepted public URL reaching review. The mobile layout was visually inspected using a placeholder image.

Live verification subsequently generated a 1024px Diana logo through the real 0G provider, normalized it to a 123631-byte PNG, accepted it locally, reopened the database, and confirmed identical image bytes and acceptance state. Replaying the same request returned the saved result. The image was visually inspected: a green D and DAN on ivory, legible but more generic than the requested storefront motif. This is one sample, not evidence of best-in-class model quality.

The live harness uses an injected test identity with the real provider and isolated local database; it does not prove the full Privy-authenticated browser journey. That journey, production PostgreSQL connectivity, and deployed public image retrieval remain unverified. The first attempt briefly entered an uncertain state before recovery completed; the service now reports generating while polling a recovered job, covered by a regression test. No launch transaction was sent. These checks do not certify the rest of Dinn as production-ready.

## Profile polish � 11 November 2026

Reduced profile copy, collapsed external URL/social fields and secondary generation controls, hid style input once a preview exists, and changed the footer action to Continue. An unselected preview must now be selected or discarded explicitly. Review preparation uses the existing bouncing Dinn brand mark in a modal, with `Dinn is preparing your launch`; it closes on success, failure, or account change. Browser fixture checks passed for this transition and the preview guard. This loader does not resolve RPC/simulation failures.

Pons' current official v2 docs explicitly describe an optional `launchAndBuy` router (https://docs.ponsfamily.com/v2). Dinn still uses the direct launch-only factory path. The proposed next step is an optional pairing-asset spend, with estimated token output, slippage, balance/allowance checks, exact router simulation, and matching wallet/receipt validation. For NVDA, spend is in NVDA and launch fee/gas remain in ETH. Do not expose an executable purchase field until that integration is implemented and verified.
