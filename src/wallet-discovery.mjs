import {tokenIcon} from './token-icons.mjs';
﻿import {isAddress} from 'viem';
const cache=new Map();
export async function discoverHoldings(account,{fetchImpl=fetch,now=Date.now,page=1}={}){
 if(!Number.isSafeInteger(page)||page<1||page>10000)throw Error("Invalid holdings page.");
 const address=account.toLowerCase(),key=address+":"+page,old=cache.get(key);if(old&&old.until>now())return old.result;
 const addresses=new Map();let nextPage=null;
 try{const r=await fetchImpl('https://api.montramarkets.xyz/api/wallets/'+address+'/holdings?limit=20&page='+page,{signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error();const data=await r.json();if(!Array.isArray(data.holdings))throw Error();for(const row of data.holdings){if(isAddress(row.address||'',{strict:false})&&/^\d+$/.test(row.balance||'')&&BigInt(row.balance)>0n)addresses.set(row.address.toLowerCase(),{address:row.address.toLowerCase(),...tokenIcon(row.imageUrl),priceUsd:typeof row.priceUsd==='number'&&Number.isFinite(row.priceUsd)&&row.priceUsd>0&&(row.quote?.usdSource==='dollar'||(Number.isFinite(row.quote?.usdAt)&&now()-row.quote.usdAt<120000&&row.quote.usdAt<=now()+30000))?row.priceUsd:null,priceAt:now(),name:typeof row.name==='string'?row.name.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,'').slice(0,60):''});}if(Number(data.pages)>page||(!data.pages&&data.holdings.length===20))nextPage=page+1;
 const result={tokens:[...addresses.values()],state:nextPage?'partial':'ready',nextPage};if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(key,{result,until:now()+30000});return result;
 }catch{const result={tokens:old?.result.tokens||[],state:'unavailable',nextPage:page};if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(key,{result,until:now()+10000});return result;}
}
