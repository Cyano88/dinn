import {decodeFunctionResult,erc20Abi} from 'viem';

const issuer='https://api.xstocks.fi/api/v2/public/assets';
const rpc='https://rpc.xlayer.tech';
let cachedCatalog;
let pendingCatalog;

async function readCatalog(fetchImpl){
 const assets=[];
 for(let page=0;page<100;page++){
  const response=await fetchImpl(issuer+'?limit=100&page='+page,{signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error('Stock issuer directory unavailable.');
  const data=await response.json();
  if(data.page?.currentPage!==page||typeof data.page.hasNextPage!=='boolean'||!Array.isArray(data.nodes)||
   !data.nodes.every(row=>typeof row?.symbol==='string'&&typeof row.name==='string'&&typeof row.underlyingSymbol==='string'&&Array.isArray(row.deployments)))
   throw Error('Incomplete stock issuer directory.');
  assets.push(...data.nodes);
  if(!data.page.hasNextPage)return assets;
 }
 throw Error('Stock issuer directory exceeded its pagination limit.');
}

async function catalog(fetchImpl){
 if(fetchImpl!==fetch)return readCatalog(fetchImpl);
 if(cachedCatalog?.expires>Date.now())return cachedCatalog.assets;
 pendingCatalog??=readCatalog(fetchImpl).then(assets=>{
  cachedCatalog={assets,expires:Date.now()+300000};
  return assets;
 }).finally(()=>{pendingCatalog=undefined;});
 return pendingCatalog;
}

export async function issuerStock(query,fetchImpl=fetch){
 const needle=query.toLowerCase();
 // The issuer publishes a single-asset record for canonical stock tickers.
 // Accept it only when both issuer symbols match, then verify the deployment below.
 let direct;
 if(/^[a-z][a-z0-9.-]{0,9}$/i.test(query)&&!(fetchImpl===fetch&&cachedCatalog?.expires>Date.now())){
  const ticker=query.toUpperCase();
  try{
   const response=await fetchImpl(issuer+'/'+encodeURIComponent(ticker+'x'),{signal:AbortSignal.timeout(3000)});
   if(response.ok){
    const record=await response.json();
    if(record.symbol===ticker+'x'&&record.underlyingSymbol===ticker&&Array.isArray(record.deployments))direct=record;
   }
  }catch{ /* Resolve aliases and unavailable individual records via the catalog. */ }
 }
 const assets=direct?[direct]:await catalog(fetchImpl);
 // Prefer exact underlying tickers before interpreting OKX's X prefix.
 const exact=assets.filter(row=>row.underlyingSymbol.toLowerCase()===needle);
 const matches=exact.length?exact:assets.filter(row=>[row.symbol,row.underlyingSymbol,'X'+row.underlyingSymbol,
  row.name,row.name.replace(/\s+xstock$/i,'')].some(value=>value.toLowerCase()===needle));
 if(!matches.length)return null;
 if(matches.length!==1)throw Error('Ambiguous issuer match.');
 const asset=matches[0];
 const deployments=asset.deployments.filter(d=>Number(d.chainId)===196);
 const symbol=asset.underlyingSymbol;
 if(!deployments.length)return {symbol,identity:null};
 const address=deployments[0].address;
 if(deployments.length!==1||!/^0x[0-9a-f]{40}$/i.test(address))throw Error('Ambiguous X Layer deployment.');
 async function call(method,params){
  const response=await fetchImpl(rpc,{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error('X Layer RPC unavailable.');
  const body=await response.json();
  if(body.error||body.result==null)throw Error('X Layer RPC read failed.');
  return body.result;
 }
 const [chain,block]=await Promise.all([call('eth_chainId',[]),call('eth_blockNumber',[])]);
 if(chain!=='0xc4'||!/^0x[0-9a-f]+$/i.test(block))throw Error('X Layer network mismatch.');
 const data=await call('eth_call',[{to:address,data:'0x95d89b41'},block]);
 if(decodeFunctionResult({abi:erc20Abi,functionName:'symbol',data})!==asset.symbol)throw Error('Issuer and deployed token disagree.');
 return {symbol,identity:{status:'verified',chainId:196,address,tokenSymbol:asset.symbol,underlyingSymbol:symbol,
  blockNumber:BigInt(block).toString(),source:issuer+'/'+encodeURIComponent(asset.symbol)}};
}
