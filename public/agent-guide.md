# Dinn agent access

Discover `/.well-known/dinn.json` and `/api/agent/schema`. The old `/.well-known/launchflow.json` URL remains an alias. Send JSON to `POST /api/agent/request` with `{service,input,requestId?}`.

## Current read-only services

- `token.research`: `{address,account?}`. One read-only research report for a Robinhood Chain (4663) token. It combines Pons phase, launch age, curve progress, current market references and fee balances with contract/source/control checks, indexed top holders, their Pons curve buys and sells, selected other-token balances, and PinkLock lock/vesting records from four listed shared adapters plus verified `PinkLock02` per-lock contracts among indexed top-holder candidates. Per-lock matches require deployed bytecode to match Blockscout-verified source at the report block. Other locker versions and unindexed contracts may be missed; no match does not prove supply is unlocked. Curve volume and generated fee totals come from Pons events and are explicitly scoped to the curve; they do not include post-graduation Uniswap v4 trades. `account` is an optional fee-viewing query address, not proof of ownership. When omitted, fees are queried for the creator recipient. A token address is the required input; holders and their activity are already included.
- `token.inspect`: `{address,chainId}`. Compatibility alias for the same expanded report. New marketplace requests should use `token.research` and need no service or chain selector lines.
- `wallet.balances`: `{account,chainId}`. Chain 4663, Base 8453 or Arbitrum 42161. Unavailable data remains unavailable, never zero.
- `launch.options`: `{account?}`. Current enabled Pons launch terms.
- `swap.quote`: `{account,chainId,asset,outputAsset,amount}`. Same-network quotes. Base and Arbitrum allow only ETH, USDC and USDT on both sides; Robinhood routes depend on live liquidity.
- `bridge.quote`: same fields; source chain 8453 or 42161, destination Robinhood Chain. No return bridge is offered by this service.

Amounts are decimal strings. Native ETH uses the zero address. Every address must be explicit; no agent receives a connected user's wallet implicitly. Unknown fields, signing keys and execution flags are rejected. Missing required inputs return `status: needs_input`. Errors are not completed deliverables.

Example:

```json
{"service":"token.research","requestId":"research-001","input":{"address":"0x32d5ee0142db8769d954a7c2521e76ca3241fb32"}}
```

A completed response includes `result`, `broadcast:false`, `charged:false` and `ownershipVerified:false`. Research also includes `deliverableMarkdown`. `evidence.content` is the exact JSON string covered by `evidence.sha256`; the hash detects content changes but is not a cryptographic attestation, authorization or proof of payment. A reused requestId is correlation only: reads run again and can produce newer results.

These endpoints read public data. They do not access private drafts, create delegated spending authority, sign, send, claim fees or settle marketplace jobs. Quotes are not transactions. Fees ready to claim are distinct from fees awaiting distribution and lifetime earnings; the escrow balance may include multiple launches. Research is not a security audit or guaranteed sellability.

Legacy `plan` and `pons.brief` responses remain available with their existing response shapes. Plan inference may require the deployment's configured inference access. All Ascend/Elysium execution routes remain retired.

## NEAR Agent Market

The direct endpoint is a free public preview. Dinn's separate paid listing is live at [market.near.ai/a/dinn](https://market.near.ai/a/dinn), and its self-hosted worker processes funded, supported research hires. The marketplace hosts the A2A card and x402 endpoint; this direct JSON API is not that endpoint. Marketplace payment never authorizes use of a buyer's token wallet.

## Human wallet actions

The Dinn application separately offers Pons launch review, simulation and explicit wallet approval; Robinhood transfers and supported Relay routes; and supported Pons fee claims with receipt verification. Agents cannot execute these through `/api/agent/request`. Public tools at `/api/tools` and `/api/tools/run` expose additional reads and UI suggestions, not delegated signing.


## Marketplace worker status

A self-hosted NEAR Agent Market worker processes paid research hires from public standard jobs, private instant hires and private instant A2A hires, plus zero-cost test runs the marketplace authorizes for the agent owner or an allowed admin. Test runs require the marketplace's `isTestRun` flag and zero escrow; they do not pay the agent or affect reputation. Include one token address; no capability selectors are needed. Holder, portfolio, market and PinkLock sources can be unavailable or partial, and the report marks their coverage. PinkLock per-lock discovery checks verified `PinkLock02` contracts among indexed top-holder candidates; other lockers and unindexed contracts may be missed. The report never claims a token is safe to trade. The worker stores recovery state in PostgreSQL. Paid acceptance records marketplace payment release; it does not establish a withdrawal to an external wallet. See `docs/NEAR-MARKETPLACE.md` for the accepted request format and operational limits.
