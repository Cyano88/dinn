export const productCapabilities={
 launch:{title:'Launch a token',status:'wallet-approval',description:'Pons ETH and approved ERC-20 pair launch setup, current economics, simulation, explicit wallet approval and exact receipt verification.'},
 inspect:{title:'Check a token or contract',status:'read-only',description:'Robinhood Chain bytecode, TS (total supply), SC (source verification), reported owner and proxy indicators. Not a security audit.'},
 balance:{title:'Read wallet balance',status:'read-only',description:'Native ETH balance on Robinhood Chain, with checked block.'},
 transaction:{title:'Check a transaction',status:'read-only',description:'Robinhood transaction and canonical receipt status. This is not proof of a specific launch; use saved launch receipt verification for that.'},
 options:{title:'Read Pons launch options',status:'read-only',description:'Current enabled configurations, fees and launch permission.'},
 lock:{title:'Lock token holdings',status:'unavailable',description:'No verified personal-token locker adapter. LP-lock evidence is also not verified by the generic token inspector.'},
 burn:{title:'Burn tokens',status:'unavailable',description:'No token-specific burn adapter; a sink transfer does not prove totalSupply decreases.'},
 buy:{title:'Buy tokens',status:'coming-soon',description:'Pons trading adapter not connected. Old Elysium/Montra swaps are paused.'},
 sell:{title:'Sell tokens',status:'coming-soon',description:'Pons trading adapter not connected; sellability is not established by a contract read.'},
 claim:{title:'Check and claim Pons fees',status:'wallet-approval',description:'Supported Pons v2 escrow balance, separate pending distribution, claim review, wallet approval and payout receipt verification.'},
 transfer:{title:'Send tokens',status:'wallet-approval',description:'Send ETH or ERC-20 tokens on Robinhood Chain. Send ETH, USDC or USDT on Base and Arbitrum. Review the network, recipient, gas and receipt before and after wallet approval.'},
 fund:{title:'Bridge or fund',status:'wallet-approval',description:'Relay quotes from Base or Arbitrum ETH, USDC and USDT to Robinhood Chain. Source confirmation and destination delivery are separate.'},
 swap:{title:'Swap assets',status:'wallet-approval',description:'Relay routes on Robinhood Chain where liquidity exists; Base and Arbitrum swaps are limited to ETH, USDC and USDT. Explicit quote review and wallet approval; unsupported routes remain unavailable.'},
 dex:{title:'DEX Screener profile',status:'external-checkout',description:'Get a checkout link with Robinhood Chain and token address prefilled. Optional profile notes are copyable. Complete details and payment on DEX Screener; check public order status here.'}
};
const tool=(name,description,properties={},required=[])=>({type:'function',function:{name,description,parameters:{type:'object',properties,required,additionalProperties:false}}});
const address={type:'string',pattern:'^0x[0-9a-fA-F]{40}$'};
export const productTools=[
 tool('manage_launch_draft','Understand a launch request, answer setup questions with inspect, or validate explicitly requested draft edits. Never choose financial settings. Values and evidence must be copied from the CURRENT user message (tax values are percent strings, not bps; buyback values enable/disable; pair ETH/ticker/address; recipient may be Use connected wallet). Use start/resume/pause only when requested. No wallet transaction.',{operation:{type:'string',enum:['start','resume','pause','inspect','update']},updates:{type:'array',maxItems:8,items:{type:'object',properties:{field:{type:'string',enum:['name','symbol','description','pairToken','configId','creatorTaxBps','buybackEnabled','creatorFeeRecipient','logo','website','twitter','telegram','discord','farcaster']},value:{type:'string'},evidence:{type:'string'}},required:['field','value','evidence'],additionalProperties:false}}},['operation']),
 tool('request_guidance','Read the applicable product constraint or missing information for the current request. Does not execute an unsupported action.'),
 tool('product_capabilities','Read the actual product tool status. Use before promising locks, burns, trades, claims, funding, or other operations.'),
 tool('pons_token_state','Read live Pons v2 bonding progress, graduation phase, spot price, FDV, reported circulating market cap, and claimable versus unswept fees. Lifetime earnings are unavailable.',{address,focus:{type:'string',enum:['market','fees','overview']}}),
 tool('review_pons_claim','Offer a fee claim review for the connected wallet and a Pons token. Does not sign or submit; never changes the fee recipient.',{address}),
 tool('wallet_balance','Read native ETH balance on Robinhood Chain only. Omit account to use the connected wallet.',{account:address}),
 tool('launch_options','Read current Pons configs, fees and optional connected-wallet permission.'),
 tool('inspect_token','Check a token/contract on Robinhood Chain only: TS supply, SC source verification, ownership/proxy indicators, Pons venue/fees/sell gates, and indexed top holders with onchain balances and their largest other priced holdings when the indexer is configured.',{address,focus:{type:'string',enum:['overview','supply','source','locks','owner','sellability','holders']}}),
 tool('transaction_status','Read a Robinhood transaction receipt by full hash. Does not validate a specific launch intent.',{hash:{type:'string',pattern:'^0x[0-9a-fA-F]{64}$'}},['hash']),
 tool('open_launch_setup','Offer a button to start or resume conversational Pons setup. Does not deploy or set fees.'),
 tool('open_launch_review','Offer a button to review the saved launch. Never signs or sends.'),
 tool('dex_service_status','Read public DEX Screener profile orders and published information for a Robinhood token. Does not prove this user paid.',{address},['address']),
 tool('open_dex_profile','Look up onchain token identity and reported project metadata, use AI to draft a description, and offer a populated review. Requires a token address. No submission or payment.',{address}),
 tool('open_wallet_action','Conversationally collect the user-chosen network, recipient when sending, asset and amount, and receive asset when bridging or swapping. Ask for one missing detail at a time. Once all values are explicitly supplied by the user, prepare and return a plain-language review plus a wallet approval action. Never sign or submit.',{kind:{type:'string',enum:['send','bridge','swap']},network:{type:'string',enum:['4663','8453','42161']},recipient:address,asset:{type:'string',pattern:'^([Ee][Tt][Hh]|[Uu][Ss][Dd][Gg]|[Ww][Ee][Tt][Hh]|[Uu][Ss][Dd][Cc]|[Uu][Ss][Dd][Tt]|0x[0-9a-fA-F]{40})$'},amount:{type:'string',pattern:'^[0-9]+(\\.[0-9]+)?$'},outputAsset:{type:'string',pattern:'^([Ee][Tt][Hh]|[Uu][Ss][Dd][Gg]|[Ww][Ee][Tt][Hh]|[Uu][Ss][Dd][Cc]|[Uu][Ss][Dd][Tt]|0x[0-9a-fA-F]{40})$'}},['kind']),
 tool('wallet_portfolio','Read wallet assets and estimated values on Robinhood Chain, Base or Arbitrum.',{account:address,network:{type:'string',enum:['4663','8453','42161']}}),
 tool('open_wallet','Offer a button to the wallet view.'),
 tool('open_launchpads','Offer a button to the launchpad list.')
];
export const actionTitles={dex:'Prepare DEX Screener profile',launch:'Start or resume launch',review:'Review launch',wallet:'Open wallet',launchpads:'View launchpads'};
