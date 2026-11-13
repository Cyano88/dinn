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

export function createNearWorker({token=process.env.NEAR_AGENT_TOKEN,agentId=process.env.NEAR_AGENT_ID,minimumEscrow=process.env.NEAR_WORKER_MIN_ESCROW,escrowToken=process.env.NEAR_WORKER_ESCROW_TOKEN,store,client,report=agentAccessRequest,now=()=>new Date(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
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
    data={phase:'prepared',markdown:made.deliverableMarkdown,evidenceHash:made.evidence.sha256,service,tokenAddress:input.address,testRun:full.isTestRun===true,preparedAt:now().toISOString()};
    await store.save(lock,data);await event('report-prepared');
   }
   // Re-check marketplace state immediately before the external delivery.
   const current=await client.assignment(a.assignmentId);
   if(!current||current.assignment?.workerAgentId!==agentId||current.assignment?.status!=='in_progress'||current.assignment?.deliverableUrl||current.assignment?.submittedAt){
    await store.save(lock,{...data,phase:'not-delivered',lastObservedStatus:current?.assignment?.status||'missing'});await event('not-delivered');return {assignmentId:a.assignmentId,state:'not-delivered'};
   }
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
