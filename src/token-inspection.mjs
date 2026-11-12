import {attachVerifiedArtifact,controlResearch} from './token-controls.mjs';
import {researchHolders} from './holder-research.mjs';
import {researchHolderBehavior} from './holder-behavior.mjs';
import {researchPonsToken,explorerSource} from './token-research.mjs';
import {createPublicClient,http,parseAbi,formatUnits,isAddress,zeroAddress} from 'viem';
const abi=parseAbi(['function name() view returns (string)','function symbol() view returns (string)','function decimals() view returns (uint8)','function totalSupply() view returns (uint256)','function owner() view returns (address)']);
const slots={implementation:'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',beacon:'0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50'};
const unknown=(label,detail,evidence=[])=>({label,status:'unknown',detail,evidence});
const clean=value=>String(value).replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,'').slice(0,80);
export async function sourceVerification(chainId,address,code,{fetchImpl=fetch,signal}={}){
 const sourceUrl='https://sourcify.dev/server/v2/contract/'+chainId+'/'+address+'?fields=runtimeBytecode.onchainBytecode,abi';
 try{
  const response=await fetchImpl(sourceUrl,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000),redirect:'error'});
  if(response.status===404)return unknown('Source verification','No matching Sourcify record was found. Verification elsewhere has not been checked.');
  if(!response.ok)return unknown('Source verification','The source-verification service is unavailable for this lookup.');
  const text=await response.text();if(text.length>1000000)return unknown('Source verification','The verification record exceeded the read limit.');
  const record=JSON.parse(text);
  if(String(record.chainId)!==String(chainId)||record.address?.toLowerCase()!==address.toLowerCase()||!['exact_match','match'].includes(record.runtimeMatch)||record.runtimeBytecode?.onchainBytecode?.toLowerCase()!==code.toLowerCase())return unknown('Source verification','The available record does not match the runtime code at the checked block.');
  const names=Array.isArray(record.abi)?record.abi.filter(f=>f?.type==='function'&&!['view','pure'].includes(f.stateMutability)&&typeof f.name==='string').map(f=>f.name).filter(n=>/^[a-zA-Z_][a-zA-Z0-9_]{0,79}$/.test(n)):[];
  return attachVerifiedArtifact({label:'Source verification',status:'verified',detail:'Sourcify runtime '+record.runtimeMatch.replace('_',' ')+'; recorded bytecode matches this address at the checked block. This is not a security audit.',sourceUrl:'https://repo.sourcify.dev/'+chainId+'/'+address,functions:names,evidence:['Sourcify v2 runtime record','eth_getCode at the report block']},record);
 }catch{return unknown('Source verification','Source verification could not be retrieved.');}
}
export async function inspectToken(address,{rpc,chainId=99901,client:provided,fetchImpl=fetch,signal}={}){
 if(typeof address!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(address)||!isAddress(address,{strict:false})||address.toLowerCase()===zeroAddress)throw Error('Paste one nonzero EVM token contract address.');
 if(![4663,99801,99901].includes(chainId))throw Error('This network is not supported by the inspector.');
 if(!rpc&&!provided)throw Error('The read-only chain connection is not configured.');
 const client=provided||createPublicClient({transport:http(rpc,{retryCount:1,retryDelay:250,timeout:10000,fetchOptions:{signal}})});
 try{
  if(await client.getChainId()!==chainId)throw Error('CHAIN_MISMATCH');
  const block=await client.getBlock();if(!block.hash||block.number===null)throw Error('MISSING_BLOCK');
  if(chainId===4663&&(!block.timestamp||Math.abs(Date.now()-Number(block.timestamp)*1000)>120000))throw Error('STALE_BLOCK');
  const blockNumber=block.number;
  const report={address:address.toLowerCase(),chainId,network:chainId===4663?'Robinhood Chain':chainId===99801?'Elysium testnet':'Elysium mainnet',blockNumber:blockNumber.toString(),blockHash:block.hash,checkedAt:new Date().toISOString(),checks:[]};
  const code=await client.getCode({address,blockNumber});
  if(!code||code==='0x'){
   report.checks.push({label:'Contract code',status:'not-found',detail:'No contract was found on this network at the checked block. Is this token on another network?',evidence:['eth_getCode']});
  }else{
   report.checks.push({label:'Contract code',status:'observed',detail:'Contract bytecode is present. This alone does not establish that it is an ERC-20 token or safe to trade.',evidence:['eth_getCode']});
   const safe=async fn=>{try{return {ok:true,value:await fn()};}catch{return {ok:false};}};
   const names=['name','symbol','decimals','totalSupply','owner'];
   const [reads,storage,source,research,explorer]=await Promise.all([
    Promise.all(names.map(functionName=>safe(()=>client.readContract({address,abi,functionName,blockNumber})))),
    Promise.all(Object.values(slots).map(slot=>safe(()=>client.getStorageAt({address,slot,blockNumber})))),
    sourceVerification(chainId,address,code,{fetchImpl,signal}),
    chainId===4663?researchPonsToken(address,{client,blockNumber}):null,
    chainId===4663?explorerSource(address,code,{fetchImpl,signal}):null
   ]);
   const data=Object.fromEntries(names.map((n,i)=>[n,reads[i]]));
   report.decimals=data.decimals.ok?Number(data.decimals.value):null;report.rawSupply=data.totalSupply.ok?String(data.totalSupply.value):null;
   report.tokenName=data.name.ok?clean(data.name.value):null;report.symbol=data.symbol.ok?clean(data.symbol.value):null;
   if(data.totalSupply.ok&&typeof data.totalSupply.value==='bigint'){
    const decimals=data.decimals.ok?Number(data.decimals.value):null;
    const amount=Number.isInteger(decimals)&&decimals>=0&&decimals<=255?formatUnits(data.totalSupply.value,decimals):data.totalSupply.value.toString()+' raw units (decimals unavailable)';
    report.checks.push({label:'Total supply (TS)',status:'observed',detail:amount+(report.symbol?' '+report.symbol:'')+'. Reported by the contract; not circulating supply or market cap.',value:amount,evidence:['totalSupply()',...(data.decimals.ok?['decimals()']:[])]});
   }else report.checks.push(unknown('Total supply (TS)','The totalSupply() read did not return a usable value. The address may not be a standard token.',['totalSupply()']));
   if(source.status==='unknown'&&explorer?.status==='unknown')source.detail=source.detail.replace('Verification elsewhere has not been checked.','')+' '+explorer.detail;report.checks.push(explorer?.status==='verified'?explorer:source);if(explorer&&explorer.status!=='verified')report.checks.push(explorer);report.sources=research?.sources||[];if(explorer)report.sources.push({label:'Explorer source',url:explorer.sourceUrl});if(source.status==='verified')report.sources.push({label:'Sourcify verification',url:source.sourceUrl});
   report.checks.push(data.owner.ok?{label:'Reported owner',status:'observed',detail:data.owner.value+(data.owner.value.toLowerCase()===zeroAddress?' is returned by owner(). Other roles and upgrade controls may still exist.':' is returned by owner(). Permissions have not been audited.'),evidence:['owner()']}:unknown('Reported owner','owner() was unavailable. This does not prove ownership was renounced.',['owner()']));
   const clone=code.match(/^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/i);
   if(clone)report.implementationAddress='0x'+clone[1];
   const present=storage.map((r,i)=>r.ok&&typeof r.value==='string'&&/^0x[0-9a-f]{64}$/i.test(r.value)&&!/^0x0{64}$/i.test(r.value)?Object.keys(slots)[i]+': '+r.value:null).filter(Boolean);
   report.checks.push(clone?{label:'Proxy indicators',status:'attention',detail:'Standard ERC-1167 minimal proxy forwards to '+report.implementationAddress+'. Implementation source and permissions are not verified by this check.',evidence:['eth_getCode: ERC-1167 runtime pattern']}:present.length?{label:'Proxy indicators',status:'attention',detail:'Nonzero EIP-1967 slot(s): '+present.join('; ')+'. Implementation permissions require separate review.',evidence:['eth_getStorageAt: EIP-1967 implementation and beacon slots']}:{label:'Proxy indicators',status:storage.every(r=>r.ok)?'observed':'unknown',detail:storage.every(r=>r.ok)?'No nonzero EIP-1967 proxy slots were observed. Other proxy patterns and upgrade mechanisms have not been ruled out.':'Standard proxy-slot reads were incomplete.',evidence:['eth_getStorageAt: EIP-1967 implementation and beacon slots']});
   const control=await controlResearch(explorer?.status==='verified'?explorer:source,{address,client,blockNumber,protocol:research?.protocol,proxyDetected:!!clone||present.length>0});report.checks.push(control);
   if(control.profile==='pons-v2-fixed-supply'){const owner=report.checks.find(c=>c.label==='Reported owner');owner.status='observed';owner.detail='This matched token implementation has no owner role. Its immutable deployer is attribution data, not a controller. Factory and curve governance are outside this finding.';owner.evidence=['Matched Pons token source and dependencies','deployer() at report block'];}
   delete source.functions;
   if(research?.protocol){report.protocol=research.protocol;report.checks.push(...research.checks);const balances=research.protocol.knownBalances;if(balances&&Number.isInteger(report.decimals)&&report.decimals>=0&&report.decimals<=255){report.checks.push({label:'Known holder balances',status:'observed',detail:['deployer','curve'].filter(k=>balances[k]!==null).map(k=>k+': '+formatUnits(BigInt(balances[k]),report.decimals)+' '+(report.symbol||'tokens')).join('; ')+'. These are two identified addresses, not a complete holder distribution.',evidence:['balanceOf(factory deployer)','balanceOf(factory curve)']});}}
  }
  if(!report.checks.some(c=>c.label==='LP lock'))report.checks.push(unknown('LP lock','Not verified. I need evidence identifying the pool and the contract or position holding its liquidity. A token address or launchpad label alone cannot prove a lock.'));
  if(!report.checks.some(c=>c.label==='Can I sell?'))report.checks.push(unknown('Can I sell?','Not tested. No buy/sell simulation or current liquidity check has been performed.'));
  if(!report.protocol)report.checks.push(unknown('Holder concentration','Holder balances and the deployer identity are not verified in this report.'));
  if(chainId===4663&&report.rawSupply){report.holders=await researchHolders(address,{client,blockNumber,decimals:report.decimals,rawSupply:report.rawSupply,protocol:report.protocol,fetchImpl,signal});report.holders.behavior=await researchHolderBehavior({tokenAddress:address,tokenDecimals:report.decimals,rows:report.holders.rows,blockNumber:blockNumber.toString(),checkedAt:report.checkedAt,fetchImpl,signal});}
  const recheck=await client.getBlock({blockNumber});if(recheck.hash!==block.hash)throw Error('REORG');
  return report;
 }catch(error){
  if(signal?.aborted)throw Error('Inspection cancelled.');
  if(error.message==='CHAIN_MISMATCH')throw Error('The RPC network does not match the workspace. No token findings were accepted.');
  if(error.message==='STALE_BLOCK')throw Error('Robinhood network data is stale. No current token report was accepted.');
  if(error.message==='REORG')throw Error('The checked block changed. Please run the check again.');
  throw Error('Onchain reads could not be completed. No safety conclusion was made.');
 }
}
export function inspectionSummary(report,message=''){
 const find=label=>report.checks.find(c=>c.label===label);
 let selected;
 if(/\blp\b|liquidity|lock/i.test(message))selected=find('LP lock');
 else if(/\bts\b|supply/i.test(message))selected=find('Total supply (TS)');
 else if(/verified|verification|\bsc\b/i.test(message))selected=find('Source verification');
 else if(/sell|safe|honeypot/i.test(message))selected=find('Can I sell?');
 else if(/owner/i.test(message))selected=find('Reported owner');
 else if(/holder behavior|wallet history|traded before|strong hands/i.test(message)){
  const behavior=report.holders?.behavior,summary=behavior?.summary;
  const clean=value=>String(value??'unavailable').replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').slice(0,180);
  const holders=Array.isArray(report.holders?.rows)?report.holders.rows:[],sample=holders.filter(row=>!row.infrastructure&&!row.sink).slice(0,3),holdings=sample.map(row=>{
   const otherTokens=Array.isArray(row.otherTokens)?row.otherTokens.slice(0,2):[],other=otherTokens.length?otherTokens.map(token=>`${clean(token.symbol||token.address)} ${clean(token.balance)}${token.estimatedUsd?` (est. $${clean(token.estimatedUsd)})`:''}`).join('; '):'no indexed priced-token balance returned';
   return `- ${clean(row.address)} (${clean(row.kind)}): ${clean(row.balance)} ${clean(report.symbol||'tokens')}; ${clean(row.sharePercent)}% of reported supply. Other-token snapshot: ${other}.`;
  });
  const historyRows=Array.isArray(behavior?.rows)?behavior.rows:[],trades=historyRows.flatMap(row=>(Array.isArray(row.recentSwaps)?row.recentSwaps:[]).filter(trade=>trade.classification==='two-sided swap candidate').map(trade=>({row,trade}))).slice(0,3),activity=trades.map(({row,trade})=>{
   const legs=[...(Array.isArray(trade.tokenFlows)?trade.tokenFlows.slice(0,4).map(flow=>`${flow.direction} ${flow.amount} ${flow.symbol||flow.tokenAddress}`):[]),...(Array.isArray(trade.nativeFlows)?trade.nativeFlows.slice(0,2).map(flow=>`${flow.direction} ${flow.amount} ${flow.symbol||'ETH'}`):[])].map(clean).join('; ');
   return `- ${clean(row.address)}: ${clean(trade.targetTokenAction)}; ${clean(trade.timestamp)}; ${legs||'asset legs unavailable'}; ${clean(trade.transactionUrl)}.`;
  });
  const lines=[`Holder-flow triage: ${behavior?.status||'unavailable'}. ${clean(summary?.holderSignal||behavior?.reason||'No holder-history signal was returned.')}`,`Suggested next step: ${clean(summary?.nextStep||'manual_review')}. Target-token swap candidates: ${clean(summary?.targetTokenBuyCandidates??'unknown')} buy / ${clean(summary?.targetTokenSellCandidates??'unknown')} sell across ${clean(summary?.walletsAnalyzed??0)} sampled addresses.`,'Current indexed top-holder candidates (not a complete holder census):',...(holdings.length?holdings:['- No eligible holder snapshot was available.']),'Recent decoded swap candidates in the bounded sample:',...(activity.length?activity:['- None observed here; this does not prove inactivity.']),'An address is not a person. Holdings and swaps are partial evidence; they do not show profitability, conviction or community quality. This is research triage, not a buy recommendation.'];
  return lines.join('\n')+'\n\n'+report.network+' (chain '+report.chainId+'), block '+report.blockNumber+'. Transaction history is bounded and can omit activity.';
 }
 else if(/holder|dev|deployer/i.test(message))selected=find('Holder concentration');
 else if(/mint|blacklist|pause/i.test(message))selected=find('Control functions');
 const code=find('Contract code');
 const lead=code.status==='not-found'?code.detail:selected?selected.label+': '+selected.detail:'Checked the contract. '+(report.tokenName?'It reports the name '+report.tokenName+'. ':'')+(find('Total supply (TS)')?.detail||'');
 return lead+'\n\n'+report.network+' (chain '+report.chainId+'), block '+report.blockNumber+'. Checked '+report.checkedAt+'. These limited checks do not establish that the token is safe to trade.';
}
