import {encodeFunctionData,decodeFunctionResult,parseAbi,toEventSelector,zeroAddress} from 'viem';

const sablierUrl='https://indexer.hyperindex.xyz/53b7e25/v1/graphql';
const hedgeyPlans=[
 {name:'Hedgey lockup plans',address:'0x1961a23409ca59eedca6a99c97e4087dad752486',vesting:false},
 {name:'Hedgey vesting plans',address:'0x2cde9919e81b20b4b33dd562a48a84b54c48f00c',vesting:true}
];
const planAbi=vesting=>parseAbi([
 'function plans(uint256) view returns (address,uint256,uint256,uint256,uint256,uint256'+(vesting?',address,bool':'')+')',
 'function planEnd(uint256) view returns (uint256)',
 'function totalSupply() view returns (uint256)',
 'function tokenByIndex(uint256) view returns (uint256)'
]);
const limit=5;
const timestamp=value=>{
 if(!/^\d+$/.test(String(value))||BigInt(value)>8640000000000n)throw Error('Invalid schedule timestamp');
 return BigInt(value)===0n?null:new Date(Number(value)*1000).toISOString();
};

async function sablier(token,fetchImpl,signal){
 const source={name:'Sablier Lockup',url:'https://docs.sablier.com/api/streams/indexers',basis:'Current indexed non-canceled, non-depleted streams with future end dates. Historical versions and completed withdrawals may be omitted.'};
 try{
  const asset='asset-8453-'+token.toLowerCase();
  const query='query TokenStreams($asset:String!,$now:numeric!){LockupStream(where:{chainId:{_eq:8453},asset_id:{_eq:$asset},endTime:{_gt:$now},depleted:{_eq:false},canceled:{_eq:false}},order_by:{id:asc},limit:6){chainId asset_id contract tokenId startTime endTime cliffTime category cancelable}}';
  const response=await fetchImpl(sablierUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query,variables:{asset,now:String(Math.floor(Date.now()/1000))}}),signal});
  if(!response.ok)throw Error();
  const payload=await response.json(),rows=payload.data?.LockupStream;
  if(payload.errors||!Array.isArray(rows)||rows.length>limit+1)throw Error();
  const records=rows.slice(0,limit).map(row=>{
   if(String(row.chainId)!=='8453'||row.asset_id!==asset||!/^0x[0-9a-f]{40}$/i.test(row.contract)||!/^\d+$/.test(row.tokenId)||typeof row.cancelable!=='boolean')throw Error();
   const startUtc=timestamp(row.startTime),endUtc=timestamp(row.endTime),cliffUtc=row.cliffTime==null?null:timestamp(row.cliffTime);
   if(!startUtc||!endUtc||BigInt(row.endTime)<BigInt(row.startTime))throw Error();
   return {id:String(row.tokenId),contract:row.contract,startUtc,endUtc,cliffUtc,cancelable:row.cancelable};
  });
  return {...source,status:rows.length>limit?'partial':'indexed',records};
 }catch{return {...source,status:'unavailable',records:[]};}
}

async function hedgey(config,token,block,rpc,fetchImpl,signal){
 const source={name:config.name,url:'https://basescan.org/address/'+config.address+'#readContract',basis:'Indexed creation events for this token. Up to five recent plan IDs checked onchain. Segmented plans can fall outside this search.'};
 try{
  if(block==null)throw Error();
  const blockTag='0x'+BigInt(block).toString(16);
  // These two non-voting plans custody the asset directly. A zero balance only describes this contract at this block.
  const balanceAbi=parseAbi(['function balanceOf(address) view returns (uint256)']);
  const balanceCall={to:token,data:encodeFunctionData({abi:balanceAbi,functionName:'balanceOf',args:[config.address]})};
  const balanceResponse=await fetchImpl(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_call',params:[balanceCall,blockTag]}),signal});
  if(!balanceResponse.ok)throw Error();
  const custody=decodeFunctionResult({abi:balanceAbi,functionName:'balanceOf',data:(await balanceResponse.json()).result});
  if(custody===0n)return {...source,status:'checked',custodyRaw:'0',records:[]};
  source.custodyRaw=String(custody);
  const topicToken='0x'+token.slice(2).toLowerCase().padStart(64,'0');
  const params=new URLSearchParams({module:'logs',action:'getLogs',fromBlock:'0',toBlock:BigInt(block).toString(),address:config.address,topic3:topicToken});
  const abi=planAbi(config.vesting);
  async function read(name,...args){
   const body={jsonrpc:'2.0',id:1,method:'eth_call',params:[{to:config.address,data:encodeFunctionData({abi,functionName:name,args})},'0x'+BigInt(block).toString(16)]};
   const res=await fetchImpl(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal});
   if(!res.ok)throw Error();
   return decodeFunctionResult({abi,functionName:name,data:(await res.json()).result});
  }
  const ids=new Set();
  let truncated=false,enumerated=false;
  try{
   const response=await fetchImpl('https://base.blockscout.com/api?'+params,{signal:AbortSignal.any([signal,AbortSignal.timeout(2300)])});
   if(!response.ok)throw Error();
   const data=await response.json();
   if(!Array.isArray(data.result)||!(data.status==='1'||(data.status==='0'&&data.message==='No logs found'&&!data.result.length)))throw Error();
   const topic=toEventSelector('PlanCreated(uint256,address,address,uint256,uint256,uint256,uint256,uint256,uint256'+(config.vesting?',address,bool':'')+')');

   for(const log of data.result){
    if(log.address?.toLowerCase()!==config.address||log.topics?.[3]?.toLowerCase()!==topicToken||BigInt(log.blockNumber)>BigInt(block))throw Error();
    if(log.topics[0]===topic)ids.add(BigInt(log.topics[1]));
   }
   truncated=data.result.length>=1000;
  }catch{
   // The public explorer can be unavailable. Sample existing plan NFTs and verify the asset onchain.
   enumerated=true;
   const supply=await read('totalSupply');
   const size=Number(supply>BigInt(limit)?BigInt(limit):supply);
   const discovered=await Promise.all(Array.from({length:size},(_,i)=>read('tokenByIndex',supply-1n-BigInt(i))));
   for(const id of discovered)ids.add(id);
   truncated=supply>BigInt(limit);
   source.basis='Onchain enumerable plan fallback. Checked '+size+' of '+supply+' existing plan NFTs at the pinned block.';
  }
  const selected=[...ids].sort((a,b)=>a>b?-1:1).slice(0,limit);
  const reads=await Promise.allSettled(selected.map(async id=>{
   const [asset,amount,start,cliff,rate,period]=await read('plans',id);
   if(asset===zeroAddress&&amount===0n)return null;
   if(enumerated&&asset.toLowerCase()!==token.toLowerCase())return null;
   if(asset.toLowerCase()!==token.toLowerCase()||period===0n||rate===0n)throw Error();
   const end=await read('planEnd',id);
   if(end<start||end<cliff)throw Error();
   return {id:String(id),unredeemedRaw:String(amount),rateRaw:String(rate),periodSeconds:String(period),startUtc:timestamp(start),cliffUtc:timestamp(cliff),endUtc:timestamp(end)};
  }));
  const partial=ids.size>limit||truncated||reads.some(r=>r.status==='rejected');
  return {...source,status:partial?'partial':'checked',sampledPlanIds:selected.length,records:reads.filter(r=>r.status==='fulfilled'&&r.value).map(r=>r.value)};
 }catch{return {...source,status:'unavailable',records:[]};}
}

export function additionalBaseSchedules(token,block,rpc,fetchImpl,signal){
 return Promise.all([sablier(token,fetchImpl,signal),...hedgeyPlans.map(plan=>hedgey(plan,token,block,rpc,fetchImpl,signal))]);
}

export function additionalScheduleLines(reports=[]){
 return reports.map(report=>{
  if(report.custodyRaw==='0')return report.name+': the plan contract held none of this token at the checked block.';
  if(report.status==='unavailable')return report.name+(report.custodyRaw?' held tokens, but its schedules could not be verified.':' could not be checked.');
  const details=report.records.map(r=>'Plan '+r.id+(r.cliffUtc?' cliff '+r.cliffUtc+',':'')+' scheduled end '+r.endUtc+(r.cancelable?' (cancelable)':'')+'.');
  const text=details.length?details.join(' '):'No matching schedules returned.';
  return report.name+' ('+report.status+'): '+text;
 });
}
