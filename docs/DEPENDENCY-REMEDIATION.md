# Dependency remediation — 6 November 2026

The ws security update is applied. Live release remains blocked by unresolved dependencies and untested provider configuration.

## Changes and evidence

- Scoped npm override: ws versions >=8.0.0 and <8.21.0 resolve to 8.22.1. Existing 7.x and already-patched 8.x consumers retain their own versions. No forced Privy downgrade or global major-version override.
- package-lock.json updated with npm install --ignore-scripts.
- Current npm audit: 28 affected packages (21 high, 7 moderate), rooted in decode-uri-component, uuid and zod. npm counts affected parent packages as well as libraries with direct advisories. This is not 28 distinct root vulnerabilities.
- Historical snapshot: dependency-audit.json. Current snapshot: dependency-audit-current.json. Counts and severity propagation differ; the ws findings are absent from the new report.
- Build now writes output/build/auth-meta.json. Run node scripts/dependency-exposure.mjs after a fresh audit and build to regenerate dependency-exposure.json, including the lockfile digest.
- In this build, affected decoder and UUID inputs contribute zero bytes to the auth outputs. Zod v3 from x402 contributes 59,490 bytes. This is bundle evidence, not a proof of exploitability or non-exploitability.
- Production bundles build; all 40 application tests pass; Playwright imports the rebuilt auth entry successfully without page errors. This is not live email/X or wallet approval validation.

## Remaining decisions

decode-uri-component 0.5.1 is the published fix, but it changes the installed 0.2.x CommonJS consumer to an ESM package. UUID's published fix starts at 11.1.1, while current consumers use 8/9. Zod's advisory marks versions below 4.6.6 affected, while x402 uses Zod v3 APIs. Blind overrides would cross compatibility boundaries in third-party wallet code.

Prefer compatible upstream dependency updates. If an override or provider change becomes necessary, test the affected SDK paths and actual onboarding before release. Do not suppress audit findings simply because optional wallet connectors are not selected. The bundled Zod v3 path needs specific upstream clarification or remediation; no advisory exception has been granted.

Official advisory references:
- https://github.com/advisories/GHSA-qr28-fpjm-wq7f
- https://github.com/advisories/GHSA-w5hq-g745-h8pq
- https://github.com/advisories/GHSA-mrhx-c7xc-m3w5

## Live validation requirements

No local Privy app ID, public Elysium RPC, private server RPC or 0G model configuration is present. Configure these in .env using .env.example. The Privy app ID and public RPC are public browser configuration; keep server credentials local. ENABLE_LIVE_LAUNCH remains false.

With configuration available, validate email OTP, X redirect/return, wallet creation, repeated login, identity linking, export/recovery, logout, chain ID and read-only simulation before considering a funded approval. No external account was created or transaction sent during this remediation.
