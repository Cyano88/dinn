# UI workflow — 6 November 2026

## Current product flow

X or Google sign-in -> Assistant -> seven-setting draft -> editable review -> read-only simulation -> wallet approval (release-gated) -> receipt verification -> Launches.

The signed-out HTML contains an inert, hidden workspace. A configured Privy session opens it. Missing configuration shows disabled social buttons and a retry action; there is no guest/demo entry or fake OAuth completion. The Google and Twitter login methods are configured in the SDK and public config.

## Interface

- Neutral light surfaces, charcoal actions, subtle sage selection, consistent outlined navigation icons.
- Assistant, Launches and Agent access are the only navigation items.
- Chat has clearly separated outgoing/incoming messages, contextual replies and a fixed composer. No typing animation, pulses, ambient glow, fake stats or placeholder service cards.
- Launch details appear after setup starts. Settings remain editable; changing a setting discards stale review/simulation.
- New launch requires confirmation before replacing a nonempty draft.
- Mobile details occupy their own panel with an explicit close action and return to chat when editing.
- Launches has a truthful empty state, transaction tracking and verified receipt details. No fictitious balances, activity or live-market charts.
- Agent access provides working guide/schema links and copyable instructions. No marketplace listing or payment is claimed.

## References inspected

Hash PayLink reference source was read, not changed:
- C:/Users/USER/hashpaylink-exchange-push-release/src/surfaces/DeveloperLayout.tsx
- C:/Users/USER/hashpaylink-exchange-push-release/src/components/DeveloperSupportWidget.tsx
- C:/Users/USER/hashpaylink-exchange-push-release/src/components/SupportConversation.tsx
- C:/Users/USER/hashpaylink-exchange-push-release/src/components/PocketStyleSupportComposer.tsx

Veildesk reference: C:/Users/USER/Desktop/veildesk/web/index.html and style.css. Its restrained colours and structured detail/review sections informed this console; decorative effects were not carried over.

Bankr's official onboarding documentation informed the sign-in/wallet/chat progression: https://docs.bankr.bot/faq/getting-started/. Direct browser access to bankr.bot timed out, so no claim of a pixel-for-pixel inspection or reproduction.

## State boundaries

Drafts and tracked launches use sessionStorage keys scoped to the provider user ID. Unowned v1 drafts are not silently assigned to a new account. Logging out closes the workspace and invalidates review; a returning account restores its draft. Conversation text is currently transient and is replaced by a resume prompt on reload.

Pending submissions retain their original browser-wide localStorage recovery record and Web Lock, preventing cross-tab duplicate sends. The status panel is only shown for the connected deployer account. This is local UI separation, not encrypted storage or server authorization. Public agent/planning endpoints remain public. Add server-side token verification before introducing private account data or paid operations.

## Verification

40 application tests pass. Playwright checked both sign-in choices with a mock identity provider, locked entry, seven settings, review, new-draft confirmation/cancel, mobile detail editing, sign-out, account switching, restoration and agent/launch navigation. Mock submission regression covers disabled sending, a single wallet request, confirming/verified receipts, timeout, refresh without resending and exact-calldata hash recovery. Screenshots are in output/playwright/ui-*.png.

Mock authentication is confined to browser interception and ignored QA files. It is not an application feature. Real Google/X OAuth, wallet creation/recovery and onchain execution remain unverified without provider configuration. Live sending remains disabled.

## Dinn sign-in presentation
The approved sign-in design always displays the legal sentence and official 0G footer logo, independently of runtime configuration. This is presentation work; it does not enable OAuth or inference. Local /terms and /privacy pages are explicitly labelled drafts pending operator details and final policies. Configured published policy URLs replace the local destinations when supplied. Complete and verify integrations and policies before public launch.


## Account refinement - 2026-11-06

The account menu provides wallet-address copying with accessible confirmation, Escape dismissal, and outside-click dismissal. Workspace and review feedback distinguish testnet onboarding from mainnet execution; a testnet connection never grants transaction readiness. Draft-deployer mismatches remain visible. User-facing assistant and agent-service names now use Dinn; existing storage keys and endpoint paths remain compatible.

Validation: npm test passed 43 tests. The controlled browser remained signed out; the user reported signing in in their browser. Actual authenticated menu interaction still needs live verification. 0G inference configuration is absent; launching remains disabled.


Chat now streams real 0G answers, supports Stop, and restores up to six completed exchanges per account in the current tab. Launch questions no longer automatically start setup; explicit launch requests still open the guided flow. Partial responses are marked and excluded from memory. Tests cover account changes during an in-flight reply.


## Conversational setup correction

Greetings and questions during launch setup route to streaming chat with the current pending field as context. Explicit field values remain validated locally; conversational replies cannot mutate the draft. Choice buttons return after the response. The composer stays Ask Dinn, with a separate Next: label. Plain launch requests such as launch GOK TOKEN recognize the requested name; a conflicting saved name requires confirmation before replacement.

Validation: 51 tests passed. Live 0G browser reproduction of the reported GOK flow confirmed that HI receives a greeting without setting the pair, choices remain available, and use HYPE advances to the trading fee. Browser auth was a fixture, inference was live.


## Token profile and network selection - November 7

Token profile opens from the header, launch summary or composer attachment button. PNG/JPEG/WebP files under 4 MB are decoded locally, bounded by dimensions, square-cropped with zoom/position controls and re-encoded as a 512px WebP. Description, website, X and Telegram links are optional. URL validation rejects executable URLs, embedded credentials and spoofed social domains. Preview and launch review display the profile; it never enters the launch contract payload.

Profiles are account-scoped sessionStorage drafts, saved in the current tab only. Switching accounts dismisses the editor and clears transient image state. New launch clears its profile after the existing confirmation. No upload, IPFS pinning, Ascend publication or social-ownership verification is claimed.

The inspection selector starts at Choose network. Available networks are supplied by the server; Elysium testnet is currently connected, while Elysium mainnet and X Layer are visibly unavailable. The chat requires explicit network selection before scanning an address. Server validation refuses absent or unavailable inspectionChainId values without querying another chain. Changing inspection network clears the selected token context; wallet/launch network settings are separate.

Validation: 60 tests passed. Browser fixtures exercised image crop/save/restore, cross-account isolation, mobile/desktop preview, profile inclusion in review, seven-field-only transaction payloads and zero scan requests before network selection. Direct HTTP verification rejected X Layer as unavailable. Screenshots: output/playwright/dinn-token-profile-desktop.png and dinn-token-profile-mobile.png.

### Conversation navigation (2026-11-07)
- Sidebar New chat clears conversation and selected token, preserving the current launch draft and profile.
- Launch details contains New launch, with explicit confirmation before replacing draft, profile and conversation.
- Restoring a session no longer inserts repeated saved-draft messages. Profile publication guidance is consolidated in the editor footer.
- Verified in an isolated browser with fixture authentication: preservation, confirmation, cancel, and reset. All 60 tests passed. No live transaction or auth changes.

### Conversational token tasks (2026-11-07)
- Token details / Your token / Continue setup replace prominent draft terminology.
- Explicit single-field chat edits update existing validated settings or local profile values; unsupported or compound edits ask for clarification. Logo requests open the existing upload editor. Missing-setting requests read current state.
- Generated model text does not mutate settings; explicit app handlers do. No signing or launch execution added.
- 62 tests passed. Browser fixture verified ticker and X edits, rejected invalid fees, missing settings, and logo dialog.

### Elysium default (2026-11-07)
- User requested Elysium-first scope. Inspection now selects the available configured Elysium network automatically and sends its chain ID explicitly. Other networks are omitted from the selector.
- Network label remains visible; currently Elysium testnet. A selected token is not restored across a different chain.
- Syntax checks and isolated browser request interception passed without live RPC calls.

### Refresh and inspection cost controls (2026-11-07)
- Workspace shell renders immediately while Privy resolves; it stays inert until authenticated. Confirmed sign-out shows sign-in. No restoration interstitial. Fixture transitions verified; actual user session persistence not independently verified.
- Public inspection reports cached for 30 seconds with original evidence timestamps. Concurrent same-token reads coalesced. Process-wide upstream cap: 30 fresh checks/minute, four concurrent, 256 cached reports. Failures not cached. Limits reset on restart; not per-user daily quotas.
- Full suite: 65 passed; final UI syntax and browser state transitions passed.

### Wallet stage (2026-11-07)
- Added Wallet view with native/manually-added ERC-20 balances, transfer review and persistent transfer recovery. Chat can open/prefill sends; explicit wallet approval required.
- Swaps unavailable: documented mainnet router/quoter have no code on configured testnet. See WALLET-TRANSFERS.md for evidence and limitations.
- 71 tests passed, mobile mocked send/receipt flow passed, real read-only balance HTTP call passed. No real funds sent.

### Swap review stage (2026-11-07)
- Wallet Swap and chat trading requests open a shared buy/sell form, followed by a separate review screen. Editing the trade invalidates the previous approval.
- Added fee-inclusive quotes, minimum received, bounded token/Permit2 approvals, optional HYPE wrapping, receipt polling and persisted unknown/submitted recovery. HYPE-pair sells return WHYPE; unwrapping is not automatic.
- Execution is restricted to an explicitly enabled local Anvil fork. The user's configured testnet and public swaps remain disabled; no environment settings or real funds were changed.
- 76 tests passed. Shared service/submission/receipt modules confirmed wrap, reset, approve, permit, buy and sell on Elysium fork block 1,920,563. Desktop/mobile fixture checks confirmed zero sends before approval, one send after approval, and stale-review removal after editing.
- See FORK-SWAP-TEST.md for rerun instructions and the public RPC history limitation.

### Read-only mainnet quotes (2026-11-07)
- Pasting a bare token address or asking to buy/sell opens token quotes. Wallet Swap opens the same screen outside explicit local-fork preview mode.
- Montra detection reads the registry lens/router, verifies that the token is in the pool key and that its hook is recognized and pool seeded. Ascend detection reads recorded launch times for pool IDs derived from the token and supported quote assets. Multiple verified pools require a selection.
- Quotes use the venue's actual quoter, pin all reads to one block, reject stale/wrong-chain state and recheck the block hash. Native HYPE and WHYPE are distinguished. Current buy/sell fees, slippage and minimum received are shown. No API labels or token names establish venue identity.
- Read-only market access uses Elysium mainnet through the public Montra RPC, optionally overridden server-side by ELYSIUM_MARKET_RPC_URL. This does not change the connected wallet, existing inspection network, or private RPC. The UI explicitly labels the market network as Elysium mainnet.
- Market endpoints share the existing process-wide wallet-read quota. Quotes expire after 30 seconds; edits invalidate the displayed review. Balances, when available, are checked on mainnet and do not imply sufficient gas or approval readiness.
- Responses contain no transaction calldata and expose executionEnabled=false. Public signing, bridging and live swap submission remain disabled. Pool identity evidence is not a token safety rating; this stage does not add source audits, holder analytics or a liquidity-lock guarantee.
- Validation: 80 tests passed, including Montra and Ascend selection, native-vs-wrapped quote assets, incorrect hooks, stale state, reorgs, wrong network, unavailable providers and decimal precision. A live read-only Alfie detection and quote passed; evidence is saved in output/research/market-live-check.json.
- Browser verification passed using the real read-only endpoints: pasted-address chat entry, automatic Montra identification, mobile/desktop quote rendering, no wallet approval control, no horizontal overflow, and invalidation after editing. Displayed amounts are truncated to six decimal places; exact values remain in Pool evidence. Screenshots are in output/playwright/dinn-market-*.png.
- Vendored ABI fragments come from Montra's published LaunchLens.json and LaunchRouter.json at https://montramarkets.xyz/docs/abis/. Only tokenView and quoteExactIn are used by this read-only module.

## Wallet route and delivery checks (2026-11-08)

Token quote reviews offer a read-only wallet-route check when an account is available. It reads the account's native balances and code on HyperEVM and Elysium, verifies the inbox-to-bridge-to-rollup chain link, checks pause state, and reports Montra service availability. This does not deposit funds, switch the wallet network, or establish that the user's wallet can sign.

The delivery status API requires a transaction hash and expected sender, recipient, chain, value and calldata. Confirmation requires a matching canonical Elysium receipt and two L2 blocks. Relayer-only reports never establish confirmation or permit automatic retry. Inclusion is not proof of swap output or bridge withdrawal finality. The tracker is backend infrastructure; there is no live submission flow wired to it yet.

Signed-transaction validation accepts only exact reviewed EIP-1559 bytes including recovered sender, chain, calldata, value, nonce, gas and fees. Privy's installed SDK exposes signTransaction, but the connected embedded wallet's signing capability remains untested. Mainnet submission and bridge deposits remain disabled.

Validation: 85 tests passed, including wrong intent/signature fields, reorgs, relayer ambiguity, and delegated-address bridge restrictions. Read-only live evidence is in output/research/delivery-live-read-check.json. That check used a public sample address, not the user's wallet; its balances are not user balances. A historical transaction receipt was verified, not a newly submitted trade. Mobile UI was checked with fixture data and no wallet interaction.

## Local Privy signing diagnostic

Open http://127.0.0.1:4317/?wallet-check=1 and use Account menu > Check transaction signing after signing in. The normal account menu has no diagnostic. This uses Privy's useSignTransaction hook with wallet confirmation UI enabled; no send method is called. The fixed EIP-1559 probe targets chain 99901, sends zero value to the same wallet, carries no calldata, and uses gas limit 1 (below intrinsic gas, so it cannot execute). The local validator checks the recovered signer and every reviewed field. Signed bytes are not stored, logged, sent to Dinn's server, or returned from the helper. Only an in-memory result is shown.

A provider may reject the deliberately invalid gas limit or unsupported chain before signing. Such a result is unverified, not proof of incompatibility. Actual embedded-wallet signing remains unverified until this check succeeds with the signed-in user. This diagnostic does not change the configured onboarding network or enable trading.

Reference: https://docs.privy.io/wallets/using-wallets/ethereum/sign-a-transaction

## Wallet and swap layout cleanup (2026-11-08)

Wallet refresh is an accessible icon in the header. Successful balance reads no longer print block numbers; native-asset subtitles and integration-status boilerplate were removed. Errors remain visible. Token contract addresses are abbreviated with the full address available on hover.

The market quote UI now follows PocketExchangeLayout's From/To card structure: asset and amount rows, direction reversal, inline output, and expandable fee details. Token contract entry opens from the token selector; pool selection remains explicit when multiple routes exist. Changing input clears the previous quote; reversing clears the amount so units cannot silently change. Expired quotes clear the output. Mainnet quotes remain read-only, clearly labeled Quotes only, with no confirm/send action.

Verified in the isolated browser at mobile and desktop sizes using fixture quote responses: token selection, buy quote, reverse to sell, amount clearing, and stale quote invalidation. Syntax checks passed. No funds or wallet signatures were used.

## Mainnet workspace migration (2026-11-08)

The active local workspace now uses Elysium mainnet 99901 for Privy onboarding, server reads, wallet balances, token inspection and market quotes. The server and browser RPCs are https://rpc.montramarkets.xyz. This is a community service with unrestricted reads but scoped submission, not a general Ascend submission route. Prior testnet endpoints are retained only under inactive ELYSIUM_TESTNET_* keys in ignored .env. Duplicate active RPC entries were removed; no keys were disclosed or changed.

Existing embedded wallets are switched to the configured network before publishing a connected session, and the provider chain is checked again afterward. This does not create another wallet or move testnet balances to mainnet. Token watchlists and transfer records remain chain-scoped. Historical testnet support in tests and explicit configuration is preserved.

ENABLE_LIVE_LAUNCH, ENABLE_WALLET_TRANSFERS and ENABLE_LOCAL_SWAP_PREVIEW remain false. Mainnet reads and launch simulation are available; quotes do not submit trades, and bridging remains unimplemented. Sending is disabled in the wallet UI. Privy's actual user session still needs to reconnect/refresh to verify its real mainnet state; isolated UI tests are not a live wallet verification.

Validation: all 89 tests passed, including embedded-wallet chain switching and refusal of unsuccessful switches. Live /api/status and /api/auth/config returned mainnet, and /api/wallet/balances returned HTTP 200 with chain 99901. Mainnet factory, launchpad, router, quoter and Permit2 code were verified, as was the factory-to-launchpad link. Public RPC reads intermittently failed; check:network deduplicates identical URLs to avoid unnecessary repeated requests and exits nonzero on unverified connections. Current evidence: output/research/mainnet-migration-check.log. Browser fixture confirmed Elysium mainnet and disabled Send tokens, then was cleared.

Reference: https://montramarkets.xyz/docs/rpc.md

## Supported mainnet execution release (2026-11-08)

Enabled in the active local .env: ENABLE_WALLET_TRANSFERS=true and ENABLE_MONTRA_SWAPS=true. Release-policy checks require chain 99901 and the verified Montra RPC for server, browser and market traffic. Each preparation checks relay health. A disabled relay, unknown provider, unsupported asset/pool, failed simulation, or insufficient balance prevents wallet approval preparation.

Available now:
- Native HYPE transfers: exact recipient/value, simulation, buffered network fee, explicit wallet approval and matching canonical receipt.
- Montra native-HYPE token buys/sells through the verified LaunchRouter/hook: selected pool verification, exact input, minimum output, short-lived review, simulated transaction, gas balance check. Sales use exact-amount ERC-20 approvals; nonzero insufficient allowances reset first. Each confirmed approval requires a new swap review.
- Public Montra token list/search, bounded and sanitized, cached for one minute. Listings are metadata, not safety endorsements; selection is checked onchain before quoting.
- Persistent swap/approval recovery; unknown results never auto-retry. Pending transfer/market/local-swap/launch records prevent conflicting actions. One Swap CTA leads from quote to a separate wallet review. Confirmation requires the exact transaction and a matching Swapped event with expected pool, sender, recipient, input, direction and minimum output.

Not enabled: Ascend launches and swaps (Montra explicitly excludes them); ERC-20 sends outside the scoped adapter; bridge deposits/withdrawals; holdings locks, burns, fee claims, NEAR funding and DEX service payments. Those require their own verified routes/adapters. Ascend's current public docs provide metadata/indexer guidance but no general partner submission endpoint. This release does not change Ascend launch planning or simulation into a Montra launch.

Evidence: 97 tests passed (output/build/execution-release-tests.log). scripts/fork-montra.mjs now executes the actual Dinn preparation and browser submission helpers on local Anvil, with read-only upstream allowlisting. Verified native send, Montra buy, exact sell approval and sell with matching receipts; output/research/montra-execution-fork.log. Browser used a simulated non-signing wallet for a single send/confirmed test and separate mobile review QA; fixtures were removed afterward. Live API returned 20 discoverable tokens and the relay reported sends enabled. No user's funds were moved. Actual Privy-to-public-relay execution has not been smoke-tested with real funds; fork and simulated browser success do not prove that final live path.

Sources: https://montramarkets.xyz/docs/rpc.md ; https://montramarkets.xyz/docs/abis/LaunchRouter.json ; https://montramarkets.xyz/docs/api.md ; https://ascendlaunch.gitbook.io/docs/developers/apis-and-bridging.md

## Two-asset swap and stable holdings (2026-11-08)

Swap now uses two independent From/To asset selectors. Both open the same searchable catalog, including HYPE and held tokens; the current selection and balances appear in the list. The middle control exchanges the exact assets and clears the old amount/quote. Duplicate selections reverse the pair. The last pair is saved per user/address/mainnet; on first use HYPE is the input and a held catalog token is preferred for output, otherwise the first oldest catalog token. Defaults are UI selections, not token recommendations. Each route is verified before quoting, and unsupported token-to-token routes fail clearly rather than silently changing assets. The card debounces quotes, rejects stale responses, and has one compact expandable detail row. Wallet approval remains a separate review.

Wallet discovery uses Montra's holdings API for candidate addresses, plus known quote assets and manually added contracts. Balances, symbols and decimals are read onchain at one block; indexer values cannot become wallet balances. Discovery is cached per address for 30 seconds, bounded to 50 discovered candidates (plus manual/base assets), and reports unavailable or partial coverage. This is not whole-chain token indexing. Failed discovery keeps known candidates; failed refreshes keep visible balance rows. Rows are updated in place by asset address. Account/network changes still clear the prior identity's rows. Auth refreshes for the same user/wallet avoid the intermediate disconnect that caused flicker.

Browser verification used simulated HYPE/ALFA/BETA fixtures: defaults HYPE/ALFA, From changed to BETA, To changed to HYPE, reverse returned HYPE/BETA, and automatic quotes rendered. A delayed balance refresh kept the old value and the same DOM row, then updated it in place. Mobile swap/picker and desktop wallet screenshots were inspected. No wallet signing occurred. Sources for layout and discovery: https://github.com/RabbyHub/Rabby/tree/develop/src/ui/views/Swap and https://montramarkets.xyz/docs/api.md.
