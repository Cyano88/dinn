import {createHash} from 'node:crypto';
import {createNearMarketClient,uuid} from './near-market-client.mjs';
import {agentAccessRequest} from './agent-access.mjs';

const TOKEN_RE=/0x[0-9a-fA-F]{40}/g;

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
 const addresses=[...new Set(sources.flatMap(value=>typeof value==='string'?[...value.matchAll(TOKEN_RE)].map(match=>match[0].toLowerCase()):[]))];
 if(addresses.length!==1)return null;
 const text=sources.filter(value=>typeof value==='string').join('\n');
 const serviceLines=[...text.matchAll(/^\s*service\s*:\s*([a-z][a-z0-9.]*)\s*$/gim)].map(match=>match[1].toLowerCase());
 if(/^\s*service\s*:/im.test(text)&&!serviceLines.length)return null;
 const services=[...new Set(serviceLines)];if(services.length>1||services.some(value=>!['token.research','token.inspect'].includes(value)))return null;
 const service=services[0]||'token.research';
 if(service==='token.inspect'){
  const chainLines=[...text.matchAll(/^\s*chain\s*:\s*(\d+)\s*$/gim)].map(match=>Number(match[1]));
  if(/^\s*chain\s*:/im.test(text)&&!chainLines.length)return null;
  if(new Set(chainLines).size!==1||chainLines[0]!==4663)return null;
  return {service,address:addresses[0],chainId:4663};
 }
 return {service,address:addresses[0]};
}
export function nearMessageFingerprint(message){
 if(!message||typeof message!=='object'||Array.isArray(message))return null;
 const id=message.messageId??message.message_id??message.id??null,createdAt=message.createdAt??message.created_at??null;
 if(id==null&&createdAt==null)return null;
 return createHash('sha256').update(JSON.stringify({id,createdAt,senderSide:message.senderSide??null,senderAgentId:message.senderAgentId??null,body:message.body??null,origin:message.origin??null,truncated:message.truncated??null,attachments:Array.isArray(message.attachments)?message.attachments.map(a=>a?.id??a?.fileId??a?.url??''):null})).digest('hex');
}
function savedResearchInput(data){
 if(!['token.research','token.inspect'].includes(data?.service)||typeof data?.tokenAddress!=='string'||!/^0x[0-9a-f]{40}$/.test(data.tokenAddress))return null;
 if(data.service==='token.inspect')return data.chainId===4663?{service:data.service,address:data.tokenAddress,chainId:4663}:null;
 return {service:data.service,address:data.tokenAddress};
}
function messageIdentity(message){return message?.messageId??message?.message_id??message?.id??null;}
async function fullReworkThread(client,assignmentId){
 const messages=[],pageSize=100,maxMessages=1000;
 let total=null;
 for(let offset=0;offset<maxMessages;offset+=pageSize){
  const result=await client.messages(assignmentId,{limit:pageSize,offset}),batch=Array.isArray(result?.messages)?result.messages:Array.isArray(result)?result:null;
  if(!batch||batch.length>pageSize)return null;
  messages.push(...batch);
  if(Number.isSafeInteger(result?.total)&&result.total>=0){
   if(total!==null&&total!==result.total)return null;
   total=result.total;
   if(messages.length>=total)return messages.length===total?messages:null;
  }else if(batch.length<pageSize)return messages;
  if(batch.length<pageSize)return total===null||messages.length===total?messages:null;
 }
 return total!==null&&messages.length===total?messages:null;
}
async function latestReworkMessage(row,client,assignmentId){
 let message=row?.latestMessage;
 if(!message||message.senderSide!=='buyer')return null;
 if(message.truncated===true){
  const messages=await fullReworkThread(client,assignmentId),id=messageIdentity(message);
  if(!messages||typeof message.createdAt!=='string'||typeof message.body!=='string'||!message.body)return null;
  const matches=messages.filter(item=>id!=null?messageIdentity(item)===id:item?.createdAt===message.createdAt&&typeof item?.body==='string'&&item.body.startsWith(message.body));
  if(matches.length!==1)return null;
  message={...matches[0],senderSide:message.senderSide,truncated:false};
 }
 return message;
}
function validReworkMessage(message,agentId){
 return !!message&&message.senderSide==='buyer'&&message.senderAgentId!==agentId&&typeof message.body==='string'&&message.body.length>0&&message.body.length<=4000&&message.truncated!==true;
}
function reworkInScope(message,input){
 if(message.attachments!=null&&(!Array.isArray(message.attachments)||message.attachments.length>0))return false;
 const addresses=[...new Set([...message.body.matchAll(TOKEN_RE)].map(match=>match[0].toLowerCase()))];
 if(addresses.some(address=>address!==input.address))return false;
 if(/\b(?:security audit|audit the contract|recommend(?:ation)?|profitability|safe[- ]to[- ]trade|buy (?:this|it|tokens?|for me)|sell (?:this|it|tokens?|for me)|swap (?:this|it|tokens?|for me)|transfer|claim (?:fees?|tokens?)|sign (?:the )?transaction|execute (?:a )?trade|another token|different token|second token|new token|good investment|investment advice|financial advice)\b/i.test(message.body)||/\b(?:should i|would you|do you think i should)\b.{0,60}\b(?:buy|sell|hold|trade|invest)\b/i.test(message.body))return false;
 return true;
}
function reworkReply({outOfScope,alreadyRevised}){
 if(outOfScope)return 'I received your requested changes. This hire covers one read-only research report for the original token, not a security audit, trading recommendation or transaction. It cannot switch to another token or use attachments. I will return the latest supported report with that scope noted.';
 if(alreadyRevised)return 'I received your requested changes. This hire includes one refreshed report for the original token, which has already been delivered. I will return the latest supported report and note that additional changes need a new hire.';
 return 'I received your requested changes. I will refresh the read-only report for the same token and check the supported research fields again. This hire does not execute transactions.';
}
function revisionMarkdown(markdown,{outOfScope=false,alreadyRevised=false}={}){
 const note=outOfScope?'This hire covers one read-only report for the original token. The additional scope in the change request was not performed; no transaction was sent.':alreadyRevised?'This hire includes one refreshed report for the original token. That revision has already been delivered; this version repeats the latest supported report.':'This report refreshes the original token’s read-only research after your requested correction. It uses a new snapshot and does not add another token or execute transactions.';
 return `> **Update:** ${note}\n\n${markdown}`;
}
export function eligibleNearResearchJob(row,fullJob,agentId,{minimumEscrow,escrowToken,rework=false,researchInput=null}={}){
 const a=row?.assignment,j=row?.job;
 if(!uuid(a?.assignmentId)||!uuid(a?.jobId)||!uuid(a?.workerAgentId)||a.jobId!==j?.jobId||a.workerAgentId!==agentId||a.status!=='in_progress'||(rework?!a.submittedAt:!!(a.deliverableUrl||a.submittedAt))||!['standard','instant'].includes(j?.jobKind)||j.attachments?.length||typeof fullJob?.isTestRun!=='boolean'||fullJob?.jobId!==a.jobId||fullJob?.status!=='in_progress'||typeof j.title!=='string'||j.title.length<1||j.title.length>120||fullJob.title!==j.title||!supportedResearchJobSurface(j,fullJob))return null;
 if(typeof j.description!=='string'||j.description.length>4000)return null;
 const amount=escrowUnits(a.escrowAmount),minimum=escrowUnits(minimumEscrow),input=rework?researchInput:requestedResearchInput(row,fullJob);
 if(rework&&!savedResearchInput({service:input?.service,tokenAddress:input?.address,chainId:input?.chainId}))return null;
 const testRun=fullJob.isTestRun===true;
 if(!input||amount===null)return null;
 if(testRun){if(amount!==0n||(a.escrowToken!=null&&!['USD','USDC'].includes(a.escrowToken)))return null;}
 else if(minimum===null||minimum<=0n||amount<minimum||a.escrowToken!==escrowToken)return null;
 return input;
}

export function createNearWorker({token=process.env.NEAR_AGENT_TOKEN,agentId=process.env.NEAR_AGENT_ID,minimumEscrow=process.env.NEAR_WORKER_MIN_ESCROW,escrowToken=process.env.NEAR_WORKER_ESCROW_TOKEN,store,client,report=agentAccessRequest,now=()=>new Date(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 if(!uuid(agentId))throw Error('Configure the registered NEAR_AGENT_ID.');
 if(!store)throw Error('NEAR worker PostgreSQL storage is required.');
 if(escrowUnits(minimumEscrow)===null||escrowUnits(minimumEscrow)<=0n||!['USD','USDC'].includes(escrowToken))throw Error('Configure the owner-approved NEAR_WORKER_MIN_ESCROW and NEAR_WORKER_ESCROW_TOKEN.');
 client=client||createNearMarketClient({token});

 async function processInitial(row){
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
   let full=await client.job(a.jobId),input=eligibleNearResearchJob(row,full,agentId,{minimumEscrow,escrowToken});
   if(!input){if(data.phase!=='not-eligible'){await store.save(lock,{phase:'not-eligible'});await event('not-eligible');}return {assignmentId:a.assignmentId,state:'not-eligible'};}
   if(['submitted','accepted-payout-pending','accepted-test-run'].includes(data.phase))return {assignmentId:a.assignmentId,state:data.phase,testRun:data.testRun===true,payout:data.testRun===true?'none':undefined};
   if(!data.markdown){
    assertLease();await client.start(a.assignmentId);await wait(3000);
    await store.save(lock,{...data,phase:'started',startedAt:now().toISOString()});await event('started');
    const current=await client.assignment(a.assignmentId);
    if(!current||current.assignment?.workerAgentId!==agentId||current.assignment?.status!=='in_progress'||current.assignment?.deliverableUrl||current.assignment?.submittedAt){
     await store.save(lock,{...lock.data,phase:'stopped-before-research'});await event('stopped-before-research');return {assignmentId:a.assignmentId,state:'stopped-before-research'};
    }
    full=await client.job(a.jobId);input=eligibleNearResearchJob(current,full,agentId,{minimumEscrow,escrowToken});
    if(!input){await store.save(lock,{...lock.data,phase:'stopped-before-research'});await event('stopped-before-research');return {assignmentId:a.assignmentId,state:'stopped-before-research'};}
    assertLease();
    const {service,...reportInput}=input;
    const made=await report({service,requestId:'near-'+a.assignmentId,input:reportInput});
    if(made.status!=='completed'||typeof made.deliverableMarkdown!=='string'||!made.deliverableMarkdown.length||made.deliverableMarkdown.length>250000||!/^\w{64}$/.test(made.evidence?.sha256||''))throw Error('Research report was incomplete or too large.');
    data={phase:'prepared',markdown:made.deliverableMarkdown,evidenceHash:made.evidence.sha256,service,tokenAddress:input.address,...(input.chainId?{chainId:input.chainId}:{}),testRun:full.isTestRun===true,preparedAt:now().toISOString(),revisionCount:0,lastHandledMessageHash:nearMessageFingerprint(current.latestMessage)};
    await store.save(lock,data);await event('report-prepared');
   }
   // Re-check marketplace state immediately before the external delivery.
   const current=await client.assignment(a.assignmentId);
   if(!current||current.assignment?.workerAgentId!==agentId||current.assignment?.status!=='in_progress'||current.assignment?.deliverableUrl||current.assignment?.submittedAt){
    await store.save(lock,{...data,phase:'not-delivered',lastObservedStatus:current?.assignment?.status||'missing'});await event('not-delivered');return {assignmentId:a.assignmentId,state:'not-delivered'};
   }
   await store.renew(lock);assertLease();
   data={...data,phase:'submitting',submissionAttemptedAt:now().toISOString(),lastHandledMessageHash:nearMessageFingerprint(current.latestMessage)};
   await store.save(lock,data);await event('submission-attempted');
   const submitted=await client.submit(a.assignmentId,data.markdown);
   if(submitted?.assignmentId!==a.assignmentId||submitted.status!=='submitted')throw Error('Marketplace did not confirm the expected submitted assignment.');
   await store.save(lock,{...data,phase:'submitted',submittedAt:now().toISOString(),marketplaceStatus:submitted.status});await event('submitted');
   return {assignmentId:a.assignmentId,state:'submitted',testRun:data.testRun===true,payout:data.testRun===true?'none':'pending-buyer-acceptance'};
  }catch(error){try{await store.event(lock,'error:'+String(error.code||error.message).slice(0,120));}catch{}throw error;}
  finally{clearInterval(heartbeat);await store.release(lock);}
 }

 async function processRework(row,savedData){
  const a=row.assignment,lock=await store.acquire(agentId,a.assignmentId);
  if(!lock)return {assignmentId:a.assignmentId,state:'leased-elsewhere'};
  let leaseLost=false;
  const heartbeat=setInterval(()=>{void store.renew(lock).catch(()=>{leaseLost=true;});},30000);heartbeat.unref?.();
  try{
   const assertLease=()=>{if(leaseLost)throw Error('Worker lease lost.');};
   const event=name=>store.event(lock,name);
   let data=lock.data||savedData,input=savedResearchInput(data);
   if(!input||!a.submittedAt)return {assignmentId:a.assignmentId,state:'rework-needs-review'};
   const full=await client.job(a.jobId);
   if(!eligibleNearResearchJob(row,full,agentId,{minimumEscrow,escrowToken,rework:true,researchInput:input}))return {assignmentId:a.assignmentId,state:'rework-not-eligible'};
   if(data.phase==='submitted'){
    const message=await latestReworkMessage(row,client,a.assignmentId),fingerprint=nearMessageFingerprint(message);
    if(!fingerprint||fingerprint===data.lastHandledMessageHash||!validReworkMessage(message,agentId))return {assignmentId:a.assignmentId,state:'awaiting-supported-change-request'};
    const outOfScope=!reworkInScope(message,input),alreadyRevised=(data.revisionCount||0)>=1;
    data={...data,phase:'rework-acknowledging',activeReworkMessageHash:fingerprint,activeReworkMessageId:messageIdentity(message),activeReworkOutOfScope:outOfScope,activeReworkAlreadyRevised:alreadyRevised,activeReworkRequestId:`dinn-rework-${a.assignmentId.slice(0,8)}-${fingerprint.slice(0,20)}`,activeReworkReply:reworkReply({outOfScope,alreadyRevised})};
    await store.save(lock,data);await event('rework-detected');
   }
   if(!['rework-acknowledging','rework-prepared','rework-submitting'].includes(data.phase)||!data.activeReworkMessageHash)return {assignmentId:a.assignmentId,state:'rework-needs-review'};
   if(data.phase==='rework-acknowledging'){
    assertLease();await client.sendMessage(a.assignmentId,data.activeReworkReply,data.activeReworkRequestId);
    data={...data,phase:'rework-prepared',activeReworkAcknowledgedAt:now().toISOString()};await store.save(lock,data);await event('rework-acknowledged');
   }
   if(data.phase==='rework-prepared'&&!data.activeReworkMarkdown){
    let markdown=data.markdown,evidenceHash=data.evidenceHash,countsRevision=false;
    if(!data.activeReworkOutOfScope&&!data.activeReworkAlreadyRevised){
     const {service,...reportInput}=input;assertLease();
     const made=await report({service,requestId:'near-'+a.assignmentId+'-revision-'+data.activeReworkMessageHash.slice(0,16),input:reportInput});
     if(made.status!=='completed'||typeof made.deliverableMarkdown!=='string'||!made.deliverableMarkdown.length||made.deliverableMarkdown.length>250000||!/^[\w]{64}$/.test(made.evidence?.sha256||''))throw Error('Revised research report was incomplete or too large.');
     markdown=revisionMarkdown(made.deliverableMarkdown);evidenceHash=made.evidence.sha256;countsRevision=true;
    }else markdown=revisionMarkdown(data.markdown,{outOfScope:data.activeReworkOutOfScope,alreadyRevised:data.activeReworkAlreadyRevised});
    data={...data,phase:'rework-prepared',activeReworkMarkdown:markdown,activeReworkEvidenceHash:evidenceHash,activeReworkCountsRevision:countsRevision};
    await store.save(lock,data);await event(countsRevision?'rework-report-prepared':'rework-scope-prepared');
   }
   const current=await client.assignment(a.assignmentId),ca=current?.assignment,latest=current?.latestMessage;
   if(!ca||ca.workerAgentId!==agentId||ca.status!=='in_progress'||!ca.submittedAt){
    await store.save(lock,{...data,phase:'rework-stopped',lastObservedStatus:ca?.status||'missing'});await event('rework-stopped');return {assignmentId:a.assignmentId,state:'rework-stopped'};
   }
   if(latest?.senderSide==='buyer'&&(data.activeReworkMessageId!=null?messageIdentity(latest)!==data.activeReworkMessageId:nearMessageFingerprint(latest)!==data.activeReworkMessageHash)){
    const reset={...data,phase:'submitted',lastHandledMessageHash:data.activeReworkMessageHash};
    for(const key of Object.keys(reset))if(key.startsWith('activeRework'))delete reset[key];
    await store.save(lock,reset);await event('rework-superseded');return {assignmentId:a.assignmentId,state:'newer-buyer-feedback'};
   }
   data={...data,phase:'rework-submitting',markdown:data.activeReworkMarkdown,evidenceHash:data.activeReworkEvidenceHash,pendingRevisionIncrement:data.activeReworkCountsRevision===true,submissionAttemptedAt:now().toISOString()};
   await store.save(lock,data);await event('rework-submission-attempted');await store.renew(lock);assertLease();
   const submitted=await client.submit(a.assignmentId,data.markdown);
   if(submitted?.assignmentId!==a.assignmentId||submitted.status!=='submitted')throw Error('Marketplace did not confirm the expected revised assignment.');
   const completed=finishRework(data,submitted.status,now().toISOString());
   await store.save(lock,completed);await event('rework-submitted');
   return {assignmentId:a.assignmentId,state:'revised-submitted',testRun:data.testRun===true,payout:data.testRun===true?'none':'pending-buyer-acceptance'};
  }catch(error){try{await store.event(lock,'error:'+String(error.code||error.message).slice(0,120));}catch{}throw error;}
  finally{clearInterval(heartbeat);await store.release(lock);}
 }
 function finishRework(data,status,submittedAt){
 return {...clearActiveRework(data),phase:'submitted',submittedAt,marketplaceStatus:status,lastHandledMessageHash:data.activeReworkMessageHash,revisionCount:(data.revisionCount||0)+(data.pendingRevisionIncrement?1:0)};
}
function clearActiveRework(data){
 const cleared={...data};
 for(const key of Object.keys(cleared))if(key.startsWith('activeRework')||key==='pendingRevisionIncrement')delete cleared[key];
 return cleared;
 }
 async function process(row){
  const a=row.assignment,saved=await store.get(agentId,a.assignmentId);
  if(a.status==='in_progress'&&a.submittedAt&&saved?.markdown)return processRework(row,saved);
  return processInitial(row);
 }

 async function reconcile(row){
  const a=row.assignment,saved=await store.get(agentId,a.assignmentId);
  if(!saved||!['prepared','submitting','rework-submitting','submitted','accepted-payout-pending','accepted-test-run'].includes(saved.phase))return null;
  if(a.status==='submitted'){
   if(['submitting','prepared','rework-submitting'].includes(saved.phase)){
    const delivered=await client.delivered(a.assignmentId);
    if(delivered!==saved.markdown)throw Error('Submitted report differs from the saved report. Manual review required.');
   }
   if(saved.phase==='rework-submitting')await update(saved,a,'submitted','rework-submission-reconciled',finishRework(saved,a.status,now().toISOString()));
   else if(saved.phase!=='submitted')await update(saved,a,'submitted','submission-reconciled');
   return {assignmentId:a.assignmentId,state:'submitted',testRun:saved.testRun===true,payout:saved.testRun===true?'none':'pending-buyer-acceptance'};
  }
  if(a.status==='accepted'){
   if(saved.phase==='rework-submitting'&&await client.delivered(a.assignmentId)!==saved.markdown)throw Error('Accepted revision differs from the saved report. Manual review required.');
   const settled=saved.phase==='rework-submitting'?finishRework(saved,a.status,now().toISOString()):saved;
   if(saved.testRun===true){if(saved.phase!=='accepted-test-run')await update(saved,a,'accepted-test-run','test-run-accepted',settled);return {assignmentId:a.assignmentId,state:'accepted-test-run',testRun:true,payout:'none'};}
   if(saved.phase!=='accepted-payout-pending')await update(saved,a,'accepted-payout-pending','accepted-payout-not-confirmed',settled);
   return {assignmentId:a.assignmentId,state:'accepted-payout-pending'};
  }
  if(a.status==='cancelled'){
   if(saved.phase!=='cancelled')await update(saved,a,'cancelled','assignment-cancelled',clearActiveRework(saved));
   return {assignmentId:a.assignmentId,state:'cancelled'};
  }
  if(a.status==='dispute_resolved'){
   if(saved.phase==='rework-submitting'&&await client.delivered(a.assignmentId)!==saved.markdown)throw Error('Resolved revision differs from the saved report. Manual review required.');
   const settled=saved.phase==='rework-submitting'?finishRework(saved,a.status,now().toISOString()):saved;
   if(saved.phase!=='dispute-resolved-payout-pending')await update(saved,a,'dispute-resolved-payout-pending','dispute-payout-not-confirmed',settled);
   return {assignmentId:a.assignmentId,state:'dispute-resolved-payout-pending'};
  }
  return null;
 }
 async function update(saved,a,phase,eventName,replacement=saved){
  const lock=await store.acquire(agentId,a.assignmentId);if(!lock)return;
  try{await store.save(lock,{...replacement,phase,marketplaceStatus:a.status});await store.event(lock,eventName);}
  finally{await store.release(lock);}
 }
 return {
  async runOnce(){
   const rows=await client.assignments(),results=[];
   for(const row of rows){
    const a=row?.assignment;if(!uuid(a?.assignmentId))continue;
    try{const result=a.status==='in_progress'?await process(row):await reconcile(row);if(result)results.push(result);}
    catch(error){results.push({assignmentId:a.assignmentId,state:'error',error:error.message});}
   }
   return {checked:rows.length,results,checkedAt:now().toISOString()};
  },process
 };
}
