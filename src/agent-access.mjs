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
 'token.research':{description:'Live supported Pons v2 token phase, bonding metrics, reference market data and explicitly scoped fees. No security verdict or lifetime earnings.',required:['address'],properties:{address:account,account}},
 'token.inspect':{description:'Read-only Robinhood Chain token inspection: reported supply, source matching, proxy and control indicators, Pons launch checks, indexed top holders, current other-token balances, and bounded recent swap-like activity for eligible holders when available. Holder history is partial evidence, not a conviction score or safe-to-trade verdict.',required:['address','chainId'],properties:{address:account,chainId:{type:'integer',enum:[4663]}}},
 'wallet.balances':{description:'Public onchain balances, with unavailable data preserved. This does not authenticate wallet ownership.',required:['account','chainId'],properties:{account,chainId:{type:'integer',enum:[4663,8453,42161]}}},
 'launch.options':{description:'Current enabled Pons configurations and optional account launch permission.',required:[],properties:{account}},
 'swap.quote':{description:'Read-only same-chain route quote; no deposit or signing. Base/Arbitrum support ETH, USDC and USDT only.',required:['account','chainId','asset','outputAsset','amount'],properties:{account,chainId:{type:'integer',enum:[4663,8453,42161]},asset:account,outputAsset:account,amount:{type:'string',pattern:'^[0-9]+(\\.[0-9]+)?$'}}},
 'bridge.quote':{description:'Read-only Base/Arbitrum to Robinhood route quote; no deposit or signing.',required:['account','chainId','asset','outputAsset','amount'],properties:{account,chainId:{type:'integer',enum:[8453,42161]},asset:account,outputAsset:account,amount:{type:'string',pattern:'^[0-9]+(\\.[0-9]+)?$'}}}
};
export function agentAccessManifest(){return {name:'Dinn',version:'4',services:['plan','pons.brief',...Object.keys(agentServices)],discovery:{instructions:'/agent-guide.md',schema:'/api/agent/schema',tools:'/api/tools'},transport:{type:'http-json',endpoint:'/api/agent/request'},broadcastEnabled:false,canSign:false,acceptsPrivateKeys:false,payment:{mode:'free-public-preview',charged:false},marketplace:{provider:'NEAR Agent Market',status:'live',listingUrl:'https://market.near.ai/a/dinn',pricePerHireUsd:'0.10'},notes:['Public account input is a query target, not proof of ownership.','Research is a dated chain snapshot, not a security audit.','Marketplace payment never grants wallet authority.']};}
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
 const lines=['# Dinn token inspection','Token: '+report.address,'Network: '+report.network+' (chain '+report.chainId+')','Checked block: '+report.blockNumber+' ('+report.blockHash+')','Checked at: '+report.checkedAt,'Token name: '+(report.tokenName?safeLine(report.tokenName,100):'Unavailable'),'Token symbol: '+(report.symbol?safeLine(report.symbol,40):'Unavailable')];
 lines.push('','## Contract and launch checks');
 for(const check of report.checks.slice(0,40))lines.push('- **'+safeLine(check.label,100)+'** ('+safeLine(check.status,40)+'): '+safeLine(check.detail));
 lines.push('','## Market and fee context');
 if(ponsState){
  lines.push('Pons snapshot: block '+safeLine(ponsState.blockNumber,40)+'; checked '+safeLine(ponsState.checkedAt,80)+'.','Fee view: creator fee recipient '+safeLine(ponsState.viewerAccount,64)+'; this is a public address query, not proof of ownership.',...tokenStateMessage(ponsState).split('\n\n').map(safeText));
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
   if(behavior.summary?.holderSignal)lines.push('Holder-flow triage: '+safeLine(behavior.summary.holderSignal,160)+'. Suggested next step: '+safeLine(behavior.summary.nextStep,50)+'. This is a research-routing signal, not a buy recommendation.');
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
 lines.push('','## Limits','This is a dated, read-only snapshot. Holder index results can omit wallets, and each holder portfolio lookup is limited to indexed priced-token candidates. Wallet history covers at most five externally owned addresses among the top 10 index candidates and only the latest 30 days of bounded outgoing transactions. Swap-like calls require a decoded method and observed incoming and outgoing asset legs; ETH legs come from transaction value or explorer internal-transfer data and may be incomplete. This does not establish every trade, profitability, conviction, or community quality. Contract checks are not an audit. No buy or sell simulation, current market-liquidity proof, LP-lock proof, or safe-to-trade verdict is provided. A missing result remains unknown; it is not a clean bill of health.');
 return lines.join('\n');
}
export async function agentAccessRequest(request,dependencies={}){
 const missing=validate(request),base={schemaVersion:'4',requestId:request.requestId||randomUUID(),service:request.service,broadcast:false,charged:false,ownershipVerified:false};
 if(missing.length)return {...base,status:'needs_input',missingFields:missing,next:{type:'collect_fields',message:'Supply the missing fields explicitly. No wallet or financial choices were inferred.'}};
 const i=request.input;let result,deliverable;
 if(request.service==='token.research'){
  result=await (dependencies.tokenState||ponsTokenState)(i);
  if(result.chainId!==4663||!same(result.address,i.address)||!/^\d+$/.test(result.blockNumber)||!Number.isFinite(Date.parse(result.checkedAt))||!same(result.viewerAccount,i.account||result.feeRecipient))throw Error('Research evidence does not match the requested token or fee viewer.');
  const feeView=i.account?'Caller-specified query wallet':'Current creator fee recipient; no caller wallet was supplied';
  deliverable=['# Dinn token research','Token: '+i.address,'Network: Robinhood Chain (4663)','Checked block: '+result.blockNumber,'Checked at: '+result.checkedAt,feeView+': '+result.viewerAccount,...tokenStateMessage(result).split('\n\n').map(safeText),'Fee scope: '+safeText(result.claimScope),'Evidence: https://robinhoodchain.blockscout.com/token/'+i.address,'Limitations: This is a dated snapshot, not a security audit, proof of ownership, guaranteed sellability or an investment recommendation. Reference market data may be unavailable. No funds were claimed or moved.'].join('\n\n');
  }else if(request.service==='token.inspect'){
   const env=dependencies.env||process.env;
   result=await (dependencies.inspect||inspectCachedToken)(i.address,{chainId:i.chainId,rpc:env.ROBINHOOD_RPC_URL||PONS_RPC,fetchImpl:dependencies.fetchImpl||fetch});
   if(!result||!same(result.address,i.address)||result.chainId!==i.chainId||typeof result.blockNumber!=='string'||!/^\d+$/.test(result.blockNumber)||typeof result.blockHash!=='string'||!/^0x[0-9a-f]{64}$/i.test(result.blockHash)||!Number.isFinite(Date.parse(result.checkedAt))||!Array.isArray(result.checks))throw Error('Inspection evidence does not match the requested token or checked block.');
  const inspection=result;
  let marketAndFees=null,marketAndFeesUnavailable=false;
  if(result.protocol?.name==='Pons v2'){
   try{
    marketAndFees=await (dependencies.tokenState||ponsTokenState)({address:i.address});
    if(!same(marketAndFees.address,i.address)||marketAndFees.chainId!==4663||!/^[0-9]+$/.test(marketAndFees.blockNumber)||!Number.isFinite(Date.parse(marketAndFees.checkedAt)))throw Error('Mismatched Pons snapshot.');
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
