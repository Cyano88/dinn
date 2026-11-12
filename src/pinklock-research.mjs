import {formatUnits,parseAbi} from 'viem';
import {blockscoutRead} from './blockscout.mjs';

export const PINKLOCK_ADAPTERS=Object.freeze([
 {name:'PinkLock adapter v1',address:'0x16e02A106fE6E978fB98F76756B3a06b4995a7A6'},
 {name:'PinkLock adapter v2',address:'0xDBE1f3dc1d6E6759355E1B164231748f0589cb41'},
 {name:'PinkLock adapter v3',address:'0x6022DA059FAa0673E3058ADECEef375c2Abfb4A1'},
 {name:'PinkLock adapter v4',address:'0xA2898528eb4Aea0bDAf47202A5BA3bA4f58F831c'}
]);
const abi=parseAbi([
 'function totalLockCountForToken(address token) view returns (uint256)',
 'function getLocksForToken(address token,uint256 start,uint256 end) view returns ((uint256 id,address token,address owner,uint256 amount,uint256 lockDate,uint256 tgeDate,uint256 tgeBps,uint256 cycle,uint256 cycleBps,uint256 unlockedAmount,string description)[])',
 'function withdrawableTokens(uint256 lockId) view returns (uint256)',
 'function isLpToken(uint256 lockId) view returns (bool)'
]);
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const explorer='https://robinhoodchain.blockscout.com';
const MAX_LOCKS_PER_ADAPTER=25;
const MAX_HOLDER_CONTRACTS=10;
const PINKLOCK02_NAME='PinkLock02';
const asBigInt=v=>typeof v==='bigint'?v:/^\d+$/.test(String(v))?BigInt(v):null;
const unixDate=v=>{const n=asBigInt(v);if(n===null||n===0n||n>8640000000n)return null;return new Date(Number(n)*1000).toISOString();};
const sanitize=v=>String(v??'').replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,' ').slice(0,160);
const validAddress=v=>typeof v==='string'&&/^0x[0-9a-f]{40}$/i.test(v);
const pinkSaleUrl=id=>'https://www.pinksale.finance/pinklock/robinhood/record/'+encodeURIComponent(String(id));
async function mapPool(items,limit,fn){let cursor=0;const out=[];await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(cursor<items.length){const i=cursor++;out[i]=await fn(items[i],i);}}));return out;}

/** Reads the shared adapters, then recognizes verified per-lock PinkLock02 contracts among indexed top holders. */
export async function researchPinkLocks({address,decimals,client,blockNumber,holders=[],env=process.env,fetchImpl=fetch,signal,read=blockscoutRead}={}){
 const base={status:'unavailable',checkedBlock:String(blockNumber??'unknown'),adapters:PINKLOCK_ADAPTERS.map(x=>({name:x.name,address:x.address,status:'unavailable',lockCount:null,records:[]})),records:[],scope:'Checks the four listed shared Robinhood PinkLock adapters and verified PinkLock02 lock contracts found among the top 10 indexed holder candidates. Per-lock discovery depends on holder-index coverage, verified Blockscout source metadata and matching deployed bytecode. Other locker versions or unindexed lock contracts may be missed; no records found is not proof that supply is unlocked.',sourceUrls:[...PINKLOCK_ADAPTERS.map(x=>({label:x.name,url:explorer+'/address/'+x.address})),{label:'PinkSale PinkLock documentation',url:'https://docs.pinksale.finance/pinklock/create-a-lock'}]};
 if(!client||typeof address!=='string'||!/^0x[0-9a-f]{40}$/i.test(address)||!Number.isInteger(decimals)||decimals<0||decimals>36)return {...base,reason:'Token, decimals or Robinhood Chain reader is unavailable.'};
 const holderSnapshot=await Promise.resolve(holders).catch(()=>null),holderRows=Array.isArray(holderSnapshot)?holderSnapshot:Array.isArray(holderSnapshot?.rows)?holderSnapshot.rows:null;
 const staticAddresses=new Set(PINKLOCK_ADAPTERS.map(x=>x.address.toLowerCase())),seen=new Set(),candidates=[];
 for(const row of holderRows||[]){const candidate=row?.address;if(row?.walletType!=='contract'||row.infrastructure||row.sink||!validAddress(candidate)||staticAddresses.has(candidate.toLowerCase())||seen.has(candidate.toLowerCase()))continue;seen.add(candidate.toLowerCase());candidates.push(candidate);if(candidates.length===MAX_HOLDER_CONTRACTS)break;}
 const shared=await Promise.all(PINKLOCK_ADAPTERS.map(async adapter=>{
  const result={...adapter,status:'unavailable',lockCount:null,records:[]};
  try{
   const count=await client.readContract({address:adapter.address,abi,functionName:'totalLockCountForToken',args:[address],blockNumber:BigInt(blockNumber)});
   if(typeof count!=='bigint'||count<0n)throw Error();result.lockCount=count.toString();
   if(count===0n)return {...result,status:'checked'};
   const limit=BigInt(MAX_LOCKS_PER_ADAPTER),end=count>limit?limit:count;
   const locks=await client.readContract({address:adapter.address,abi,functionName:'getLocksForToken',args:[address,0n,end],blockNumber:BigInt(blockNumber)});
   if(!Array.isArray(locks))throw Error();
   const records=await mapPool(locks,4,async lock=>{
    const values=Array.isArray(lock)?{id:lock[0],token:lock[1],owner:lock[2],amount:lock[3],lockDate:lock[4],tgeDate:lock[5],tgeBps:lock[6],cycle:lock[7],cycleBps:lock[8],unlockedAmount:lock[9],description:lock[10]}:lock;
    if(!same(values.token,address))return null;
    const [lp,withdrawable]=await Promise.all([
     client.readContract({address:adapter.address,abi,functionName:'isLpToken',args:[values.id],blockNumber:BigInt(blockNumber)}).catch(()=>null),
     client.readContract({address:adapter.address,abi,functionName:'withdrawableTokens',args:[values.id],blockNumber:BigInt(blockNumber)}).catch(()=>null)
    ]);
    const amount=asBigInt(values.amount),unlocked=asBigInt(values.unlockedAmount),available=asBigInt(withdrawable);
    if(amount===null||unlocked===null)return null;
    const remaining=amount>unlocked?amount-unlocked:0n;
    return {adapter:adapter.name,adapterAddress:adapter.address,id:String(values.id),token:values.token,owner:values.owner,kind:lp===true?'liquidity-position':'token',amount:formatUnits(amount,decimals),unlocked:formatUnits(unlocked,decimals),remaining:formatUnits(remaining,decimals),currentlyWithdrawable:available===null?null:formatUnits(available,decimals),lockDate:unixDate(values.lockDate),tgeOrUnlockDate:unixDate(values.tgeDate),tgeReleasePercent:asBigInt(values.tgeBps)===null?null:(Number(values.tgeBps)/100),cycleSeconds:asBigInt(values.cycle)?.toString()??null,cycleDays:asBigInt(values.cycle)===null?null:Number(values.cycle)/86400,cycleReleasePercent:asBigInt(values.cycleBps)===null?null:(Number(values.cycleBps)/100),description:sanitize(values.description),sourceUrl:explorer+'/address/'+adapter.address+'?tab=read_contract',pinkSaleUrl:pinkSaleUrl(values.id)};
   });
   const validRecords=records.filter(Boolean);
   return {...result,status:count>limit||validRecords.length!==Number(count)?'partial':'checked',records:validRecords,reason:count>limit?'More than 25 records exist; only the first 25 were read.':validRecords.length!==Number(count)?'The adapter count and validated token records did not match.':null};
  }catch{return {...result,status:'unavailable',reason:'This adapter could not be read at the checked block.'};}
 }));
 const holderCoverageKnown=Array.isArray(holderRows)&&(!holderSnapshot?.status||['available','partial'].includes(holderSnapshot.status)),discovered=await mapPool(candidates,3,async candidate=>{
  const result={name:'Holder contract candidate',address:candidate,status:'unavailable',lockCount:null,records:[]};
  try{
   const metadata=await read('smart-contracts/'+candidate,{env,fetchImpl,signal});
   if(metadata?.is_verified!==true||metadata?.name!==PINKLOCK02_NAME)return {...result,status:metadata?.is_verified===true?'not-pinklock02':'unverified'};
   if(typeof client.getCode!=='function')return {...result,reason:'Deployed bytecode could not be checked.'};
   const runtime=await client.getCode({address:candidate,blockNumber:BigInt(blockNumber)}),deployed=metadata.deployed_bytecode;
   if(typeof runtime!=='string'||!/^0x[0-9a-f]+$/i.test(runtime)||typeof deployed!=='string'||runtime.toLowerCase()!==deployed.toLowerCase())return {...result,status:'source-mismatch',reason:'Verified source bytecode did not match deployed code at the checked block.'};
   result.name=PINKLOCK02_NAME;result.sourceUrl=explorer+'/address/'+candidate+'?tab=read_contract';
   const count=await client.readContract({address:candidate,abi,functionName:'totalLockCountForToken',args:[address],blockNumber:BigInt(blockNumber)});
   if(typeof count!=='bigint'||count<0n)throw Error();result.lockCount=count.toString();
   if(count===0n)return {...result,status:'checked'};
   const limit=BigInt(MAX_LOCKS_PER_ADAPTER),end=count>limit?limit:count;
   const locks=await client.readContract({address:candidate,abi,functionName:'getLocksForToken',args:[address,0n,end],blockNumber:BigInt(blockNumber)});
   if(!Array.isArray(locks))throw Error();
   const records=await mapPool(locks,4,async lock=>{
    const values=Array.isArray(lock)?{id:lock[0],token:lock[1],owner:lock[2],amount:lock[3],lockDate:lock[4],tgeDate:lock[5],tgeBps:lock[6],cycle:lock[7],cycleBps:lock[8],unlockedAmount:lock[9],description:lock[10]}:lock;
    if(!same(values.token,address))return null;
    const [lp,withdrawable]=await Promise.all([client.readContract({address:candidate,abi,functionName:'isLpToken',args:[values.id],blockNumber:BigInt(blockNumber)}).catch(()=>null),client.readContract({address:candidate,abi,functionName:'withdrawableTokens',args:[values.id],blockNumber:BigInt(blockNumber)}).catch(()=>null)]);
    const amount=asBigInt(values.amount),unlocked=asBigInt(values.unlockedAmount),available=asBigInt(withdrawable);if(amount===null||unlocked===null)return null;
    const remaining=amount>unlocked?amount-unlocked:0n;
    return {adapter:PINKLOCK02_NAME,adapterAddress:candidate,id:String(values.id),token:values.token,owner:values.owner,kind:lp===true?'liquidity-position':'token',amount:formatUnits(amount,decimals),unlocked:formatUnits(unlocked,decimals),remaining:formatUnits(remaining,decimals),currentlyWithdrawable:available===null?null:formatUnits(available,decimals),lockDate:unixDate(values.lockDate),tgeOrUnlockDate:unixDate(values.tgeDate),tgeReleasePercent:asBigInt(values.tgeBps)===null?null:(Number(values.tgeBps)/100),cycleSeconds:asBigInt(values.cycle)?.toString()??null,cycleDays:asBigInt(values.cycle)===null?null:Number(values.cycle)/86400,cycleReleasePercent:asBigInt(values.cycleBps)===null?null:(Number(values.cycleBps)/100),description:sanitize(values.description),sourceUrl:result.sourceUrl,pinkSaleUrl:pinkSaleUrl(values.id)};
   });
   const validRecords=records.filter(Boolean);
   return {...result,status:count>limit||validRecords.length!==Number(count)?'partial':'checked',records:validRecords,reason:count>limit?'More than 25 records exist; only the first 25 were read.':validRecords.length!==Number(count)?'The lock count and validated token records did not match.':null};
  }catch{return {...result,status:'unavailable',reason:'This verified PinkLock02 candidate could not be read at the checked block.'};}
 });
 const adapters=[...shared,...discovered],records=adapters.flatMap(a=>a.records),found=records.length>0,sharedChecked=shared.every(a=>a.status==='checked'),dynamicComplete=holderCoverageKnown&&discovered.every(a=>['checked','not-pinklock02'].includes(a.status)),anyAvailable=adapters.some(a=>['checked','partial'].includes(a.status));
 const scopeComplete=sharedChecked&&dynamicComplete;
 return {...base,status:found?'observed':scopeComplete?'observed':anyAvailable?'partial':'unavailable',adapters,records,reason:found?scopeComplete?null:'A matching lock was found, but some adapter or indexed-holder candidate checks were incomplete. Other locker versions or unindexed contracts may still hold supply.':scopeComplete?'No matching token or vesting records were found in the checked shared adapters or verified PinkLock02 contracts among indexed top-holder contract candidates. Other or unindexed locker contracts may still hold supply; this is not proof that the supply is unlocked.':!holderCoverageKnown?'Shared adapters were checked, but holder-indexed contract candidates were not supplied; per-lock PinkLock02 discovery is incomplete.':'One or more shared adapters or holder contract candidates could not be checked; absence of a record is inconclusive.'};
}
