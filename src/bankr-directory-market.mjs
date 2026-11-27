import {poolStats} from './launch-directory-trends.mjs';
export async function bankrDirectoryMarket(item,fetchImpl){
 const token=item.token.toLowerCase(),poolId=item.curve.toLowerCase(),quote=item.pairToken.toLowerCase();
 const usd=n=>n!==null&&n!==undefined&&String(n).trim()!==''&&Number.isFinite(Number(n))&&Number(n)>0?String(n):null;
 async function get(url){
  const response=await fetchImpl(url,{signal:AbortSignal.timeout(3500),redirect:'error'});
  if(!response.ok)throw Error('Market source unavailable');
  return response.json();
 }
 const [index,pairs]=await Promise.allSettled([
  get('https://api.bankr.bot/launches/base/'+token),
  get('https://api.dexscreener.com/latest/dex/pairs/base/'+poolId)
 ]);
 const b=index.value;
 const bankr=b?.chain==='base'&&b.tokenAddress?.toLowerCase()===token&&b.poolId?.toLowerCase()===poolId&&b.quoteAddress?.toLowerCase()===quote?b.market:null;
 const dex=pairs.value?.pairs?.find(p=>p.chainId==='base'&&p.pairAddress?.toLowerCase()===poolId&&p.baseToken?.address?.toLowerCase()===token&&p.quoteToken?.address?.toLowerCase()===quote);
 const fdvUsd=usd(dex?.fdv),bankrCap=usd(bankr?.marketCapUsd),marketCapUsd=bankrCap||usd(dex?.marketCap);
 return {...poolStats(dex?.liquidity?.usd,dex?.priceChange?.h24,dex?.volume?.h24,poolId),fdvUsd,fdvSource:fdvUsd?'DEX Screener':null,marketCapUsd,marketCapSource:bankrCap?'Bankr':marketCapUsd?'DEX Screener':null};
}
