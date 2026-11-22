import {formatUnits,keccak256,parseAbi} from 'viem';

const manager='0xB31eAEFA2A0bdC53Df6D7a7f0f289b6eE1a8AAF3';
const runtimeHash='0x53b7b930e77df1aa4e32979dfd28c8fe0a8b22687a874ae54f38b9f0e5dd7140';
const fields='address token,address creator,address beneficiary,uint256 totalAmount,uint256 released,bool isSoft,bool isNftized,bool cancelled,bool isTopable,uint8 vestingType';
const abi=parseAbi([
 'function nextVestingId() view returns(uint256)',
 'function vestingSchedules(uint256) view returns('+fields+')',
 'function getVestingSchedule(uint256) view returns(('+fields+', (uint256 time,uint256 amount,uint8 eqType)[] tranches))',
 'function getReleasableAmount(uint256) view returns(uint256)',
 'function getVestedAmount(uint256) view returns(uint256)'
]);
const source='https://robinhoodchain.blockscout.com/address/'+manager+'?tab=read_contract';
const call=(functionName,args=[])=>({address:manager,abi,functionName,args});
const same=(a,b)=>a?.toLowerCase()===b.toLowerCase();
const iso=t=>new Date(Number(t)*1000).toISOString();

export async function uncxVesting({client,address,blockNumber,timestamp,decimals}){
 const report={manager,source,blockNumber:String(blockNumber),status:'unavailable',scanned:0,matched:0,records:[]};
 try{
  const [code,next]=await Promise.all([client.getCode({address:manager,blockNumber}),client.readContract({...call('nextVestingId'),blockNumber})]);
  if(!code||keccak256(code)!==runtimeHash)return report;
  return await scanSchedules({client,address,blockNumber,timestamp,decimals,next,report});
 }catch{return report;}
}

export async function scanSchedules({client,address,blockNumber,timestamp,decimals,next,report}){
 try{
  // Include ID zero; an unused mapping slot returns the zero address.
  const count=Number(next>256n?256n:next);
  const ids=Array.from({length:count},(_,i)=>next-1n-BigInt(i));
  const batch=contracts=>client.multicall({contracts,deployless:true,blockNumber,allowFailure:true,batchSize:2048});
  const rows=count?await batch(ids.map(id=>call('vestingSchedules',[id]))):[];
  let partial=next>256n;
  const matches=[];
  for(const [i,row] of rows.entries()){
   if(row.status!=='success'){partial=true;continue;}
   report.scanned++;
   if(same(row.result[0],address))matches.push({id:ids[i],cancelled:row.result[7]});
  }
  report.matched=matches.length;
  report.firstId=count?String(ids.at(-1)):null;
  report.lastId=count?String(ids[0]):null;
  const selected=matches.sort((a,b)=>Number(a.cancelled)-Number(b.cancelled)).slice(0,64).map(row=>row.id);
  partial ||= selected.length<matches.length;
  const methods=['getVestingSchedule','getVestedAmount','getReleasableAmount'];
  const details=selected.length?await batch(selected.flatMap(id=>methods.map(name=>call(name,[id])))):[];
  const amount=n=>typeof n==='bigint'&&Number.isInteger(decimals)?formatUnits(n,decimals):null;
  for(const [i,id] of selected.entries()){
   const [schedule,vested,available]=details.slice(i*3,i*3+3).map(row=>row.result);
   if(!schedule||!same(schedule.token,address)){partial=true;continue;}
   const dates=schedule.tranches.map(t=>t.time).sort((a,b)=>a<b?-1:a>b?1:0);
   const nextDate=dates.find(t=>t>timestamp);
   const unvested=vested!=null&&vested<=schedule.totalAmount?schedule.totalAmount-vested:null;
   if(!schedule.cancelled&&(unvested==null||available==null||!Number.isInteger(decimals)))partial=true;
   report.records.push({id:String(id),token:schedule.token,cancelled:schedule.cancelled,soft:schedule.isSoft,
    scheduledAllocation:amount(schedule.totalAmount),scheduledUnvested:schedule.cancelled?null:amount(unvested),
    currentlyWithdrawable:amount(available),nextScheduleDate:!schedule.cancelled&&nextDate?iso(nextDate):null,
    scheduleEnd:dates.length?iso(dates.at(-1)):null});
  }
  report.status=partial?'partial':matches.length?'observed':'no-match';
 }catch{report.status=report.scanned?'partial':'unavailable';}
 return report;
}

export function uncxRecordLine(r){
  if(r.cancelled)return 'Schedule '+r.id+' was cancelled.';
  return 'Schedule '+r.id+(r.soft?' (soft vesting)':'')+'. Scheduled tokens still to vest: '+(r.scheduledUnvested??'unavailable')+'. Withdrawable now: '+(r.currentlyWithdrawable??'unavailable')+'. Next schedule milestone: '+(r.nextScheduleDate||'none ahead')+'.';
}

export function uncxLines(report){
 if(!report)return [];
 const lines=['UNCX V2: '+report.status+' ('+report.scanned+' schedule IDs checked, '+report.matched+' matched, '+report.records.length+' detailed).'];
 for(const r of report.records){
  lines.push(uncxRecordLine(r));
 }
 lines.push('Source: '+report.source);
 return lines;
}
