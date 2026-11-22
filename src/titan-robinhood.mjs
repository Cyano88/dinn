import {formatUnits,keccak256,parseAbi} from 'viem';

const managers=[
 ['V2.2','0x5fa3f3ca0c497b22ccd360aae8423738d1825fe9','0xacb5a9c6d9bf89969a11091b31ae80415b4a5f5b7e8ffc1b179f35d0ea2b9e83'],
 ['V2.1','0x102a70bda2c833b3483a2ee55c14c7ea0fb7a01b','0xf8454271651f613a9946191888a80ab84434ca0e918e20a98fc8ae427b3165d2'],
 ['V2','0x26b0654a0756dcd036d4e7215324f3d2be34d79e','0x5798eba95dad6a11309841ff2967657dcf2fa4348f244f1d7191ccf87d895198'],
 ['V1','0x713e56cee7060f01f710bf26aff988264dcfb311','0xc41e73941f6261b669d16292fd3425977deb1edebb69638dce11efdaf661a909']
];
const indexAbi=parseAbi(['function getTokenLockersForAddress(address) view returns(uint40[])']);
const v1=parseAbi(['function getTokenLockData(uint40) view returns(bool,uint40,address,address,address,address,uint40,uint40,uint256,uint256)']);
const v2=parseAbi(['function getTokenLockData(uint40) view returns(uint8,uint40,address,address,address,uint256,address,uint40,uint40,uint256)']);
const vestAbi=parseAbi(['function getVesting() view returns(uint40,uint40,uint40,uint256,uint256)','function vestedAmount() view returns(uint256)','function releasable() view returns(uint256)']);
const date=t=>new Date(Number(t)*1000).toISOString();

export function titanRecord(version,id,row,details,{address,decimals,timestamp}){
 // The index also contains owners, creators and the underlying assets of LP positions.
 if(!row||Number(row[1])!==Number(id))throw Error('Invalid indexed record');
 if(row[4].toLowerCase()!==address.toLowerCase())return null;
 const kind=version==='V1'?(row[0]?1:0):row[0];
 if(kind!==0&&kind!==3)return null;
 const amount=n=>typeof n==='bigint'&&Number.isInteger(decimals)?formatUnits(n,decimals):null;
 const end=BigInt(row[version==='V1'?7:8]),balance=row[version==='V1'?8:9];
 const record={id:String(id),child:row[2],owner:row[3],kind:kind===0?'fixed':'vesting',balance:amount(balance)};
 if(kind===0)return {...record,unlockDate:date(end),locked:amount(timestamp<end?balance:0n),withdrawable:amount(timestamp>=end?balance:0n)};
 const [schedule,vested,releasable]=details;
 const valid=schedule&&schedule[0]<=schedule[1]&&schedule[1]<=schedule[2]&&schedule[4]<=schedule[3];
 const remaining=valid&&vested!=null&&vested>=schedule[4]&&vested<=schedule[3]?schedule[3]-vested:null;
 return {...record,start:valid?date(schedule[0]):null,cliff:valid?date(schedule[1]):null,end:valid?date(schedule[2]):null,
  scheduledUnvested:amount(remaining),withdrawable:amount(releasable!=null&&releasable<=balance?releasable:null)};
}

export async function titanLocks(input){
 const {client,address,blockNumber}=input;
 const batch=contracts=>client.multicall({contracts,deployless:true,blockNumber,allowFailure:true,batchSize:2048});
 return Promise.all(managers.map(async ([version,manager,hash])=>{
  const report={version,manager,status:'unavailable',indexed:null,checked:0,records:[]};
  try{
   const [code,index]=await Promise.all([client.getCode({address:manager,blockNumber}),client.readContract({address:manager,abi:indexAbi,functionName:'getTokenLockersForAddress',args:[address],blockNumber})]);
   if(!code||keccak256(code)!==hash)return report;
   const ids=[...new Set(index)].sort((a,b)=>Number(b)-Number(a));
   report.indexed=ids.length;
   const selected=ids.slice(0,64);
   const rows=selected.length?await batch(selected.map(id=>({address:manager,abi:version==='V1'?v1:v2,functionName:'getTokenLockData',args:[id]}))):[];
   let partial=selected.length<ids.length;
   const childCalls=rows.flatMap(({result:r})=>r?.[0]===3&&r[4].toLowerCase()===address.toLowerCase()?['getVesting','vestedAmount','releasable'].map(functionName=>({address:r[2],abi:vestAbi,functionName})):[]);
   const details=childCalls.length?(await batch(childCalls)).map(r=>r.result):[];
   for(const [i,{result:row}] of rows.entries()){
    if(!row){partial=true;continue;}
    const vest=row[0]===3&&row[4].toLowerCase()===address.toLowerCase();
    const record=titanRecord(version,selected[i],row,vest?details.splice(0,3):[],input);
    report.checked++;
    if(!record)continue;
    report.records.push(record);
    if(record.withdrawable===null||vest&&record.scheduledUnvested===null)partial=true;
   }
   report.status=partial?'partial':report.records.length?'observed':'no-match';
  }catch{if(report.indexed!==null)report.status='partial';}
  return report;
 }));
}

export function titanLines(reports,detail=true){
 if(!reports)return [];
 const lines=['Titan Locker: '+reports.map(r=>r.version+' '+r.status+' ('+r.records.length+')').join(', ')+'.'];
 if(detail)for(const r of reports)for(const x of r.records){
  const terms=x.kind==='fixed'?'Locked '+(x.locked??'unavailable')+' until '+x.unlockDate:'Scheduled balance still to vest '+(x.scheduledUnvested??'unavailable')+'. Cliff '+(x.cliff??'unavailable')+', ends '+(x.end??'unavailable');
  lines.push(r.version+' #'+x.id+'. '+terms+'. Withdrawable '+(x.withdrawable??'unavailable')+'. https://robinhoodchain.blockscout.com/address/'+x.child);
 }
 return lines;
}
