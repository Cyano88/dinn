const validAddress=v=>typeof v==='string'&&/^0x[0-9a-f]{40}$/i.test(v)&&!/^0x0{40}$/i.test(v);
export async function dexStatus({address},{fetcher=fetch}={}){
 if(!validAddress(address))throw Error('Enter a nonzero token address on Robinhood Chain.');
 async function get(path){const r=await fetcher('https://api.dexscreener.com/'+path+'/robinhood/'+address,{signal:AbortSignal.timeout(12000),redirect:'error'});if(!r.ok)throw Error('DEX Screener is unavailable. Retry later; no purchase status was verified.');const text=await r.text();if(text.length>2000000)throw Error('DEX Screener returned too much data.');return JSON.parse(text);}
 const [pairs,orderData]=await Promise.all([get('token-pairs/v1'),get('orders/v1')]);
 const orders=Array.isArray(orderData)?orderData:orderData?.orders;
 if(!Array.isArray(pairs)||!Array.isArray(orders))throw Error('DEX Screener returned an unexpected response.');
 const matched=pairs.filter(p=>p.chainId==='robinhood'&&p.baseToken?.address?.toLowerCase()===address.toLowerCase());
 const safe=s=>typeof s==='string'?s.slice(0,500):'';
 const profiles=matched.slice(0,10).map(p=>({pairAddress:safe(p.pairAddress),name:safe(p.baseToken.name),symbol:safe(p.baseToken.symbol),imageUrl:safe(p.info?.imageUrl),websites:(Array.isArray(p.info?.websites)?p.info.websites:[]).slice(0,10).map(v=>safe(v.url)),socials:(Array.isArray(p.info?.socials)?p.info.socials:[]).slice(0,10).map(v=>({type:safe(v.type||v.platform),url:safe(v.url||v.handle)}))}));
 return {provider:'DEX Screener',chainId:4663,address,indexed:matched.length>0,profiles,orders:orders.filter(o=>o.type==='tokenProfile').slice(0,20).map(o=>({type:'tokenProfile',status:safe(o.status),paymentTimestamp:Number.isFinite(o.paymentTimestamp)?o.paymentTimestamp:null})),checkedAt:new Date().toISOString(),note:'Public token-level records only. These do not identify your order or prove your payment. Missing records do not prove that no payment occurred. Description and exact logo matching are not verified by this endpoint.'};
}
