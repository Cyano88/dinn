const finite=value=>typeof value==='number'||typeof value==='string'&&value.trim()!==''?Number.isFinite(Number(value))?Number(value):null:null;
const nonnegative=value=>{const n=finite(value);return n!==null&&n>=0?n:null;};
export function rankLaunches(rows,filter){
 const rank=value=>nonnegative(value)??-1;
 const cap=row=>rank(row.metrics?.launchCap?.usd??row.metrics?.market?.marketCapUsd);
 const liquidity=row=>rank(row.metrics?.market?.liquidityUsd);
 const trending=row=>finite(row.metrics?.market?.change24h)>0&&finite(row.metrics?.market?.volume24hUsd)>0;
 return rows.filter(row=>filter==='trending'?trending(row):filter==='curve'?row.metrics?.phase===0:filter==='graduated'?row.metrics?.phase===2||row.chainId===8453&&!!row.curve:true)
 .sort((a,b)=>(filter==='trending'?Number(b.metrics.market.change24h)-Number(a.metrics.market.change24h):0)||liquidity(b)-liquidity(a)||cap(b)-cap(a)||(b.launchedAt||'').localeCompare(a.launchedAt||'')||String(a.token).localeCompare(String(b.token)));
}
export async function poolCandles(row,fetchImpl,now){
 const market=row.metrics?.market,pool=market?.chartPool;
 if(!pool||!/^0x(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(pool))return [];
 const net=row.chainId===8453?'base':'robinhood';
 try{
  const url='https://api.geckoterminal.com/api/v2/networks/'+net+'/pools/'+pool+'/ohlcv/hour?aggregate=1&currency=usd&include_empty_intervals=false&limit=24&token='+row.token;
  const r=await fetchImpl(url,{signal:AbortSignal.timeout(3000),redirect:'error'});
  if(!r.ok)return [];
  const data=await r.json(),meta=data.meta;
  if(![meta?.base?.address,meta?.quote?.address].some(a=>a?.toLowerCase()===row.token.toLowerCase()))return [];
  const hours=new Map();
  for(const candle of data.data?.attributes?.ohlcv_list||[]){
   if(!Array.isArray(candle))continue;
   const [t,o,h,l,c,v]=candle;
   if(![t,o,h,l,c,v].every(Number.isFinite)||t*1000<now-86400000||t*1000>now||v<=0||l<=0||h<Math.max(o,c)||l>Math.min(o,c))continue;
   hours.set(t,[t,o,h,l,c]);
  }
  return [...hours.values()].sort((a,b)=>a[0]-b[0]).slice(-24);
 }catch{return [];}
}
export function poolStats(liquidity,change,volume,pool){
 return {liquidityUsd:nonnegative(liquidity),change24h:finite(change),volume24hUsd:nonnegative(volume),chartPool:pool||null};
}
