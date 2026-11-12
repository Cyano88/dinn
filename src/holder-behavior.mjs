import {formatUnits,parseUnits} from 'viem';
import {blockscoutRead} from './blockscout.mjs';

const validAddress=value=>typeof value==='string'&&/^0x[0-9a-f]{40}$/i.test(value);
const validHash=value=>typeof value==='string'&&/^0x[0-9a-f]{64}$/i.test(value);
const same=(a,b)=>validAddress(a)&&validAddress(b)&&a.toLowerCase()===b.toLowerCase();
const integer=value=>typeof value==='string'&&/^\d{1,78}$/.test(value);
const addressOf=value=>typeof value==='string'?value:value?.hash;
const MAX_WALLETS=5,MAX_PAGES=3,PAGE_SIZE=20,MAX_SWAP_CALLS=3,WINDOW_DAYS=30;
const transactionUrl=hash=>'https://robinhoodchain.blockscout.com/tx/'+hash;

function safeCursor(params){
 if(!params||typeof params!=='object'||Array.isArray(params))return null;
 const allowed=new Set(['block_number','index','items_count','transaction_hash']);
 const entries=Object.entries(params);if(!entries.length||entries.some(([key,value])=>!allowed.has(key)||!(typeof value==='string'||typeof value==='number')||String(value).length>120))return null;
 return Object.fromEntries(entries.map(([key,value])=>[key,String(value)]));
}
function hasMorePages(result){
 const next=result?.next_page_params;
 return next!==null&&next!==undefined&&(!(typeof next==='object')||Array.isArray(next)||Object.keys(next).length>0);
}

function swapLike(method){
 if(typeof method!=='string')return false;
 const name=method.replace(/\(.*/, '').replace(/[^a-z0-9]/gi,'').toLowerCase();
 return name==='swap'||name.startsWith('swapexact')||name.startsWith('swaptokens')||name.startsWith('swapeth')||name.startsWith('exactinput')||name.startsWith('exactoutput')||['buy','sell','buytoken','selltoken'].includes(name)||name.startsWith('buyexact')||name.startsWith('sellexact');
}

function formatFlow(item,wallet){
 const from=addressOf(item?.from),to=addressOf(item?.to),token=item?.token;
 const tokenAddress=token?.address||token?.address_hash,raw=item?.total?.value,decimals=Number(item?.total?.decimals??token?.decimals);
 if(!validAddress(tokenAddress)||!integer(raw)||!Number.isInteger(decimals)||decimals<0||decimals>255)return null;
 const direction=same(from,wallet)?'out':same(to,wallet)?'in':null;if(!direction)return null;
 return {tokenAddress:tokenAddress.toLowerCase(),symbol:typeof token.symbol==='string'?token.symbol.replace(/[\x00-\x1f\x7f-\x9f]/g,'').slice(0,24):null,decimals,raw:BigInt(raw),direction};
}

function formatNativeFlow(item,wallet){
 const from=addressOf(item?.from),to=addressOf(item?.to),raw=item?.value;
 if(!validAddress(from)||!validAddress(to)||!integer(raw)||BigInt(raw)===0n)return null;
 const direction=same(from,wallet)?'out':same(to,wallet)?'in':null;if(!direction)return null;
 return {symbol:'ETH',amount:formatUnits(BigInt(raw),18),direction};
}

async function inspectWallet(address,{tokenAddress,tokenDecimals,checkedAtMs,windowStartMs,snapshotBlockNumber,env,fetchImpl,signal,read}){
 const trades=[];let cursor=null,pages=0,transactionsSeen=0,oldestTimestampMs=null,coverageComplete=false,partialReason=null,swapCallsCapped=false,undecodedContractCalls=0;
 try{
  for(;pages<MAX_PAGES;pages++){
   const result=await read('addresses/'+address+'/transactions',{env,fetchImpl,signal,query:{filter:'from',items_count:String(PAGE_SIZE),...(cursor||{})}});
   if(!Array.isArray(result?.items))throw Error('Blockscout returned an unexpected transaction-history response.');
   transactionsSeen+=result.items.length;
   const ordered=[...result.items].sort((a,b)=>Date.parse(b.timestamp||'')-Date.parse(a.timestamp||''));
   for(const transaction of ordered){
    const hash=transaction?.hash||transaction?.transaction_hash,block=Number(transaction?.block_number),timestampMs=Date.parse(transaction?.timestamp||'');
    if(!Number.isSafeInteger(block)||block>snapshotBlockNumber||!Number.isFinite(timestampMs)||timestampMs>checkedAtMs)continue;
    oldestTimestampMs=oldestTimestampMs===null?timestampMs:Math.min(oldestTimestampMs,timestampMs);
    if(timestampMs<windowStartMs)continue;
    if(!same(addressOf(transaction.from),address)||!validHash(hash)||!['ok','success'].includes(String(transaction.status||'').toLowerCase()))continue;
    const method=typeof transaction.method==='string'?transaction.method.trim():'';
    if((!method||method==='-'||method.toLowerCase()==='unknown')&&transaction.to?.is_contract===true){undecodedContractCalls++;continue;}
    if(!swapLike(method))continue;
    if(trades.length>=MAX_SWAP_CALLS){swapCallsCapped=true;continue;}
    let transfers;
    try{transfers=await read('transactions/'+hash+'/token-transfers',{env,fetchImpl,signal});}
    catch{partialReason='At least one candidate swap could not be enriched with its token-transfer legs.';continue;}
    if(!Array.isArray(transfers?.items)){partialReason='At least one candidate swap returned an unexpected token-transfer response.';continue;}
    if(hasMorePages(transfers))partialReason=partialReason||'A candidate swap has additional token-transfer pages outside the bounded lookup.';
    const aggregated=new Map();
    for(const item of transfers.items){
     const flow=formatFlow(item,address);if(!flow)continue;
     if(same(flow.tokenAddress,tokenAddress)&&flow.decimals!==tokenDecimals){partialReason='A target-token transfer reported decimals that did not match the token contract.';continue;}
     const key=flow.tokenAddress+'|'+flow.direction;const prior=aggregated.get(key);
     if(prior&&prior.decimals!==flow.decimals){partialReason='A token transfer reported inconsistent decimals for one contract.';continue;}
     if(prior)prior.raw+=flow.raw;else aggregated.set(key,{tokenAddress:flow.tokenAddress,symbol:flow.symbol,decimals:flow.decimals,raw:flow.raw,direction:flow.direction});
    }
    const flows=[...aggregated.values()].map(flow=>({tokenAddress:flow.tokenAddress,symbol:flow.symbol,amount:formatUnits(flow.raw,flow.decimals),direction:flow.direction}));
    const nativeFlows=[];const transactionValue=integer(String(transaction.value??''))?BigInt(transaction.value):0n;if(transactionValue>0n)nativeFlows.push({symbol:'ETH',amount:formatUnits(transactionValue,18),direction:'out'});
    let incoming=flows.some(flow=>flow.direction==='in'),outgoing=flows.some(flow=>flow.direction==='out')||nativeFlows.some(flow=>flow.direction==='out');
    if(!(incoming&&outgoing)&&flows.length){
     let internal;
     try{internal=await read('transactions/'+hash+'/internal-transactions',{env,fetchImpl,signal});}
     catch{partialReason=partialReason||'A one-sided swap-like call could not be checked for native ETH transfer legs.';internal=null;}
     if(internal&&!Array.isArray(internal.items)){partialReason=partialReason||'A native-asset transfer lookup returned an unexpected response.';}
     if(hasMorePages(internal))partialReason=partialReason||'A candidate swap has additional native-asset transfer pages outside the bounded lookup.';
     for(const item of (Array.isArray(internal?.items)?internal.items:[])){const flow=formatNativeFlow(item,address);if(flow)nativeFlows.push(flow);}
     incoming=flows.some(flow=>flow.direction==='in')||nativeFlows.some(flow=>flow.direction==='in');
     outgoing=flows.some(flow=>flow.direction==='out')||nativeFlows.some(flow=>flow.direction==='out');
    }
    const targetFlows=flows.filter(flow=>same(flow.tokenAddress,tokenAddress)),targetReceived=targetFlows.filter(flow=>flow.direction==='in').reduce((sum,flow)=>sum+parseUnits(flow.amount,tokenDecimals),0n),targetSent=targetFlows.filter(flow=>flow.direction==='out').reduce((sum,flow)=>sum+parseUnits(flow.amount,tokenDecimals),0n);
    const classification=incoming&&outgoing?'two-sided swap candidate':'swap-like call; token-leg evidence incomplete';
    const targetAction=classification!=='two-sided swap candidate'?'unconfirmed':targetReceived>0n&&targetSent===0n?'target-token buy candidate':targetSent>0n&&targetReceived===0n?'target-token sell candidate':targetReceived>0n&&targetSent>0n?'mixed target-token flow':'other-token activity';
    trades.push({transactionHash:hash,transactionUrl:transactionUrl(hash),blockNumber:String(block),timestamp:new Date(timestampMs).toISOString(),method:method.replace(/[\x00-\x1f\x7f-\x9f]/g,'').slice(0,80),classification,targetTokenAction:targetAction,targetTokenReceived:formatUnits(targetReceived,tokenDecimals),targetTokenSent:formatUnits(targetSent,tokenDecimals),tokenFlows:flows,nativeFlows});
   }
   const next=result.next_page_params;
   const nextCursor=safeCursor(next);
   if(next===null||next===undefined||oldestTimestampMs!==null&&oldestTimestampMs<=windowStartMs){coverageComplete=true;break;}
   if(typeof next!=='object'||Array.isArray(next)){partialReason=partialReason||'The explorer returned an unsupported pagination cursor.';break;}
   if(!Object.keys(next).length){coverageComplete=true;break;}
   if(!nextCursor){partialReason=partialReason||'The explorer returned an unsupported pagination cursor.';break;}
   cursor=nextCursor;
  }
  if(pages>=MAX_PAGES&&!coverageComplete)partialReason=partialReason||'The 30-day window exceeded the bounded transaction-page limit.';
  if(swapCallsCapped)partialReason=partialReason||'More than three swap-like calls were found; only the latest three were enriched.';
  if(undecodedContractCalls)partialReason=partialReason||'One or more successful contract calls had no decoded method; swap activity may be missing.';
  return {address,sourceUrl:'https://robinhoodchain.blockscout.com/address/'+address+'?tab=txs',status:coverageComplete&&!partialReason?'available':'partial',windowDays:WINDOW_DAYS,windowStart:new Date(windowStartMs).toISOString(),windowEnd:new Date(checkedAtMs).toISOString(),transactionsSeen,firstObservedTransactionAt:oldestTimestampMs===null?null:new Date(oldestTimestampMs).toISOString(),coverageComplete,undecodedContractCalls,swapLikeCallsEnriched:trades.length,swapCallsCapped,recentSwaps:trades,reason:partialReason};
 }catch(error){
  return {address,sourceUrl:'https://robinhoodchain.blockscout.com/address/'+address+'?tab=txs',status:'unavailable',windowDays:WINDOW_DAYS,windowStart:new Date(windowStartMs).toISOString(),windowEnd:new Date(checkedAtMs).toISOString(),transactionsSeen,firstObservedTransactionAt:oldestTimestampMs===null?null:new Date(oldestTimestampMs).toISOString(),coverageComplete:false,undecodedContractCalls,swapLikeCallsEnriched:trades.length,recentSwaps:trades,reason:error.message};
 }
}

export async function researchHolderBehavior({tokenAddress,tokenDecimals,rows,blockNumber,checkedAt,env=process.env,fetchImpl=fetch,signal,read=blockscoutRead,maxWallets=MAX_WALLETS}={}){
 const checkedAtMs=Date.parse(checkedAt),snapshotBlockNumber=Number(blockNumber);
 const policy='Continue to simulation only when complete sampled histories show greater target-token buy-candidate flow than sell-candidate flow across at least three distinct current-holder addresses. Pause for review only when sell-candidate flow is greater across at least two sampled holders. Otherwise require manual review or more evidence. This triage is not a buy recommendation and executes no action.';
 const base={chainId:4663,source:'Blockscout address transactions, transaction token transfers, and native ETH transaction/internal-transfer data',windowDays:WINDOW_DAYS,scope:'Latest outbound transactions from up to five externally owned addresses among the top 10 indexed holder candidates. This is not a complete holder or trading history.',classification:'A swap candidate requires a successful decoded swap-like method and observed incoming and outgoing asset legs. Legs can be ERC-20 transfers or native ETH; a candidate is not proof of profitable trading or future conviction.',status:'unavailable',rows:[],excludedContractCandidates:0,summary:{walletsAnalyzed:0,walletsWithSwapCandidates:0,swapLikeCallsEnriched:0,assetsSeen:[],completeWalletHistories:0,targetTokenBuyCandidates:null,targetTokenSellCandidates:null,targetTokenBuyWallets:0,targetTokenSellWallets:0,targetTokenBuyAmount:null,targetTokenSellAmount:null,holderSignal:'insufficient evidence',nextStep:'manual_review',policy},reason:null};
 if(!validAddress(tokenAddress)||!Number.isInteger(tokenDecimals)||tokenDecimals<0||tokenDecimals>36||!Array.isArray(rows)||!Number.isSafeInteger(snapshotBlockNumber)||!Number.isFinite(checkedAtMs)){return {...base,reason:'Token address, decimals, holder rows, or checked block time are unavailable.'};}
 const candidates=rows.filter(row=>!row.infrastructure&&!row.sink&&validAddress(row.address));
 const wallets=candidates.filter(row=>row.walletType==='externally-owned').slice(0,Math.min(MAX_WALLETS,Math.max(1,maxWallets)));
 base.excludedContractCandidates=candidates.length-wallets.length;
 if(!wallets.length){return {...base,reason:candidates.length?'No externally owned addresses were found among the sampled candidates; contract and smart-account activity is not attributed to a person.':'No non-infrastructure holder candidates were available.'};}
 const windowStartMs=checkedAtMs-WINDOW_DAYS*86400000;
 let cursor=0;const histories=[];
 await Promise.all(Array.from({length:Math.min(2,wallets.length)},async()=>{while(cursor<wallets.length){const index=cursor++;histories[index]=await inspectWallet(wallets[index].address,{tokenAddress,tokenDecimals,checkedAtMs,windowStartMs,snapshotBlockNumber,env,fetchImpl,signal,read});}}));
 const complete=histories.filter(item=>item.status==='available');
 const assets=new Map();for(const history of histories)for(const trade of history.recentSwaps)for(const flow of trade.tokenFlows){const token=flow.tokenAddress;if(!assets.has(token))assets.set(token,flow.symbol);}
 const swapLikeCallsEnriched=histories.reduce((n,item)=>n+item.swapLikeCallsEnriched,0),candidateTrades=histories.flatMap(item=>item.recentSwaps).filter(trade=>trade.classification==='two-sided swap candidate'),buyTrades=candidateTrades.filter(trade=>trade.targetTokenAction==='target-token buy candidate'),sellTrades=candidateTrades.filter(trade=>trade.targetTokenAction==='target-token sell candidate'),buyWallets=new Set(buyTrades.map(trade=>histories.find(item=>item.recentSwaps.includes(trade))?.address).filter(Boolean)),sellWallets=new Set(sellTrades.map(trade=>histories.find(item=>item.recentSwaps.includes(trade))?.address).filter(Boolean));
 const buyAmount=buyTrades.reduce((sum,trade)=>sum+parseUnits(trade.targetTokenReceived,tokenDecimals),0n),sellAmount=sellTrades.reduce((sum,trade)=>sum+parseUnits(trade.targetTokenSent,tokenDecimals),0n);
 let holderSignal='insufficient evidence',nextStep='manual_review';
 if(complete.length===histories.length){
  if(buyAmount>sellAmount&&buyWallets.size>=3){holderSignal='more target-token buy candidates than sell candidates in the sample';nextStep='continue_to_simulation';}
  else if(sellAmount>buyAmount&&sellWallets.size>=2){holderSignal='more target-token sell candidates than buy candidates in the sample';nextStep='pause_for_review';}
  else if(buyAmount===0n&&sellAmount===0n){holderSignal='no target-token swap candidates observed';nextStep='insufficient_evidence';}
  else{holderSignal='mixed or low-coverage target-token activity';nextStep='manual_review';}
 }
 return {...base,status:complete.length===histories.length?'available':'partial',checkedAt,windowStart:new Date(windowStartMs).toISOString(),snapshotBlock:String(snapshotBlockNumber),rows:histories,summary:{walletsAnalyzed:histories.length,walletsWithSwapCandidates:histories.filter(item=>item.recentSwaps.some(trade=>trade.classification==='two-sided swap candidate')).length,swapLikeCallsEnriched,assetsSeen:[...assets].map(([address,symbol])=>({address,symbol})),completeWalletHistories:complete.length,targetTokenBuyCandidates:buyTrades.length,targetTokenSellCandidates:sellTrades.length,targetTokenBuyWallets:buyWallets.size,targetTokenSellWallets:sellWallets.size,targetTokenBuyAmount:formatUnits(buyAmount,tokenDecimals),targetTokenSellAmount:formatUnits(sellAmount,tokenDecimals),holderSignal,nextStep,policy},reason:complete.length===histories.length?null:'Some wallet histories are unavailable or incomplete; absence of a report is not evidence of inactivity.'};
}
