# Dinn agent access

Dinn is a multi-launchpad AI workspace. Pons on Robinhood Chain is the first integration in development. Ascend and Montra on Elysium are Coming soon.

POST /api/agent/request with JSON:

    {"service":"plan","input":{"message":"Help me write a token description"}}

    {"service":"pons.brief","input":{"launchpad":"pons","chainId":4663,"name":"Example","symbol":"EX","description":"A project idea"}}

Brief validation does not publish metadata, save a server-side draft, simulate or deploy a token. The browser saves briefs locally per account. Explicit chat setup and edit commands save the browser brief; generated AI text does not. Read-only checks: POST /api/pons/readiness with {} or an account address, and POST /api/robinhood/balance with {"account":"0x..."}.

Agent endpoints never sign or broadcast. The browser supports Pons ETH and approved ERC-20 pair review, simulation, explicit wallet approval and receipt verification. POST /api/pons/review accepts a Pons launch configuration; /api/pons/simulate accepts {configuration,quote}; /api/pons/receipt accepts {configuration,quote,hash}. Optional opening purchases use the Pons launch-and-buy router. ERC-20 purchases require a separate exact-amount approval. Logo creation is a restricted pilot. Legacy launch, swap, funding, wallet and creator-fee endpoints return HTTP 410. Discover capabilities at /.well-known/launchflow.json and /api/status.

Product read tools: GET /api/tools discovers strict schemas and capability states. POST /api/tools/run accepts {name,args,walletAccount?}. Supported reads: wallet_balance, launch_options, inspect_token (TS/SC/owner/proxy/unknown lock evidence), transaction_status, product_capabilities. open_* tools return UI suggestions, not execution. All operate on Robinhood Chain only. Locks, burns, swaps, claims, transfers and bridges have no active tool adapter.

DEX Screener: open_dex_profile opens local profile preparation; dex_service_status({address}) reads public profile orders and indexed metadata on Robinhood. Profile submission and payment occur at official external checkout. Public token-level orders do not identify the payer or prove fulfillment of a particular draft.

First-release checkout handoff: only the token address is required. The official link prefills chainId=robinhood and tokenAddress; other profile notes are optional and copied manually. Dinn does not submit profiles or pay.

DEX profile drafting: open_dex_profile with a token address reads contract identity and available GeckoTerminal metadata, then uses inference to draft a description. Reported project claims require review; missing links stay blank. If inference fails, source-based text is returned. Only network and address are prefilled externally.
