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
function requestedResearchInput(row,job){
 const brief=row?.job,sources=[brief?.description];
 if(job.origin==='a2a'&&row.latestMessage!=null){
  const message=row.latestMessage;
  if(message.senderSide!=='buyer'||message.origin!=='direct'||message.truncated!==false||message.attachments?.length||typeof message.body!=='string'||message.body.length>4000)return null;
  sources.push(message.body);
 }
 const text=sources.filter(value=>typeof value==='string').join('\n');
 const serviceLines=[...text.matchAll(/^\s*service\s*:\s*([a-z][a-z0-9.-]*)\s*$/gim)].map(match=>match[1].toLowerCase());
 if([...text.matchAll(/^\s*service\s*:/gim)].length!==serviceLines.length)return null;
 const services=[...new Set(serviceLines)];if(services.length>1||services.some(value=>!['token.research','token.inspect','base.stock-paired.research','base.stock.research'].includes(value)))return null;
 const addresses=[...new Set(sources.flatMap(value=>typeof value==='string'?[...value.matchAll(TOKEN_RE)].map(match=>match[0].toLowerCase()):[]))];
 const chainLines=[...text.matchAll(/^\s*chain\s*:\s*(\d+)\s*$/gim)].map(match=>Number(match[1]));
 if([...text.matchAll(/^\s*chain\s*:/gim)].length!==chainLines.length)return null;
 const uniqueChains=new Set(chainLines);
 if(services[0]==='base.stock.research'){
  if(chainLines.length&&(uniqueChains.size!==1||chainLines[0]!==8453))return null;
  const targets=[...text.matchAll(/^\s*(?:token|token address|ticker|symbol)\s*:\s*([^\s,;]+)\s*$/gim)].map(match=>match[1]);
  if([...text.matchAll(/^\s*(?:token|token address|ticker|symbol)\s*:/gim)].length!==targets.length||targets.length!==1)return null;
  const query=targets[0].trim();if(!(/^(?:0x[0-9a-f]{40}|[a-z][a-z0-9 ._-]{0,39})$/i.test(query)))return null;
  if(addresses.length&&(!/^0x[0-9a-f]{40}$/i.test(query)||addresses.length!==1||addresses[0]!==query.toLowerCase()))return null;
  return {service:'base.stock.research',query};
 }
 if(addresses.length!==1)return null;
 const namesBase=/\b(?:on|for|via)\s+(?:the\s+)?base(?:\s+chain)?\b|\bbase[- ]stock[- ]paired\b|\bbankr\b|\bchain\s*:\s*8453\b/i.test(text);
 const namesRobinhood=/\brobinhood(?:\s+chain)?\b|\bpons\b|\bchain\s*:\s*4663\b/i.test(text);
 const comparesNetworks=namesBase&&namesRobinhood&&/\b(?:and|or|vs\.?|versus|compare|both|either)\b/i.test(text);
 if(comparesNetworks)return null;
 const baseRequested=!services.length&&(uniqueChains.has(8453)||namesBase);
 const service=services[0]||(baseRequested?'base.stock-paired.research':'token.research');
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
export function eligibleNearResearchJob(row,fullJob,agentId,{minimumEscrow,escrowToken}={}){
 const a=row?.assignment,j=row?.job;
 if(!uuid(a?.assignmentId)||!uuid(a?.jobId)||!uuid(a?.workerAgentId)||a.jobId!==j?.jobId||a.workerAgentId!==agentId||a.status!=='in_progress'||a.deliverableUrl||a.submittedAt||!['standard','instant'].includes(j?.jobKind)||j.attachments?.length||typeof fullJob?.isTestRun!=='boolean'||fullJob?.jobId!==a.jobId||fullJob?.status!=='in_progress'||typeof j.title!=='string'||j.title.length<1||j.title.length>120||fullJob.title!==j.title||!supportedResearchJobSurface(j,fullJob))return null;
 if(typeof j.description!=='string'||j.description.length>4000)return null;
 const amount=escrowUnits(a.escrowAmount),minimum=escrowUnits(minimumEscrow),input=requestedResearchInput(row,fullJob);
 const testRun=fullJob.isTestRun===true;
 if(!input||amount===null)return null;
 if(testRun){if(amount!==0n||(a.escrowToken!=null&&!['USD','USDC'].includes(a.escrowToken)))return null;}
 else if(minimum===null||minimum<=0n||amount<minimum||a.escrowToken!==escrowToken)return null;
 return input;
}

export function createNearWorker({token=process.env.NEAR_AGENT_TOKEN,agentId=process.env.NEAR_AGENT_ID,minimumEscrow=process.env.NEAR_WORKER_MIN_ESCROW,escrowToken=process.env.NEAR_WORKER_ESCROW_TOKEN,store,client,feedbackEnabled=false,report=agentAccessRequest,now=()=>new Date(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
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
    const candidate=eligibleNearResearchJob(checked,job,agentId,{minimumEscrow,escrowToken});
    if(!refresh || !candidate)return candidate;
    const target=candidate.address || candidate.query;
    const savedTarget=data.tokenAddress || data.stockQuery;
    return savedTarget && target.toLowerCase()===savedTarget.toLowerCase() && candidate.service===data.service && data.testRun===job.isTestRun ? candidate : null;
   };
   let input=resolveInput(row,full);
   if(!input && data.submittedAt)return {assignmentId:a.assignmentId,state:'refresh-not-confirmed'};
   if(returned && data.refresh===true && data.phase==='submitted')return {assignmentId:a.assignmentId,state:'refresh-limit'};
   if(returned && !data.refresh && input){
    const current=await client.assignment(a.assignmentId);
    if(!current || !resolveInput(current,full) || current.latestMessage?.senderSide!=='buyer')return {assignmentId:a.assignmentId,state:'refresh-not-confirmed'};
    data={...data,refresh:true,phase:'refresh-requested',markdown:null};
    await store.save(lock,data);
   }
   if(!input){if(data.phase==='not-eligible'&&data.eligibilityFingerprint===fingerprint)return {assignmentId:a.assignmentId,state:'not-eligible',recorded:false,cached:true};const recorded=data.phase!=='not-eligible';if(recorded||data.eligibilityFingerprint!==fingerprint){await store.save(lock,{...data,phase:'not-eligible',eligibilityFingerprint:fingerprint});if(recorded)await event('not-eligible');}return {assignmentId:a.assignmentId,state:'not-eligible',recorded};}
   if(['submitted','accepted-payout-pending','accepted-test-run'].includes(data.phase))return {assignmentId:a.assignmentId,state:data.phase,testRun:data.testRun===true,payout:data.testRun===true?'none':undefined};
   if(!data.markdown){
    assertLease();if(!refresh){await client.start(a.assignmentId);await wait(3000);}
    await store.save(lock,{...data,phase:'started',startedAt:now().toISOString()});await event('started');
    const current=await client.assignment(a.assignmentId);
    if(!current||current.assignment?.workerAgentId!==agentId||current.assignment?.status!=='in_progress'||(!refresh && (current.assignment?.deliverableUrl||current.assignment?.submittedAt))){
     await store.save(lock,{...lock.data,phase:'stopped-before-research'});await event('stopped-before-research');return {assignmentId:a.assignmentId,state:'stopped-before-research'};
    }
    full=await client.job(a.jobId);input=resolveInput(current,full);
    if(!input){await store.save(lock,{...lock.data,phase:'stopped-before-research'});await event('stopped-before-research');return {assignmentId:a.assignmentId,state:'stopped-before-research'};}
    assertLease();
    const {service,...reportInput}=input;
    const made=await report({service,requestId:'near-'+a.assignmentId+(refresh?'-refresh':''),input:reportInput},{paidMarketplaceHire:full.isTestRun===false});
    if(made.status!=='completed'||typeof made.deliverableMarkdown!=='string'||!made.deliverableMarkdown.length||made.deliverableMarkdown.length>250000||!/^\w{64}$/.test(made.evidence?.sha256||''))throw Error('Research report was incomplete or too large.');
    data={refresh,phase:'prepared',markdown:made.deliverableMarkdown,evidenceHash:made.evidence.sha256,service,tokenAddress:input.address,stockQuery:input.query,testRun:full.isTestRun===true,preparedAt:now().toISOString()};
    if(feedbackEnabled && full.isPrivate===true){
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
