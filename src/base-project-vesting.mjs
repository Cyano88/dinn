import {readFileSync} from 'node:fs';
import {decodeAbiParameters,decodeFunctionData,decodeFunctionResult,encodeFunctionData,formatUnits,parseAbi,toEventSelector} from 'viem';
import {blockscoutRead} from './blockscout.mjs';

const catalog=JSON.parse(readFileSync(new URL('./base-magna-escrows.json',import.meta.url),'utf8'));
const allocation='(string id,address beneficiary,uint256 total,bool cancelable,bool revokable,bool transferableByAdmin,bool transferableByBeneficiary)';
const state='(address withdrawalAddress,uint32 terminated,uint256 withdrawn,uint256 terminatedWithdrawn,uint256 funded,uint256 terminatedAmount)';
const abi=parseAbi([
 'function merkleContracts(string) view returns(address)','function token() view returns(address)',
 'function decimals() view returns(uint8)','function balanceOf(address) view returns(uint256)','function start() view returns(uint256)','function duration() view returns(uint256)',
 'function released(address) view returns(uint256)','function releasable(address) view returns(uint256)','function vestedAmount(address,uint64) view returns(uint256)',
 'function withdraw(uint256,uint32,bytes,bytes32[])','function withdraw(uint256,uint32,bytes,bytes32[],address,bytes)',
 'function getCalendarLeafAllocationData(uint32,bytes,bytes32[]) view returns(('+allocation+' allocation,string scheduleId,'+state+' state),(string id,uint32[] times,uint256[] amounts))',
 'function getIntervalLeafAllocationData(uint32,bytes,bytes32[]) view returns(('+allocation+' allocation,string scheduleId,'+state+' state),(string id,(uint32 start,uint32 period,uint32 count,uint256 amount)[] pieces))'
]);
const date=n=>new Date(Number(n)*1000).toISOString();
const addr=/^0x[0-9a-f]{40}$/i;
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();

function reader(rpcUrl,fetchImpl,block,signal){
 const tag='0x'+BigInt(block).toString(16);
 async function rpc(method,params){
  const res=await fetchImpl(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:1,jsonrpc:'2.0',method,params}),signal});
  if(!res.ok)throw Error('Base RPC unavailable');
  const data=await res.json();if(data.error||data.result==null)throw Error('Base read failed');
  return data.result;
 }
 async function call(address,name,args=[]){
  const data=encodeFunctionData({abi,functionName:name,args});
  return decodeFunctionResult({abi,functionName:name,data:await rpc('eth_call',[{to:address,data},tag])});
 }
 return {rpc,call,tag};
}

export async function magnaAllocation(hash,escrow,block,read){
 const tx=await read.rpc('eth_getTransactionByHash',[hash]);
 if(!same(tx.hash,hash)||!same(tx.to,escrow)||tx.blockNumber==null||BigInt(tx.blockNumber)>BigInt(block)||tx.input.length>160000)throw Error('Transaction mismatch');
 const {functionName,args}=decodeFunctionData({abi,data:tx.input});
 if(functionName!=='withdraw')throw Error('No public allocation proof in this call');
 const [,root,leaf,proof]=args;
 const [kind]=decodeAbiParameters([{type:'string'}],leaf);
 if(!['calendar','interval'].includes(kind)||proof.length>64)throw Error('Unsupported proof');
 const method=kind==='calendar'?'getCalendarLeafAllocationData':'getIntervalLeafAllocationData';
 // Magna validates this leaf against its stored root and returns the allocation's current distribution state.
 const [row,schedule]=await read.call(escrow,method,[root,leaf,proof]);
 const id=row.allocation.id;
 if(!id||row.scheduleId!==schedule.id)throw Error('Schedule mismatch');
 const terms=kind==='calendar'?schedule.times.map((t,i)=>({releaseUtc:date(t),amountRaw:String(schedule.amounts[i])})):
  schedule.pieces.map(p=>({startUtc:date(p.start),periodSeconds:p.period,periods:p.count,amountRaw:String(p.amount),endUtc:date(BigInt(p.start)+BigInt(p.period)*BigInt(p.count))}));
 if(!terms.length||terms.length>1024||kind==='calendar'&&schedule.times.length!==schedule.amounts.length)throw Error('Invalid schedule');
 const endUtc=terms.map(t=>t.releaseUtc??t.endUtc).sort().at(-1);
 const header=await read.rpc('eth_getBlockByNumber',[read.tag,false]);
 if(BigInt(header.number)!==BigInt(block))throw Error('Block mismatch');
 const now=Number(BigInt(header.timestamp));
 const future=kind==='calendar'?schedule.times.filter((t,i)=>t>now&&schedule.amounts[i]>0n):schedule.pieces.flatMap(p=>{
  if(!p.amount||!p.period||!p.count)return [];
  const n=Math.max(1,Math.floor((now-p.start)/p.period)+1);
  return n<=p.count?[p.start+n*p.period]:[];
 });
 const nextScheduledUtc=row.state.terminated===0&&future.length?date(Math.min(...future)):null;
 return {id,kind,endUtc,nextScheduledUtc,terminated:row.state.terminated!==0,fundedRaw:String(row.state.funded),withdrawnRaw:String(row.state.withdrawn),allocationRaw:String(row.allocation.total),terms,proofTransaction:hash};
}

// Extend the verified snapshot using finalized factory events. A failed range leaves its cursor unchanged.
const discoveryByReader=new WeakMap();
const creationTopic=toEventSelector('MerkleCreated(address,address,string)');
async function factoryCatalog(read,block,fetchImpl,rpcUrl){
 const requested=Number(block);
 if(requested<=catalog.throughBlock)return {entries:catalog.entries,throughBlock:requested};
 let state=discoveryByReader.get(fetchImpl);
 if(!state||state.rpcUrl!==rpcUrl){
  state={rpcUrl,throughBlock:catalog.throughBlock,entries:[...catalog.entries],retryAt:0,pending:null};
  discoveryByReader.set(fetchImpl,state);
 }
 if(!state.pending&&Date.now()>=state.retryAt&&state.throughBlock<requested){
  state.pending=(async()=>{
   const finalized=await read.rpc('eth_getBlockByNumber',['finalized',false]);
   const target=Math.min(requested,Number(BigInt(finalized.number)));
   for(let range=0;range<3&&state.throughBlock<target;range++){
    const from=state.throughBlock+1,to=Math.min(target,from+999);
    const logs=await read.rpc('eth_getLogs',[{address:catalog.factory,topics:[creationTopic],fromBlock:'0x'+from.toString(16),toBlock:'0x'+to.toString(16)}]);
    if(!Array.isArray(logs)||logs.length>40)throw Error('Incomplete factory range');
    const additions=await Promise.all(logs.map(async log=>{
     const created=Number(BigInt(log.blockNumber));
     if(log.removed||!same(log.address,catalog.factory)||!same(log.topics?.[0],creationTopic)||!/^0x0{24}[0-9a-f]{40}$/i.test(log.topics[2])||created<from||created>to)throw Error('Invalid factory entry');
     const address='0x'+log.topics[2].slice(-40).toLowerCase();
     const [id]=decodeAbiParameters([{type:'string'}],log.data);
     const [registered,token]=await Promise.all([read.call(catalog.factory,'merkleContracts',[id]),read.call(address,'token')]);
     if(!same(address,registered)||!addr.test(token))throw Error('Factory mismatch');
     return {id,address,created,token:token.toLowerCase()};
    }));
    state.entries.push(...additions);state.throughBlock=to;
   }
   state.retryAt=Date.now()+(state.throughBlock>=target?30000:1000);
  })().catch(()=>{state.retryAt=Date.now()+10000;}).finally(()=>{state.pending=null;});
 }
 if(state.pending)await state.pending;
 return {entries:state.entries,throughBlock:Math.min(requested,state.throughBlock)};
}

async function magna(token,block,read,env,fetchImpl,signal,rpcUrl){
 const view=await factoryCatalog(read,block,fetchImpl,rpcUrl);
 const matches=view.entries.filter(d=>same(d.token,token)&&d.created<=Number(block));
 const out={name:'Magna Airlock V2.1',source:'https://docs.magna.so/admins/privacy-and-security/magna-contract-deployments',catalogThroughBlock:view.throughBlock,catalogSize:view.entries.length,matchingEscrows:matches.length,escrows:[],status:matches.length?'partial':'no-catalog-match'};
 out.escrows=await Promise.all(matches.slice(0,3).map(async d=>{
  const result={address:d.address,status:'unavailable',allocations:[]};
  try{
   const [registered,asset,balance]=await Promise.all([read.call(catalog.factory,'merkleContracts',[d.id]),read.call(d.address,'token'),read.call(token,'balanceOf',[d.address])]);
   if(!same(registered,d.address)||!same(asset,token))return result;
   result.balanceRaw=String(balance); result.status='custody-verified';
   const path='addresses/'+d.address+'/transactions';
   const indexedHashes=async()=>{
    try{
     const response=await fetchImpl('https://base.blockscout.com/api/v2/'+path,{signal:AbortSignal.any([signal,AbortSignal.timeout(1800)])});
     if(!response.ok)throw Error();
     return (await response.json()).items;
    }catch{
     try{return (await blockscoutRead(path,{chainId:8453,fetchImpl,env,signal:AbortSignal.any([signal,AbortSignal.timeout(1800)])})).items;}catch{return [];}
    }
   };
   const proofChecks=new Map();
   function verify(hash){
    if(!proofChecks.has(hash))proofChecks.set(hash,magnaAllocation(hash,d.address,block,read).catch(()=>null));
   }
   for(const hash of d.proofTransactions??[])verify(hash);
   const rows=await indexedHashes();
   for(const tx of (Array.isArray(rows)?rows:[]).filter(tx=>same(tx.to?.hash,d.address)&&tx.method==='withdraw'&&tx.status==='ok'&&/^0x[0-9a-f]{64}$/i.test(tx.hash)&&tx.block_number<=Number(block)).slice(0,3))verify(tx.hash);
   const checked=await Promise.all(proofChecks.values());
   const unique=new Map();for(const item of checked)if(item&&!unique.has(item.id))unique.set(item.id,item);
   result.allocations=[...unique.values()];if(result.allocations.length)result.status='public-proofs-verified';
   return result;
  }catch{return result;}
 }));
 return out;
}

// A custom wallet may override vesting or provide an admin exit. Report only what its getters and custody agree on.
async function walletSchedule(holder,token,now,read){
 if(await read.rpc('eth_getCode',[holder,read.tag])==='0x')return null;
 const [start,duration,released,releasable,balance,vested]=await Promise.all([
  read.call(holder,'start'),read.call(holder,'duration'),read.call(holder,'released',[token]),
  read.call(holder,'releasable',[token]),read.call(token,'balanceOf',[holder]),read.call(holder,'vestedAmount',[token,now])
 ]);
 const end=start+duration;
 if(!balance||!start||end>253402300799n||releasable>balance||released+releasable!==vested)return null;
 const atEnd=await read.call(holder,'vestedAmount',[token,end]);
 if(atEnd!==released+balance)return null;
 return {address:holder,startUtc:date(start),endUtc:date(end),balanceRaw:String(balance),releasedRaw:String(released),releasableRaw:String(releasable),unvestedRaw:String(balance-releasable),basis:'Contract-reported vesting interface; admin exits and future changes were not assessed.'};
}

export async function projectVesting(token,block,rpcUrl,fetchImpl,env,holders,signal){
 if(block==null)return {status:'unavailable'};
 const read=reader(rpcUrl,fetchImpl,block,signal);
 const rows=holders?.largestBalancesInSample;
 const candidates=[...new Set((rows??[]).map(row=>row.address?.toLowerCase()).filter(a=>addr.test(a)))].slice(0,3);
 const walletReads=async()=>{
  if(!candidates.length)return {status:'not-sampled',candidates:0,records:[]};
  const header=await read.rpc('eth_getBlockByNumber',[read.tag,false]);
  if(BigInt(header.number)!==BigInt(block))throw Error('Block mismatch');
  const probes=await Promise.allSettled(candidates.map(a=>walletSchedule(a,token,BigInt(header.timestamp),read)));
  return {status:'sampled',candidates:candidates.length,inconclusive:probes.filter(p=>p.status==='rejected').length,records:probes.flatMap(p=>p.status==='fulfilled'&&p.value?[p.value]:[])};
 };
 const [factory,wallets]=await Promise.all([magna(token,block,read,env,fetchImpl,signal,rpcUrl),walletReads().catch(()=>({status:'unavailable',records:[]}))]);
 if(factory.escrows.some(e=>e.balanceRaw!=null)||wallets.records?.length){
  try{
   const decimals=await read.call(token,'decimals');
   for(const h of wallets.records??[])h.unvestedTokens=formatUnits(BigInt(h.unvestedRaw),decimals);
   for(const e of factory.escrows){
    if(e.balanceRaw!=null)e.balanceTokens=formatUnits(BigInt(e.balanceRaw),decimals);
    for(const a of e.allocations)a.allocationTokens=formatUnits(BigInt(a.allocationRaw),decimals);
   }
  }catch{/* Raw token units are retained if the denomination cannot be read. */}
 }
 return {magna:factory,wallets};
}

export function projectVestingLines(findings){
 if(!findings?.magna)return [];
 const {magna:factory,wallets}=findings,lines=[];
 if(factory.matchingEscrows>factory.escrows.length)lines.push('Checked '+factory.escrows.length+' of '+factory.matchingEscrows+' matching Magna escrows.');
 if(!factory.matchingEscrows)lines.push('Magna: no matching escrow in the factory catalog through Base block '+factory.catalogThroughBlock+'.');
 for(const escrow of factory.escrows){
  if(!escrow.allocations.length)lines.push('Magna escrow '+escrow.address+': '+(escrow.balanceRaw!=null?'token balance checked; ':'')+'allocation dates unverified.');
  for(const a of escrow.allocations)lines.push('Magna '+a.kind+' allocation'+(a.allocationTokens?' of '+a.allocationTokens+' tokens':'')+': '+(a.terminated?'terminated; original scheduled end ':'scheduled end ')+a.endUtc+(a.nextScheduledUtc?' (next scheduled release '+a.nextScheduledUtc+')':'')+'. Public proof: https://basescan.org/tx/'+a.proofTransaction);
 }
 for(const h of wallets.records??[])lines.push('Holder contract '+h.address+' reports '+(h.unvestedTokens?h.unvestedTokens+' unvested tokens, with a scheduled end of ':'vesting through ')+h.endUtc+'. '+h.basis);
 if(!wallets.records?.length)lines.push(wallets.status==='sampled'?'No custom schedule verified among '+wallets.candidates+' sampled holders.':'Custom holder contracts were not checked.');
 if(wallets.inconclusive)lines.push(wallets.inconclusive+' sampled holder checks were inconclusive.');
 return lines;
}
