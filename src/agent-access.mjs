import {createHash,randomUUID} from 'node:crypto';
import {ponsTokenState,tokenStateMessage} from './pons-token-state.mjs';
import {ponsReadiness} from './pons.mjs';
import {robinhoodBalances} from './robinhood-wallet.mjs';
import {robinhoodRouteQuote} from './robinhood-routes.mjs';
import {address,same} from './robinhood-wallet-call.mjs';
import {inspectCachedToken} from './inspection-cache.mjs';
import {PONS_RPC} from './pons.mjs';
const account={type:'string',pattern:'^0x[0-9a-fA-F]{40}$'};
export const agentServices={
 'token.research':{description:'Read-only Robinhood Chain token research for trading agents: Pons launch age, phase and curve metrics; curve volume and generated fee totals where event coverage is complete; indexed holders and their Pons buy/sell history; current other-token balances; contract controls; PinkLock token and vesting records from the listed adapters plus verified per-lock PinkLock02 contracts among indexed top holders; and reference market data. Findings include their source, block and coverage limits. No trade execution or safe-to-trade verdict.',required:['address'],properties:{address:account,account}},
 'token.inspect':{description:'Compatibility alias for the expanded read-only Robinhood Chain token.research report.',required:['address','chainId'],properties:{address:account,chainId:{type:'integer',enum:[4663]}}},
 'wallet.balances':{description:'Public onchain balances, with unavailable data preserved. This does not authenticate wallet ownership.',required:['account','chainId'],properties:{account,chainId:{type:'integer',enum:[4663,8453,42161]}}},
 'launch.options':{description:'Current enabled Pons configurations and optional account launch permission.',required:[],properties:{account}},
 'swap.quote':{description:'Read-only same-chain route quote; no deposit or signing. Base/Arbitrum support ETH, USDC and USDT only.',required:['account','chainId','asset','outputAsset','amount'],properties:{account,chainId:{type:'integer',enum:[4663,8453,42161]},asset:account,outputAsset:account,amount:{type:'string',pattern:'^[0-9]+(\\.[0-9]+)?$'}}},
 'bridge.quote':{description:'Read-only Base/Arbitrum to Robinhood route quote; no deposit or signing.',required:['account','chainId','asset','outputAsset','amount'],properties:{account,chainId:{type:'integer',enum:[8453,42161]},asset:account,outputAsset:account,amount:{type:'string',pattern:'^[0-9]+(\\.[0-9]+)?$'}}}
};
export function agentAccessManifest(){return {name:'Dinn',version:'5',services:['plan','pons.brief',...Object.keys(agentServices)],discovery:{instructions:'/agent-guide.md',schema:'/api/agent/schema',tools:'/api/tools'},transport:{type:'http-json',endpoint:'/api/agent/request'},broadcastEnabled:false,canSign:false,acceptsPrivateKeys:false,payment:{mode:'free-public-preview',charged:false},marketplace:{provider:'NEAR Agent Market',status:'live',listingUrl:'https://market.near.ai/a/dinn',pricePerHireUsd:'0.10'},notes:['Public account input is a query target, not proof of ownership.','Research is a dated chain snapshot, not a security audit.','Marketplace payment never grants wallet authority.']};}
export function agentAccessSchema(){return {type:'object',required:['service','input'],additionalProperties:false,properties:{service:{enum:['plan','pons.brief',...Object.keys(agentServices)]},input:{type:'object'},requestId:{type:'string',pattern:'^[A-Za-z0-9._-]{1,100}$'}},serviceInputs:Object.fromEntries(Object.entries(agentServices).map(([k,v])=>[k,{type:'object',additionalProperties:false,...v}]))};}
function validate(request){
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
function inspectionDeliverable(report,ponsState,ponsStateUnavailable=false){
 const lines=['# Dinn token research','Token: '+report.address,'Network: '+report.network+' (chain '+report.chainId+')','Checked block: '+report.blockNumber+' ('+report.blockHash+')','Checked at: '+report.checkedAt,'Token name: '+(report.tokenName?safeLine(report.tokenName,100):'Unavailable'),'Token symbol: '+(report.symbol?safeLine(report.symbol,40):'Unavailable')];
 if(report.ponsHistory){
  const history=report.ponsHistory,curve=history.curve||{};
  lines.push('','## Launch and trading activity','Launch date: '+safeLine(history.launchedAt||'Unavailable',80)+'; age at checked block: '+safeLine(history.age||'Unavailable',40)+'.');
  if(history.launchBlock)lines.push('Launch block: '+safeLine(history.launchBlock,40)+'.');
  const curveCoverage=curve.status==='complete-to-checked-block'?'Complete from the verified launch through the checked block.':String(curve.status||'').startsWith('partial')?'Partial; the figures below are observed lower bounds.':safeLine(curve.status||history.status,120);
  lines.push('Curve history coverage: '+curveCoverage);
  if(history.launchTransactionHash&&/^0x[0-9a-f]{64}$/i.test(history.launchTransactionHash))lines.push('Verified Pons launch transaction: https://robinhoodchain.blockscout.com/tx/'+history.launchTransactionHash+'.');
  if(history.holderEventSummary){const summary=history.holderEventSummary;lines.push('Current top-holder Pons event summary: '+safeLine(summary.addressesWithBuys,10)+' of '+safeLine(summary.indexedAddresses,10)+' indexed addresses had curve buys ('+safeLine(summary.buyEvents,10)+' events); '+safeLine(summary.addressesWithSells,10)+' had curve sells ('+safeLine(summary.sellEvents,10)+' events). '+safeLine(summary.scope,240));}
  if(curve.totalVolume!==null&&curve.totalVolume!==undefined){
   lines.push('Pons curve trades: '+safeLine(curve.tradeCount,30)+' ('+safeLine(curve.buyCount,30)+' buys, '+safeLine(curve.sellCount,30)+' sells). Quote volume: '+safeLine(curve.totalVolume,80)+' '+safeLine(curve.pairSymbol,30)+' ('+safeLine(curve.buyVolume,80)+' in buys; '+safeLine(curve.sellVolume,80)+' in sells).','Curve fees recorded: '+safeLine(curve.baseAndSnipeFees,80)+' '+safeLine(curve.pairSymbol,30)+' base plus opening snipe fees, and '+safeLine(curve.creatorTax,80)+' creator tax; '+safeLine(curve.totalFees,80)+' total. These are event totals, not creator earnings or claimable fees.');
  }else if(curve.scannedVolume!==null&&curve.scannedVolume!==undefined){
   lines.push('Observed Pons curve activity (partial lower bound): '+safeLine(curve.scannedTradeCount,30)+' scanned trades ('+safeLine(curve.scannedBuyCount,30)+' buys, '+safeLine(curve.scannedSellCount,30)+' sells); '+safeLine(curve.scannedBuyVolume,80)+' '+safeLine(curve.pairSymbol,30)+' buy volume and '+safeLine(curve.scannedSellVolume,80)+' '+safeLine(curve.pairSymbol,30)+' sell volume. Scanned fees: '+safeLine(curve.scannedFees,80)+' '+safeLine(curve.pairSymbol,30)+' (not all-time totals). '+safeLine(history.reason||'Some indexed event history was outside the bounded scan.',400));
  }else lines.push('Curve trade volume and generated fees: unavailable. '+safeLine(history.reason||'The full event history could not be checked.',400));
  if(Array.isArray(history.holderActivity)&&history.holderActivity.length){
   lines.push('Top-holder Pons activity (from curve events; addresses are not identities):');
   for(const row of history.holderActivity.slice(0,10))lines.push('- '+safeLine(row.address,64)+': '+safeLine(row.buys,20)+' buys for '+safeLine(row.buyTokens,70)+' tokens ('+safeLine(row.buyQuote,70)+' '+safeLine(curve.pairSymbol,24)+'); '+safeLine(row.sells,20)+' sells of '+safeLine(row.sellTokens,70)+' tokens ('+safeLine(row.sellQuote,70)+' '+safeLine(curve.pairSymbol,24)+').'+(row.lastTradeHash?' Latest curve event: https://robinhoodchain.blockscout.com/tx/'+row.lastTradeHash+'.':''));
  }
  if(history.coverage)lines.push('Trade-history coverage: '+safeLine(history.coverage,500));
  for(const source of (Array.isArray(history.sourceUrls)?history.sourceUrls:[]))if(typeof source==='string'&&/^https:\/\//i.test(source))lines.push('Pons history source: '+source.slice(0,500));
 }
 if(report.pinkLock){
  const locks=report.pinkLock;
  lines.push('','## PinkLock token locks and vesting','Coverage: '+safeLine(locks.scope,400));
  if(locks.reason)lines.push(safeLine(locks.reason,500));
  for(const source of (Array.isArray(locks.sourceUrls)?locks.sourceUrls:[]))if(source&&typeof source.url==='string'&&/^https:\/\//i.test(source.url))lines.push('PinkLock source ('+safeLine(source.label,80)+'): '+source.url.slice(0,500));
  for(const lock of (Array.isArray(locks.records)?locks.records.slice(0,30):[])){
   lines.push('- '+safeLine(lock.kind,40)+' lock '+safeLine(lock.id,30)+' via '+safeLine(lock.adapter,50)+': '+safeLine(lock.remaining,80)+' '+safeLine(report.symbol||'tokens')+' remains; '+safeLine(lock.unlocked,80)+' unlocked; '+safeLine(lock.currentlyWithdrawable,80)+' currently withdrawable. Owner: '+safeLine(lock.owner,64)+'.');
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
  if(ponsState.market?.source==='GeckoTerminal reported')lines.push('Market reference source: https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/'+report.address);
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
 const missing=validate(request),base={schemaVersion:'5',requestId:request.requestId||randomUUID(),service:request.service,broadcast:false,charged:false,ownershipVerified:false};
 if(missing.length)return {...base,status:'needs_input',missingFields:missing,next:{type:'collect_fields',message:'Supply the missing fields explicitly. No wallet or financial choices were inferred.'}};
 const i=request.input;let result,deliverable;
 if(request.service==='token.research'){
  const env=dependencies.env||process.env;
  const inspection=await (dependencies.inspect||inspectCachedToken)(i.address,{chainId:4663,rpc:env.ROBINHOOD_RPC_URL||PONS_RPC,fetchImpl:dependencies.fetchImpl||fetch,fresh:true});
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
  }else if(request.service==='token.inspect'){
   const env=dependencies.env||process.env;
   result=await (dependencies.inspect||inspectCachedToken)(i.address,{chainId:i.chainId,rpc:env.ROBINHOOD_RPC_URL||PONS_RPC,fetchImpl:dependencies.fetchImpl||fetch,fresh:true});
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
  }else if(request.service==='wallet.balances')result=await (dependencies.balances||robinhoodBalances)(i);
 else if(request.service==='launch.options')result=await (dependencies.options||ponsReadiness)(i);
 else result=await (dependencies.quote||robinhoodRouteQuote)({...i,kind:request.service==='swap.quote'?'swap':'bridge'});
 const evidence={service:request.service,input:i,result,...(deliverable?{deliverableMarkdown:deliverable}:{})};
 const content=JSON.stringify(evidence),sha256=createHash('sha256').update(content).digest('hex');
 return {...base,status:'completed',result,...(deliverable?{deliverableMarkdown:deliverable}:{}),evidence:{format:'application/json',content,sha256,meaning:'Content integrity only; not a signature or proof of payment.'},next:{type:'stop',message:request.service.endsWith('.quote')?'Quote only. No transfer was prepared or sent; obtain a fresh wallet-approved review to execute.':'Read-only result. No wallet authority or marketplace payment was granted.'}};
}
