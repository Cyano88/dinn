import {formatUnits,keccak256,parseAbi} from 'viem';

const abi=parseAbi([
 'function locksByToken(address) view returns(uint256[])',
 'function schedulesByToken(address) view returns(uint256[])',
 'function locks(uint256) view returns(address,address,uint256,uint256,bool)',
 'function schedules(uint256) view returns(address,uint64,address,uint64,address,uint64,uint128,uint128)',
 'function claimable(uint256) view returns(uint256)'
]);
const managers=[
 {kind:'lock',address:'0xd0f7d8c6e9f6d80c297bebe4f7fd1b9c8125c32f',hash:'0x1ec0a7c8ab5624a07a04f2fc170cd52fa806298826bae7376487c07f4aba603e',index:'locksByToken',methods:['locks']},
 {kind:'vesting',address:'0x910e19bcc4bce46999994ed7297e0fc4431ec72e',hash:'0x474437b803ca274825d915d62f5453648b72eafebd76c25a3d3c80a7ae16d663',index:'schedulesByToken',methods:['schedules','claimable']}
];
const date=t=>new Date(Number(t)*1000).toISOString();

export function hoodRecord(kind,id,values,{address,decimals,timestamp}){
 const [row,claimable]=values;
 const amount=n=>typeof n==='bigint'&&Number.isInteger(decimals)?formatUnits(n,decimals):null;
 const same=token=>token?.toLowerCase()===address.toLowerCase();
 if(kind==='lock'){
  if(!row||!same(row[1]))return null;
  const [owner,,total,end,withdrawn]=row;
  const frozen=!withdrawn&&end>timestamp;
  return {kind,id:String(id),owner,status:withdrawn?'withdrawn':frozen?'locked':'withdrawable',unlockDate:date(end),locked:amount(frozen?total:0n),withdrawable:amount(!withdrawn&&!frozen?total:0n)};
 }
 if(!row||!same(row[4]))return null;
 const [creator,start,beneficiary,cliff,,end,total,claimed]=row;
 if(claimed>total||end<start||cliff>end)return null;
 const remaining=total-claimed,known=typeof claimable==='bigint'&&claimable<=remaining;
 return {kind,id:String(id),creator,beneficiary,status:remaining===0n?'claimed':timestamp<cliff?'before cliff':timestamp<end?'vesting':'ended',
  start:date(start),cliff:date(cliff),end:date(end),allocation:amount(total),claimed:amount(claimed),
  locked:known?amount(remaining-claimable):null,withdrawable:known?amount(claimable):null};
}

export async function hoodLocks(input){
 const {client,address,blockNumber}=input;
 return Promise.all(managers.map(async manager=>{
  const call=(functionName,args)=>({address:manager.address,abi,functionName,args});
  const report={kind:manager.kind,manager:manager.address,source:'https://robinhoodchain.blockscout.com/address/'+manager.address+'?tab=read_contract',status:'unavailable',matched:null,records:[]};
  try{
   const [code,ids]=await Promise.all([client.getCode({address:manager.address,blockNumber}),client.readContract({...call(manager.index,[address]),blockNumber})]);
   if(!code||keccak256(code)!==manager.hash)return report;
   const unique=[...new Set(ids)].sort((a,b)=>a>b?-1:a<b?1:0);
   report.matched=unique.length;
   const selected=unique.slice(0,64);
   const width=manager.methods.length;
   const rows=selected.length?await client.multicall({deployless:true,blockNumber,allowFailure:true,batchSize:2048,contracts:selected.flatMap(id=>manager.methods.map(name=>call(name,[id])))}):[];
   let partial=selected.length<unique.length;
   for(const [i,id] of selected.entries()){
    const values=rows.slice(i*width,(i+1)*width).map(row=>row.result);
    const record=hoodRecord(manager.kind,id,values,input);
    if(record)report.records.push(record);
    if(!record||record.withdrawable===null)partial=true;
   }
   report.status=partial?'partial':unique.length?'observed':'no-match';
  }catch{if(report.matched!==null)report.status='partial';}
  return report;
 }));
}

export function hoodLines(reports,detailed=true){
 return (reports||[]).flatMap(report=>{
  const lines=['HoodLock '+(report.kind==='lock'?'token locks':'vesting')+': '+report.status+(report.matched===null?'':' ('+report.records.length+' of '+report.matched+' records checked)')+'.'];
  if(!detailed)return lines;
  for(const r of report.records){
   const dates=r.kind==='lock'?'Unlock date '+r.unlockDate:'Vesting cliff '+r.cliff+', ends '+r.end;
   lines.push('#'+r.id+' '+r.status+'. '+dates+'. Locked: '+(r.locked??'unavailable')+'. Withdrawable: '+(r.withdrawable??'unavailable')+'.');
  }
  lines.push('Source: '+report.source);
  return lines;
 });
}
