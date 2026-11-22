import {decodeFunctionResult,encodeFunctionData,parseAbi,zeroAddress} from 'viem';

const lockers=[
 {name:'Clanker v4 launch vault',address:'0x8e845ead15737bf71904a30bddd3aee76d6adf6c',count:'allocation'},
 {name:'PinkLock V2',address:'0xdd6e31a046b828cbbafb939c2a394629aff8bbdc',count:'totalLockCountForToken'},
 {name:'UNCX legacy token vesting',address:'0xa82685520c463a752d5319e6616e4e5fd0215e33',count:'getTokenLocksLength'}
];
const abi=parseAbi([
 'function allocation(address) view returns (address,uint256,uint256,uint256,uint256,address)',
 'function amountAvailableToClaim(address) view returns (uint256)',
 'function totalLockCountForToken(address) view returns (uint256)',
 'function getTokenLocksLength(address) view returns (uint256)',
 'function getTokenLockIDAtIndex(address,uint256) view returns (uint256)',
 'function LOCKS(uint256) view returns (address token,uint256 depositedShares,uint256 withdrawnShares,uint256 start,uint256 end,uint256 id,address owner,address condition)',
 'function getLocksForToken(address,uint256,uint256) view returns ((uint256 id,address token,address owner,uint256 amount,uint256 lockDate,uint256 tgeDate,uint256 tgeBps,uint256 cycle,uint256 cycleBps,uint256 unlockedAmount,string description)[])'
]);
const date=seconds=>seconds>0n&&seconds<=8640000000000n?new Date(Number(seconds)*1000).toISOString():null;

// Each result applies only to the specified asset, deployment and checked block.
export async function baseLockEvidence(token,block,rpcUrl,fetchImpl,env={}){
 const signal=AbortSignal.timeout(6500);
 const lockerReads=Promise.all(lockers.map(async locker=>{
  const source={name:locker.name,address:locker.address,url:'https://basescan.org/address/'+locker.address+'#readContract'};
  try{
   if(block==null)throw Error();
   const tag='0x'+BigInt(block).toString(16);
   async function read(functionName,args){
    const data=encodeFunctionData({abi,functionName,args});
    const response=await fetchImpl(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},signal,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_call',params:[{to:locker.address,data},tag]})});
    if(!response.ok)throw Error();
    return decodeFunctionResult({abi,functionName,data:(await response.json()).result});
   }
   if(locker.count==='allocation'){
    const [asset,total,claimed,cliff,end,admin]=await read('allocation',[token]);
    if(asset===zeroAddress&&total===0n&&cliff===0n)return {...source,status:'checked',count:'0',records:[]};
    if(asset.toLowerCase()!==token.toLowerCase()||claimed>total||cliff===0n||end<cliff)throw Error();
    const claimable=await read('amountAvailableToClaim',[token]);
    if(claimable>total-claimed)throw Error();
    return {...source,status:'checked',count:'1',records:[{id:asset,admin,lockedRaw:String(total-claimed-claimable),claimableRaw:String(claimable),cliffUtc:date(cliff),vestingEndUtc:date(end)}]};
   }
   const count=await read(locker.count,[token]);
   const limit=Number(count>5n?5n:count);
   let records=[];
   if(limit&&locker.count==='totalLockCountForToken'){
    const rows=await read('getLocksForToken',[token,0n,BigInt(limit-1)]);
    records=rows.map(row=>{
     if(row.token.toLowerCase()!==token.toLowerCase()||row.amount<row.unlockedAmount)throw Error();
     return {id:String(row.id),remainingRaw:String(row.amount-row.unlockedAmount),firstReleaseUtc:date(row.tgeDate),initialReleaseBps:String(row.tgeBps),cycleSeconds:String(row.cycle),cycleReleaseBps:String(row.cycleBps)};
    });
   }else if(limit){
    records=await Promise.all(Array.from({length:limit},async(_,i)=>{
     const id=await read('getTokenLockIDAtIndex',[token,BigInt(i)]);
     const [asset,deposited,withdrawn,start,end,recordId,,condition]=await read('LOCKS',[id]);
     if(asset.toLowerCase()!==token.toLowerCase()||id!==recordId||withdrawn>deposited)throw Error();
     return {id:String(id),remainingShares:String(deposited-withdrawn),emissionStartUtc:date(start),scheduledEndUtc:date(end),conditionContract:condition===zeroAddress?null:condition};
    }));
   }
   return {...source,status:count===BigInt(records.length)?'checked':'partial',count:String(count),records};
  }catch{return {...source,status:'unavailable',count:null,records:[]};}
 }));
 const [sources,index]=await Promise.all([lockerReads,indexedUnlocks(token,fetchImpl,env.VESTREAM_API_KEY,signal)]);
 return {token,chainId:8453,block:block==null?null:String(block),sources,index,scope:'These Base token lockers only. Historical records can include withdrawn assets. Other lockers and custom schedules may exist.'};
}

// Aggregate index findings stay separate from direct reads to avoid double counting.
async function indexedUnlocks(token,fetchImpl,key,signal){
 const url='https://www.vestream.io/api/v1/token/8453/'+token+'/unlocks?days=365';
 const source={name:'Vestream',url,windowDays:365};
 if(!key)return {...source,status:'not-configured'};
 try{
  const response=await fetchImpl(url,{headers:{authorization:'Bearer '+key},redirect:'error',signal});
  if(!response.ok)throw Error();
  const row=await response.json();
  if(row.chain_id!==8453||row.token_address?.toLowerCase()!==token.toLowerCase()||row.window_days!==365||
   !Number.isSafeInteger(row.summary?.active_schedules)||row.summary.active_schedules<0||
   !Array.isArray(row.unlocks)||!Array.isArray(row.summary.protocols))throw Error();
  const events=row.unlocks.map(event=>{
   const utc=Number.isSafeInteger(event.unlock_time)?date(BigInt(event.unlock_time)):null;
   if(!utc||!/^\d+(?:\.\d+)?$/.test(String(event.amount_unlocking)))throw Error();
   return {utc,providerAmount:String(event.amount_unlocking)};
  }).sort((a,b)=>a.utc.localeCompare(b.utc));
  return {...source,status:'indexed',activeSchedules:row.summary.active_schedules,protocols:row.summary.protocols.filter(p=>typeof p==='string'&&/^[a-z0-9_-]{1,32}$/i.test(p)),nextIndexedEvent:events[0]??null};
 }catch{return {...source,status:'unavailable'};}
}

export function baseLockSummary(scan){
 if(!scan)return [];
 const lines=['Token lock checks for '+scan.token+' at Base block '+(scan.block??'unavailable')+'.'];
 for(const s of scan.sources){
  lines.push(s.name+': '+(s.count===null?'unavailable':s.count+' records; '+s.records.length+' schedules read')+'. '+s.url);
  for(const r of s.records){
   if('lockedRaw' in r)lines.push('Launch vault: '+r.lockedRaw+' token base units locked. Cliff: '+r.cliffUtc+'. Vesting ends: '+r.vestingEndUtc+'.');
   else if('remainingRaw' in r)lines.push('Lock '+r.id+': '+r.remainingRaw+' token base units remain. First release: '+(r.firstReleaseUtc??'unknown')+'; cycle: '+r.cycleSeconds+' seconds.');
   else lines.push('Lock '+r.id+': '+r.remainingShares+' vesting shares remain. Scheduled end: '+(r.scheduledEndUtc??'unknown')+'.'+(r.conditionContract?' Additional release condition: '+r.conditionContract+'.':''));
  }
 }
 if(scan.index?.status==='indexed')lines.push('Vestream: '+scan.index.activeSchedules+' indexed active schedules. Next discrete release in the 365-day window: '+(scan.index.nextIndexedEvent?.utc??'none reported')+'. '+scan.index.url);
 else lines.push('Vestream multi-protocol index was not checked successfully.');
 return [...lines,scan.scope];
}
export function chatLockEvidence(scan,symbol){
 if(!scan)return '';
 const checked=scan.sources.filter(source=>source.status==='checked');
 const records=scan.sources.flatMap(source=>source.records.map(record=>({source,record})));
 const lines=['**Token locks for '+symbol+'**'];
 if(!records.length)lines.push(checked.length?'No records returned by '+checked.map(source=>source.name).join(', ')+'.':'The locker checks could not be completed.');
 for(const {source,record:r} of records){
  const schedule=r.cliffUtc?'Cliff '+r.cliffUtc+', vesting ends '+r.vestingEndUtc:r.firstReleaseUtc?'First release '+r.firstReleaseUtc+(r.cycleSeconds!=='0'?', then every '+r.cycleSeconds+' seconds':''):r.scheduledEndUtc?'Scheduled end '+r.scheduledEndUtc:'Release date unavailable';
  lines.push('['+source.name+']('+source.url+') '+schedule+(r.conditionContract?' (an additional release condition applies)':'')+'.');
 }
 if(checked.length!==scan.sources.length)lines.push('Some sources were unavailable or only partly checked.');
 if(scan.index?.status==='indexed')lines.push('Vestream reports '+scan.index.activeSchedules+' active schedules'+(scan.index.nextIndexedEvent?' with a discrete release on '+scan.index.nextIndexedEvent.utc:'')+'.');
 lines.push('Other contracts may hold additional locks.');
 return lines.join('\n\n');
}
