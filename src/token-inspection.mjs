import {attachVerifiedArtifact,controlResearch} from './token-controls.mjs';
import {researchHolders} from './holder-research.mjs';
import {researchHolderBehavior} from './holder-behavior.mjs';
import {researchPonsToken,explorerSource} from './token-research.mjs';
import {researchPonsHistory} from './pons-history.mjs';
import {researchPinkLocks} from './pinklock-research.mjs';
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
  const report={address:address.toLowerCase(),chainId,network:chainId===4663?'Robinhood Chain':chainId===99801?'Elysium testnet':'Elysium mainnet',blockNumber:blockNumber.toString(),blockHash:block.hash,checkedAt:Number.isFinite(Number(block.timestamp))?new Date(Number(block.timestamp)*1000).toISOString():new Date().toISOString(),checks:[]};
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
  if(chainId===4663&&report.rawSupply){
   const holdersWork=researchHolders(address,{client,blockNumber,decimals:report.decimals,rawSupply:report.rawSupply,protocol:report.protocol,fetchImpl,signal}).catch(()=>({status:'unavailable',rows:[],reason:'Holder index could not be checked at the report block.'}));
   const [holders,pinkLock,history]=await Promise.all([
    holdersWork,
    researchPinkLocks({address,decimals:report.decimals,client,blockNumber,holders:holdersWork,fetchImpl,signal}).catch(()=>({status:'unavailable',records:[],reason:'PinkLock records could not be checked at the report block.'})),
    (async()=>{
     if(report.protocol?.name!=='Pons v2'||!report.protocol.curve||!report.protocol.pairToken)return null;
     const pairDecimals=report.protocol.pairToken.toLowerCase()==='0x0000000000000000000000000000000000000000'?18:await client.readContract({address:report.protocol.pairToken,abi:parseAbi(['function decimals() view returns(uint8)']),functionName:'decimals',blockNumber}).catch(()=>null);
     if(!Number.isInteger(Number(pairDecimals))||Number(pairDecimals)<0||Number(pairDecimals)>36)return {status:'unavailable',reason:'The Pons quote asset decimals could not be read at the report block.'};
     return researchPonsHistory({address,curve:report.protocol.curve,phase:report.protocol.phase,tokenDecimals:report.decimals,pairDecimals:Number(pairDecimals),pairSymbol:report.protocol.pairSymbol,blockNumber,checkedAt:report.checkedAt,holders:holdersWork.then(value=>value.rows)});
    })().catch(()=>({status:'unavailable',reason:'Pons event history could not be checked at the report block.'}))
   ]);
   report.holders=holders;
   report.holders.behavior=await researchHolderBehavior({tokenAddress:address,tokenDecimals:report.decimals,rows:report.holders.rows,blockNumber:blockNumber.toString(),checkedAt:report.checkedAt,fetchImpl,signal}).catch(()=>({status:'unavailable',rows:[],reason:'Holder transaction history could not be checked.'}));
   report.pinkLock=pinkLock;if(history)report.ponsHistory=history;
  }
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
 if(/pink\s*lock|vesting|vested|locked supply|supply locked|tokens? locked|lock schedule|lock records|token lock/i.test(message)){
  const locks=report.pinkLock,records=Array.isArray(locks?.records)?locks.records:[],clean=value=>String(value??'unavailable').replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').slice(0,180);
  const rows=records.slice(0,3).map(row=>`- ${clean(row.kind)}: ${clean(row.remaining)} ${clean(report.symbol||'tokens')} remaining; ${clean(row.currentlyWithdrawable)} currently withdrawable; unlock/TGE ${clean(row.tgeOrUnlockDate||'not reported')}; schedule ${clean(row.tgeReleasePercent)}% at TGE and ${clean(row.cycleReleasePercent)}% every ${clean(row.cycleDays)} days.`);
  return [`PinkLock check: ${clean(locks?.status||'unavailable')}. ${clean(locks?.reason||'No PinkLock result was returned.')}`,...(rows.length?rows:['No matching record was verified in the checked sources.']),clean(locks?.scope||'The checked sources do not cover every locker.'),'No matching record is not proof that supply is unlocked. '+report.network+' block '+report.blockNumber+'.'].join('\n');
 }
 else if(/launch age|token age|how old|when (?:was|did).*launch|curve.*volume|trading volume|generated fees|fees generated|fees? (?:were )?(?:generated|collected)|curve fees/i.test(message)){
  const history=report.ponsHistory,curve=history?.curve||{},clean=value=>String(value??'unavailable').replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').slice(0,220);
  const coverage=clean(history?.coverage||history?.reason||'Pons launch or curve history was unavailable.');
  return [`Launch: ${clean(history?.launchedAt)}; age at the checked snapshot: ${clean(history?.age)}.`,`Pons curve: ${clean(curve.tradeCount??curve.scannedTradeCount)} trades; ${clean(curve.totalVolume??curve.scannedVolume)} ${clean(curve.pairSymbol||report.protocol?.pairSymbol||'quote asset')} volume; generated fees ${clean(curve.totalFees??curve.scannedFees)} ${clean(curve.pairSymbol||report.protocol?.pairSymbol||'quote asset')}.`,coverage,'Generated curve fees are event totals, not creator earnings or currently claimable fees. Post-graduation pool trades are not included. '+report.network+' block '+report.blockNumber+'.'].join('\n\n');
 }
 else if(/\blp\b|liquidity|lock/i.test(message))selected=find('LP lock');
 else if(/\bts\b|supply/i.test(message))selected=find('Total supply (TS)');
 else if(/verified|verification|\bsc\b/i.test(message))selected=find('Source verification');
 else if(/\b(?:can (?:i|we) sell|will .* sell|sellability|sellable|honeypot|safe to trade)\b/i.test(message))selected=find('Can I sell?');
 else if(/owner/i.test(message))selected=find('Reported owner');
 else if(/holder behavior|wallet history|traded before|strong hands|holder.*(?:buy|sell|flow)|(?:buy|sell|flow).*holder|top holders?.*(?:buy|sell|trade)/i.test(message)){
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
  const curveActivity=Array.isArray(report.ponsHistory?.holderActivity)?report.ponsHistory.holderActivity.filter(row=>row.buys||row.sells).slice(0,3):[],curveLines=curveActivity.map(row=>`- ${clean(row.address)}: ${clean(row.buys)} cumulative Pons curve buys / ${clean(row.sells)} sells; ${clean(row.buyQuote)} ${clean(report.protocol?.pairSymbol||'quote asset')} bought / ${clean(row.sellQuote)} sold.`);
  const lines=[`Holder-flow triage: ${behavior?.status||'unavailable'}. ${clean(summary?.holderSignal||behavior?.reason||'No holder-history signal was returned.')}`,`Suggested next step: ${clean(summary?.nextStep||'manual_review')}. Recent target-token swap candidates: ${clean(summary?.targetTokenBuyCandidates??'unknown')} buy / ${clean(summary?.targetTokenSellCandidates??'unknown')} sell across ${clean(summary?.walletsAnalyzed??0)} sampled wallets.`,...(curveLines.length?['Cumulative Pons curve events matched to today’s indexed top-holder sample (not the recent 30-day history):',...curveLines]:[]),'Current indexed top-holder candidates (not a complete holder census):',...(holdings.length?holdings:['- No eligible holder snapshot was available.']),'Recent decoded wallet swaps within the bounded 30-day sample:',...(activity.length?activity:['- No decoded two-sided swap candidate was observed; this does not prove inactivity.']),'An address is not a person. Holdings and swaps are partial evidence; they do not show profitability, conviction or community quality. This is research triage, not a buy recommendation.'];
  return lines.join('\n')+'\n\n'+report.network+' (chain '+report.chainId+'), block '+report.blockNumber+'. Transaction history is bounded and can omit activity.';
 }
 else if(/holder|dev|deployer/i.test(message))selected=find('Holder concentration');
 else if(/mint|blacklist|pause/i.test(message))selected=find('Control functions');
 const code=find('Contract code');
 if(!selected&&!/\b(?:ts\b|supply|verified|verification|\bsc\b|owner|mint|blacklist|pause|sellability|sellable|honeypot|safe to trade)\b/i.test(message)){
  const clean=value=>String(value??'unavailable').replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').slice(0,180),supply=find('Total supply (TS)'),source=find('Source verification'),history=report.ponsHistory,curve=history?.curve||{},state=report.ponsState,holders=report.holders,behavior=holders?.behavior,lock=report.pinkLock;
  const basics=`${report.tokenName||'Token'}${report.symbol?' ('+report.symbol+')':''}: ${clean(supply?.value||supply?.detail||'total supply unavailable')}${source?.status==='verified'?'; source matched to runtime':'; source not confirmed'}.`;
  const trades=curve.tradeCount??curve.scannedTradeCount,volume=curve.totalVolume??curve.scannedVolume,fees=curve.totalFees??curve.scannedFees,ponsStatus=state?.status||(report.ponsStateUnavailable?'live state unavailable':report.protocol?.name||'not identified');
  const market=`Pons: ${ponsStatus}${history?.launchedAt?'; launched '+clean(history.age)+' ago':''}${trades!==null&&trades!==undefined?`; ${clean(trades)} curve trades, ${clean(volume)} ${clean(curve.pairSymbol||report.protocol?.pairSymbol||'quote asset')} volume, ${clean(fees)} generated curve fees`:''}${state?.curve?`; ${clean(state.curve.progressPercent)}% of graduation reserve`:''}${state?.market?.marketCapUsd?`; reported market cap $${clean(state.market.marketCapUsd)}`:''}.`;
  const holderText=holders?.rows?.length?`${clean(holders.topSharePercent)}% of supply across the listed holder sample; holder-wallet signal: ${clean(behavior?.summary?.holderSignal||behavior?.status||'unavailable')}`:'Holder concentration unavailable';
  const lockText=lock?`${clean(lock.status)} PinkLock checks, ${Array.isArray(lock.records)?lock.records.length:0} matching record(s)${lock.status==='observed'&&!lock.records?.length?' (no match does not prove supply is unlocked)':''}`:'PinkLock check unavailable';
  const caveat=history?.coverage||lock?.scope||'This is a dated read-only snapshot; unknown does not mean safe.';
  return `- ${basics}\n- ${market}\n- Holders: ${holderText}. Locks: ${lockText}.\n\n${clean(caveat)} These checks are not a security audit or a safe-to-trade verdict.`;
 }
 const lead=code.status==='not-found'?code.detail:selected?selected.label+': '+selected.detail:'Checked the contract. '+(report.tokenName?'It reports the name '+report.tokenName+'. ':'')+(find('Total supply (TS)')?.detail||'');
 return lead+'\n\n'+report.network+' (chain '+report.chainId+'), block '+report.blockNumber+'. Checked '+report.checkedAt+'. These limited checks do not establish that the token is safe to trade.';
}
