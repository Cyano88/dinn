import {decodeEventLog,formatUnits,parseAbiItem,toEventSelector} from 'viem';
import {PONS_FACTORY} from './pons.mjs';
import {blockscoutRead} from './blockscout.mjs';

const launched=parseAbiItem('event TokenLaunched(address indexed token,address indexed curve,address indexed deployer,address pairToken,uint256 launchConfigId,uint256 graduationThreshold)');
const buy=parseAbiItem('event CurveBuy(address indexed buyer,address indexed recipient,uint256 quoteIn,uint256 tokensOut,uint256 fee,uint256 tax)');
const sell=parseAbiItem('event CurveSell(address indexed seller,address indexed recipient,uint256 tokensIn,uint256 quoteOut,uint256 fee,uint256 tax)');
const validAddress=v=>typeof v==='string'&&/^0x[0-9a-f]{40}$/i.test(v);
const same=(a,b)=>validAddress(a)&&validAddress(b)&&a.toLowerCase()===b.toLowerCase();
const validHash=v=>typeof v==='string'&&/^0x[0-9a-f]{64}$/i.test(v);
const explorer='https://robinhoodchain.blockscout.com';
const topic=event=>toEventSelector(event).toLowerCase();
const MAX_FACTORY_PAGES=20,MAX_CURVE_PAGES=80,PAGE_SIZE=100;

async function pageLogs(address,{env,fetchImpl,signal,read,cursor}){
 const result=await read('addresses/'+address+'/logs',{env,fetchImpl,signal,query:{items_count:String(PAGE_SIZE),...(cursor||{})}});
 if(!Array.isArray(result?.items))throw Error('Blockscout returned an unexpected event-log page.');
 return result;
}

function logAddress(log){
 const value=log?.address;
 return typeof value==='string'?value:value?.hash||log?.address_hash||null;
}

async function launchFromCreationTransaction(address,curve,checkedBlock,{env,fetchImpl,signal,read}){
 const metadata=await read('addresses/'+address,{env,fetchImpl,signal});
 const hash=metadata?.creation_transaction_hash;
 if(!same(metadata?.hash,address)||!validHash(hash)||metadata?.creation_status&&metadata.creation_status!=='success')return null;
 let cursor=null;
 for(let page=0;page<4;page++){
  const result=await read('transactions/'+hash+'/logs',{env,fetchImpl,signal,query:{items_count:String(PAGE_SIZE),...(cursor||{})}});
  if(!Array.isArray(result?.items))throw Error('Blockscout returned unexpected creation-transaction logs.');
  for(const log of result.items){
   const block=Number(log.block_number);
   if(!Number.isSafeInteger(block)||BigInt(block)>checkedBlock||!same(logAddress(log),PONS_FACTORY)||!Array.isArray(log.topics)||String(log.topics[0]).toLowerCase()!==topic(launched))continue;
   try{const event=decodeEventLog({abi:[launched],data:log.data,topics:log.topics});if(same(event.args.token,address)&&same(event.args.curve,curve))return {log,blockNumber:BigInt(block),event:event.args,transactionHash:hash};}catch{}
  }
  const next=result.next_page_params;
  if(next===null||next===undefined||!Object.keys(next).length)return {notFound:true,complete:true};
  cursor=safeCursor(next);if(!cursor)throw Error('Blockscout returned an unsupported creation-log cursor.');
 }
 return {notFound:true,complete:false};
}

function safeCursor(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const allowed=new Set(['block_number','index','items_count']);
 const pairs=Object.entries(value);
 if(!pairs.length||pairs.some(([key,v])=>!allowed.has(key)||!(typeof v==='number'||typeof v==='string')||String(v).length>40||!/^\d+$/.test(String(v))))return null;
 return Object.fromEntries(pairs.map(([key,v])=>[key,String(v)]));
}

async function findLaunch(address,curve,checkedBlock,{env,fetchImpl,signal,read}){
 try{
  const direct=await launchFromCreationTransaction(address,curve,checkedBlock,{env,fetchImpl,signal,read});
  if(direct)return direct;
 }catch{}
 let cursor=null;
 for(let page=0;page<MAX_FACTORY_PAGES;page++){
  const result=await pageLogs(PONS_FACTORY,{env,fetchImpl,signal,read,cursor});
  for(const log of result.items){
   const block=Number(log.block_number);
   if(!Number.isSafeInteger(block)||BigInt(block)>checkedBlock||!same(logAddress(log),PONS_FACTORY)||!Array.isArray(log.topics)||String(log.topics[0]).toLowerCase()!==topic(launched))continue;
   try{const event=decodeEventLog({abi:[launched],data:log.data,topics:log.topics});if(same(event.args.token,address)&&same(event.args.curve,curve))return {log,blockNumber:BigInt(block),event:event.args,transactionHash:log.transaction_hash};}catch{}
  }
  const next=result.next_page_params;
  if(next===null||next===undefined||!Object.keys(next).length)return {notFound:true,complete:true};
  cursor=safeCursor(next);if(!cursor)throw Error('Blockscout returned an unsupported launch-log cursor.');
 }
 return {notFound:true,complete:false};
}

async function curveEvents(curve,launchBlock,checkedBlock,{env,fetchImpl,signal,read}){
 let cursor=null;const logs=[];let complete=false;
 for(let page=0;page<MAX_CURVE_PAGES;page++){
  const result=await pageLogs(curve,{env,fetchImpl,signal,read,cursor});
  for(const log of result.items){
   const n=Number(log.block_number);if(!Number.isSafeInteger(n))continue;const block=BigInt(n);
   if(block>checkedBlock)continue;
   if(block<launchBlock){complete=true;break;}
   if(!same(logAddress(log),curve)||!Array.isArray(log.topics))continue;
   const eventTopic=String(log.topics[0]).toLowerCase();
   if(eventTopic!==topic(buy)&&eventTopic!==topic(sell))continue;
   const abi=eventTopic===topic(buy)?buy:sell;
   try{const decoded=decodeEventLog({abi:[abi],data:log.data,topics:log.topics});logs.push({eventName:eventTopic===topic(buy)?'CurveBuy':'CurveSell',args:decoded.args,blockNumber:block,transactionHash:log.transaction_hash});}catch{}
  }
  if(complete)break;
  const next=result.next_page_params;
  if(next===null||next===undefined||!Object.keys(next).length){complete=true;break;}
  cursor=safeCursor(next);if(!cursor)throw Error('Blockscout returned an unsupported curve-log cursor.');
 }
 return {logs,complete};
}

const emptyActivity=address=>({address,buys:0,sells:0,buyTokens:'0',sellTokens:'0',buyQuote:'0',sellQuote:'0',lastTradeBlock:null,lastTradeHash:null});

/** Full Pons v2 curve event history, bounded to the verified launch through the checked block. */
export async function researchPonsHistory({address,curve,phase,tokenDecimals,pairDecimals,pairSymbol,blockNumber,checkedAt,holders=[],env=process.env,fetchImpl=fetch,signal,read=blockscoutRead}={}){
 const checked=BigInt(blockNumber),base={status:'unavailable',source:'Pons v2 factory and curve events indexed by Blockscout',checkedBlock:String(checked),launchBlock:null,launchTransactionHash:null,launchedAt:null,ageSeconds:null,age:'unavailable',curve:{status:'unavailable',buyCount:null,sellCount:null,tradeCount:null,buyVolume:null,sellVolume:null,totalVolume:null,scannedBuyCount:null,scannedSellCount:null,scannedTradeCount:null,scannedBuyVolume:null,scannedSellVolume:null,scannedVolume:null,baseAndSnipeFees:null,creatorTax:null,totalFees:null,scannedFees:null,pairSymbol},holderActivity:[],coverage:'unavailable',sourceUrls:[explorer+'/address/'+PONS_FACTORY+'/logs',validAddress(curve)?explorer+'/address/'+curve+'/logs':null,'https://docs.ponsfamily.com/v2'].filter(Boolean)};
 if(!validAddress(address)||!validAddress(curve)||!Number.isInteger(tokenDecimals)||tokenDecimals<0||tokenDecimals>36||!Number.isInteger(pairDecimals)||pairDecimals<0||pairDecimals>36||checked<0n)return {...base,reason:'Token, curve, decimals or report block could not be verified.'};
 let launch;
 try{launch=await findLaunch(address,curve,checked,{env,fetchImpl,signal,read});}
 catch{return {...base,reason:'Pons launch event history could not be queried; launch age and curve history remain unknown.'};}
 if(!launch||launch.notFound)return {...base,reason:launch?.complete?'No factory launch event matching both this token and its verified curve was found.':'The launch event was not found within the bounded factory-log scan.'};
 const launchBlock=launch.blockNumber,launchHash=validHash(launch.transactionHash)?launch.transactionHash:null;
 let launchAt=null;
 try{const block=await read('blocks/'+launchBlock.toString(),{env,fetchImpl,signal});const height=BigInt(block?.height);const stamp=typeof block?.timestamp==='number'&&block.timestamp<100000000000?block.timestamp*1000:Date.parse(block?.timestamp);if(height!==launchBlock||!Number.isFinite(stamp))throw Error();launchAt=new Date(stamp).toISOString();}catch{}
 let scan;
 try{scan=await curveEvents(curve,launchBlock,checked,{env,fetchImpl,signal,read});}
 catch{return {...base,launchBlock:String(launchBlock),launchTransactionHash:launchHash,sourceUrls:launchHash?[...base.sourceUrls,explorer+'/tx/'+launchHash]:base.sourceUrls,launchedAt:launchAt,ageSeconds:launchAt?Math.floor(Math.max(0,(Number.isFinite(Date.parse(checkedAt))?Date.parse(checkedAt):Date.now())-Date.parse(launchAt))/1000):null,age:launchAt?formatAge((Number.isFinite(Date.parse(checkedAt))?Date.parse(checkedAt):Date.now())-Date.parse(launchAt)):'unavailable',reason:'The launch is verified, but curve trade logs could not be read.'};}
 const tradeLogs=scan.logs,holdersByAddress=new Map(),holderRows=await Promise.resolve(holders).catch(()=>[]);
 for(const holder of Array.isArray(holderRows)?holderRows:[])if(validAddress(holder?.address))holdersByAddress.set(holder.address.toLowerCase(),emptyActivity(holder.address));
 let buyCount=0,sellCount=0,buyQuote=0n,sellQuote=0n,buyTokens=0n,sellTokens=0n,baseAndSnipeFees=0n,creatorTax=0n;
 for(const log of tradeLogs){const a=log.args||{};if(log.eventName==='CurveBuy'){buyCount++;buyQuote+=BigInt(a.quoteIn);buyTokens+=BigInt(a.tokensOut);baseAndSnipeFees+=BigInt(a.fee);creatorTax+=BigInt(a.tax);}else{sellCount++;sellQuote+=BigInt(a.quoteOut);sellTokens+=BigInt(a.tokensIn);baseAndSnipeFees+=BigInt(a.fee);creatorTax+=BigInt(a.tax);}}
 const holderTotals=new Map();
 for(const log of tradeLogs){const a=log.args||{},actor=log.eventName==='CurveBuy'?a.recipient:log.eventName==='CurveSell'?a.seller:null;if(!validAddress(actor))continue;const key=actor.toLowerCase();if(!holdersByAddress.has(key))continue;let h=holderTotals.get(key);if(!h){h={buys:0,sells:0,buyTokens:0n,sellTokens:0n,buyQuote:0n,sellQuote:0n,lastTradeBlock:0n,lastTradeHash:null};holderTotals.set(key,h);}if(log.blockNumber>=h.lastTradeBlock){h.lastTradeBlock=log.blockNumber;h.lastTradeHash=validHash(log.transactionHash)?log.transactionHash:null;}if(log.eventName==='CurveBuy'){h.buys++;h.buyTokens+=BigInt(a.tokensOut);h.buyQuote+=BigInt(a.quoteIn);}else{h.sells++;h.sellTokens+=BigInt(a.tokensIn);h.sellQuote+=BigInt(a.quoteOut);}}
 const activity=[...holdersByAddress.values()].map(holder=>{const h=holderTotals.get(holder.address.toLowerCase());return h?{...holder,buys:h.buys,sells:h.sells,buyTokens:formatUnits(h.buyTokens,tokenDecimals),sellTokens:formatUnits(h.sellTokens,tokenDecimals),buyQuote:formatUnits(h.buyQuote,pairDecimals),sellQuote:formatUnits(h.sellQuote,pairDecimals),lastTradeBlock:h.lastTradeBlock.toString(),lastTradeHash:h.lastTradeHash,sourceUrl:h.lastTradeHash?explorer+'/tx/'+h.lastTradeHash:null}:holder;});
 const holderEventSummary={indexedAddresses:activity.length,addressesWithBuys:activity.filter(x=>x.buys>0).length,addressesWithSells:activity.filter(x=>x.sells>0).length,buyEvents:activity.reduce((n,x)=>n+x.buys,0),sellEvents:activity.reduce((n,x)=>n+x.sells,0),scope:'Cumulative Pons curve events from the verified launch through the checked block, matched to the current indexed top-holder sample. This is not a recent 30-day wallet-history count; addresses may be contracts and are not identities.'};
 const ageMs=launchAt?Math.max(0,(Number.isFinite(Date.parse(checkedAt))?Date.parse(checkedAt):Date.now())-Date.parse(launchAt)):null,curveVolume=buyQuote+sellQuote,totalFees=baseAndSnipeFees+creatorTax,curveComplete=scan.complete,postGraduation=Number(phase)===2||Number(phase)===3;
 const coverage=curveComplete?(postGraduation?'Complete Pons curve history through curve completion. Post-graduation Uniswap v4 pool trading is not included.':'Complete Pons curve history from launch through the checked block. Post-graduation Uniswap v4 pool trading is not included.'):'Partial Pons curve scan. Reported amounts are lower bounds, not all-time totals; post-graduation Uniswap v4 trading is also not included.';
 return {...base,status:curveComplete&&launchAt?'available':'partial',launchBlock:String(launchBlock),launchTransactionHash:launchHash,sourceUrls:launchHash?[...base.sourceUrls,explorer+'/tx/'+launchHash]:base.sourceUrls,launchedAt:launchAt,ageSeconds:ageMs===null?null:Math.floor(ageMs/1000),age:ageMs===null?'unavailable':formatAge(ageMs),curve:{status:curveComplete?'complete-to-checked-block':'partial curve history; post-graduation or unscanned logs are excluded',buyCount:curveComplete?buyCount:null,sellCount:curveComplete?sellCount:null,tradeCount:curveComplete?buyCount+sellCount:null,buyVolume:curveComplete?formatUnits(buyQuote,pairDecimals):null,sellVolume:curveComplete?formatUnits(sellQuote,pairDecimals):null,totalVolume:curveComplete?formatUnits(curveVolume,pairDecimals):null,scannedBuyCount:curveComplete?null:buyCount,scannedSellCount:curveComplete?null:sellCount,scannedTradeCount:curveComplete?null:buyCount+sellCount,scannedBuyVolume:curveComplete?null:formatUnits(buyQuote,pairDecimals),scannedSellVolume:curveComplete?null:formatUnits(sellQuote,pairDecimals),scannedVolume:curveComplete?null:formatUnits(curveVolume,pairDecimals),baseAndSnipeFees:curveComplete?formatUnits(baseAndSnipeFees,pairDecimals):null,creatorTax:curveComplete?formatUnits(creatorTax,pairDecimals):null,totalFees:curveComplete?formatUnits(totalFees,pairDecimals):null,scannedFees:curveComplete?null:formatUnits(totalFees,pairDecimals),pairSymbol},holderEventSummary,holderActivity:activity,coverage,reason:curveComplete?(launchAt?null:'The launch event is verified, but the indexed block timestamp was unavailable.'):'The full curve event range was not covered within the bounded scan.'};
}

function formatAge(ms){const hours=Math.floor(Math.max(0,ms)/3600000),days=Math.floor(hours/24);return days?days+'d '+(hours%24)+'h':hours+'h';}
