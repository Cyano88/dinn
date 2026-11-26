import {researchSnapshot,refreshSummary} from './near-refresh.mjs';
import {requestedLockFocus} from './research-finding.mjs';
import {intakePrompt,discoveryStep,discoveryMessage,chosenCandidate} from './discovery-guide.mjs';
import {discoverStockPairs} from './base-stock-paired-research.mjs';
import {researchTarget,researchQuestion,followResearch} from './research-guide.mjs';
import {createHash,randomBytes} from 'node:crypto';
import {createNearMarketClient,uuid} from './near-market-client.mjs';
import {agentAccessRequest} from './agent-access.mjs';

const TOKEN_RE=/0x[0-9a-fA-F]{40}/g;
export function submittedReportStatusMessage(result){
 if(result?.state!=='submitted')return null;
 return result.testRun===true?'NEAR worker submitted an authorized zero-cost test-run report; no payout is due.':'NEAR worker submitted a report; payout awaits buyer acceptance.';
}
function eligibilityFingerprint(row,fullJob){
 const a=row?.assignment,j=row?.job,m=row?.latestMessage;
 const value={policy:2,assignment:{assignmentId:a?.assignmentId,jobId:a?.jobId,workerAgentId:a?.workerAgentId,status:a?.status,startedAt:a?.startedAt,slaDeadlineAt:a?.slaDeadlineAt},job:{jobId:j?.jobId,title:j?.title,description:j?.description,jobKind:j?.jobKind,attachments:j?.attachments},eligibility:{jobId:fullJob?.jobId,status:fullJob?.status,title:fullJob?.title,description:fullJob?.description,jobKind:fullJob?.jobKind,hasOrigin:Object.hasOwn(fullJob||{},'origin'),origin:fullJob?.origin,isPrivate:fullJob?.isPrivate,isTestRun:fullJob?.isTestRun},latestMessage:m?{senderSide:m.senderSide,origin:m.origin,truncated:m.truncated,body:m.body,attachments:m.attachments}:null};
 return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function escrowUnits(value){if(typeof value!=='string'||!/^\d+(?:\.\d{1,12})?$/.test(value))return null;const [whole,fraction='']=value.split('.');return BigInt(whole)*10n**12n+BigInt((fraction+'0'.repeat(12)).slice(0,12));}
function supportedResearchJobSurface(brief,job){
 if(!brief||!job||brief.jobKind!==job.jobKind||!Object.hasOwn(job,'origin'))return false;
 if(job.origin===null)return job.jobKind==='standard'&&job.isPrivate===false||job.jobKind==='instant'&&job.isPrivate===true;
 return job.origin==='a2a'&&job.jobKind==='instant'&&job.isPrivate===true;
}
const researchScope='Robinhood Chain: Pons launches and stock pairs by launch address, or Robinhood stock tokens by ticker or address. Base: Coinbase stock tokens by ticker or address, or Bankr stock pairs by launch address. For a fresh community concept, ask “Find a stock-inspired token launch idea for my community on Base” or specify Robinhood Chain. Dinn provides research only.';
const scopeNotice='Dinn does not cover this request today. '+researchScope+' Research has not started. You can cancel this job.';
export function outsideResearchScope(text){
 if(typeof text!=='string')return false;
 const foreignNetwork=/^\s*chain\s*:\s*(?!8453\s*$|4663\s*$)(?:\d+|solana|arbitrum|polygon|ethereum|bsc|avalanche|near)\s*$/im;
 const namedNetwork=/\b(?:research|check|analyze|investigate|token|pair|launch|contract)\b[^.!?\n]{0,180}\b(?:on|via)\s+(?:the\s+)?(?:solana|arbitrum|polygon|ethereum|bsc|avalanche|near)(?!\s+(?:AI\s+)?(?:agent\s+)?market(?:place)?\b)(?:\s+(?:mainnet|chain))?\b/i;
 const base=/\b(?:on Base|Base chain|Bankr)\b|^\s*chain\s*:\s*8453\s*$/im;
 const nonStock=/\b(?:paired with|paired against|quote asset\s*:|pair\s*:)\s*(?:W?ETH|USDC|USDT|SOL|BTC|W?BTC)\b|\b[A-Z0-9]+\s*\/\s*(?:W?ETH|USDC|USDT|W?BTC)\b/i;
 const execute=/^(?:please\s+)?(?:(?:buy|sell|swap|transfer|bridge|stake)\s+(?:this|that|my|all|some|the token|0x[0-9a-f]{40}|[0-9]+)\b|send funds\b|claim fees\b|execute (?:a |the )?trade\b|monitor daily\b|watch daily\b)/im;
 return execute.test(text)||foreignNetwork.test(text)||namedNetwork.test(text)||(base.test(text)&&nonStock.test(text));
}
function requestedResearchInput(row,job){
 const brief=row?.job,sources=[brief?.description];
 if(job.origin==='a2a'&&row.latestMessage!=null){
  const message=row.latestMessage;
  if(message.senderSide!=='buyer'||message.origin!=='direct'||message.truncated!==false||message.attachments?.length||typeof message.body!=='string'||message.body.length>4000)return null;
  sources.push(message.body);
 }
 const text=sources.filter(value=>typeof value==='string').join('\n');
 if(outsideResearchScope(text))return null;
 const serviceLines=[...text.matchAll(/^\s*service\s*:\s*([a-z][a-z0-9.-]*)\s*$/gim)].map(match=>match[1].toLowerCase());
 if([...text.matchAll(/^\s*service\s*:/gim)].length!==serviceLines.length)return null;
 const ideaRequest=/^(?:please )?(?:find|suggest|propose) (?:me |us )?(?:a|one) stock[- ]inspired token launch idea for (?:my|our) community(?: on (Base|Robinhood(?: Chain)?))?[.!?]?$/i;
 const ideaLines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 if(ideaLines.some(s=>ideaRequest.test(s)||/^service:\s*stock\.launch-idea$/i.test(s))){
  const chains=new Set();
  for(const line of ideaLines){
   const prompt=line.match(ideaRequest),field=line.match(/^chain:\s*(8453|4663|Base|Robinhood(?: Chain)?)$/i);
   if(!prompt&&!field&&!/^service:\s*stock\.launch-idea$|^hire: dinn labs$/i.test(line))return null;
   const chain=field?.[1]||prompt?.[1];
   if(chain)chains.add(/^(8453|base)$/i.test(chain)?8453:4663);
  }
  return chains.size===1&&job.isTestRun===false?{service:'stock.launch-idea',chainId:[...chains][0]}:null;
 }
 const services=[...new Set(serviceLines)];if(services.length>1||services.some(value=>!['pons.stock.research','pons.stock-paired.research','token.research','token.inspect','base.stock-paired.research','base.stock.research'].includes(value)))return null;
 const addresses=[...new Set(sources.flatMap(value=>typeof value==='string'?[...value.matchAll(TOKEN_RE)].map(match=>match[0].toLowerCase()):[]))];
 const chainLines=[...text.matchAll(/^\s*chain\s*:\s*(\d+)\s*$/gim)].map(match=>Number(match[1]));
 if([...text.matchAll(/^\s*chain\s*:/gim)].length!==chainLines.length)return null;
 const uniqueChains=new Set(chainLines);
 if(['pons.stock.research','base.stock.research'].includes(services[0])){
  if(chainLines.length&&(uniqueChains.size!==1||chainLines[0]!== (services[0]==='pons.stock.research'?4663:8453)))return null;
  const targets=[...text.matchAll(/^\s*(?:token|token address|ticker|symbol)\s*:\s*([^\s,;]+)\s*$/gim)].map(match=>match[1]);
  if([...text.matchAll(/^\s*(?:token|token address|ticker|symbol)\s*:/gim)].length!==targets.length||targets.length!==1)return null;
  const query=targets[0].trim();if(!(/^(?:0x[0-9a-f]{40}|[a-z][a-z0-9 ._-]{0,39})$/i.test(query)))return null;
  if(addresses.length&&(!/^0x[0-9a-f]{40}$/i.test(query)||addresses.length!==1||addresses[0]!==query.toLowerCase()))return null;
  return {service:services[0],query};
 }
 if(!services.length&&!chainLines.length&&!addresses.length){
  const title=brief?.title;
  const natural=[...new Set([...sources,title].filter(x=>typeof x==='string').map(x=>x.trim()))];
  const robinhood=natural.map(x=>/^(?:please\s+)?(?:research|check|inspect)\s+\$?([a-z][\w.-]{0,19})\s+on\s+(?:pons|robinhood(?: chain)?)[.!?]?$/i.exec(x)?.[1]).filter(Boolean);
  if(new Set(robinhood.map(x=>x.toLowerCase())).size===1&&!/\b(?:base|bankr|solana|arbitrum|ethereum)\b/i.test(text))return {service:'pons.stock.research',query:robinhood[0]};
  const ticker=/^(?:please\s+)?(?:research|check|inspect|look up)\s+\$?([a-z][a-z0-9._-]{0,14})\s+on\s+base(?:\s+chain)?[.!?]?$/i;
  const matches=[...new Set(natural.map(x=>ticker.exec(x)?.[1]?.toUpperCase()).filter(Boolean))];
  if(matches.length===1&&!/\b(?:robinhood|pons|bankr|solana|arbitrum|ethereum)\b/i.test(text)){
   return {service:'base.stock.research',query:natural.map(x=>ticker.exec(x)?.[1]).find(Boolean)};
  }
  if(job.isPrivate && (job.origin==='a2a'||job.isTestRun===false)){
   const candidate=natural.find(x=>discoveryStep(x)?.metric);
   if(candidate && !outsideResearchScope(text))return {service:'base.stock-paired.discover',metric:discoveryStep(candidate).metric};
  }
 }
 if(addresses.length!==1)return null;
 const namesBase=/\b(?:on|for|via)\s+(?:the\s+)?base(?:\s+chain)?\b|\bbase[- ]stock[- ]paired\b|\bbankr\b|\bchain\s*:\s*8453\b/i.test(text);
 const namesRobinhood=/\brobinhood(?:\s+chain)?\b|\bpons\b|\bchain\s*:\s*4663\b/i.test(text);
 const comparesNetworks=namesBase&&namesRobinhood&&/\b(?:and|or|vs\.?|versus|compare|both|either)\b/i.test(text);
 if(comparesNetworks)return null;
 const baseRequested=!services.length&&(uniqueChains.has(8453)||namesBase);
 const stockPair=namesRobinhood&&!namesBase&&/\bstock[- ]paired\b/i.test(text);
 const stockToken=namesRobinhood&&!namesBase&&!stockPair&&/\bstock token\b/i.test(text);
 if(!services.length&&stockToken&&!chainLines.some(id=>id!==4663))return {service:'pons.stock.research',query:addresses[0]};
 const service=services[0]||(stockPair?'pons.stock-paired.research':baseRequested?'base.stock-paired.research':'token.research');
 if(service==='base.stock-paired.research'){
  if(chainLines.length&&(uniqueChains.size!==1||chainLines[0]!==8453))return null;
  return {service,address:addresses[0]};
 }
 if(service==='token.inspect'){
  if(uniqueChains.size!==1||chainLines[0]!==4663)return null;
  return {service,address:addresses[0],chainId:4663};
 }
 if(chainLines.length&&(uniqueChains.size!==1||chainLines[0]!==4663))return null;
 return {service,address:addresses[0]};
}
function eligibleAssignment(row,fullJob,agentId,{minimumEscrow,escrowToken}={}){
 const a=row?.assignment,j=row?.job;
 if(!uuid(a?.assignmentId)||!uuid(a?.jobId)||!uuid(a?.workerAgentId)||a.jobId!==j?.jobId||a.workerAgentId!==agentId||a.status!=='in_progress'||a.deliverableUrl||a.submittedAt||!['standard','instant'].includes(j?.jobKind)||j.attachments?.length||typeof fullJob?.isTestRun!=='boolean'||fullJob?.jobId!==a.jobId||fullJob?.status!=='in_progress'||typeof j.title!=='string'||j.title.length<1||j.title.length>120||fullJob.title!==j.title||!supportedResearchJobSurface(j,fullJob))return null;
 if(typeof j.description!=='string'||j.description.length>4000)return null;
 const amount=escrowUnits(a.escrowAmount),minimum=escrowUnits(minimumEscrow);
 const testRun=fullJob.isTestRun===true;
 if(amount===null)return null;
 if(testRun){if(amount!==0n||(a.escrowToken!=null&&!['USD','USDC'].includes(a.escrowToken)))return null;}
 else {
  const marketplaceX402=fullJob.origin==='a2a' && fullJob.isPrivate===true && j.jobKind==='instant' && a.escrowToken==='X402';
  if(minimum===null||minimum<=0n||amount<minimum||(!marketplaceX402&&a.escrowToken!==escrowToken))return null;
 }
 return true;
}
export function eligibleNearResearchJob(row,fullJob,agentId,options){
 return eligibleAssignment(row,fullJob,agentId,options)?requestedResearchInput(row,fullJob):null;
}

export function createNearWorker({token=process.env.NEAR_AGENT_TOKEN,agentId=process.env.NEAR_AGENT_ID,minimumEscrow=process.env.NEAR_WORKER_MIN_ESCROW,escrowToken=process.env.NEAR_WORKER_ESCROW_TOKEN,store,client,feedbackEnabled=false,discover=discoverStockPairs,report=agentAccessRequest,now=()=>new Date(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 if(!uuid(agentId))throw Error('Configure the registered NEAR_AGENT_ID.');
 if(!store)throw Error('NEAR worker PostgreSQL storage is required.');
 if(escrowUnits(minimumEscrow)===null||escrowUnits(minimumEscrow)<=0n||!['USD','USDC'].includes(escrowToken))throw Error('Configure the owner-approved NEAR_WORKER_MIN_ESCROW and NEAR_WORKER_ESCROW_TOKEN.');
 client=client||createNearMarketClient({token});

 async function process(row){
  const a=row.assignment,lock=await store.acquire(agentId,a.assignmentId);
  if(!lock)return {assignmentId:a.assignmentId,state:'leased-elsewhere'};
  let leaseLost=false;
  const heartbeat=setInterval(()=>{void store.renew(lock).catch(()=>{leaseLost=true;});},30000);
  heartbeat.unref?.();
  try{
   const assertLease=()=>{if(leaseLost)throw Error('Worker lease lost.');};
   const event=name=>store.event(lock,name);
   let data=lock.data||{};
   await store.renew(lock);assertLease();
   const startDeadline=typeof a.slaDeadlineAt==='string'?Date.parse(a.slaDeadlineAt):NaN;
   if(!a.startedAt&&Number.isFinite(startDeadline)&&startDeadline<=now().getTime()){
    const recorded=data.phase!=='start-window-expired';
    if(recorded){await store.save(lock,{...data,phase:'start-window-expired'});await event('start-window-expired');}
    return {assignmentId:a.assignmentId,state:'start-window-expired',recorded};
   }
   let full=await client.job(a.jobId);const fingerprint=eligibilityFingerprint(row,full);
   // Re-evaluate eligibility before using the cached negative result. Some
   // marketplace fields (for example zero-cost test-run escrow details) can
   // become available without changing the brief or full-job fingerprint.
   // A buyer return reopens the same assignment. Keep its original target and
   // escrow checks, and require current buyer feedback before spending quota.
   const returned=Boolean(data.submittedAt && a.startedAt && row.latestMessage?.senderSide==='buyer');
   const refresh=returned || data.refresh===true;
   const resolveInput=(current,job)=>{
    // Marketplace retains the previous submission URL and time on rework.
    const sameReturn=refresh && current?.assignment?.assignmentId===a.assignmentId &&
     current.assignment.startedAt && current.latestMessage?.senderSide==='buyer';
    const checked=sameReturn?{...current,assignment:{...current.assignment,submittedAt:null,deliverableUrl:null}}:current;
    let researchRow=checked;
    if(data.guidedInput){
     const g=data.guidedInput;
     const description='Service: '+g.service+'\nToken: '+(g.query||g.address);
     researchRow={...checked,job:{...checked.job,description},latestMessage:null};
    }
    const candidate=eligibleNearResearchJob(researchRow,job,agentId,{minimumEscrow,escrowToken});
    if(!refresh || !candidate)return candidate;
    const target=candidate.address || candidate.query;
    const savedTarget=data.tokenAddress || data.stockQuery;
    return savedTarget && target.toLowerCase()===savedTarget.toLowerCase() && candidate.service===data.service && data.testRun===job.isTestRun ? candidate : null;
   };
   const oneShot=full.isPrivate===true && (full.origin==='a2a'||full.isTestRun===false);
   const decline=async(reason,detail)=>{
    assertLease();
    const result=await client.decline(a.assignmentId,reason,detail);
    if(result?.assignmentId!==a.assignmentId||result.status!=='cancelled')throw Error('Marketplace did not confirm the decline.');
    await store.save(lock,{...data,phase:'declined'});await event('declined');
    return {assignmentId:a.assignmentId,state:'declined'};
   };
   if(data.phase==='declined')return {assignmentId:a.assignmentId,state:'declined'};
   if(oneShot && !data.submittedAt && eligibleAssignment(row,full,agentId,{minimumEscrow,escrowToken}) && !resolveInput(row,full))
    return decline('rejected',/stock[ -]inspired token launch idea|stock\.launch-idea/i.test([row.job.description,row.latestMessage?.body].join(' '))?'Which launch chain should Dinn research? Include “on Base” or “on Robinhood Chain” in the first brief. Research has not started.':'Send one supported research brief with the chain and target. '+researchScope+' Example: Research NVDAc on Base.');
   if(!oneShot && data.scopeNoticeSent)return {assignmentId:a.assignmentId,state:'unsupported-scope'};
   const canGuide=!oneShot && eligibleAssignment(row,full,agentId,{minimumEscrow,escrowToken}) && full.isPrivate===true;
   if(canGuide && !data.guidedInput && !data.submittedAt && !a.startedAt && !a.deliverableUrl &&
      full.isPrivate===true && a.workerAgentId===agentId && a.jobId===row.job?.jobId && full.jobId===a.jobId &&
      a.status==='in_progress' && full.status==='in_progress' && !row.job.attachments?.length && supportedResearchJobSurface(row.job,full)){
    const m=row.latestMessage;
    const reply=m?.senderSide==='buyer' && m.origin==='direct' && m.truncated===false && !m.attachments?.length?m.body:null;
    const brief=row.job.description||'';
    const buyerInput=reply || brief;
    const explicitReply=data.intakeAsked && reply && /0x[0-9a-f]{40}/i.test(reply) && /\b(?:base|pons|robinhood|bankr)\b/i.test(reply)
     ?requestedResearchInput({job:{description:reply}}, {origin:null}):null;
    const selected=data.shortlist && reply && chosenCandidate(reply,data.shortlist.candidates);
    if(selected || explicitReply){
     data={...data,guidedInput:selected?{service:'base.stock-paired.research',address:selected}:explicitReply};
     await store.save(lock,data);
    }
    const discovery=(!data.discoveryNotice || reply) && !data.guidedInput && !data.guideStage && !data.shortlist && !outsideResearchScope(buyerInput)
     && discoveryStep(buyerInput,data.discoveryStage);
    if(discovery){
     const key=discovery.stage||discovery.metric||'coverage';
     if(data.discoveryNotice!==key){
      if(discovery.metric){
       let shortlist;
       try{shortlist=await discover(discovery.metric);}
       catch{
        assertLease();await client.scopeMessage(a.assignmentId,'The launch feed or stock registry is unavailable. You can send a token address for an individual report, or cancel this unstarted hire.','discover-source-offline');
        await store.save(lock,{...data,intakeAsked:true,discoveryNotice:key});
        return {assignmentId:a.assignmentId,state:'discovery-unavailable'};
       }
       data={...data,shortlist,intakeAsked:true};
       await store.save(lock,data);
      }
      assertLease();await client.scopeMessage(a.assignmentId,data.shortlist?discoveryMessage(data.shortlist):discovery.message,'discover-'+key);
      data={...data,discoveryNotice:key,discoveryStage:discovery.stage||null,intakeAsked:true};await store.save(lock,data);
     }
     return {assignmentId:a.assignmentId,state:'awaiting-research-details'};
    }
    if(data.shortlist && !data.discoveryNotice?.match(/^(liquidity|volume)$/)){
     assertLease();await client.scopeMessage(a.assignmentId,discoveryMessage(data.shortlist),'discover-'+data.shortlist.metric);
     data={...data,discoveryNotice:data.shortlist.metric,discoveryStage:null};await store.save(lock,data);
    }
    const target=!data.guidedInput && (data.guideTarget || researchTarget(brief) || ((full.origin==='a2a'||data.intakeAsked) && reply && researchTarget(reply)));
    if(target){
     const stage=data.guideStage||'chain';
     const next=reply && followResearch(stage,target,reply);
     if(next?.service){
      data={...data,guidedInput:next};await store.save(lock,data);
     }else{
      const pending=next?.stage||stage;
      if(data.guideStage!==pending || next?.unsupported){
       data={...data,guideTarget:target,guideStage:pending};
       if(next?.unsupported)data.scopeNoticeSent=true;
       assertLease();
       await client.scopeMessage(a.assignmentId,next?.unsupported?scopeNotice:researchQuestion(pending,target),'guide-'+(next?.unsupported?'unsupported':pending));
       await store.save(lock,data);
      }
      return {assignmentId:a.assignmentId,state:next?.unsupported?'unsupported-scope':'awaiting-research-details'};
     }
    }
   }
   let input=resolveInput(row,full);
   if(!input && data.submittedAt)return {assignmentId:a.assignmentId,state:'refresh-not-confirmed'};
   if(returned && data.refresh===true && data.phase==='submitted')return {assignmentId:a.assignmentId,state:'refresh-limit'};
   if(returned && !data.refresh && input){
    const current=await client.assignment(a.assignmentId);
    if(!current || !resolveInput(current,full) || current.latestMessage?.senderSide!=='buyer')return {assignmentId:a.assignmentId,state:'refresh-not-confirmed'};
    data={...data,refresh:true,phase:'refresh-requested',markdown:null};
    await store.save(lock,data);
   }
   if(!oneShot && !input && !a.startedAt && !a.submittedAt && !a.deliverableUrl && !data.submittedAt &&
      a.workerAgentId===agentId && a.jobId===row.job?.jobId && full.jobId===a.jobId &&
      a.status==='in_progress' && full.status==='in_progress' && full.isPrivate===true &&
      supportedResearchJobSurface(row.job,full)){
    const buyerText=row.latestMessage?.senderSide==='buyer' && row.latestMessage?.origin==='direct' && row.latestMessage?.truncated===false?row.latestMessage.body:'';
    if(outsideResearchScope(row.job.description)||outsideResearchScope(buyerText)){
     if(!data.scopeNoticeSent){
      assertLease();await client.scopeMessage(a.assignmentId,scopeNotice);
      await store.save(lock,{...data,scopeNoticeSent:true,phase:'unsupported-scope'});
     }
     return {assignmentId:a.assignmentId,state:'unsupported-scope'};
    }
   }
   if(canGuide && !input && !a.startedAt && !a.submittedAt && !a.deliverableUrl && !data.submittedAt && full.isPrivate===true &&
      a.workerAgentId===agentId && a.jobId===row.job?.jobId && full.jobId===a.jobId && full.status==='in_progress' && supportedResearchJobSurface(row.job,full) &&
      !row.job.attachments?.length && !data.intakeAsked){
    assertLease();await client.scopeMessage(a.assignmentId,intakePrompt,'intake');
    await store.save(lock,{...data,intakeAsked:true});
    return {assignmentId:a.assignmentId,state:'awaiting-research-details'};
   }
   if(!input){if(data.phase==='not-eligible'&&data.eligibilityFingerprint===fingerprint)return {assignmentId:a.assignmentId,state:'not-eligible',recorded:false,cached:true};const recorded=data.phase!=='not-eligible';if(recorded||data.eligibilityFingerprint!==fingerprint){await store.save(lock,{...data,phase:'not-eligible',eligibilityFingerprint:fingerprint});if(recorded)await event('not-eligible');}return {assignmentId:a.assignmentId,state:'not-eligible',recorded};}
   if(['submitted','accepted-payout-pending','accepted-test-run'].includes(data.phase))return {assignmentId:a.assignmentId,state:data.phase,testRun:data.testRun===true,payout:data.testRun===true?'none':undefined};
   if(!data.markdown){
    assertLease();if(!refresh&&!a.startedAt){await client.start(a.assignmentId);await wait(3000);}
    await store.save(lock,{...data,phase:'started',startedAt:now().toISOString()});await event('started');
    const current=await client.assignment(a.assignmentId);
    if(!current||current.assignment?.workerAgentId!==agentId||current.assignment?.status!=='in_progress'||(!refresh && (current.assignment?.deliverableUrl||current.assignment?.submittedAt))){
     await store.save(lock,{...lock.data,phase:'stopped-before-research'});await event('stopped-before-research');return {assignmentId:a.assignmentId,state:'stopped-before-research'};
    }
    full=await client.job(a.jobId);input=resolveInput(current,full);
    if(!input){await store.save(lock,{...lock.data,phase:'stopped-before-research'});await event('stopped-before-research');return {assignmentId:a.assignmentId,state:'stopped-before-research'};}
    assertLease();
    const {service,...reportInput}=input;
    if(!['base.stock-paired.discover','stock.launch-idea'].includes(service)){
     const buyer=current.latestMessage;
     const brief=[current.job?.description,buyer?.senderSide==='buyer'&&buyer.origin==='direct'&&!buyer.truncated?buyer.body:''].filter(Boolean).join(' ');
     const focus=requestedLockFocus(brief);
     if(focus)reportInput.focus=focus;
    }
    let made;
    try{
     if(service==='base.stock-paired.discover'){
      const shortlist=await discover(input.metric);
      const markdown=discoveryMessage(shortlist).replace('Choose a result by number for its full report.','For a full report, use the listed contract and Base in a separate hire.');
      made={status:'completed',deliverableMarkdown:markdown,evidence:{sha256:createHash('sha256').update(markdown).digest('hex')}};
     }else made=await report({service,requestId:'near-'+a.assignmentId+(refresh?'-refresh':''),input:reportInput},{paidMarketplaceHire:full.isTestRun===false});
    if(made.status!=='completed'||typeof made.deliverableMarkdown!=='string'||!made.deliverableMarkdown.length||made.deliverableMarkdown.length>250000||!/^\w{64}$/.test(made.evidence?.sha256||''))throw Error('Research report was incomplete or too large.');
    }catch(error){
     if(!oneShot||refresh)throw error;
     return decline('failed','Dinn could not verify this report from its sources. No completed report is available.');
    }
    const currentSnapshot=researchSnapshot(made.result);
    const firstSnapshot=refresh?data.firstSnapshot:currentSnapshot;
    const comparison=refresh&&service!=='base.stock-paired.discover'?refreshSummary(firstSnapshot,currentSnapshot)+'\n\n':'';
    data={firstSnapshot,...(data.guidedInput?{guidedInput:data.guidedInput}:{}),refresh,phase:'prepared',markdown:comparison+made.deliverableMarkdown,evidenceHash:made.evidence.sha256,service,tokenAddress:input.address,stockQuery:input.query,testRun:full.isTestRun===true,preparedAt:now().toISOString()};
    if(feedbackEnabled && full.isPrivate===true && !['base.stock-paired.discover','stock.launch-idea'].includes(service)){
     const code=randomBytes(32).toString('hex');
     data.feedbackDigest=createHash('sha256').update(code).digest('hex');
     data.feedbackTarget=(service.startsWith('base.')?'8453':'4663')+':'+(made.result?.address||input.address||input.query);
     data.markdown+='\n\n[Optional feedback after acceptance](https://dinn-pasy.onrender.com/research-feedback#job='+a.assignmentId+'&code='+code+')';
    }
    await store.save(lock,data);await event('report-prepared');
   }
   // Re-check marketplace state immediately before the external delivery.
   const current=await client.assignment(a.assignmentId);
   if(!current||current.assignment?.workerAgentId!==agentId||current.assignment?.status!=='in_progress'||(!refresh && (current.assignment?.deliverableUrl||current.assignment?.submittedAt))){
    await store.save(lock,{...data,phase:'not-delivered',lastObservedStatus:current?.assignment?.status||'missing'});await event('not-delivered');return {assignmentId:a.assignmentId,state:'not-delivered'};
   }
   if(refresh && (!current.assignment.startedAt || current.latestMessage?.senderSide!=='buyer' || !resolveInput(current,await client.job(a.jobId))))return {assignmentId:a.assignmentId,state:'refresh-not-confirmed'};
   await store.renew(lock);assertLease();
   await store.save(lock,{...data,phase:'submitting',submissionAttemptedAt:now().toISOString()});await event('submission-attempted');
   const submitted=await client.submit(a.assignmentId,data.markdown);
   if(full.origin==='a2a' && submitted?.assignmentId===a.assignmentId && submitted.status==='accepted'){
    await store.save(lock,{...data,phase:'accepted-payout-pending',submittedAt:now().toISOString(),marketplaceStatus:'accepted'});
    await event('accepted-payout-not-confirmed');
    return {assignmentId:a.assignmentId,state:'accepted-payout-pending'};
   }
   if(submitted?.assignmentId!==a.assignmentId||submitted.status!=='submitted')throw Error('Marketplace did not confirm the expected submitted assignment.');
   await store.save(lock,{...data,phase:'submitted',submittedAt:now().toISOString(),marketplaceStatus:submitted.status});await event('submitted');
   return {assignmentId:a.assignmentId,state:'submitted',testRun:data.testRun===true,payout:data.testRun===true?'none':'pending-buyer-acceptance'};
  }catch(error){try{await store.event(lock,'error:'+String(error.code||error.message).slice(0,120));}catch{}throw error;}
  finally{clearInterval(heartbeat);await store.release(lock);}
 }

 async function reconcile(row){
  const a=row.assignment,saved=await store.get(agentId,a.assignmentId);
  if(!saved||!['prepared','submitting','submitted','accepted-payout-pending','accepted-test-run'].includes(saved.phase))return null;
  if(a.status==='submitted'){
   if(['submitting','prepared'].includes(saved.phase)){
    const delivered=await client.delivered(a.assignmentId);
    if(delivered!==saved.markdown)throw Error('Submitted report differs from the saved report. Manual review required.');
   }
   if(saved.phase!=='submitted')await update(saved,a,'submitted','submission-reconciled');
   return {assignmentId:a.assignmentId,state:'submitted',testRun:saved.testRun===true,payout:saved.testRun===true?'none':'pending-buyer-acceptance'};
  }
  if(a.status==='accepted'){
   if(saved.testRun===true){if(saved.phase!=='accepted-test-run')await update(saved,a,'accepted-test-run','test-run-accepted');return {assignmentId:a.assignmentId,state:'accepted-test-run',testRun:true,payout:'none'};}
   if(saved.phase!=='accepted-payout-pending')await update(saved,a,'accepted-payout-pending','accepted-payout-not-confirmed');
   return {assignmentId:a.assignmentId,state:'accepted-payout-pending'};
  }
  if(a.status==='cancelled'){
   if(saved.phase!=='cancelled')await update(saved,a,'cancelled','assignment-cancelled');
   return {assignmentId:a.assignmentId,state:'cancelled'};
  }
  if(a.status==='dispute_resolved'){
   if(saved.phase!=='dispute-resolved-payout-pending')await update(saved,a,'dispute-resolved-payout-pending','dispute-payout-not-confirmed');
   return {assignmentId:a.assignmentId,state:'dispute-resolved-payout-pending'};
  }
  return null;
 }
 async function update(saved,a,phase,eventName){
  const lock=await store.acquire(agentId,a.assignmentId);if(!lock)return;
  try{await store.save(lock,{...saved,phase,marketplaceStatus:a.status});await store.event(lock,eventName);}
  finally{await store.release(lock);}
 }
 return {
  async runOnce(){
   const rows=await client.assignments(),queue=rows.map((row,index)=>({row,index}));
   const startDeadline=row=>{const value=Date.parse(row?.assignment?.slaDeadlineAt||'');return Number.isFinite(value)?value:Number.MAX_SAFE_INTEGER;};
   queue.sort((left,right)=>{
    const a=left.row?.assignment,b=right.row?.assignment;
    const aNeedsStart=a?.status==='in_progress'&&!a.startedAt,bNeedsStart=b?.status==='in_progress'&&!b.startedAt;
    if(aNeedsStart!==bNeedsStart)return aNeedsStart?-1:1;
    return aNeedsStart?startDeadline(left.row)-startDeadline(right.row):left.index-right.index;
   });
   const outcomes=new Array(queue.length);let cursor=0;
   const runNext=async()=>{
    while(cursor<queue.length){
     const position=cursor++,row=queue[position].row,a=row?.assignment;
     if(!uuid(a?.assignmentId))continue;
     try{const result=a.status==='in_progress'?await process(row):await reconcile(row);if(result)outcomes[position]=result;}
     catch(error){const errorCode=typeof error?.code==='string'&&/^[A-Z0-9_]{1,40}$/.test(error.code)?error.code:'WORKER_ERROR';outcomes[position]={assignmentId:a.assignmentId,state:'error',errorCode,...(Number.isInteger(error?.status)?{status:error.status}:{})};}
    }
   };
   await Promise.all(Array.from({length:Math.min(3,queue.length)},runNext));
   const results=outcomes.filter(Boolean);
   return {checked:rows.length,results,checkedAt:now().toISOString()};
  },process
 };
}
