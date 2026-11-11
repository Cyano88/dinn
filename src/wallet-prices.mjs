let cached;
export async function walletPrices(input={}, {fetchImpl=fetch,now=Date.now}={}) {
 if(cached&&now()-cached.checkedAt<30000)return cached;
 const r=await fetchImpl('https://api.montramarkets.xyz/api/tokens?limit=1&quote=0x0000000000000000000000000000000000000000',{signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error('Prices are unavailable.');
 const q=(await r.json()).tokens?.[0]?.quote;
 if(q?.address!=='0x0000000000000000000000000000000000000000'||typeof q.usd!=='number'||!Number.isFinite(q.usd)||q.usd<=0||!Number.isFinite(q.usdAt)||now()-q.usdAt>120000||q.usdAt>now()+30000)throw Error('Prices are unavailable.');
 return cached={chainId:99901,nativeUsd:q.usd,priceAt:q.usdAt,checkedAt:now(),source:'Montra'};
}
