import {tokenIcon} from './token-icons.mjs';
﻿import {validAddress} from './wallet-actions.mjs';
const cache=new Map();const clean=(s,max)=>typeof s==='string'?s.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,'').slice(0,max):'';
export async function marketTokens(input={}, {fetchImpl=fetch,now=Date.now}={}){
 if(typeof input.search!=='string'&&input.search!==undefined)throw Error('Invalid token search.');const search=(input.search||'').trim();if(search.length>80)throw Error('Search is too long.');const sort=input.sort==='old'?'old':'new',key=sort+':'+search;const old=cache.get(key);if(old&&old.until>now())return old.result;
 const url=new URL('https://api.montramarkets.xyz/api/tokens');url.search=new URLSearchParams({sort,limit:'20',quote:'0x0000000000000000000000000000000000000000',...(search?{search}:{})});const r=await fetchImpl(url,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Token list is unavailable. You can paste a contract instead.');const data=await r.json();if(!Array.isArray(data.tokens))throw Error('Token list is unavailable.');
 const tokens=data.tokens.slice(0,20).filter(t=>validAddress(t.address)&&t.quote?.address==='0x0000000000000000000000000000000000000000').map(t=>({address:t.address.toLowerCase(),...tokenIcon(t.imageUrl),name:clean(t.name,60)||'Token',symbol:clean(t.symbol,32)||'Token'}));const result={chainId:99901,venue:'Montra',tokens};if(cache.size>=20)cache.delete(cache.keys().next().value);cache.set(key,{until:now()+60000,result});return result;
}
