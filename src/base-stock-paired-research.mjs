import {pairCatalog} from './base-pair-catalog.mjs';
import {baseStockOptions} from './base-stock-data.mjs';
import {inspectToken} from './token-inspection.mjs';
import {serverRpcUrl} from './rpc-config.mjs';
import {blockscoutRead} from './blockscout.mjs';
import {decodeAbiParameters,encodeAbiParameters,keccak256,parseAbiParameters} from 'viem';

const ADDRESS=/^0x[0-9a-f]{40}$/i;
const HASH=/^0x[0-9a-f]{64}$/i;
const INITIALIZE='0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438';
const BASE_V4_POOL_MANAGER='0x498581ff718922c3f8e6a244956af099b2652b2b';
const V4_POOL_KEY='(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)';
const BANKR='https://api.bankr.bot';
const DEX='https://api.dexscreener.com';
const GECKO='https://api.geckoterminal.com/api/v2';
const holderSnapshotCache=new Map();
const holderSnapshotPending=new Map();
const geckoPoolCache=new Map();
const researchPending=new Map();
async function json(url,fetchImpl,signal){const r=await fetchImpl(url,{headers:{accept:'application/json'},signal});if(!r.ok)throw new Error('A Base research source is unavailable.');return r.json();}
function units(raw,decimals){if(typeof raw!=='string'||!/^\d+$/.test(raw)||!Number.isInteger(decimals)||decimals<0||decimals>36)return null;const value=BigInt(raw),scale=10n**BigInt(decimals),whole=value/scale,fraction=(value%scale).toString().padStart(decimals,'0').replace(/0+$/,'');return fraction?`${whole}.${fraction}`:whole.toString();}
function allocationPercent(amount,supply){try{const parse=value=>{const [whole,fraction='']=String(value).split('.');return {whole,fraction};},a=parse(amount),s=parse(supply),scale=Math.max(a.fraction.length,s.fraction.length),integer=value=>BigInt(value.whole)*10n**BigInt(scale)+BigInt((value.fraction+'0'.repeat(scale)).slice(0,scale)||'0'),numerator=integer(a),denominator=integer(s);if(denominator<=0n||numerator>denominator)return null;const basisPoints=(numerator*10000n+denominator/2n)/denominator;return `${basisPoints/100n}.${String(basisPoints%100n).padStart(2,'0')}`;}catch{return null;}}
function percentBps(balance,supply){if(typeof balance!=='bigint'||typeof supply!=='bigint'||supply<=0n)return null;return Number((balance*1_000_000n)/supply)/10_000;}
function classifiedTokenAddress(item){const token=item?.token;const value=token?.contract_address||token?.address||token?.contractAddress;return typeof value==='string'?value.toLowerCase():null;}
async function baseHolderActivity(address,token,fetchImpl,signal,apiKey){
  const url=new URL(`https://api.covalenthq.com/v1/base-mainnet/address/${address}/transactions_v3/`);url.searchParams.set('with-classification','true');url.searchParams.set('no-logs','true');url.searchParams.set('quote-currency','USD');
 const response=await fetchImpl(url,{headers:{accept:'application/json',authorization:`Bearer ${apiKey}`},signal});
 if(!response.ok)return {status:'unavailable',reason:'GoldRush transaction history request failed.'};
 const payload=await response.json(),data=payload?.data;if(payload?.error||!Array.isArray(data?.items))return {status:'unavailable',reason:'GoldRush returned no classified transaction page.'};
 const items=data.items,swaps=[];
 for(const tx of items){const classification=tx?.classification;if(tx?.successful!==true||String(classification?.type||'').toLowerCase()!=='swap')continue;const sent=(Array.isArray(classification.sent)?classification.sent:[]).filter(row=>classifiedTokenAddress(row)===token);const received=(Array.isArray(classification.received)?classification.received:[]).filter(row=>classifiedTokenAddress(row)===token);let side=null,amounts=[];if(sent.length&&!received.length){side='sell';amounts=sent;}else if(received.length&&!sent.length){side='buy';amounts=received;}else continue;const hash=typeof tx.tx_hash==='string'&&HASH.test(tx.tx_hash)?tx.tx_hash.toLowerCase():null;swaps.push({side,at:typeof tx.block_signed_at==='string'?tx.block_signed_at:null,blockNumber:Number.isSafeInteger(tx.block_height)?tx.block_height:null,transactionHash:hash,tokenAmounts:amounts.map(row=>text(String(row.amount??''),80)).filter(Boolean)});}
 return {status:'available',transactionsChecked:items.length,transactionLimit:100,oldestTransactionAt:items.length&&typeof items.at(-1)?.block_signed_at==='string'?items.at(-1).block_signed_at:null,latestTransactionAt:items.length&&typeof items[0]?.block_signed_at==='string'?items[0].block_signed_at:null,classifiedTokenSwaps:swaps.length,buys:swaps.filter(row=>row.side==='buy').length,sells:swaps.filter(row=>row.side==='sell').length,recentSwaps:swaps.slice(0,5),coverage:'Recent transaction page only (up to 100 transactions); only successful GoldRush-classified swaps that include this token are counted. This is not the wallet\'s complete trade history.'};
}
async function baseAccountCode(address,fetchImpl,signal,rpc){
 const response=await fetchImpl(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getCode',params:[address,'latest']}),signal});
 if(!response.ok)throw new Error('Base account code is unavailable.');const payload=await response.json(),code=payload?.result;
 if(typeof code!=='string'||!/^0x[0-9a-f]*$/i.test(code))throw new Error('Base account code is unavailable.');return code==='0x'?'not-observed':'present';
}
async function blockscoutBaseHolderSnapshot(token,fetchImpl,signal,env){
 if(typeof env.BLOCKSCOUT_API_KEY!=='string'||!env.BLOCKSCOUT_API_KEY.trim())return null;
 try{
  const payload=await blockscoutRead(`tokens/${token}/holders`,{chainId:8453,env,fetchImpl,signal,query:{items_count:100}});
  if(!Array.isArray(payload?.items))return null;
  const info=payload.token||{},decimals=Number(info.decimals);
  if(!Number.isInteger(decimals)||decimals<0||decimals>36)return null;
  const rows=payload.items.map(row=>({address:typeof row?.address_hash==='string'?row.address_hash:typeof row?.address_hash?.hash==='string'?row.address_hash.hash:typeof row?.address?.hash==='string'?row.address.hash:null,rawBalance:typeof row?.value==='string'?row.value:typeof row?.balance==='string'?row.balance:null})).filter(row=>addr(row.address)&&typeof row.rawBalance==='string'&&/^\d+$/.test(row.rawBalance)).map(row=>({address:row.address.toLowerCase(),balance:BigInt(row.rawBalance)})).filter(row=>!['0x0000000000000000000000000000000000000000','0x000000000000000000000000000000000000dead'].includes(row.address)).sort((a,b)=>a.balance>b.balance?-1:a.balance<b.balance?1:0);
  const supplyRaw=typeof info.total_supply==='string'?info.total_supply:typeof info.totalSupply==='string'?info.totalSupply:null,supply=supplyRaw&&/^\d+$/.test(supplyRaw)?BigInt(supplyRaw):null;
  const leaders=rows.slice(0,10),topTen=leaders.reduce((sum,row)=>sum+row.balance,0n),hasMore=payload.next_page_params&&typeof payload.next_page_params==='object'?true:payload.next_page_params===null?false:true,sharesValid=Boolean(supply&&supply>0n&&topTen<=supply&&leaders.every(row=>row.balance<=supply));
  const reportedCount=Number(info.holders_count??info.holder_count);
  return {source:'Blockscout token holder API',url:`https://base.blockscout.com/token/${token}?tab=holders`,checkedAt:new Date().toISOString(),blockNumber:null,holderCount:Number.isSafeInteger(reportedCount)&&reportedCount>=0?reportedCount:null,sampleSize:rows.length,pageSize:100,hasMore,supply:supply?units(supply.toString(),decimals):null,decimals,largestBalancesInSample:leaders.map(row=>({address:row.address,balance:units(row.balance.toString(),decimals),percentOfSupply:sharesValid?percentBps(row.balance,supply):null})),sampleTop10SharePercent:sharesValid?percentBps(topTen,supply):null,holderActivity:leaders.slice(0,3).map(row=>({address:row.address,balance:units(row.balance.toString(),decimals),status:'unavailable',reason:'Blockscout provides holder balances here, but this endpoint does not classify buys or sells.'})),activityCoverage:'Blockscout holder data is a current balance snapshot; recent buys and sells were not classified.',coverage:`Blockscout lists holders in descending balance order; ${hasMore?'this is a partial page, with later holders omitted.':'the API reported no later page.'} Holder counts and balances reflect the explorer index, not the Base block-pinned contract read. Contract addresses may be included; their roles are not identified.`};
 }catch{return null;}
}
export async function baseHolderSnapshot(token,fetchImpl,signal,rpc,env=process.env){
 const apiKey=typeof env.GOLDRUSH_API_KEY==='string'?env.GOLDRUSH_API_KEY.trim():'';
 const cached=holderSnapshotCache.get(token);if(cached&&cached.expiresAt>Date.now()&&cached.value)return cached.value;
 const pending=holderSnapshotPending.get(token);if(pending)return pending;
 if(!apiKey){
  const fallbackRequest=blockscoutBaseHolderSnapshot(token,fetchImpl,signal,env);holderSnapshotPending.set(token,fallbackRequest);
  try{const value=await fallbackRequest;if(value){if(holderSnapshotCache.size>=500)holderSnapshotCache.delete(holderSnapshotCache.keys().next().value);holderSnapshotCache.set(token,{value,expiresAt:Date.now()+60_000});}return value;}finally{holderSnapshotPending.delete(token);}
 }
 const request=(async()=>{
 const url=new URL(`https://api.covalenthq.com/v1/base-mainnet/tokens/${token}/token_holders_v2/`);
 url.searchParams.set('page-size','1000');url.searchParams.set('page-number','0');
 const response=await fetchImpl(url,{headers:{accept:'application/json',authorization:`Bearer ${apiKey}`},signal});
 if(!response.ok)throw new Error('GoldRush holder data is unavailable.');
 const payload=await response.json(),data=payload?.data;
 if(payload?.error||!Array.isArray(data?.items)||!data?.pagination)return null;
 const items=data.items.filter(row=>typeof row?.address==='string'&&ADDRESS.test(row.address)&&typeof row.balance==='string'&&/^\d+$/.test(row.balance));
 const decimals=Number(items[0]?.contract_decimals),supplyRaw=items[0]?.total_supply;
 const supply=typeof supplyRaw==='string'&&/^\d+$/.test(supplyRaw)?BigInt(supplyRaw):null;
 const ranked=items.map(row=>({address:row.address.toLowerCase(),balance:BigInt(row.balance)})).filter(row=>row.address!=='0x000000000000000000000000000000000000dead').sort((a,b)=>a.balance>b.balance?-1:a.balance<b.balance?1:0);
 const leaders=ranked.slice(0,10).map(row=>({address:row.address,balance:units(row.balance.toString(),decimals),percentOfSupply:supply?percentBps(row.balance,supply):null}));
 const candidates=ranked.slice(0,3),codeResults=await Promise.allSettled(candidates.map(row=>baseAccountCode(row.address,fetchImpl,signal,rpc))),activityResults=await Promise.allSettled(candidates.map((row,index)=>codeResults[index].status==='fulfilled'&&codeResults[index].value==='not-observed'?baseHolderActivity(row.address,token,fetchImpl,signal,apiKey):Promise.resolve(null)));
 const holderActivity=candidates.map((row,index)=>{const accountCode=codeResults[index],activity=activityResults[index];if(accountCode.status!=='fulfilled')return {address:row.address,balance:units(row.balance.toString(),decimals),accountCode:'unavailable',status:'unavailable',reason:'Could not determine whether this holder address is a contract.'};if(accountCode.value==='present')return {address:row.address,balance:units(row.balance.toString(),decimals),accountCode:'present',status:'contract',reason:'Contract code is present; wallet buy/sell classification was not applied.'};return {address:row.address,balance:units(row.balance.toString(),decimals),accountCode:'not-observed',status:activity.status==='fulfilled'&&activity.value?activity.value.status:'unavailable',...(activity.status==='fulfilled'&&activity.value?activity.value:{reason:'GoldRush transaction history request failed.'})};});
 const sampledTop10=ranked.slice(0,10).reduce((total,row)=>total+row.balance,0n);
 const value={source:'GoldRush Token Holders API',checkedAt:typeof data.updated_at==='string'?data.updated_at:null,blockNumber:Number.isSafeInteger(data.chain_tip_height)?data.chain_tip_height:(Number.isSafeInteger(items[0]?.block_height)?items[0].block_height:null),holderCount:Number.isSafeInteger(data.pagination.total_count)?data.pagination.total_count:null,sampleSize:items.length,pageSize:data.pagination.page_size||1000,hasMore:data.pagination.has_more===true,supply:supply&&Number.isInteger(decimals)?units(supply.toString(),decimals):null,decimals:Number.isInteger(decimals)?decimals:null,largestBalancesInSample:leaders,sampleTop10SharePercent:supply?percentBps(sampledTop10,supply):null,holderActivity,activityCoverage:'Bytecode was checked for only the three largest balances in the returned holder sample. Buy/sell classification is attempted only where no contract code was observed; address labels and identity are not provided.',coverage:data.pagination.has_more===true?'First 1,000 returned holders only; largest balances are ranked within this sample. This is not a complete holder ranking. Contract addresses may include pools or service contracts; their roles are not identified.':'Complete holder list returned; largest balances are ranked across the full list. Contract addresses may include pools or service contracts; their roles are not identified.'};
  if(holderSnapshotCache.size>=500)holderSnapshotCache.delete(holderSnapshotCache.keys().next().value);
  const complete=holderActivity.every(row=>row.status==='available'||row.status==='contract');holderSnapshotCache.set(token,{value,expiresAt:Date.now()+(complete?5*60_000:60_000)});return value;
 })();
 holderSnapshotPending.set(token,request);
 try{const value=await request;if(value)return value;return await blockscoutBaseHolderSnapshot(token,fetchImpl,signal,env);}catch{const fallback=await blockscoutBaseHolderSnapshot(token,fetchImpl,signal,env);if(fallback)return fallback;if(holderSnapshotCache.size>=500)holderSnapshotCache.delete(holderSnapshotCache.keys().next().value);holderSnapshotCache.set(token,{value:null,expiresAt:Date.now()+30_000});return null;}finally{holderSnapshotPending.delete(token);}
}
function addr(value){return typeof value==='string'&&ADDRESS.test(value);}
function text(value,max=120){return typeof value==='string'?value.slice(0,max):null;}
function finite(value){if(value===null||value===undefined||typeof value==='boolean'||typeof value==='string'&&!value.trim())return null;const n=Number(value);return Number.isFinite(n)?n:null;}
function tokenAmount(value){if(typeof value!=='string'||value.length>100||!/^\d+(?:\.\d+)?$/.test(value))return null;const n=Number(value);return Number.isFinite(n)&&n>=0?value:null;}
function vestingAmountsReconcile(total,released,claimable,locked){const values=[total,released,claimable,locked],scale=Math.max(...values.map(value=>(value.split('.')[1]||'').length));const units=values.map(value=>{const [whole,fraction='']=value.split('.');return BigInt(whole)*10n**BigInt(scale)+BigInt((fraction+'0'.repeat(scale)).slice(0,scale)||'0');});return units[1]+units[2]+units[3]===units[0]&&units[0]>0n;}
async function bankrVesting(token,launch,fetchImpl,signal){
 const source='Bankr public vesting endpoint',url=BANKR+'/token-launches/'+token+'/vesting';
 if(!launch)return {status:'unavailable',reason:'No matching deployed Bankr launch record was verified.'};
 try{
  const payload=await json(url,fetchImpl,signal);
  if(payload?.tokenAddress?.toLowerCase()!==token||payload?.chain!=='base'||payload?.tokenSymbol!==launch.tokenSymbol||typeof payload?.eligible!=='boolean')return {status:'unavailable',reason:'Bankr vesting response did not match the verified Base launch.'};
  if(payload.eligible===false&&payload.vesting===null)return {status:'no-eligible-schedule',reason:'Bankr reports no eligible vesting schedule for this launch. This does not prove the supply is unlocked.',source,url};
  const row=payload.vesting,phase=typeof row?.phase==='string'&&/^[a-z][a-z0-9_-]{0,39}$/i.test(row.phase)?row.phase:null,start=row?.vestingStart,cliff=row?.cliffEndsAt,end=row?.vestingEndsAt;
  const total=tokenAmount(row?.totalAmount),released=tokenAmount(row?.releasedAmount),claimable=tokenAmount(row?.claimableAmount),locked=tokenAmount(row?.lockedAmount),unlocked=finite(row?.unlockedPercent);
  if(payload.eligible!==true||!phase||![start,cliff,end].every(Number.isSafeInteger)||start<=0||cliff<start||end<cliff||!Number.isSafeInteger(row?.cliffSeconds)||row.cliffSeconds<0||cliff-start!==row.cliffSeconds||!Number.isSafeInteger(row?.durationSeconds)||row.durationSeconds<=0||end-start!==row.durationSeconds||[total,released,claimable,locked].some(value=>value===null)||!vestingAmountsReconcile(total,released,claimable,locked)||unlocked===null||unlocked<0||unlocked>100)return {status:'unavailable',reason:'Bankr returned an incomplete, inconsistent or invalid vesting schedule.'};
  return {status:'reported',tokenSymbol:payload.tokenSymbol,phase,vestingStart:new Date(start*1000).toISOString(),cliffEndsAt:new Date(cliff*1000).toISOString(),vestingEndsAt:new Date(end*1000).toISOString(),cliffSeconds:row.cliffSeconds,durationSeconds:row.durationSeconds,totalAmount:total,releasedAmount:released,claimableAmount:claimable,lockedAmount:locked,unlockedPercent:unlocked,source,url};
 }catch{return {status:'unavailable',reason:'Bankr vesting data could not be retrieved.'};}
}
function numericSeries(value,keys){if(!value||typeof value!=='object'||Array.isArray(value))return null;const result={};for(const key of keys){const n=finite(value[key]);if(n!==null)result[key]=n;}return Object.keys(result).length?result:null;}
function transactionSeries(value){if(!value||typeof value!=='object'||Array.isArray(value))return null;const result={};for(const period of ['m5','h1','h6','h24']){const row=numericSeries(value[period],['buys','sells']);if(row)result[period]=row;}return Object.keys(result).length?result:null;}
function unpackInitialize(log){if(log?.address?.toLowerCase()!==BASE_V4_POOL_MANAGER||log?.topics?.[0]?.toLowerCase()!==INITIALIZE||log.topics.length<4)return null;try{const [fee,tickSpacing,hooks]=decodeAbiParameters(parseAbiParameters('uint24,int24,address,uint160,int24'),log.data);const poolKey={currency0:('0x'+log.topics[2].slice(-40)).toLowerCase(),currency1:('0x'+log.topics[3].slice(-40)).toLowerCase(),fee,tickSpacing,hooks:hooks.toLowerCase()},poolId=keccak256(encodeAbiParameters(parseAbiParameters(V4_POOL_KEY),[poolKey])).toLowerCase();return {poolId:log.topics[1]?.toLowerCase(),computedPoolId:poolId,currency0:poolKey.currency0,currency1:poolKey.currency1,poolKey};}catch{return null;}}
async function receipt(txHash,fetchImpl,signal,rpc){const r=await fetchImpl(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getTransactionReceipt',params:[txHash]}),signal});if(!r.ok)throw new Error('Base receipt source unavailable.');const j=await r.json();return j?.result||null;}
async function geckoPoolMarket(poolId,token,quoteAddress,launch,stock,fetchImpl,signal,batchPool){
 const cacheKey=poolId.toLowerCase(),cached=geckoPoolCache.get(cacheKey);if(cached&&cached.expiresAt>Date.now())return cached.value;
 const pool=batchPool===undefined?(await json(GECKO+'/networks/base/pools/'+poolId,fetchImpl,signal))?.data:batchPool,attributes=pool?.attributes||{},relationships=pool?.relationships||{};
 const baseId=relationships.base_token?.data?.id?.toLowerCase(),quoteId=relationships.quote_token?.data?.id?.toLowerCase(),dexId=relationships.dex?.data?.id;
 if(pool?.id?.toLowerCase()!=='base_'+poolId.toLowerCase()||dexId!=='bankr'||![baseId,quoteId].includes('base_'+token.toLowerCase())||![baseId,quoteId].includes('base_'+quoteAddress.toLowerCase())||baseId===quoteId){if(geckoPoolCache.size>=300)geckoPoolCache.delete(geckoPoolCache.keys().next().value);geckoPoolCache.set(cacheKey,{value:null,expiresAt:Date.now()+60_000});return null;}
 const reserves=finite(attributes.reserve_in_usd),noReserves=reserves===0;
 const baseIsToken=baseId==='base_'+token.toLowerCase(),baseToken=baseIsToken?{address:token,symbol:launch?.tokenSymbol||'token'}:{address:quoteAddress,symbol:stock?.symbol||launch?.pairedStock?.symbol||'stock'},quoteToken=baseIsToken?{address:quoteAddress,symbol:stock?.symbol||launch?.pairedStock?.symbol||'stock'}:{address:token,symbol:launch?.tokenSymbol||'token'};
 const value={source:'GeckoTerminal',pairAddress:poolId,poolName:text(attributes.name,120),baseToken,quoteToken,priceUsd:noReserves?null:finite(baseIsToken?attributes.base_token_price_usd:attributes.quote_token_price_usd),priceNative:noReserves?null:finite(baseIsToken?attributes.base_token_price_quote_token:attributes.quote_token_price_base_token),volumeUsd:numericSeries(attributes.volume_usd,['m5','h1','h6','h24']),transactions:transactionSeries(attributes.transactions),liquidityUsd:reserves,fdvUsd:noReserves?null:finite(attributes.fdv_usd),marketCapUsd:noReserves?null:finite(attributes.market_cap_usd),pairCreatedAt:typeof attributes.pool_created_at==='string'&&Number.isFinite(Date.parse(attributes.pool_created_at))?new Date(attributes.pool_created_at).getTime():null,url:'https://www.geckoterminal.com/base/pools/'+poolId};
 if(geckoPoolCache.size>=300)geckoPoolCache.delete(geckoPoolCache.keys().next().value);geckoPoolCache.set(cacheKey,{value,expiresAt:Date.now()+60_000});return value;
}
async function researchBaseStockPairedTokenUncached(input,{fetchImpl=fetch,baseStockOptionsImpl=baseStockOptions,inspectTokenImpl=inspectToken,holderSnapshotImpl=baseHolderSnapshot,holderSnapshotEnabled=true,env=process.env}={}){
 const token=typeof input?.address==='string'?input.address.trim().toLowerCase():'';
 if(!addr(token)||/^0x0{40}$/i.test(token))throw new Error('Enter a valid Base token contract address.');
 const baseRpc=serverRpcUrl(8453,env);
 const signal=AbortSignal.timeout(12000),holderSignal=AbortSignal.timeout(30000);
 const [launchesResult,feesResult,marketsResult,stocksResult,contractResult,holdersResult]=await Promise.allSettled([
  json(BANKR+'/token-launches',fetchImpl,signal),
  json(BANKR+'/token-launches/'+token+'/fees',fetchImpl,signal),
  json(DEX+'/token-pairs/v1/base/'+token,fetchImpl,signal),
  baseStockOptionsImpl({fetchImpl,signal}),
  inspectTokenImpl(token,{rpc:baseRpc,chainId:8453,fetchImpl,signal}),
  holderSnapshotEnabled?holderSnapshotImpl(token,fetchImpl,holderSignal,baseRpc,env):Promise.resolve(null)
 ]);
 const launchList=launchesResult.status==='fulfilled'&&Array.isArray(launchesResult.value?.launches)?launchesResult.value.launches:[];
 let launch=launchList.find(row=>row?.chain==='base'&&row?.status==='deployed'&&row?.tokenAddress?.toLowerCase()===token)||null,launchSource=launch?'recent Bankr launch feed':null,launchLookupStatus='not needed';
 if(!launch){launchLookupStatus='unavailable';try{const response=await fetchImpl(BANKR+'/token-launches/'+token,{headers:{accept:'application/json'},signal});if(response.status===404)launchLookupStatus='no matching address record';else if(response.ok){const detail=await response.json(),candidate=detail?.launch;if(candidate?.chain==='base'&&candidate?.status==='deployed'&&candidate?.tokenAddress?.toLowerCase()===token){launch=candidate;launchSource='address-specific Bankr launch lookup';launchLookupStatus='matched';}else launchLookupStatus='response did not match the requested Base launch';}}catch{}}
 const feeTokens=feesResult.status==='fulfilled'&&Array.isArray(feesResult.value?.tokens)?feesResult.value.tokens:[];
 const fee=feeTokens.find(row=>row?.tokenAddress?.toLowerCase()===token&&row?.chain==='base')||null;
 const declaredStockAddress=addr(launch?.pairedStock?.address)?launch.pairedStock.address.toLowerCase():null;
 const feeNumeraire=addr(fee?.numeraire)?fee.numeraire.toLowerCase():null;
 const quoteAddress=declaredStockAddress||feeNumeraire;
 const launchPoolId=HASH.test(launch?.poolId||'')?launch.poolId.toLowerCase():null;
 const feePoolId=HASH.test(fee?.poolId||'')?fee.poolId.toLowerCase():null;
 const marketRows=marketsResult.status==='fulfilled'&&Array.isArray(marketsResult.value)?marketsResult.value:[];
 // Match DEX Screener data by both token addresses, then compare its returned
 // pair identifier with Bankr's v4 pool ID before labeling it as that pool.
 // The launch receipt independently verifies Bankr's exact v4 pool identifier.
 const marketCandidates=quoteAddress?marketRows.filter(row=>[row?.baseToken?.address,row?.quoteToken?.address].some(x=>x?.toLowerCase()===quoteAddress)&&[row?.baseToken?.address,row?.quoteToken?.address].some(x=>x?.toLowerCase()===token)):[];
 let market=marketCandidates.sort((a,b)=>(finite(b?.liquidity?.usd)||0)-(finite(a?.liquidity?.usd)||0))[0]||null;
 const stockData=stocksResult.status==='fulfilled'?stocksResult.value:null;
 const stockRegistry=stockData?.coinbaseRegistry||stockData?.stocks?.map(row=>row.coinbase).filter(Boolean)||[];
 const stock=quoteAddress?stockRegistry.find(row=>row.address===quoteAddress)||null:null;
 const hasMarketStats=value=>!!value&&[value.volume?.h24,value.volumeUsd?.h24,value.txns?.h24?.buys,value.txns?.h24?.sells,value.transactions?.h24?.buys,value.transactions?.h24?.sells,...[value.priceUsd,value.priceNative,value.liquidityUsd,value.liquidity?.usd,value.fdvUsd,value.fdv,value.marketCapUsd,value.marketCap].filter(item=>finite(item)>0)].some(item=>finite(item)!==null);
 const dexPairMatchesBankr=!!(launchPoolId&&typeof market?.pairAddress==='string'&&market.pairAddress.toLowerCase()===launchPoolId);
 if(launchPoolId&&quoteAddress&&(!dexPairMatchesBankr||!hasMarketStats(market))){try{const exactMarket=await geckoPoolMarket(launchPoolId,token,quoteAddress,launch,stock,fetchImpl,signal);if(exactMarket&&(hasMarketStats(exactMarket)||!hasMarketStats(market)))market=exactMarket;}catch{}}
 const holders=holdersResult.status==='fulfilled'?holdersResult.value:null;
 const contractReport=contractResult.status==='fulfilled'?{address:contractResult.value.address,chainId:contractResult.value.chainId,network:contractResult.value.network,blockNumber:contractResult.value.blockNumber,blockHash:contractResult.value.blockHash,checkedAt:contractResult.value.checkedAt,tokenName:contractResult.value.tokenName,symbol:contractResult.value.symbol,decimals:contractResult.value.decimals,rawSupply:contractResult.value.rawSupply,implementationAddress:contractResult.value.implementationAddress,checks:contractResult.value.checks.filter(item=>['Contract code','Total supply (TS)','Source verification','Reported owner','Proxy indicators','Control functions'].includes(item.label)),sources:contractResult.value.sources}:null;
 let chainCheck={status:'unavailable',source:'Base JSON-RPC transaction receipt'};
 if(launch&&HASH.test(launch.txHash||'')){
  try{
   const r=await receipt(launch.txHash,fetchImpl,signal,baseRpc),events=(r?.logs||[]).map(unpackInitialize).filter(Boolean);
   const match=events.find(event=>event.poolId===launchPoolId&&event.currency0!==event.currency1&&[event.currency0,event.currency1].includes(token)&&[event.currency0,event.currency1].includes(quoteAddress));
   chainCheck={status:r?.status==='0x1'&&match&&match.poolId===match.computedPoolId?'verified':r?.status==='0x0'?'failed':'unverified',transactionHash:launch.txHash,blockNumber:r?.blockNumber?parseInt(r.blockNumber,16):null,blockHash:r?.blockHash||null,poolId:match?.poolId||null,computedPoolId:match?.computedPoolId||null,currency0:match?.currency0||null,currency1:match?.currency1||null,poolKey:match?.poolKey||null,tokenAddress:match?token:null,quoteAddress:match?quoteAddress:null,source:'Base JSON-RPC transaction receipt'};
  }catch{chainCheck={status:'unavailable',transactionHash:launch.txHash,source:'Base JSON-RPC transaction receipt'};}
 }
 const feeConsistent=!fee||(feeNumeraire===declaredStockAddress&&feePoolId===launchPoolId);
 const feeHistory=(()=>{const payload=feesResult.status==='fulfilled'?feesResult.value:null,rows=Array.isArray(payload?.allTimeDailyEarnings)?payload.allTimeDailyEarnings:null,launchTime=finite(launch?.timestamp),total=finite(payload?.lifetimeEarnedWeth),days=payload?.lifetimeDays;if(!fee||!feeConsistent||!rows||launchTime===null||total===null||!Number.isSafeInteger(days)||days<0)return {status:'unavailable',reason:'Bankr lifetime earnings could not be checked against a matching launch and complete daily history.'};const launchDate=new Date(launchTime).toISOString().slice(0,10),validRows=rows.every(row=>typeof row?.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row.date)&&finite(row.weth)!==null&&finite(row.weth)>=0),positive=rows.filter(row=>finite(row.weth)>0),sum=rows.reduce((value,row)=>value+(finite(row.weth)||0),0),best=payload.lifetimeBestDay;if(!validRows||positive.some(row=>row.date<launchDate)||positive.length!==days||Math.abs(sum-total)>0.00011||best&&(typeof best.date!=='string'||best.date<launchDate||finite(best.weth)===null))return {status:'unavailable',reason:'Bankr lifetime earnings did not reconcile with its daily history and verified launch date.'};return {status:'reported',lifetimeEarnedWeth:String(payload.lifetimeEarnedWeth),earningDays:days,bestDay:best?{date:best.date,weth:String(best.weth)}:null,source:'Bankr public fee history'};})();
 const pairVerified=!!(launch&&declaredStockAddress&&stock&&stock.address===declaredStockAddress&&launchPoolId&&chainCheck.poolId===launchPoolId&&chainCheck.computedPoolId===launchPoolId&&chainCheck.status==='verified'&&feeConsistent);
 if(pairVerified && env.DATABASE_URL && env.RENDER){
  try{const catalog=await pairCatalog(env);await catalog.remember([launch]);}
  catch{console.error('Base discovery could not save a verified launch.');}
 }
 const marketReport=market?{source:market.source||'DEX Screener',pairAddress:market.pairAddress,matchesBankrPool:market.source==='GeckoTerminal'||!!(launchPoolId&&typeof market.pairAddress==='string'&&market.pairAddress.toLowerCase()===launchPoolId),poolName:market.poolName||null,baseToken:market.baseToken,quoteToken:market.quoteToken,priceUsd:finite(market.priceUsd),priceNative:finite(market.priceNative),volumeUsd:market.volumeUsd||numericSeries(market.volume,['m5','h1','h6','h24']),transactions:market.transactions||transactionSeries(market.txns),liquidityUsd:market.liquidityUsd??finite(market.liquidity?.usd),fdvUsd:market.fdvUsd??finite(market.fdv),marketCapUsd:market.marketCapUsd??finite(market.marketCap),pairCreatedAt:finite(market.pairCreatedAt)!==null?new Date(Number(market.pairCreatedAt)).toISOString():typeof market.pairCreatedAt==='string'&&Number.isFinite(Date.parse(market.pairCreatedAt))?new Date(market.pairCreatedAt).toISOString():null,url:market.url||null}:null;
 const vestingResult=await bankrVesting(token,launch,fetchImpl,AbortSignal.timeout(6000)),supplyHuman=contractReport?units(contractReport.rawSupply,contractReport.decimals):null,vesting=vestingResult.status==='reported'?{...vestingResult,allocationPercentOfSupply:supplyHuman?allocationPercent(vestingResult.totalAmount,supplyHuman):null}:vestingResult;
 const checkedAt=new Date().toISOString(),timestamp=finite(launch?.timestamp),deployedAt=timestamp!==null&&Math.abs(timestamp)<=8.64e15?new Date(Number(timestamp)).toISOString():null,ageMs=deployedAt?Date.parse(checkedAt)-Date.parse(deployedAt):null,launchAgeDays=ageMs!==null&&ageMs>=0?Math.floor(ageMs/86400000):null;
 const toFloat=value=>finite(value);
 return {address:token,chainId:8453,network:'Base',checkedAt,classification:pairVerified?'verified-bankr-stock-paired-token':'insufficient-evidence',contract:contractReport,stock:pairVerified?{address:stock.address,symbol:stock.symbol,name:stock.name,referencePrice:stock.coinbase?.referencePrice??null,referencePriceUpdatedAt:stock.coinbase?.referencePriceUpdatedAt??null,multiplier:stock.coinbase?.multiplier??null}:null,launch:launch?{name:text(launch.tokenName),symbol:text(launch.tokenSymbol,40),pairedStock:launch.pairedStock&&addr(launch.pairedStock.address)?{address:launch.pairedStock.address.toLowerCase(),symbol:text(launch.pairedStock.symbol,24)}:null,deployedAt,ageDays:launchAgeDays,transactionHash:launch.txHash,poolId:launch.poolId,...(pairVerified?{poolKey:chainCheck.poolKey}:{})}:null,market:marketReport,vesting,fees:fee?{source:'Bankr public fee endpoint',poolId:fee.poolId,token0Label:text(fee.token0Label,40),token1Label:text(fee.token1Label,40),quoteTokenLabel:text(fee.tokenIsToken0?fee.token1Label:fee.token0Label,40),claimable:fee.claimable||null,claimed:fee.claimed||null,share:text(fee.share,40),lifetime:feeHistory}:null,holders,verification:chainCheck,coverage:{bankrLaunchFeed:launchSource||`not found in recent feed (50 latest); address-specific lookup ${launchLookupStatus}`,bankrFeeRecord:fee?'found':'unavailable',bankrVesting:vesting.status,stockRegistry:stock?'Coinbase registry address match':'unavailable',marketPair:market?(market.source==='GeckoTerminal'?'GeckoTerminal matched the exact Bankr v4 pool ID and token/stock addresses':marketReport?.matchesBankrPool?'DEX Screener pair ID matched the exact Bankr v4 pool ID':'DEX Screener reported a pair with the same token and stock addresses'):'unavailable',holders:holders?holders.coverage:holderSnapshotEnabled?(env.GOLDRUSH_API_KEY?'unavailable; GoldRush holder request failed and Blockscout returned no snapshot':env.BLOCKSCOUT_API_KEY?'unavailable; Blockscout holder request failed or returned no snapshot':'unavailable; no GoldRush or Blockscout holder key configured'):'not requested for the free public preview',holderActivity:holders?.source==='GoldRush Token Holders API'?'GoldRush classified activity was checked for up to three sampled holders':holders?'Blockscout holder balances do not include classified recent buys or sells':'unavailable',holderSnapshotSource:holders?.source||null,contractSafety:'not assessed',onchainContract:contractReport?'checked':'unavailable',notes:['Reference NAV is not an executable price.','Market fields may be absent even when a pool exists.','A successful launch receipt proves the event and addresses, not liquidity, safety, or sellability.','A missing Bankr vesting schedule does not prove supply is unlocked.','Holder balances are a point-in-time snapshot, not a complete wallet history or evidence of intent.','Recent buys and sells cover only up to three largest balances in the returned sample and each wallet’s latest transaction page when GoldRush is configured.','Holder addresses are not labeled as exchange, liquidity-pool, treasury, or team wallets.','No matching record is insufficient evidence; it does not prove a token is not stock-paired.']}};
}

export async function researchBaseStockPairedToken(input,options={}){
 const token=typeof input?.address==='string'?input.address.trim().toLowerCase():'';
 if(!addr(token)||/^0x0{40}$/i.test(token))throw new Error('Enter a valid Base token contract address.');
 const active=researchPending.get(token);if(active)return active;
 const pending=researchBaseStockPairedTokenUncached({address:token},options);
 researchPending.set(token,pending);
 try{return await pending;}finally{if(researchPending.get(token)===pending)researchPending.delete(token);}
}
// A bounded comparison of recent launches. Rank only observations for the pool
// initialized by the successful Bankr launch transaction.
let discoveryScan;
async function scanStockPairs({fetchImpl=fetch,env=process.env,baseStockOptionsImpl=baseStockOptions,catalog:providedCatalog}={}){
 const signal=AbortSignal.timeout(18000);
 const feedUrl=BANKR+'/token-launches';
 const [feed,registry]=await Promise.all([json(feedUrl,fetchImpl,signal).catch(()=>null),baseStockOptionsImpl({fetchImpl,signal})]);
 const feedAvailable=Array.isArray(feed?.launches);
 if(registry.sources?.coinbase?.status!=='available')throw Error('The launch feed or stock registry could not be checked.');
 const listed=feedAvailable?feed.launches.slice(0,50):[],stocks=new Map(registry.coinbaseRegistry.map(s=>[s.address.toLowerCase(),s]));
 const unique=new Map();
 for(const l of listed){
  const token=l?.tokenAddress?.toLowerCase(),quote=l?.pairedStock?.address?.toLowerCase();
  if(l?.chain==='base'&&l.status==='deployed'&&addr(token)&&token!==quote&&stocks.has(quote)&&!unique.has(token))unique.set(token,l);
 }
 const recent=[...unique.values()].filter(l=>HASH.test(l.poolId||'')&&HASH.test(l.txHash||''));
 const catalog=providedCatalog===undefined?await pairCatalog(env):providedCatalog;
 let sample=recent.slice(0,8),eligible=recent.length;
 if(catalog){
  await catalog.remember(recent);
  const selection=await catalog.sample([...stocks.keys()]);
  sample=selection.launches;eligible=selection.total;
 }
 if(!feedAvailable&&!sample.length)throw Error('The launch feed is unavailable and there are no saved candidates to check.');
 const rpc=serverRpcUrl(8453,env);
 let poolBatch;
 const poolIds=sample.map(l=>l.poolId).filter(id=>HASH.test(id||''));
 if(poolIds.length){
  try{
   const payload=await json(GECKO+'/networks/base/pools/multi/'+poolIds.join(','),fetchImpl,signal);
   if(Array.isArray(payload?.data))poolBatch=new Map(payload.data.map(p=>[p.id?.toLowerCase(),p]));
  }catch{}
 }
 const checked=await Promise.allSettled(sample.map(async l=>{
  const token=l.tokenAddress.toLowerCase(),quote=l.pairedStock.address.toLowerCase(),pool=l.poolId?.toLowerCase(),stock=stocks.get(quote);
  if(!HASH.test(pool||'')||!HASH.test(l.txHash||''))return null;
  const r=await receipt(l.txHash,fetchImpl,signal,rpc);
  if(r?.status!=='0x1'||r.transactionHash?.toLowerCase()!==l.txHash.toLowerCase()||!r.logs?.map(unpackInitialize).some(e=>e&&e.poolId===pool&&e.computedPoolId===pool&&[e.currency0,e.currency1].includes(token)&&[e.currency0,e.currency1].includes(quote)))return null;
  let market;
  try{market=await geckoPoolMarket(pool,token,quote,l,stock,fetchImpl,signal,poolBatch?(poolBatch.get('base_'+pool)||null):undefined);}catch{}
  if(!market || market.liquidityUsd==null || market.volumeUsd?.h24==null){
   try{
    const rows=await json(DEX+'/token-pairs/v1/base/'+token,fetchImpl,signal);
    const pair=rows.find(p=>p.chainId==='base'&&p.pairAddress?.toLowerCase()===pool&&[p.baseToken?.address?.toLowerCase(),p.quoteToken?.address?.toLowerCase()].sort().join() === [token,quote].sort().join());
    if(pair){
     const dexUrl='https://dexscreener.com/base/'+pool;
     const liquidity=market?.liquidityUsd??finite(pair.liquidity?.usd),volume=market?.volumeUsd?.h24??finite(pair.volume?.h24);
     market={liquidityUsd:liquidity,volumeUsd:{h24:volume},url:market?.url||dexUrl,liquiditySource:market?.liquidityUsd!=null?market.url:dexUrl,volumeSource:market?.volumeUsd?.h24!=null?market.url:dexUrl};
    }
   }catch{}
  }
  if(!market)return null;
  const clean=s=>String(s||'Token').replace(/[^\p{L}\p{N}._-]/gu,'').slice(0,24)||'Token';
  return {address:token,symbol:clean(l.tokenSymbol),stock:clean(stock.symbol),stockAddress:quote,pool,liquidity:market.liquidityUsd,volume:market.volumeUsd?.h24??null,source:market.url,liquiditySource:market.liquiditySource||market.url,volumeSource:market.volumeSource||market.url,receipt:'https://basescan.org/tx/'+l.txHash};
 }));
 if(catalog)await catalog.checked(sample.map(l=>l.tokenAddress.toLowerCase()));
 return {catalogEnabled:!!catalog,feedAvailable,checkedAt:new Date().toISOString(),listed:listed.length,eligible,checked:sample.length,rows:checked.flatMap(x=>x.status==='fulfilled'&&x.value?[x.value]:[]),feedUrl};
}
export async function discoverStockPairs(metric,options={}){
 if(!['liquidity','volume'].includes(metric))throw Error('Choose liquidity or 24-hour volume.');
 const custom=!!(options.fetchImpl||options.catalog||options.baseStockOptionsImpl);
 if(!custom&&(!discoveryScan||Date.now()>=discoveryScan.until)){
  const promise=scanStockPairs(options);
  discoveryScan={promise,until:Date.now()+60000};
  promise.catch(()=>{if(discoveryScan?.promise===promise)discoveryScan=null;});
 }
 const {rows,...coverage}=await (custom?scanStockPairs(options):discoveryScan.promise);
 const ranked=rows.filter(x=>Number.isFinite(x[metric])&&x[metric]>0).sort((a,b)=>b[metric]-a[metric]||a.address.localeCompare(b.address));
 return {...coverage,metric,comparable:ranked.length,candidates:ranked.slice(0,3)};
}
