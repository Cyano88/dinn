# Dinn agent access

Discover `/.well-known/dinn.json` and `/api/agent/schema`. The old `/.well-known/launchflow.json` URL remains an alias. Send JSON to `POST /api/agent/request` with `{service,input,requestId?}`.

## Current read-only services

- `token.research`: `{address,account?}`. Supported Pons v2 token research on Robinhood Chain (4663): phase, bonding metrics, market references and fee balances. `account` is the fee-viewing query address, not an authenticated owner. When omitted, fees are queried for the current creator fee recipient and labelled accordingly.
- `token.inspect`: `{address,chainId}`. Read-only Robinhood Chain (4663) inspection: reported supply, source matching, proxy and contract-control indicators, Pons launch checks, indexed top holders, current other-token balances, and bounded recent swap-like activity for eligible holders when available. Wallet history covers at most five externally owned addresses among the top 10 indexed candidates and the latest 30 days of bounded outgoing transactions. A swap candidate requires a successful decoded swap-like method and observed incoming and outgoing asset legs; legs may be ERC-20 transfers or native ETH transaction data. Undecoded calls and explorer limits can hide activity. This evidence does not establish profitability, conviction or community quality. Holder-flow triage can suggest continue-to-simulation, pause-for-review or manual review. It is not a buy recommendation, security audit or safe-to-trade verdict.
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

A self-hosted NEAR Agent Market worker processes non-test, funded research hires from public standard jobs, private instant hires and private instant A2A hires. Include one token address. Pons market and fee research is the default. For broader inspection, include the exact lines `Service: token.inspect` and `Chain: 4663`; unsupported or ambiguous requests are ignored. Holder and portfolio data can be unavailable or partial. The report never claims a token is safe to trade. The worker stores recovery state in PostgreSQL. Acceptance records marketplace payment release; it does not establish a withdrawal to an external wallet. See `docs/NEAR-MARKETPLACE.md` for the accepted request format and operational limits.
