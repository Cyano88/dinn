import {inspectToken} from './token-inspection.mjs';
// Shared reports contain public chain data only. Never cache failures or caller context.
export function createInspectionCache({inspect=inspectToken,now=Date.now,ttlMs=30000,maxEntries=256,maxPerMinute=30,maxConcurrent=4}={}){
 const cache=new Map(),pending=new Map();let starts=[];
 return async function inspectCached(address,{rpc,chainId,signal,fresh=false}={}){
  if(signal?.aborted)throw Error('Inspection cancelled.');
  if(typeof address!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(address)||/^0x0{40}$/i.test(address))throw Error('Paste one nonzero EVM token contract address.');
  if(!rpc||![4663,99801,99901].includes(chainId))throw Error('The read-only chain connection is not configured.');
  const key=JSON.stringify([rpc,chainId,address.toLowerCase()]),time=now();
  for(const [id,entry] of cache)if(entry.expires<=time)cache.delete(id);
  const cached=cache.get(key);
  if(cached&&!fresh)return {...structuredClone(cached.report),cache:{hit:true,ttlSeconds:ttlMs/1000}};
  let work=pending.get(key);const shared=!!work;
  if(!work){
   starts=starts.filter(t=>time-t<60000);
   if(starts.length>=maxPerMinute||pending.size>=maxConcurrent)throw Error('Token checks are busy. Please try again in a minute.');
   starts.push(time);
   // One bounded upstream check can serve multiple callers; one disconnect must not cancel the others.
   work=Promise.resolve().then(()=>inspect(address,{rpc,chainId,signal:AbortSignal.timeout(45000)})).then(report=>{
    if(cache.size>=maxEntries)cache.delete(cache.keys().next().value);
    cache.set(key,{report:structuredClone(report),expires:now()+ttlMs});return report;
   }).finally(()=>pending.delete(key));
   pending.set(key,work);
  }
  const report=await work;
  if(signal?.aborted)throw Error('Inspection cancelled.');
  return {...structuredClone(report),cache:{hit:shared,ttlSeconds:ttlMs/1000}};
 };
}
export const inspectCachedToken=createInspectionCache();
