# Dinn agent access

New to the API? [Run the research quickstart](/docs/integrate). For the human workspace, see [Using Dinn Chat](/docs).

Buying a report on Agentic.Market? [Start with the Base buyer quickstart](/agentic-market.md).

Discover `/.well-known/dinn.json` and `/api/agent/schema`. The old `/.well-known/launchflow.json` URL remains an alias. Send JSON to `POST /api/agent/request` with `{service,input,requestId?}`.

## Community launch ideas on the marketplaces

**Find a stock-inspired token launch idea for my community.** Powered by Dinn Research. Ask the owner “Base (Bankr) or Robinhood Chain (Pons)?” before hiring if they have not specified one. On NEAR append “on Base” or “on Robinhood Chain” to the brief. On Agentic Market set `input.chainId` to 8453 or 4663. The payment network does not determine the launch chain. This service screens eligible stock pairs on the selected chain for a sourced story from the past 48 hours. It returns one creator brief or a dated wait finding. Give the owner the Open in Dinn link to continue with the same concept. An account is required to import the brief. The link can be forwarded. The hire does not authorize a launch.

## Current read-only services

Provider-cost boundary: GoldRush holder queries run for signed-in Dinn chat and verified, paid NEAR marketplace hires when the server key is configured. Free public API previews, zero-cost marketplace test runs and `/api/tools/run` skip those queries; reports label holder coverage as not requested. Public chain and market references remain available.

- `token.research`: `{address,account?}`. One read-only research report for a Robinhood Chain (4663) token. It combines Pons phase, launch age, curve progress, current market references and fee balances with contract/source/control checks, indexed top holders, their Pons curve buys and sells, selected other-token balances, and PinkLock lock/vesting records from four listed shared adapters plus verified `PinkLock02` per-lock contracts among indexed top-holder candidates. Per-lock matches require deployed bytecode to match Blockscout-verified source at the report block. Other locker versions and unindexed contracts may be missed; no match does not prove supply is unlocked. Curve volume and generated fee totals come from Pons events and are explicitly scoped to the curve; they do not include post-graduation Uniswap v4 trades. `account` is an optional fee-viewing query address, not proof of ownership. When omitted, fees are queried for the creator recipient. A token address is the required input; holders and their activity are already included.
- `base.stock.research`: `{query}`. Read-only research for a normal Coinbase tokenized stock on Base. `query` accepts one exact registry ticker such as `NVDAc`, a company name, or the token's Base address. Dinn matches the Coinbase stock registry to onchain B20 name, symbol and decimals, and pins supply, multiplier, paused features and transfer-policy IDs to one Base block. It includes Coinbase NAV with its update time, first-mint date, exact-address DEX Screener pairs and optional GoldRush holder evidence. Paid NEAR hires and signed-in chat can request GoldRush holders when configured; free previews and test runs omit them. B20 policy IDs do not establish that a particular wallet is allowed; wallet eligibility and current role holders are not checked. A Bankr link is included only when its live Base stock-pair list includes that token. Bankr must provide the current executable quote and perform its location check. Dinn never chooses a side or amount or prepares a transaction. This is not a contract audit or safe-to-trade verdict.
- `base.stock-paired.research`: `{address}`. Read-only Base (8453) research for a separately launched token that may be paired with a Coinbase stock. Reports a stock pairing only when a Bankr launch record, successful transaction receipt emitted by the canonical Uniswap v4 PoolManager, and Coinbase stock-registry address agree; available Bankr fee data must also be consistent with the launch. Bankr's public feed lists the 50 most recent launches, and Dinn also checks the address-specific launch endpoint for older records. Market data comes from DEX Screener pairs matched by both token addresses or a GeckoTerminal record verified against the exact Bankr v4 pool ID and token addresses. Dinn calls a DEX Screener pair the Bankr pool only when its pair ID matches Bankr's v4 pool ID. Includes available market activity and Bankr fee data, plus a separate block-pinned contract snapshot with token supply, reported `owner()`, EIP-1967 proxy-slot indicators, and Sourcify runtime verification when available. Signed-in Dinn chat and verified paid NEAR marketplace hires include a GoldRush holder snapshot when `GOLDRUSH_API_KEY` is configured; free API previews and zero-cost test runs skip holder queries. Snapshots cover up to the first 1,000 returned addresses, with sampled concentration and largest balances. Bytecode is checked for up to three largest balances in the returned sample; classified buys and sells are requested only when no contract code was observed, using each address's latest transaction page. This is partial activity evidence, not full wallet history; a missing swap does not prove the address never traded. Holder addresses are not identified as people or labeled as team, exchange, or pool wallets. A missing Sourcify match does not mean the contract is unverified elsewhere; other explorers are not checked. Contract controls are not assessed without runtime-matched source. If both Bankr lookup methods return no match, the result remains inconclusive. No safe-to-trade verdict is returned.
- Market volume and buy/sell counts are labeled by the provider-returned window. Missing 7d or 30d volume remains unavailable, not zero or an extrapolated value. Bankr lifetime earnings are shown only when their daily history reconciles with the verified launch date, earning-day count, and lifetime total; they are WETH-denominated and separate from token-denominated claimable and claimed balances.
- For a verified Bankr launch, Dinn reads Bankr's public vesting endpoint and reports only a validated creator vesting schedule, its reported allocation and share of contract supply when comparable, phase, cliff and end dates, and released/claimable/locked amounts. A missing or ineligible schedule does not prove supply is unlocked; the reported allocation does not represent all token supply. See [Bankr's vesting API documentation](https://docs.bankr.bot/token-launching/overview/#creator-vesting).
- Bankr launch age is calculated from its recorded deployment timestamp; Coinbase stock first-mint age uses the registry timestamp. Coinbase stock NAV includes its provider update time and is a reference value, not an executable market quote.
- Base pool records and reported liquidity are market references only. Dinn does not request an executable Base buy/sell quote in token research, so current route availability remains unconfirmed even when a pool is indexed.
- A `base.stock-paired.research` response also includes `result.tradeHandoff`. `request_external_quote` means only that the report verified the Bankr stock pair, matched its exact pool record, and observed positive reported pool liquidity; the calling agent may then ask its own execution provider for a fresh quote. `review_first` lists the evidence gaps. This field is not a quote, route confirmation, safety verdict, or buy/sell recommendation. It contains no side or amount, and Dinn does not prepare, sign, or broadcast a transaction. The calling agent must apply its own wallet policy and check current executable terms.
- `token.inspect`: `{address,chainId}`. Compatibility alias for the same expanded report. New marketplace requests should use `token.research` and need no service or chain selector lines.
- `wallet.balances`: `{account,chainId}`. Chain 4663, Base 8453 or Arbitrum 42161. Unavailable data remains unavailable, never zero.
- `launch.options`: `{account?}`. Current enabled Pons launch terms.
- `swap.quote`: `{account,chainId,asset,outputAsset,amount}`. Same-network quotes. Base and Arbitrum support ETH, USDC and USDT. Base also supports a read-only pool estimate between a verified Bankr launch and its exact stock pair, in either direction. Bankr provides the executable quote and checks location eligibility. Robinhood routes depend on live liquidity.
- `bridge.quote`: same fields; source chain 8453 or 42161, destination Robinhood Chain. No return bridge is offered by this service.

Amounts are decimal strings. Send contract addresses in both asset fields. For native ETH use the zero address (0x0000000000000000000000000000000000000000). Every address must be explicit; no agent receives a connected user's wallet implicitly. Unknown fields, signing keys and execution flags are rejected. Missing required inputs return `status: needs_input`. Errors are not completed deliverables.

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

A self-hosted NEAR Agent Market worker processes paid research hires from public standard jobs, private instant hires and private instant A2A hires, plus zero-cost test runs the marketplace authorizes for the agent owner or an allowed admin. Test runs require the marketplace's `isTestRun` flag and zero escrow; they do not pay the agent or affect reputation. Robinhood stock research accepts a ticker such as NVDA or a stock contract; Pons launch and stock-pair reports accept a launch address; Base stock-paired research accepts one token address; Coinbase stock research accepts one exact ticker, company name or Base address through `Service: base.stock.research` and `Token:` or `Ticker:`. Holder, portfolio, market and PinkLock sources can be unavailable or partial, and the report marks their coverage. PinkLock per-lock discovery checks verified `PinkLock02` contracts among indexed top-holder candidates; other lockers and unindexed contracts may be missed. The report never claims a token is safe to trade. The worker stores recovery state in PostgreSQL. Paid acceptance records marketplace payment release; it does not establish a withdrawal to an external wallet. See `docs/NEAR-MARKETPLACE.md` for the accepted request format and operational limits.

The marketplace worker routes Base requests with `Service: base.stock.research` and `Ticker: NVDAc` (or `Token: NVDAc` / an address) to Coinbase stock research. Use `Service: base.stock-paired.research` and a token address for a separate Bankr-launched stock-paired token. The latter can also be inferred from explicit Bankr or stock-pair wording. Robinhood Chain Pons research remains the default when the requested network is unclear. Both Base services include source and coverage notes and do not provide a safe-to-trade verdict.


### Find a Base stock-paired launch

Send `{"service":"base.stock-paired.discover","input":{"metric":"liquidity"}}` to the public agent endpoint. Use `volume` for 24-hour USD volume. Dinn checks up to eight distinct stock-paired candidates per comparison, rotating through candidates saved from Bankr feed observations and earlier address-specific research against the Coinbase registry, launch receipts and exact pool data. It returns up to three ranked contracts. If the sample lacks positive, verifiable values, the shortlist is empty. Use the selected contract with `base.stock-paired.research` for the full report.

For a paid NEAR hire, put the whole brief in the first message. Examples include `Research NVDAc on Base` or `Find stock-paired launches on Base by liquidity`. For a Pons or Bankr launch report, include the chain and contract address. A discovery hire returns the shortlist directly. Each additional automated hire is a separate paid call. If Dinn cannot resolve the brief or verify the report, it declines the assignment.


## Agentic.Market payments on Base

[Buy your first research report](/agentic-market.md).

`POST /api/paid/research` is available only when the operator enables a USDC recipient and Coinbase facilitator. HTTP 503 means the service is unavailable. The public preview remains at `/api/agent/request`.

For OKX clients that replay a payment without its POST body, use GET on the same endpoint. Put the three fields in the URL before requesting the quote. Reuse the exact URL on the paid retry.

```js
const url = new URL('https://dinn-pasy.onrender.com/api/paid/research');
url.search = new URLSearchParams({
  requestId: crypto.randomUUID(),
  service: 'xlayer.stock.research',
  input: JSON.stringify({query: 'Tesla'})
}).toString();
```


Provide a unique stable `requestId`, one `service`, and its `input`. Supported services are `base.stock.research`, `base.stock-paired.research`, `base.stock-paired.discover`, `pons.stock.research` for a Robinhood stock token, `pons.stock-paired.research` for a Pons stock pair, and `token.research` for a general Pons report. Example body:

```json
{"requestId":"nvda-research-001","service":"base.stock.research","input":{"query":"NVDAc"}}
```

Read the x402 v2 `PAYMENT-REQUIRED` challenge and verify the recipient, 0.10 USDC amount, and Base mainnet network before authorizing. A successful response includes the report, sources, and a settlement receipt. After a timeout or a pending response, retry the same body and original signed payment. A new request ID represents a separate purchase.


#### Buyer clients

Use an x402 v2 client that supports exact USDC payments on Base. Your client sends the JSON POST, reads the payment challenge, and repeats the same POST with its signed payment header. The service accepts the standard JSON object for `input` and also accepts it encoded as a JSON string.

For OKX OnchainOS CLI 4.6.6, pass the same business parameters to **both** commands. This Bash example uses one request ID for the entire purchase:

```bash
endpoint=https://dinn-pasy.onrender.com/api/paid/research
request_id=$(uuidgen)
params=(--param "requestId=$request_id" --param service=base.stock.research --param 'input={"query":"NVDAc"}')
onchainos payment quote "$endpoint" --chain base --method POST "${params[@]}"
```

Review the quote and copy its `data.paymentId`. To authorize the quoted purchase, substitute that value below in the same shell:

```bash
onchainos payment pay --payment-id '<paymentId>' --selected-index 0 --yes "${params[@]}"
```

If a signed POST returns `research_body_required`, it reached Dinn without the required JSON content type. With this CLI, check that the parameters were passed to the pay command. A timeout after a complete signed POST has a different meaning: replay the original signed payment and request ID to recover the result.

## Robinhood stock tokens and Pons stock pairs

Use `pons.stock.research` with `{"query":"NVDA"}` for the Robinhood stock token. An exact Robinhood Chain stock contract also works.

Use `pons.stock-paired.research` with `{"address":"0x43468fc21c46d30cf765e1a1d0ed32ecb6bd89a4"}` for a Pons launch. Dinn checks the launch?s actual pairing contract against the Robinhood registry and reports the launch and stock separately. Available lock dates belong to the asset named in each section. Use `token.research` for a general Robinhood token report.

Robinhood reports check PinkLock and UNCX V2 for each token address separately. UNCX reads up to the newest 256 schedule IDs and details up to 64 matches, prioritizing uncancelled records. A future schedule milestone can mark a point in a gradual release. Cancelled schedules do not count toward active vesting. Amounts the contract cannot return stay unknown.

Robinhood reports also read HoodLock?s token-lock and vesting contracts by exact asset address. Each contract lists its own coverage. Reports distinguish locked, withdrawable and withdrawn balances and show the vesting cliff and end date. The scan details up to 64 matching IDs per contract. Liquidity-position NFTs are outside this check.

Titan token research checks the Robinhood V1, V2, V2.1 and V2.2 general managers separately. Each manager checks up to 64 indexed IDs and matches the actual asset in each record. NFT liquidity positions and the Titan.fun LP vault are outside token supply coverage. Vesting balances distinguish the scheduled grant from what the child locker currently allows its owner to release.

For token research, add an optional input field named "focus" with the value "locks" to put lock findings first. On Robinhood Chain you can also request "titan", "hoodlock", "uncx" or "pinklock". Marketplace buyers can ask for the same findings in their brief. The full report follows the answer.
