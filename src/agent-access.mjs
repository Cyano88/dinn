import {equityContext,equityMessage} from './equity-context.mjs';
import {leadWithLockFinding} from './research-finding.mjs';
import {titanLines} from './titan-robinhood.mjs';
import {hoodLines} from './hoodlock-robinhood.mjs';
import {uncxLines} from './uncx-robinhood.mjs';
import {baseLockSummary} from './base-lock-evidence.mjs';
import {discoveryMessage} from './discovery-guide.mjs';
import {createHash,randomUUID} from 'node:crypto';
import {formatUnits,parseUnits} from 'viem';
import {ponsTokenState,tokenStateMessage} from './pons-token-state.mjs';
import {ponsReadiness} from './pons.mjs';
import {robinhoodBalances} from './robinhood-wallet.mjs';
import {robinhoodRouteQuote} from './robinhood-routes.mjs';
import {address,same} from './robinhood-wallet-call.mjs';
import {inspectCachedToken} from './inspection-cache.mjs';
import {serverRpcUrl} from './rpc-config.mjs';
import {discoverStockPairs,researchBaseStockPairedToken} from './base-stock-paired-research.mjs';
import {researchBaseStock} from './base-stock-research.mjs';
import {robinhoodStock} from './robinhood-stock.mjs';
import {purchaseUsdReference} from './purchase-usd.mjs';
const account={type:'string',pattern:'^0x[0-9a-fA-F]{40}$'};
export const agentServices={
 'pons.stock.research':{description:'Research a Robinhood stock token by exact ticker or chain 4663 address, including available contract, holder and lock evidence.',required:['query'],properties:{query:{type:'string',pattern:'^(?:0x[0-9a-fA-F]{40}|[a-zA-Z][a-zA-Z0-9.-]{0,19})$'}}},
 'pons.stock-paired.research':{description:'Research a Pons launch by address. Match its onchain pairing asset to the Robinhood stock registry and report launch activity and available lock schedules.',required:['address'],properties:{address:account}},
 'base.stock-paired.discover':{description:'Compare a rotating sample of verified Bankr stock pairs on Base by reported USD liquidity or 24-hour USD volume.',required:['metric'],properties:{metric:{type:'string',enum:['liquidity','volume']}}},
 'token.research':{description:'Read-only Robinhood Chain token research for trading agents: Pons launch age, phase and curve metrics; curve volume and generated fee totals where event coverage is complete; indexed holders and their Pons buy/sell history; current other-token balances; contract controls; PinkLock token and vesting records from the listed adapters plus verified per-lock PinkLock02 contracts among indexed top holders; and reference market data. Findings include their source, block and coverage limits. No trade execution or safe-to-trade verdict.',required:['address'],properties:{address:account,account}},
 'base.stock-paired.research':{description:'Read-only Base research for a token that may be paired with a Coinbase tokenized stock. Checks the Bankr launch record against its successful Base Uniswap v4 receipt and Coinbase stock registry; Dinn checks the 50 most recent launches and the address-specific Bankr launch endpoint. For verified launches it also reads Bankr creator vesting; missing schedules do not prove supply is unlocked, and reported allocations are not the full supply. Market data comes from DEX Screener pairs matched by token addresses or a GeckoTerminal record verified against the exact Bankr v4 pool ID and token addresses. Dinn labels a DEX Screener pair as the Bankr pool only if its pair ID exactly matches the Bankr v4 pool ID. Includes available trading activity and Bankr fee data plus block-pinned token supply, reported owner, proxy indicators, Sourcify source matching. Paid NEAR marketplace hires include GoldRush holder snapshots, or Blockscout holder balances when GoldRush is not configured; free API previews and zero-cost test runs skip holder requests. Recent buy/sell classification requires GoldRush and is checked for up to three largest sampled addresses only when no contract code was observed. This is partial activity evidence, not complete wallet history or proof of identity or intent. The report is not a contract audit or safe-to-trade verdict. Missing records from both Bankr lookup methods are inconclusive.',required:['address'],properties:{address:account}},
 'base.stock.research':{description:'Read-only research for a normal Coinbase tokenized stock on Base. Input one exact ticker, name or Base address in query. Matches the Coinbase registry to onchain B20 name, symbol, decimals, supply, multiplier, pause state and transfer policy IDs at a pinned block; reports dated NAV, exact-address DEX Screener market pairs, and optional sampled holder evidence from GoldRush or Blockscout when configured. Recent buy/sell classification requires GoldRush. Paid NEAR hires may include holder data when configured; free previews and test runs omit it. If the stock is listed in Bankr’s current stock-pair list, Dinn provides a link for Bankr’s live quote and location check. The report is not a security audit, eligibility check, or safe-to-trade verdict.',required:['query'],properties:{query:{type:'string',pattern:'^(?:0x[0-9a-fA-F]{40}|[A-Za-z][A-Za-z0-9 ._-]{0,39})$'}}},
 'token.inspect':{description:'Compatibility alias for the expanded read-only Robinhood Chain token.research report.',required:['address','chainId'],properties:{address:account,chainId:{type:'integer',enum:[4663]}}},
 'wallet.balances':{description:'Public onchain balances, with unavailable data preserved. This does not authenticate wallet ownership.',required:['account','chainId'],properties:{account,chainId:{type:'integer',enum:[4663,8453,42161]}}},
 'launch.options':{description:'Current enabled Pons configurations and optional account launch permission.',required:[],properties:{account}},
 'swap.quote':{description:'Read-only same-chain quote. Base and Arbitrum support ETH, USDC and USDT; Base also supports the exact pair of a Dinn-verified Bankr stock-paired token and its declared stock asset. Bankr location eligibility is not checked. No deposit address, signing or execution is provided.',required:['account','chainId','asset','outputAsset','amount'],properties:{account,chainId:{type:'integer',enum:[4663,8453,42161]},asset:account,outputAsset:account,amount:{type:'string',pattern:'^[0-9]+(\\.[0-9]+)?$'}}},
 'bridge.quote':{description:'Read-only Base/Arbitrum to Robinhood route quote; no deposit or signing.',required:['account','chainId','asset','outputAsset','amount'],properties:{account,chainId:{type:'integer',enum:[8453,42161]},asset:account,outputAsset:account,amount:{type:'string',pattern:'^[0-9]+(\\.[0-9]+)?$'}}}
};
for(const service of ['token.research','token.inspect','pons.stock.research','pons.stock-paired.research','base.stock.research','base.stock-paired.research']){
 agentServices[service].properties.focus={type:'string',enum:['locks','titan','hoodlock','uncx','pinklock']};
}
const nearMarket={provider:'NEAR Agent Market',status:'live',listingUrl:'https://market.near.ai/a/dinn',pricePerCallUsd:'0.10'};
const baseMarket={provider:'Agentic Market',status:'live',listingUrl:'https://agentic.market/services/dinn-pasy-onrender-com',pricePerCallUsdc:'0.10',network:'Base',endpoint:'/api/paid/research'};
export function agentAccessManifest(){return {name:'Dinn',version:'6',services:['plan','pons.brief',...Object.keys(agentServices)],discovery:{instructions:'/agent-guide.md',schema:'/api/agent/schema',tools:'/api/tools'},transport:{type:'http-json',endpoint:'/api/agent/request'},broadcastEnabled:false,canSign:false,acceptsPrivateKeys:false,payment:{mode:'free-public-preview',charged:false},marketplace:nearMarket,marketplaces:{near:nearMarket,base:baseMarket},notes:['Public account input is a query target, not proof of ownership.','Research is a dated chain snapshot, not a security audit.','Base tradeHandoff only indicates whether the report supports asking another provider for a fresh quote; it does not confirm a route or recommend a trade.','Dinn never chooses trade side or size, prepares a transaction, signs or broadcasts.','Marketplace payment never grants wallet authority.']};}
export function agentAccessSchema(){return {type:'object',required:['service','input'],additionalProperties:false,properties:{service:{enum:['plan','pons.brief',...Object.keys(agentServices)]},input:{type:'object'},requestId:{type:'string',pattern:'^[A-Za-z0-9._-]{1,100}$'}},serviceInputs:Object.fromEntries(Object.entries(agentServices).map(([k,v])=>[k,{type:'object',additionalProperties:false,...v}]))};}
export function validateAgentRequest(request){
 if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(k=>!['service','input','requestId'].includes(k)))throw Error('Expected service, input and optional requestId only.');
 if(request.requestId!==undefined&&(typeof request.requestId!=='string'||!/^[A-Za-z0-9._-]{1,100}$/.test(request.requestId)))throw Error('Invalid requestId.');
 const spec=agentServices[request.service];if(!spec)throw Error('Unsupported agent service.');const i=request.input;
 if(!i||typeof i!=='object'||Array.isArray(i)||Object.keys(i).some(k=>!Object.hasOwn(spec.properties,k)))throw Error('Unsupported input field. Never send keys, wallet permissions or execution flags.');
 const missing=spec.required.filter(k=>i[k]===undefined||i[k]==='');if(missing.length)return missing;
 for(const [k,v]of Object.entries(i)){const s=spec.properties[k];if(s.type==='integer'?!Number.isSafeInteger(v):typeof v!=='string')throw Error('Invalid '+k+'.');if(s.enum&&!s.enum.includes(v)||s.pattern&&!new RegExp(s.pattern).test(v))throw Error('Invalid '+k+'.');if(['address','account'].includes(k)&&!address(v))throw Error('Use a nonzero '+k+'.');}
 return [];
}
const safeText=v=>String(v).replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/[\\`*_{}\[\]<>#|]/g,'\\$&');
const safeLine=(v,max=1400)=>safeText(v??'Unavailable').replace(/\s+/g,' ').slice(0,max);
const reportNumber=value=>value!==null&&value!==undefined&&!(typeof value==='string'&&!value.trim())&&Number.isFinite(Number(value))?safeLine(value,80):'unavailable';
function baseQuoteHandoff(result){
 const market=result.market,launch=result.launch,reasons=[];
 if(result.classification!=='verified-bankr-stock-paired-token'||result.verification?.status!=='verified'||!same(result.stock?.address,launch?.pairedStock?.address))reasons.push('stock_pair_not_verified');
 if(typeof launch?.poolId!=='string'||!/^0x[0-9a-f]{64}$/i.test(launch.poolId)||market?.matchesBankrPool!==true)reasons.push('bankr_pool_not_matched');
 const liquidity=market?.liquidityUsd===null||market?.liquidityUsd===undefined?NaN:Number(market.liquidityUsd);
 if(!Number.isFinite(liquidity)||liquidity<=0)reasons.push('positive_pool_liquidity_unavailable');
 const canRequestQuote=reasons.length===0;
 return {
  status:canRequestQuote?'request_external_quote':'review_first',
  chainId:8453,
  tokenAddress:result.address,
  stockAddress:result.stock?.address||null,
  bankrPoolId:launch?.poolId||null,
  market:market?{source:market.source||null,poolId:market.pairAddress||null,matchesBankrPool:market.matchesBankrPool===true,reportedLiquidityUsd:Number.isFinite(liquidity)?String(market.liquidityUsd):null,referencePriceUsd:market.priceUsd??null,checkedAt:result.checkedAt}:null,
  quote:{status:'not_requested',executable:false},
  orderIntent:null,
  transaction:{prepared:false,signed:false,broadcast:false},
  nextAction:canRequestQuote?'The requesting agent may ask its own execution provider for a fresh quote and apply its own policy.':'Resolve the evidence gaps before requesting a quote.',
  reasonCodes:reasons
 };
}
function baseStockResearchDeliverable(result){
 const nav=reportNumber(result.stock?.referencePrice),coverage=result.coverage||{};
 const lines=['# Dinn Base stock-paired token research','Token: '+safeLine(result.launch?.name||result.address,100)+(result.launch?.symbol?' ('+safeLine(result.launch.symbol,24)+')':''),'Network: Base (chain 8453)','Checked at: '+safeLine(result.checkedAt,80),'Classification: '+(result.classification==='verified-bankr-stock-paired-token'?'Verified stock pairing':'Insufficient evidence to confirm stock pairing')];
 if(result.classification!=='verified-bankr-stock-paired-token')lines.push('Pairing status: insufficient evidence. This does not prove the token is not stock-paired.');
 if(result.stock)lines.push('Paired stock: '+safeLine(result.stock.name,100)+' ('+safeLine(result.stock.symbol,24)+') at '+safeLine(result.stock.address,64)+'.','Coinbase reference NAV: '+(nav==='unavailable'?'unavailable':'$'+nav)+'; updated '+safeLine(result.stock.referencePriceUpdatedAt??'unavailable',80)+'; multiplier '+reportNumber(result.stock.multiplier)+'.');
 if(result.stock)lines.push('Coinbase tokenized-stock registry: https://api.coinbase.com/v1/tokenized-stocks','Bankr Base stock-pair list: https://api.bankr.bot/token-launches/quote-tokens?chain=base');
 if(result.launch){lines.push('Bankr launch record: '+safeLine(result.launch.name,100)+' ('+safeLine(result.launch.symbol,24)+'); declared pair '+safeLine(result.launch.pairedStock?.symbol||'unavailable',24)+' at '+safeLine(result.launch.pairedStock?.address||'unavailable',64)+'; deployed '+safeLine(result.launch.deployedAt??'unavailable',80)+'.');if(typeof result.launch.transactionHash==='string'&&/^0x[0-9a-f]{64}$/i.test(result.launch.transactionHash))lines.push('Launch transaction: https://basescan.org/tx/'+result.launch.transactionHash.toLowerCase()+'.');if(typeof result.launch.poolId==='string'&&/^0x[0-9a-f]{64}$/i.test(result.launch.poolId))lines.push('Pool ID: '+result.launch.poolId.toLowerCase()+'.');}
 if(result.launch)lines.push('Bankr-reported launch age: '+(Number.isInteger(result.launch.ageDays)?result.launch.ageDays===0?'less than 1 day':result.launch.ageDays+' days':'unavailable')+' as of '+safeLine(result.checkedAt,80)+'.');
  if(coverage.bankrLaunchFeed==='address-specific Bankr launch lookup'&&/^0x[0-9a-f]{40}$/i.test(result.address||''))lines.push('Bankr launch record: https://api.bankr.bot/token-launches/'+result.address.toLowerCase());
  if(result.fees&&/^0x[0-9a-f]{40}$/i.test(result.address||''))lines.push('Bankr fee history: https://api.bankr.bot/token-launches/'+result.address.toLowerCase()+'/fees');
  if(result.contract){lines.push('Onchain contract snapshot: Base block '+safeLine(result.contract.blockNumber,24)+'; block hash '+safeLine(result.contract.blockHash,66)+'.');for(const check of result.contract.checks||[])lines.push(safeLine(check.label,80)+': '+safeLine(check.detail,600));}else lines.push('Onchain contract snapshot: unavailable.');
 if(result.market){const market=result.market,counts=market.transactions,labels={m5:'5m',h1:'1h',h6:'6h',h24:'24h'},volumePeriods=['m5','h1','h6','h24'],tradeWindows=volumePeriods.filter(period=>Number.isFinite(Number(counts?.[period]?.buys))&&Number.isFinite(Number(counts?.[period]?.sells))).map(period=>labels[period]+' '+counts[period].buys+'/'+counts[period].sells).join('; ')||'unavailable',volumeWindows=volumePeriods.filter(period=>Number.isFinite(Number(market.volumeUsd?.[period]))).map(period=>labels[period]+' '+reportNumber(market.volumeUsd[period])).join('; ')||'unavailable',volumeMissing=volumePeriods.filter(period=>!Number.isFinite(Number(market.volumeUsd?.[period]))).map(period=>labels[period]).join('/'),liquidityLabel=market.source==='GeckoTerminal'?'reported pool reserves USD':'liquidity USD';lines.push((market.matchesBankrPool?(market.source==='GeckoTerminal'?'GeckoTerminal verified Bankr pool':'DEX Screener verified Bankr pool'):'DEX Screener address-matched pair (separate pool)')+': '+safeLine(market.poolName||market.pairAddress,120)+'; base '+safeLine(market.baseToken?.symbol||'unavailable',24)+'; quote '+safeLine(market.quoteToken?.symbol||'unavailable',24)+'.','Buys/sells by window (buy/sell): '+tradeWindows+'.','Volume USD by window: '+volumeWindows+(volumeMissing?'; '+volumeMissing+' unavailable':'')+'; 7d/30d unavailable from '+safeLine(market.source||'Market provider',40)+'; '+liquidityLabel+': '+reportNumber(market.liquidityUsd)+'; FDV USD: '+reportNumber(market.fdvUsd)+'; market cap USD: '+reportNumber(market.marketCapUsd)+'.',safeLine(market.source||'Market provider',40)+' USD price: '+(reportNumber(market.priceUsd)==='unavailable'?'unavailable':'$'+reportNumber(market.priceUsd))+'; pair price: '+reportNumber(market.priceNative)+' '+safeLine(market.quoteToken?.symbol||'quote units',24)+' per '+safeLine(market.baseToken?.symbol||'token',24)+'.');if(typeof market.url==='string'&&/^https:\/\//i.test(market.url))lines.push('Market source: '+market.url);else if(typeof market.pairAddress==='string'&&/^0x[0-9a-f]{40}$/i.test(market.pairAddress))lines.push('Market source: https://dexscreener.com/base/'+market.pairAddress.toLowerCase());}
 if(!result.market)lines.push('Current buy/sell availability is unknown: no matching market pool data was found, and no executable quote was checked.');else if(result.market.liquidityUsd!==null&&result.market.liquidityUsd!==undefined&&Number.isFinite(Number(result.market.liquidityUsd)))lines.push(safeLine(result.market.source||'Market provider',40)+' reports $'+reportNumber(result.market.liquidityUsd)+' pool liquidity. No executable quote was checked, so current buy/sell availability is unconfirmed.');else lines.push('A market pool is indexed, but current liquidity and an executable buy/sell quote are unavailable.');
 if(result.fees){const fee=result.fees,amounts=value=>value&&typeof value==='object'?['token0','token1'].filter(key=>value[key]!==null&&value[key]!==undefined).map(key=>safeLine(value[key],80)+' '+safeLine(fee[key+'Label']||key,40)).join(', ')||'unavailable':'unavailable';lines.push('Bankr fee record: reported share '+safeLine(fee.share??'unavailable',40)+'; claimable amounts '+amounts(fee.claimable)+'; claimed amounts '+amounts(fee.claimed)+'.');}
  if(result.fees?.lifetime?.status==='reported'){const fees=result.fees.lifetime;lines.push('Bankr-reported lifetime fee earnings (WETH; separate from claimable token balances): '+safeLine(fees.lifetimeEarnedWeth,80)+' across '+reportNumber(fees.earningDays)+' earning days.'+(fees.bestDay?' Best day: '+safeLine(fees.bestDay.date,10)+' at '+safeLine(fees.bestDay.weth,80)+' WETH.':''));}else if(result.fees?.lifetime)lines.push('Bankr lifetime fee earnings unavailable: '+safeLine(result.fees.lifetime.reason,220));
 const vesting=result.vesting;if(vesting?.status==='reported')lines.push('Bankr-reported creator vesting for '+safeLine(vesting.tokenSymbol,40)+': '+safeLine(vesting.totalAmount,80)+' total allocation'+(vesting.allocationPercentOfSupply?', about '+safeLine(vesting.allocationPercentOfSupply,20)+'% of reported total supply':'')+'; '+safeLine(vesting.lockedAmount,80)+' locked, '+safeLine(vesting.claimableAmount,80)+' claimable, '+safeLine(vesting.releasedAmount,80)+' released; '+reportNumber(vesting.unlockedPercent)+'% unlocked. Phase: '+safeLine(vesting.phase,24)+'; cliff ends '+safeLine(vesting.cliffEndsAt.slice(0,10),10)+'; schedule ends '+safeLine(vesting.vestingEndsAt.slice(0,10),10)+'. This covers only the reported creator allocation.','Bankr vesting source: '+vesting.url);else if(vesting?.status==='no-eligible-schedule')lines.push('Bankr reports no eligible vesting schedule. This does not prove the supply is unlocked.','Bankr vesting source: '+vesting.url);else if(vesting)lines.push('Bankr vesting check unavailable: '+safeLine(vesting.reason,220));
  const holders=result.holders;
 if(holders){lines.push('Holder snapshot: '+safeLine(holders.source||'Configured provider',60)+' checked '+safeLine(holders.checkedAt??'timestamp unavailable',80)+'; '+reportNumber(holders.holderCount)+' holders total; '+reportNumber(holders.sampleSize)+' returned in this page; snapshot block '+reportNumber(holders.blockNumber)+'.','Holder sample coverage: '+safeLine(holders.coverage,300)+'.');if(holders.sampleTop10SharePercent!==null)lines.push('Largest 10 in '+(holders.hasMore?'the returned sample':'the full returned list')+' hold '+reportNumber(holders.sampleTop10SharePercent)+'% of total supply.');for(const row of holders.largestBalancesInSample||[])lines.push('Holder '+safeLine(row.address,64)+': '+safeLine(row.balance??'balance unavailable',100)+' tokens; '+reportNumber(row.percentOfSupply)+'% of total supply.');for(const row of holders.holderActivity||[]){lines.push('Recent holder activity for '+safeLine(row.address,64)+': '+(row.status==='available'?reportNumber(row.buys)+' classified buys and '+reportNumber(row.sells)+' classified sells in '+reportNumber(row.transactionsChecked)+' recent wallet transactions, from '+safeLine(row.oldestTransactionAt??'time unavailable',80)+' through '+safeLine(row.latestTransactionAt??'time unavailable',80)+'.':safeLine(row.reason||'unavailable',240)));for(const swap of row.recentSwaps||[]){const tx=typeof swap.transactionHash==='string'&&/^0x[0-9a-f]{64}$/i.test(swap.transactionHash)?' https://basescan.org/tx/'+swap.transactionHash.toLowerCase():'';lines.push('Observed '+safeLine(swap.side,12)+' of '+safeLine((swap.tokenAmounts||[]).join(' + ')||'amount unavailable',100)+' at '+safeLine(swap.at??'time unavailable',80)+'.'+tx);}}lines.push('Holder activity coverage: '+safeLine(holders.activityCoverage||'Only up to three sampled holders were checked; this is not complete wallet history.',320)+'.');}
 else {const rawReason=String(coverage.holders||'provider coverage unavailable'),reason=rawReason.toLowerCase().includes('not configured')?'no holder-data source is configured':rawReason.toLowerCase().includes('goldrush')?'the configured holder-data source returned no snapshot':safeLine(rawReason,220);lines.push('Holder snapshot unavailable: '+reason+'.');}
 if(result.holders?.url)lines.push('Holder source: '+safeLine(result.holders.url,200)+'.');
 lines.push('Pairing receipt check: '+safeLine(result.verification?.status||'unavailable',30)+'.','Coverage: Bankr fee data '+(coverage.bankrFeeRecord==='found'?'found':'unavailable')+'; Coinbase registry '+(coverage.stockRegistry==='Coinbase registry address match'?'matched':'unavailable')+'; market data '+safeLine(coverage.marketPair||'unavailable',180)+'.','Holder balances are a point-in-time snapshot. '+(result.holders?.source==='GoldRush Token Holders API'?'GoldRush classifies recent swaps for up to three sampled addresses when no contract code is observed; coverage is limited to each address’s latest transaction page. A missing swap does not prove no earlier activity.':result.holders?.source==='Blockscout token holder API'?'Blockscout reports current balances only; it does not classify recent buys or sells.':'No holder snapshot was returned, so holder balances and recent activity are unavailable.')+' Holder addresses are not identified as people or labeled as team, exchange or pool wallets. Contract safety and sellability: not assessed. NAV is a reference value, not an executable price. Market fields may be unavailable. No safe-to-trade verdict is provided.');
 const handoff=result.tradeHandoff;
 if(handoff)lines.push('','## Agent trade handoff','Status: '+(handoff.status==='request_external_quote'?'Request a fresh quote from the calling agent’s execution provider.':'Review evidence before requesting a quote.'),'This is a quote handoff only; Dinn did not choose a side or amount, check an executable route, or prepare, sign, or send a transaction.',handoff.reasonCodes.length?'Evidence gaps: '+handoff.reasonCodes.join(', ')+'.':'A current quote and the calling agent’s own wallet policy are still required.');
 lines.push(...baseLockSummary(result.tokenLocks),...baseLockSummary(result.stockLocks));
 return lines.join('\n');
}
function baseStockDeliverable(result){
 const lines=['# Dinn Coinbase stock research','Token: '+safeLine(result.identity?.name,100)+' ('+safeLine(result.identity?.symbol,24)+')','Network: Base (chain 8453)','Checked at: '+safeLine(result.checkedAt,80),'Registry/onchain identity: '+safeLine(result.identity?.status,24)+' at '+safeLine(result.address,64)+'.','Coinbase reference NAV: '+(result.stock?.referenceNav===null?'unavailable':'$'+reportNumber(result.stock?.referenceNav))+'; updated '+safeLine(result.stock?.referenceNavUpdatedAt||'unavailable',80)+'.','First mint: '+safeLine(result.stock?.firstMintAt||'unavailable',80)+'; age '+(Number.isInteger(result.stock?.ageDaysSinceFirstMint)?result.stock.ageDaysSinceFirstMint+' days':'unavailable')+'.','Base B20 snapshot: block '+safeLine(result.contract?.blockNumber,24)+'; hash '+safeLine(result.contract?.blockHash,66)+'; supply '+safeLine(result.contract?.totalSupply,80)+'; decimals '+reportNumber(result.contract?.decimals)+'; multiplier '+safeLine(result.contract?.multiplier,80)+'.','Paused features: '+((result.contract?.pausedFeatures||[]).join(', ')||'none reported')+'. Transfer policy IDs: '+(result.contract?.transferPolicies||[]).filter(row=>row.scope.startsWith('TRANSFER_')).map(row=>row.scope+' '+reportNumber(row.id)).join('; ')+' . Wallet-specific authorization and current role holders were not checked.'];
 for(const pair of result.market?.pairs||[])lines.push('DEX Screener pair '+safeLine(pair.baseToken?.symbol,24)+'/'+safeLine(pair.quoteToken?.symbol,24)+' at '+safeLine(pair.pairAddress,64)+': liquidity USD '+reportNumber(pair.liquidityUsd)+'; 24h volume USD '+reportNumber(pair.volume24hUsd)+'; buys/sells '+(pair.transactions24h?reportNumber(pair.transactions24h.buys)+'/'+reportNumber(pair.transactions24h.sells):'unavailable')+'; stock-token price USD '+reportNumber(pair.tokenPriceUsd)+(pair.tokenIsBase?'':' (not reported for quote side)')+'; checked '+safeLine(result.market.checkedAt,80)+'. '+safeLine(pair.url,200));
 if(!(result.market?.pairs||[]).length)lines.push('DEX Screener exact-address market pairs: '+safeLine(result.market?.status||'unavailable',40)+'.');
 if(result.holders){lines.push('Holder snapshot ('+safeLine(result.holders.source||'provider',60)+'): '+reportNumber(result.holders.holderCount)+' holders; '+reportNumber(result.holders.sampleSize)+' returned; checked '+safeLine(result.holders.checkedAt||'timestamp unavailable',80)+'; block '+reportNumber(result.holders.blockNumber)+'. Largest 10 share '+reportNumber(result.holders.sampleTop10SharePercent)+'% in '+(result.holders.hasMore?'the returned sample':'the returned list')+'. Coverage: '+safeLine(result.holders.coverage,300)+'.');for(const row of (result.holders.largestBalancesInSample||[]).slice(0,10))lines.push('Holder '+safeLine(row.address,64)+': '+safeLine(row.balance||'unavailable',80)+' tokens; '+reportNumber(row.percentOfSupply)+'% of total supply.');for(const row of (result.holders.holderActivity||[]).slice(0,3)){const pair=row.marketPairMatch?'Address exactly matches the DEX Screener '+safeLine(row.marketPairMatch.dex||'reported',40)+' pair contract. ':'';lines.push('Recent sampled holder flow '+safeLine(row.address,64)+': '+pair+(row.status==='available'?reportNumber(row.buys)+' classified buys, '+reportNumber(row.sells)+' sells in '+reportNumber(row.transactionsChecked)+' latest transactions.':safeLine(row.reason||row.status,240)));}}
 else lines.push('Holder data unavailable: '+safeLine(result.coverage?.holders||'not requested',220)+'.');
 if(result.holders?.url)lines.push('Holder source: '+safeLine(result.holders.url,200)+'.');
 if(result.tradeHandoff?.url)lines.push('Bankr handoff: '+safeLine(result.tradeHandoff.url,200)+'. Bankr must provide its live quote and check location eligibility; no side or amount was selected and no transaction was prepared.');else lines.push('Bankr trade handoff: '+safeLine(result.tradeHandoff?.execution||'not available',220));
 lines.push('Limits: '+safeLine(result.coverage?.contractControls,300)+'. Market and holder sources are point-in-time provider reports. This is not an audit, eligibility decision or safe-to-trade verdict.');
 for(const source of result.sources||[])if(typeof source?.url==='string'&&/^https:\/\//i.test(source.url))lines.push('Source: '+safeLine(source.label,100)+' '+source.url);
 lines.push(...baseLockSummary(result.tokenLocks),...baseLockSummary(result.stockLocks));
 return lines.join('\n');
}
const eventWord=count=>Number(count)===1?'event':'events';
function supplyPercent(rawAmount,rawSupply){try{if(!/^\d{1,78}$/.test(String(rawAmount))||!/^\d{1,78}$/.test(String(rawSupply))||BigInt(rawSupply)<=0n)return null;const scaled=BigInt(rawAmount)*1000000n/BigInt(rawSupply);return `${scaled/10000n}.${String(scaled%10000n).padStart(4,'0')}`;}catch{return null;}}
function tokenSupplyPercent(amount,decimals,rawSupply){try{if(!Number.isInteger(decimals)||decimals<0||decimals>36)return null;return supplyPercent(parseUnits(String(amount),decimals).toString(),rawSupply);}catch{return null;}}
function decimalParts(value){if(typeof value!=='string'||value.length>120)return null;const match=/^(\d{1,80})(?:\.(\d{1,36}))?$/.exec(value);if(!match)return null;return {coefficient:BigInt(match[1]+(match[2]||'')),scale:(match[2]||'').length};}
export function usdProduct(amount,unitPrice,places=2){try{if(!Number.isInteger(places)||places<0||places>8)return null;const a=decimalParts(amount),p=decimalParts(unitPrice);if(!a||!p)return null;const scale=10n**BigInt(a.scale+p.scale),factor=10n**BigInt(places),rounded=(a.coefficient*p.coefficient*factor+scale/2n)/scale;return `${rounded/factor}.${String(rounded%factor).padStart(places,'0')}`;}catch{return null;}}
function isoTimestamp(value){const ms=typeof value==='number'?value:Date.parse(String(value));return Number.isFinite(ms)?new Date(ms).toISOString():null;}
function inspectionDeliverable(report,ponsState,ponsStateUnavailable=false){
 const lines=['# Dinn token research','Token: '+report.address,'Network: '+report.network+' (chain '+report.chainId+')','Checked block: '+report.blockNumber+' ('+report.blockHash+')','Checked at: '+report.checkedAt,'Token name: '+(report.tokenName?safeLine(report.tokenName,100):'Unavailable'),'Token symbol: '+(report.symbol?safeLine(report.symbol,40):'Unavailable')];
 if(report.ponsHistory){
  const history=report.ponsHistory,curve=history.curve||{};
  lines.push('','## Launch and trading activity','Launch date: '+safeLine(history.launchedAt||'Unavailable',80)+'; age at checked block: '+safeLine(history.age||'Unavailable',40)+'.');
  if(history.launchBlock)lines.push('Launch block: '+safeLine(history.launchBlock,40)+'.');
  const curveCoverage=curve.status==='complete-to-checked-block'?'Complete from the verified launch through the checked block.':String(curve.status||'').startsWith('partial')?'Partial; the figures below are observed lower bounds.':safeLine(curve.status||history.status,120);
  lines.push('Curve history coverage: '+curveCoverage);
  if(history.launchTransactionHash&&/^0x[0-9a-f]{64}$/i.test(history.launchTransactionHash))lines.push('Verified Pons launch transaction: https://robinhoodchain.blockscout.com/tx/'+history.launchTransactionHash+'.');
  if(history.holderEventSummary){const summary=history.holderEventSummary;lines.push('Pons curve activity among current top-holder candidates (all-time from launch through this snapshot): '+safeLine(summary.addressesWithBuys,10)+' of '+safeLine(summary.indexedAddresses,10)+' indexed addresses had curve buys ('+safeLine(summary.buyEvents,10)+' '+eventWord(summary.buyEvents)+'); '+safeLine(summary.addressesWithSells,10)+' had curve sells ('+safeLine(summary.sellEvents,10)+' '+eventWord(summary.sellEvents)+'). '+safeLine(summary.scope,300));}
  if(curve.totalVolume!==null&&curve.totalVolume!==undefined){
   lines.push('Pons curve trades: '+safeLine(curve.tradeCount,30)+' ('+safeLine(curve.buyCount,30)+' buys, '+safeLine(curve.sellCount,30)+' sells). Quote volume: '+safeLine(curve.totalVolume,80)+' '+safeLine(curve.pairSymbol,30)+' ('+safeLine(curve.buyVolume,80)+' in buys; '+safeLine(curve.sellVolume,80)+' in sells).','Curve fees recorded: '+safeLine(curve.baseAndSnipeFees,80)+' '+safeLine(curve.pairSymbol,30)+' base plus opening snipe fees, and '+safeLine(curve.creatorTax,80)+' creator tax; '+safeLine(curve.totalFees,80)+' total. These are event totals, not creator earnings or claimable fees.');
  }else if(curve.scannedVolume!==null&&curve.scannedVolume!==undefined){
   lines.push('Observed Pons curve activity (partial lower bound): '+safeLine(curve.scannedTradeCount,30)+' scanned trades ('+safeLine(curve.scannedBuyCount,30)+' buys, '+safeLine(curve.scannedSellCount,30)+' sells); '+safeLine(curve.scannedBuyVolume,80)+' '+safeLine(curve.pairSymbol,30)+' buy volume and '+safeLine(curve.scannedSellVolume,80)+' '+safeLine(curve.pairSymbol,30)+' sell volume. Scanned fees: '+safeLine(curve.scannedFees,80)+' '+safeLine(curve.pairSymbol,30)+' (not all-time totals). '+safeLine(history.reason||'Some indexed event history was outside the bounded scan.',400));
  }else lines.push('Curve trade volume and generated fees: unavailable. '+safeLine(history.reason||'The full event history could not be checked.',400));
  if(Array.isArray(history.holderActivity)&&history.holderActivity.length){
   lines.push('Current top-holder Pons activity (cumulative from launch through the checked block; separate from the recent 30-day wallet-history sample; addresses are not identities):');
   for(const row of history.holderActivity.slice(0,10))lines.push('- '+safeLine(row.address,64)+': '+safeLine(row.buys,20)+' buys for '+safeLine(row.buyTokens,70)+' tokens ('+safeLine(row.buyQuote,70)+' '+safeLine(curve.pairSymbol,24)+'); '+safeLine(row.sells,20)+' sells of '+safeLine(row.sellTokens,70)+' tokens ('+safeLine(row.sellQuote,70)+' '+safeLine(curve.pairSymbol,24)+').'+(row.lastTradeHash?' Latest curve event: https://robinhoodchain.blockscout.com/tx/'+row.lastTradeHash+'.':''));
  }
  if(history.coverage)lines.push('Trade-history coverage: '+safeLine(history.coverage,500));
  for(const source of (Array.isArray(history.sourceUrls)?history.sourceUrls:[]))if(typeof source==='string'&&/^https:\/\//i.test(source))lines.push('Pons history source: '+source.slice(0,500));
 }
 lines.push(...titanLines(report.titanLocks),...hoodLines(report.hoodLocks),...uncxLines(report.uncxVesting));
 if(report.pinkLock){
  const locks=report.pinkLock;
  lines.push('','## PinkLock token locks and vesting','Coverage: '+safeLine(locks.scope,400));
  if(locks.reason)lines.push(safeLine(locks.reason,500));
  for(const source of (Array.isArray(locks.sourceUrls)?locks.sourceUrls:[]))if(source&&typeof source.url==='string'&&/^https:\/\//i.test(source.url))lines.push('PinkLock source ('+safeLine(source.label,80)+'): '+source.url.slice(0,500));
  for(const lock of (Array.isArray(locks.records)?locks.records.slice(0,30):[])){
   const lockShare=tokenSupplyPercent(lock.remaining,report.decimals,report.rawSupply);
   lines.push('- '+safeLine(lock.kind,40)+' lock '+safeLine(lock.id,30)+' via '+safeLine(lock.adapter,50)+': '+safeLine(lock.remaining,80)+' '+safeLine(report.symbol||'tokens')+' remains'+(lockShare!==null?' ('+lockShare+'% of reported total supply)':'')+'; '+safeLine(lock.unlocked,80)+' unlocked; '+safeLine(lock.currentlyWithdrawable,80)+' currently withdrawable. Owner: '+safeLine(lock.owner,64)+'.');
   lines.push('  Schedule: created '+safeLine(lock.lockDate||'unknown',40)+'; TGE/unlock '+safeLine(lock.tgeOrUnlockDate||'unknown',40)+' ('+safeLine(lock.tgeReleasePercent??'unknown',20)+'%); cycle '+safeLine(lock.cycleDays??'unknown',24)+' days, '+safeLine(lock.cycleReleasePercent??'unknown',20)+'% per cycle. '+safeLine(lock.description,180));
   if(typeof lock.pinkSaleUrl==='string'&&/^https:\/\/www\.pinksale\.finance\/pinklock\/robinhood\/record\/\d+$/.test(lock.pinkSaleUrl))lines.push('  PinkSale lock record: '+lock.pinkSaleUrl);
   if(typeof lock.sourceUrl==='string'&&/^https:\/\/robinhoodchain\.blockscout\.com\/address\/0x[0-9a-f]{40}\?tab=read_contract$/i.test(lock.sourceUrl))lines.push('  Lock contract source: '+lock.sourceUrl);
  }
 }
 lines.push('','## Contract and launch checks');
 for(const check of report.checks.slice(0,40))lines.push('- **'+safeLine(check.label,100)+'** ('+safeLine(check.status,40)+'): '+safeLine(check.detail));
 lines.push('','## Market and fee context');
 if(ponsState){
  lines.push('Pons snapshot: block '+safeLine(ponsState.blockNumber,40)+'; checked '+safeLine(ponsState.checkedAt,80)+'.','Fee query address: '+safeLine(ponsState.viewerAccount,64)+(same(ponsState.viewerAccount,ponsState.feeRecipient)?' (current creator fee recipient)':' (caller-specified public query address)')+'; this is not proof of ownership.',...tokenStateMessage(ponsState).split('\n\n').map(safeText));
  if(ponsState.curve){
   const curve=ponsState.curve,curveBalance=report.protocol?.knownBalances?.curve,curveShare=supplyPercent(curveBalance,report.rawSupply),decimals=report.decimals;
   if(typeof curveBalance==='string'&&/^\d{1,78}$/.test(curveBalance)&&Number.isInteger(decimals)&&decimals>=0&&decimals<=36)lines.push('Curve contract inventory: '+formatUnits(BigInt(curveBalance),decimals)+' '+safeLine(report.symbol||'tokens',40)+(curveShare!==null?' ('+curveShare+'% of reported total supply)':'')+'. This is the curve contract balance, not graduation progress or a wallet-specific sell amount.');
   if(curve.sellable!==undefined)lines.push('Pons sellableTokens() at this block: '+safeLine(curve.sellable,80)+' '+safeLine(report.symbol||'tokens',40)+'. This contract-reported amount is not a wallet-specific execution quote or guaranteed fill.');
   if(curve.progressPercent!==undefined)lines.push('Graduation progress is quote-reserve progress (real quote reserve divided by the graduation target); it is not token-supply percentage or market cap.');
   const pairSymbol=ponsState.pair?.symbol||report.protocol?.pairSymbol||'pair asset',pairUsd=ponsState.quoteUsd;
   if(pairUsd?.available&&curve.priceQuote&&curve.fdvQuote){const spotUsd=usdProduct(curve.priceQuote,pairUsd.unitPriceUsd,8),fdvUsd=usdProduct(curve.fdvQuote,pairUsd.unitPriceUsd,2),asOf=isoTimestamp(pairUsd.asOf);if(spotUsd!==null||fdvUsd!==null)lines.push('Curve pricing estimate: '+safeLine(curve.priceQuote,60)+' '+safeLine(pairSymbol,30)+' per token'+(spotUsd!==null?' (about $'+spotUsd+' per token)':'')+'; curve-implied FDV '+safeLine(curve.fdvQuote,80)+' '+safeLine(pairSymbol,30)+(fdvUsd!==null?' (about $'+fdvUsd+')':'')+'. USD conversion uses Robinhood\'s '+safeLine(pairUsd.basis||'pair-asset reference',100)+(asOf?' as of '+asOf:'')+'. This is not circulating market cap or an executable trade quote.');}
   if(pairUsd?.sourceUrl&&/^https:\/\//i.test(pairUsd.sourceUrl))lines.push('Pair-asset USD reference source: '+pairUsd.sourceUrl.slice(0,500));
  }
  const market=ponsState.market;
  if(market?.source==='GeckoTerminal reported')lines.push('GeckoTerminal reference: price $'+safeLine(market.priceUsd,50)+'; circulating market cap '+(market.marketCapUsd?'$'+safeLine(market.marketCapUsd,50):'unavailable')+'; FDV '+(market.fdvUsd?'$'+safeLine(market.fdvUsd,50):'unavailable')+'; checked '+safeLine(market.checkedAt,80)+'. Provider-reported reference values, not executable quotes.','Market reference source: https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/'+report.address);
  else lines.push('GeckoTerminal market reference: unavailable; price, circulating market cap and FDV were not verified.');
 }else lines.push(ponsStateUnavailable?'The token matched Pons v2, but the market and fee snapshot could not be completed.':'This inspection did not establish a Pons v2 registration, so Pons market and fee data is unavailable. Reference token market data was not independently sourced by this inspection.');
 if(report.holders){
  const holders=report.holders;
  lines.push('','## Holder snapshot','Status: '+safeLine(holders.status,40),'Scope: '+safeLine(holders.scope,500));
  if(holders.ranking)lines.push('Ranking: '+safeLine(holders.ranking,700));
  if(holders.concentrationScope)lines.push('Concentration: '+safeLine(holders.concentrationScope,700));
  if(holders.topSharePercent!==undefined&&holders.topSharePercent!==null)lines.push('Top candidates share of reported supply: '+safeLine(holders.topSharePercent,60)+'%.');
  if(Array.isArray(holders.rows)&&holders.rows.length){
   for(const [index,row] of holders.rows.slice(0,10).entries()){
    const balance=row.balance===null?'unavailable':safeLine(row.balance,80),share=row.sharePercent===null?'unavailable':safeLine(row.sharePercent,40)+'%';
    lines.push((index+1)+'. '+safeLine(row.address,64)+' — '+safeLine(row.kind,80)+'; '+balance+' tokens; '+share+' of reported supply.');
    if(row.portfolioStatus)lines.push('   Other-token lookup: '+safeLine(row.portfolioStatus,400));
    for(const token of (Array.isArray(row.otherTokens)?row.otherTokens.slice(0,3):[]))lines.push('   - '+safeLine(token.symbol||token.address,64)+' ('+safeLine(token.address,64)+'): '+safeLine(token.balance,80)+' tokens; estimated value $'+safeLine(token.estimatedUsd,80)+'.');
   }
  }else lines.push('No holder rows were available. '+safeLine(holders.reason||'The holder index did not return a usable snapshot.',500));
  if(holders.reason)lines.push('Holder-data limitation: '+safeLine(holders.reason,500));
  if(holders.behavior){
   const behavior=holders.behavior;
   lines.push('','## Holder wallet activity','Status: '+safeLine(behavior.status,40),'Scope: '+safeLine(behavior.scope,700),'Classification: '+safeLine(behavior.classification,700));
   if(behavior.windowStart&&behavior.windowEnd)lines.push('Window: '+safeLine(behavior.windowStart,80)+' to '+safeLine(behavior.windowEnd,80)+' ('+safeLine(behavior.windowDays,10)+' days).');
   if(behavior.summary)lines.push('Coverage: '+safeLine(behavior.summary.walletsAnalyzed,20)+' sampled addresses; '+safeLine(behavior.summary.completeWalletHistories,20)+' complete 30-day histories; '+safeLine(behavior.summary.swapLikeCallsEnriched,20)+' swap-like calls enriched.');
   if(behavior.summary?.holderSignal)lines.push('Wallet transaction-history triage: '+safeLine(behavior.summary.holderSignal,160)+'. Suggested next step: '+safeLine(behavior.summary.nextStep,50)+'. This is separate from Pons curve-event counts and is not a buy recommendation.');
   if(behavior.summary?.targetTokenBuyCandidates!==undefined)lines.push('Target-token swap candidates: '+safeLine(behavior.summary.targetTokenBuyCandidates,20)+' buy / '+safeLine(behavior.summary.targetTokenSellCandidates,20)+' sell; '+safeLine(behavior.summary.targetTokenBuyAmount,80)+' tokens in candidate buys / '+safeLine(behavior.summary.targetTokenSellAmount,80)+' tokens in candidate sells.');
   if(behavior.excludedContractCandidates)lines.push('Excluded contract or unknown-code candidates: '+safeLine(behavior.excludedContractCandidates,20)+'. Their activity is not attributed to an individual wallet.');
   for(const row of (Array.isArray(behavior.rows)?behavior.rows.slice(0,5):[])){
    lines.push('- '+safeLine(row.address,64)+': '+safeLine(row.status,40)+' history; '+safeLine(row.transactionsSeen,20)+' recent outgoing transactions scanned.'+(row.sourceUrl?' History source: '+safeLine(row.sourceUrl,200)+'.':'')+(row.reason?' '+safeLine(row.reason,300):''));
    for(const trade of (Array.isArray(row.recentSwaps)?row.recentSwaps.slice(0,3):[])){
     lines.push('  - '+safeLine(trade.classification,100)+'; decoded method '+safeLine(trade.method,80)+'; '+safeLine(trade.timestamp,80)+'; '+safeLine(trade.transactionUrl,200)+'.');
     for(const flow of (Array.isArray(trade.tokenFlows)?trade.tokenFlows.slice(0,8):[]))lines.push('    - '+safeLine(flow.direction,12)+' '+safeLine(flow.amount,80)+' '+safeLine(flow.symbol||flow.tokenAddress,64)+' ('+safeLine(flow.tokenAddress,64)+').');
     for(const flow of (Array.isArray(trade.nativeFlows)?trade.nativeFlows.slice(0,4):[]))lines.push('    - '+safeLine(flow.direction,12)+' '+safeLine(flow.amount,80)+' '+safeLine(flow.symbol||'native asset',24)+' (native ETH; transaction transfer data).');
    }
   }
   if(!Array.isArray(behavior.rows)||!behavior.rows.length)lines.push(safeLine(behavior.reason||'No eligible wallet histories were available.',500));
   if(behavior.reason)lines.push('History limitation: '+safeLine(behavior.reason,500));
  }
 }
 if(Array.isArray(report.sources)&&report.sources.length){
  lines.push('','## Sources');
  for(const source of report.sources.slice(0,12))if(typeof source?.url==='string'&&/^https:\/\//i.test(source.url))lines.push('- '+safeLine(source.label,100)+': '+source.url.slice(0,500));
 }
 lines.push('','## Limits','This is a dated, read-only snapshot. The top-holder list is an indexer sample, not a complete census, and an address is not a person. Pons holder buy/sell totals come from curve events; they stop at graduation and do not include later Uniswap v4 pool trades. Other wallet history is a bounded 30-day sample and may miss router activity. PinkLock checks cover four listed shared Robinhood adapters plus verified PinkLock02 contracts among indexed top-holder candidates; other locker versions or unindexed contracts may be missed, and no matching record does not prove that supply is unlocked. Current market data may be unavailable. Contract checks are not an audit. No wallet-specific trade simulation, guaranteed liquidity, profitability, conviction, community quality, or safe-to-trade verdict is provided. Missing data remains unknown.');
 return lines.join('\n');
}
export async function agentAccessRequest(request,dependencies={}){
 const env=dependencies.env||process.env;
 const missing=validateAgentRequest(request),base={schemaVersion:'5',requestId:request.requestId||randomUUID(),service:request.service,broadcast:false,charged:false,ownershipVerified:false};
 if(missing.length)return {...base,status:'needs_input',missingFields:missing,next:{type:'collect_fields',message:'Supply the missing fields explicitly. No wallet or financial choices were inferred.'}};
 const {focus,...i}=request.input;let result,deliverable;
 if(request.service==='base.stock-paired.discover'){result=await (dependencies.discoverStockPairs||discoverStockPairs)(i.metric,{env});deliverable=discoveryMessage(result);}
 else if(['pons.stock.research','pons.stock-paired.research'].includes(request.service)){
  const paired=request.service==='pons.stock-paired.research';
  const inspect=address=>agentAccessRequest({service:'token.research',input:{address}},dependencies);
  const launch=paired?await inspect(i.address):null;
  const pair=launch?.result?.ponsState?.pair;
  if(paired&&!pair)throw Error('A Pons launch and its trading pair could not be verified at the checked block.');
  const stock=await robinhoodStock(paired?pair.address:i.query,dependencies.fetchImpl);
  const stockReport=await inspect(stock.address);
  if(stockReport.result.symbol!==stock.symbol||stockReport.result.decimals!==stock.decimals)throw Error('Robinhood registry and onchain stock details could not be matched.');
  const reference=await (dependencies.stockReference||purchaseUsdReference)({pairToken:stock.address},{fetcher:dependencies.fetchImpl});
  const primary=launch||stockReport;
  result={...primary.result,equityContext:await equityContext(stock.symbol,{fetchImpl:dependencies.fetchImpl,env}),classification:paired?'verified-pons-stock-pair':'verified-robinhood-stock',stock,reference,...(paired?{stockInspection:stockReport.result}:{})};
  const price=reference.available?'Robinhood reference price $'+safeLine(reference.unitPriceUsd)+' at '+new Date(reference.asOf).toISOString()+'.':'A current Robinhood reference price is unavailable.';
  deliverable=[paired?'# Pons stock-paired launch':'# Robinhood stock token',safeLine(stock.name)+' ('+safeLine(stock.symbol)+') ? '+stock.address,price,'Source: '+stock.source,...(paired?['## Launch token',launch.deliverableMarkdown,'## Pairing stock token']:[]),stockReport.deliverableMarkdown].join('\n\n');
 }else if(request.service==='token.research'){
  const env=dependencies.env||process.env;
  const inspection=await (dependencies.inspect||inspectCachedToken)(i.address,{chainId:4663,rpc:serverRpcUrl(4663,env),fetchImpl:dependencies.fetchImpl||fetch,fresh:true});
  if(!inspection||!same(inspection.address,i.address)||inspection.chainId!==4663||typeof inspection.blockNumber!=='string'||!/^\d+$/.test(inspection.blockNumber)||typeof inspection.blockHash!=='string'||!/^0x[0-9a-f]{64}$/i.test(inspection.blockHash)||!Number.isFinite(Date.parse(inspection.checkedAt))||!Array.isArray(inspection.checks))throw Error('Inspection evidence does not match the requested token or checked block.');
  let marketAndFees=null,marketAndFeesUnavailable=false;
  if(inspection.protocol?.name==='Pons v2'){
   try{
    const stateInput={address:i.address,...(i.account?{account:i.account}:{})};
    marketAndFees=await (dependencies.tokenState||ponsTokenState)(stateInput,{blockNumber:BigInt(inspection.blockNumber)});
    if(!same(marketAndFees.address,i.address)||marketAndFees.chainId!==4663||marketAndFees.blockNumber!==inspection.blockNumber||!Number.isFinite(Date.parse(marketAndFees.checkedAt))||!same(marketAndFees.viewerAccount,i.account||marketAndFees.feeRecipient))throw Error('Mismatched Pons snapshot.');
   }catch{marketAndFees=null;marketAndFeesUnavailable=true;}
  }
  result={...inspection,ponsState:marketAndFees,ponsStateUnavailable:marketAndFeesUnavailable};
  deliverable=inspectionDeliverable(inspection,marketAndFees,marketAndFeesUnavailable);
 }else if(request.service==='base.stock-paired.research'){
  result=await (dependencies.baseStockResearch||researchBaseStockPairedToken)(i,{fetchImpl:dependencies.fetchImpl||fetch,env:dependencies.env||process.env,holderSnapshotEnabled:dependencies.paidMarketplaceHire===true||dependencies.paidResearch===true});
  if(!result||!same(result.address,i.address)||result.chainId!==8453||!Number.isFinite(Date.parse(result.checkedAt))||!['verified-bankr-stock-paired-token','insufficient-evidence'].includes(result.classification))throw Error('Base research evidence does not match the requested token, network or checked time.');
  if(result.classification==='verified-bankr-stock-paired-token'&&(!same(result.stock?.address,result.launch?.pairedStock?.address)||result.verification?.status!=='verified'||typeof result.launch?.poolId!=='string'||!/^0x[0-9a-f]{64}$/i.test(result.launch.poolId)))throw Error('Verified Base stock-pair evidence is internally inconsistent.');
  result={...result,tradeHandoff:baseQuoteHandoff(result)};
  deliverable=baseStockResearchDeliverable(result);
 }else if(request.service==='base.stock.research'){
  result=await (dependencies.baseStockAssetResearch||researchBaseStock)({query:i.query},{fetchImpl:dependencies.fetchImpl||fetch,env,holderSnapshotEnabled:dependencies.paidMarketplaceHire===true||dependencies.paidResearch===true});
  if(!result||result.chainId!==8453||!Number.isFinite(Date.parse(result.checkedAt))||!/^0x[0-9a-f]{40}$/i.test(result.address||'')||!['matched','mismatch'].includes(result.identity?.status)||result.contract?.address?.toLowerCase()!==result.address.toLowerCase()||!/^\d+$/.test(result.contract?.blockNumber||'')||!/^0x[0-9a-f]{64}$/i.test(result.contract?.blockHash||''))throw Error('Coinbase stock evidence does not match the requested Base token or checked block.');
  if(/^0x[0-9a-f]{40}$/i.test(i.query)&&i.query.toLowerCase()!==result.address.toLowerCase())throw Error('Coinbase stock result does not match the requested token address.');
  deliverable=baseStockDeliverable(result);
  }else if(request.service==='token.inspect'){
   const env=dependencies.env||process.env;
   result=await (dependencies.inspect||inspectCachedToken)(i.address,{chainId:i.chainId,rpc:serverRpcUrl(i.chainId,env),fetchImpl:dependencies.fetchImpl||fetch,fresh:true});
   if(!result||!same(result.address,i.address)||result.chainId!==i.chainId||typeof result.blockNumber!=='string'||!/^\d+$/.test(result.blockNumber)||typeof result.blockHash!=='string'||!/^0x[0-9a-f]{64}$/i.test(result.blockHash)||!Number.isFinite(Date.parse(result.checkedAt))||!Array.isArray(result.checks))throw Error('Inspection evidence does not match the requested token or checked block.');
  const inspection=result;
  let marketAndFees=null,marketAndFeesUnavailable=false;
  if(result.protocol?.name==='Pons v2'){
   try{
    marketAndFees=await (dependencies.tokenState||ponsTokenState)({address:i.address},{blockNumber:BigInt(result.blockNumber)});
    if(!same(marketAndFees.address,i.address)||marketAndFees.chainId!==4663||marketAndFees.blockNumber!==result.blockNumber||!Number.isFinite(Date.parse(marketAndFees.checkedAt)))throw Error('Mismatched Pons snapshot.');
   }catch{marketAndFees=null;marketAndFeesUnavailable=true;}
  }
  result={...inspection,ponsState:marketAndFees,ponsStateUnavailable:marketAndFeesUnavailable};
  deliverable=inspectionDeliverable(inspection,marketAndFees,marketAndFeesUnavailable);
  }else if(request.service==='wallet.balances')result=await (dependencies.balances||robinhoodBalances)(i,{env});
 else if(request.service==='launch.options')result=await (dependencies.options||ponsReadiness)(i,{env});
 else {
  const quote=await (dependencies.quote||robinhoodRouteQuote)({...i,kind:request.service==='swap.quote'?'swap':'bridge'},{env});
  const stockToken=/^0x[0-9a-f]{40}$/i.test(quote.baseStockPair?.tokenAddress||'')?quote.baseStockPair.tokenAddress.toLowerCase():null;
  result={kind:quote.kind,chainId:quote.chainId,destinationChainId:quote.destinationChainId,account:quote.account,amount:quote.amount,asset:{address:quote.asset.address,symbol:quote.asset.symbol,decimals:quote.asset.decimals},outputAsset:{address:quote.outputAsset.address,symbol:quote.outputAsset.symbol,decimals:quote.outputAsset.decimals},expectedAmount:quote.expectedAmount,minimumAmount:quote.minimumAmount,fee:quote.fee,impactPercent:quote.impactPercent,provider:quote.provider,expiresAt:quote.quoteExpiresAt||quote.expiresAt,...(quote.quoteBlockNumber?{quoteBlockNumber:quote.quoteBlockNumber}:{}),...(stockToken?{baseStockPair:{tokenAddress:stockToken,stockAddress:quote.baseStockPair.stockAddress,bankrPoolId:quote.baseStockPair.bankrPoolId,checkedAt:quote.baseStockPair.checkedAt,classification:quote.baseStockPair.classification},bankrTradeUrl:'https://bankr.bot/trade/'+stockToken,executionNote:'Reference quote only. Bankr must provide its executable quote and verify location eligibility.'}:{})};
 }
 if(result.equityContext)deliverable=[deliverable,'## Underlying U.S. stock',equityMessage(result.equityContext)].join('\n\n');
 deliverable=leadWithLockFinding(result,focus,deliverable);
 const evidence={service:request.service,input:request.input,result,...(deliverable?{deliverableMarkdown:deliverable}:{})};
 const content=JSON.stringify(evidence),sha256=createHash('sha256').update(content).digest('hex');
 return {...base,status:'completed',result,...(deliverable?{deliverableMarkdown:deliverable}:{}),evidence:{format:'application/json',content,sha256,meaning:'Content integrity only; not a signature or proof of payment.'},next:{type:'stop',message:result.baseStockPair?'Reference quote only. Dinn does not execute this stock-paired trade; Bankr must provide its executable quote and location check.':result.tradeHandoff?.url?'Research only. Bankr must provide a fresh quote and check location eligibility; Dinn did not choose or execute a trade.':request.service.endsWith('.quote')?'Quote only. No transfer was prepared or sent; obtain a fresh wallet-approved review to execute.':'Read-only result. No wallet authority or marketplace payment was granted.'}};
}
