import {issuerStock} from './xlayer-issuer.mjs';
import {baseStockOptions} from './base-stock-data.mjs';
import {b20Snapshot} from './base-stock-research.mjs';
import {robinhoodStock} from './robinhood-stock.mjs';
import {ponsPair} from './pons-pairs.mjs';
import {equityContext} from './equity-context.mjs';
import {equityNames} from '../public/pons-equities.js';

const venue='https://web3.okx.com/api/v6/explorer/tsv';
const manager='0x360e68faccca8ca495c1b759fd9eee466db9fb32';
const hook='0xf151416e74d6b4ae00197e8d8e4f4765283b3fff';
const swap='0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f';
const hash=/^0x[0-9a-f]{64}$/i;
const address=/^0x[0-9a-f]{40}$/i;

export function stockCode(query){
 const name=query.trim().toLowerCase();
 const matches=Object.entries(equityNames).filter(([ticker,names])=>
  ticker.toLowerCase()===name || names.some(alias=>alias.toLowerCase()===name));
 if(matches.length===1)return matches[0][0];
 if(!/^[a-z][a-z0-9 .-]{0,59}$/i.test(name))throw Error('Use an exact company name or stock ticker.');
 return name.toUpperCase();
}

async function read(url,fetchImpl,options){
 const response=await fetchImpl(url,{...options,signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('X Layer data source unavailable.');
 return response.json();
}

export async function stockPools(query,fetchImpl=fetch){
 const symbol=stockCode(query);
 const source=venue+'/asset-list?stockCode='+encodeURIComponent(symbol);
 const body=await read(source,fetchImpl);
 const pools=body.data?.[0]?.assetInfo;
 if(body.code!=='0'||!Array.isArray(pools)||!pools.every(p=>p.stockSymbol===symbol&&
  hash.test(p.poolId)&&address.test(p.stockTokenAddress)&&/^[A-Z0-9.-]{1,20}$/i.test(p.paymentSymbol)))
  throw Error('The OKX stock pool directory could not be verified.');
 return {symbol,source,pools};
}

export async function xLayerTarget(query,fetchImpl=fetch){
 const input=stockCode(query);
 let issuer,issuerUnavailable=false;
 try{issuer=await issuerStock(input,fetchImpl);}catch{issuerUnavailable=true;}
 const symbol=issuer?.symbol||input;
 let directory;
 try{directory=await stockPools(symbol,fetchImpl);}
 catch{
  if(!issuer?.identity)throw Error('X Layer stock sources unavailable.');
  directory={symbol,pools:[],source:venue+'/asset-list?stockCode='+encodeURIComponent(symbol),poolStatus:'unavailable'};
 }
 if(issuerUnavailable&&!directory.pools.length)throw Error('Stock issuer verification unavailable.');
 return {...directory,query,issuerIdentity:issuer?.identity||null,issuerStatus:issuerUnavailable?'unavailable':issuer?.identity?'verified':'no_match'};
}

async function recentTrade(pool,fetchImpl){
 const url=venue+'/transaction-list?limit=1&poolId='+pool.poolId;
 const body=await read(url,fetchImpl);
 const rows=body.data?.[0]?.transactionList;
 if(body.code!=='0'||!Array.isArray(rows))throw Error('Trade history unavailable.');
 if(!rows.length)return {status:'no_recent_record',source:url};
 const trade=rows[0];
 if(trade.poolId!==pool.poolId||trade.stockSymbol!==pool.stockSymbol||
    trade.stockTokenAddress?.toLowerCase()!==pool.stockTokenAddress.toLowerCase()||
    trade.paymentSymbol!==pool.paymentSymbol||trade.poolManager?.toLowerCase()!==manager||
    trade.hook?.toLowerCase()!==hook||!hash.test(trade.txHash)||!/^\d+$/.test(trade.logIndex))
  throw Error('Trade identity mismatch.');
 const rpc=async(method,params)=>(await read('https://rpc.xlayer.tech',fetchImpl,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})})).result;
 const [chain,receipt]=await Promise.all([rpc('eth_chainId',[]),rpc('eth_getTransactionReceipt',[trade.txHash])]);
 if(chain!=='0xc4'||receipt?.status!=='0x1'||receipt.transactionHash?.toLowerCase()!==trade.txHash.toLowerCase()||
    !receipt.logs?.some(log=>log.address?.toLowerCase()===manager&&Number(log.logIndex)===Number(trade.logIndex)&&
     log.topics?.[0]===swap&&log.topics[1]===pool.poolId&&!log.removed))throw Error('Swap receipt mismatch.');
 return {status:'receipt_matched',transaction:trade.txHash,block:receipt.blockNumber,source:url,
  explorer:'https://www.oklink.com/xlayer/tx/'+trade.txHash};
}

export async function stockLaunchOptions(symbol,{fetchImpl=fetch,env=process.env,baseCatalog=baseStockOptions,
 verifyBase=b20Snapshot,rhStock=robinhoodStock,verifyPons=ponsPair}={}){
 const base=async()=>{
  const catalog=await baseCatalog({fetchImpl});
  if(catalog.chainId!==8453||catalog.sources?.coinbase?.status!=='available'||catalog.sources?.bankr?.status!=='available')return;
  const matches=catalog.stocks.filter(row=>row.bankrPairSupported&&row.coinbase?.chainId===8453&&
   row.address===row.coinbase.address&&row.coinbase.symbol===symbol+'c');
  if(matches.length!==1)return;
  const {address,coinbase}=matches[0];
  const verified=await verifyBase(address,coinbase,{fetchImpl,env,signal:AbortSignal.timeout(15000)});
  if(verified.identityStatus==='matched'&&verified.address===address)
   return {chainId:8453,chain:'Base',launchpad:'Bankr',pairSymbol:coinbase.symbol,address};
 };
 const robinhood=async()=>{
  const stock=await rhStock(symbol,fetchImpl);
  const approved=await verifyPons({pairToken:stock.address});
  if(approved.chainId===4663&&approved.symbol===symbol&&approved.address.toLowerCase()===stock.address.toLowerCase())
   return {chainId:4663,chain:'Robinhood Chain',launchpad:'Pons',pairSymbol:symbol,address:stock.address};
 };
 const checks=await Promise.allSettled([base(),robinhood()]);
 return {xLayer:'coming_soon',routes:checks.flatMap(check=>check.status==='fulfilled'&&check.value?[check.value]:[])};
}

export function launchGuidance(options){
 const routes=options.routes.map(r=>r.chain+' with '+r.launchpad+' ('+r.pairSymbol+')');
 return 'Launching on X Layer is coming soon.'+(routes.length?
  ' Want to turn this research into a community token? Open [Dinn Chat](https://dinnlabs.com/) and choose '+routes.join(' or ')+'.':
  ' Dinn could not confirm a launch pair for this stock on Base or Robinhood Chain.');
}

export async function researchXLayerStock(query,{fetchImpl=fetch,env=process.env}={}){
 const target=await xLayerTarget(query,fetchImpl);
 const {symbol,pools}=target;
 const evidence=[];
 for(const pool of pools){
  let trade;
  try{trade=await recentTrade(pool,fetchImpl);}catch{trade={status:'unverified'};}
  evidence.push({...pool,trade});
 }
 const [stockContext,launchOptions]=await Promise.all([equityContext(symbol,{fetchImpl,env}),stockLaunchOptions(symbol,{fetchImpl,env})]);
 return {...target,chainId:196,launchOptions,pools:evidence,checkedAt:new Date().toISOString(),
  equityContext:stockContext};
}

export function xLayerSummary(report){
 const lines=report.pools.map(p=>p.stockSymbol+'/'+p.paymentSymbol+' · '+
  (p.trade.explorer?'[Recent swap verified on X Layer]('+p.trade.explorer+')':
   p.trade.status==='no_recent_record'?'No trade returned in the venue’s recent history.':'Recent trade could not be verified.'));
 if(report.poolStatus==='unavailable')lines.push('OKXICE pool data is temporarily unavailable.');
 else if(!lines.length)lines.push('No '+report.symbol+' pool appeared in the OKX venue directory.');
 if(report.issuerIdentity)lines.unshift('Verified '+report.issuerIdentity.tokenSymbol+' on X Layer. [Issuer deployment]('+report.issuerIdentity.source+') / [Contract](https://www.oklink.com/xlayer/address/'+report.issuerIdentity.address+')');
 return ['# Tokenized Research | '+report.symbol+' on X Layer',...lines,'[OKX stock pool directory]('+report.source+')'].join('\n\n');
}
