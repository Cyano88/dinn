import {decimalUnits,decimalString} from '../public/purchase-usd.js';
const ZERO='0x'+'0'.repeat(40),cache=new Map(),inflight=new Map();
const matches=(row,address)=>row?.deployments?.some(d=>d.chainId===4663&&d.contractAddress?.toLowerCase()===address);
function fresh(value,now){const t=Date.parse(value);if(!Number.isFinite(t)||now-t>120000||t>now+30000)throw Error('USD reference is stale.');return t;}
export function stockUsdReference(asset,quote,address,now=Date.now()){
 if(!matches(asset,address)||!matches(quote,address)||asset.status!=='ASSET_STATUS_ACTIVE'||asset.tokenSymbol!==quote.tokenSymbol||quote.currency!=='USD'||quote.isTradingHalt!==false)throw Error('USD reference is unavailable for this asset.');
 if(asset.pendingMultiplier&&Date.parse(asset.pendingMultiplierEffectiveTime)<=now+120000)throw Error('Token multiplier is changing.');
 const at=fresh(quote.generatedAt,now),bid=decimalUnits(quote.bid),ask=decimalUnits(quote.ask),multiplier=decimalUnits(asset.currentMultiplier);
 if(bid<=0n||ask<bid||multiplier<=0n)throw Error('Invalid USD reference.');
 return {available:true,pairToken:address,symbol:quote.tokenSymbol,unitPriceUsd:decimalString((bid+ask)*multiplier/(2n*10n**18n)),asOf:at,expiresAt:Math.min(at+120000,now+30000),source:'Robinhood',basis:'Multiplier-adjusted bid/ask midpoint',sourceUrl:'https://docs.robinhood.com/chain/stock-token-apis/'};
}
export async function purchaseUsdReference(input,{fetcher=fetch,now=Date.now}={}){
 const address=input?.pairToken?.toLowerCase();if(!/^0x[0-9a-f]{40}$/.test(address||'')||Object.keys(input).some(k=>k!=='pairToken'))throw Error('Invalid pairing asset.');
 const t=now(),cached=cache.get(address);if(fetcher===fetch&&cached&&cached.cachedUntil>t&&cached.expiresAt>t)return cached.result;
 if(fetcher===fetch&&inflight.has(address))return inflight.get(address);
 const task=(async()=>{try{
 const get=async url=>{const r=await fetcher(url,{signal:AbortSignal.timeout(7000),redirect:'error'});if(!r.ok)throw Error('USD source unavailable.');return r.json();};let result;
 if(address===ZERO){const q=await get('https://api.exchange.coinbase.com/products/ETH-USD/ticker'),at=fresh(q.time,now()),bid=decimalUnits(q.bid),ask=decimalUnits(q.ask);if(bid<=0n||ask<bid)throw Error('Invalid ETH reference.');result={available:true,pairToken:address,symbol:'ETH',unitPriceUsd:decimalString((bid+ask)/2n),asOf:at,expiresAt:Math.min(at+120000,now()+30000),source:'Coinbase Exchange',basis:'ETH/USD bid/ask midpoint',sourceUrl:'https://www.coinbase.com/price/ethereum'};}
 else{const data=await get('https://api.robinhood.com/rhj/assets'),asset=data.assets?.find(a=>matches(a,address));if(!asset||!/^[a-z0-9.-]{1,20}$/i.test(asset.tokenSymbol||''))throw Error('No supported USD source for this asset.');const prices=await get('https://api.robinhood.com/rhj/prices/'+encodeURIComponent(asset.tokenSymbol)),quote=prices.quotes?.find(q=>matches(q,address));result=stockUsdReference(asset,quote,address,now());}
 if(fetcher===fetch){if(cache.size>256)cache.clear();cache.set(address,{result,cachedUntil:now()+15000,expiresAt:result.expiresAt});}return result;
 }catch{return {available:false,pairToken:address,message:'USD estimate unavailable. The purchase is still priced in the pairing asset.'};}})();
 if(fetcher===fetch)inflight.set(address,task);try{return await task;}finally{if(fetcher===fetch)inflight.delete(address);}
}
