import test from 'node:test';
import assert from 'node:assert/strict';
import {createNearWorker,eligibleNearResearchJob,nearMessageFingerprint} from '../src/near-worker.mjs';

const agentId='11111111-1111-4111-8111-111111111111';
const assignmentId='22222222-2222-4222-8222-222222222222';
const jobId='33333333-3333-4333-8333-333333333333';
const tokenAddress='0x32d5ee0142db8769d954a7c2521e76ca3241fb32';
const options={minimumEscrow:'1.00',escrowToken:'USDC'};

function fixture({origin=null,isPrivate=false,jobKind='standard',title='Dinn',description=`Research ${tokenAddress}`,latestMessage=null,...overrides}={}){
 const row={
  assignment:{assignmentId,jobId,workerAgentId:agentId,status:'in_progress',deliverableUrl:null,submittedAt:null,escrowAmount:'1.000000000000',escrowToken:'USDC'},
  job:{jobId,title,description,tags:[],jobKind,status:'in_progress',attachments:[]},
  latestMessage
 };
 const fullJob={jobId,title,description,status:'in_progress',jobKind,isPrivate,isTestRun:false,origin};
 for(const [key,value] of Object.entries(overrides)){
  if(key==='assignment')Object.assign(row.assignment,value);
  else if(key==='brief')Object.assign(row.job,value);
  else if(key==='fullJob')Object.assign(fullJob,value);
  else row[key]=value;
 }
 return {row,fullJob};
}

test('accepts a supported public standard research job',()=>{
 const {row,fullJob}=fixture();
 assert.deepEqual(eligibleNearResearchJob(row,fullJob,agentId,options),{service:'token.research',address:tokenAddress});
});

test('accepts a private marketplace instant hire',()=>{
 const {row,fullJob}=fixture({jobKind:'instant',isPrivate:true,title:'Hire: Dinn Labs'});
 assert.deepEqual(eligibleNearResearchJob(row,fullJob,agentId,options),{service:'token.research',address:tokenAddress});
});

test('accepts a private A2A instant hire and reads its buyer brief',()=>{
 const message={senderSide:'buyer',origin:'direct',body:`Please research ${tokenAddress}`,truncated:false,attachments:[]};
 const {row,fullJob}=fixture({origin:'a2a',isPrivate:true,jobKind:'instant',description:'On-chain token report',latestMessage:message});
 assert.deepEqual(eligibleNearResearchJob(row,fullJob,agentId,options),{service:'token.research',address:tokenAddress});
});

test('routes explicit Robinhood token inspections to the inspection service',()=>{
 const {row,fullJob}=fixture({description:`Service: token.inspect\nChain: 4663\nToken: ${tokenAddress}`});
 assert.deepEqual(eligibleNearResearchJob(row,fullJob,agentId,options),{service:'token.inspect',address:tokenAddress,chainId:4663});
});

test('holder, lock, activity and age questions need no service selectors',()=>{
 const {row,fullJob}=fixture({description:`Show holder buys and sells, token age, and PinkLock vesting for ${tokenAddress}`});
 assert.deepEqual(eligibleNearResearchJob(row,fullJob,agentId,options),{service:'token.research',address:tokenAddress});
});

test('rejects ambiguous inspection requests, unknown services, and unsupported inspection chains',()=>{
 const requests=[
  fixture({description:`Inspect holders and contract controls for ${tokenAddress} and 0x${'9'.repeat(40)}`}),
  fixture({description:`Service: token.other\nChain: 4663\nToken: ${tokenAddress}`}),
  fixture({description:`Service: token.inspect\nChain: 99901\nToken: ${tokenAddress}`}),
  fixture({description:`Service: token.inspect\nToken: ${tokenAddress}`})
 ];
 for(const {row,fullJob} of requests)assert.equal(eligibleNearResearchJob(row,fullJob,agentId,options),null);
});

test('rejects unrelated private standard jobs and unknown job origins',()=>{
 const privateStandard=fixture({isPrivate:true});
 const unknownOrigin=fixture({origin:'webhook',isPrivate:true,jobKind:'instant'});
 assert.equal(eligibleNearResearchJob(privateStandard.row,privateStandard.fullJob,agentId,options),null);
 assert.equal(eligibleNearResearchJob(unknownOrigin.row,unknownOrigin.fullJob,agentId,options),null);
});

test('rejects ambiguous or incomplete A2A buyer briefs',()=>{
 const twoTokens=fixture({origin:'a2a',isPrivate:true,jobKind:'instant',latestMessage:{senderSide:'buyer',origin:'direct',body:`${tokenAddress} 0x1111111111111111111111111111111111111111`,truncated:false,attachments:[]}});
 const truncated=fixture({origin:'a2a',isPrivate:true,jobKind:'instant',latestMessage:{senderSide:'buyer',origin:'direct',body:tokenAddress,truncated:true,attachments:[]}});
 const wrongSender=fixture({origin:'a2a',isPrivate:true,jobKind:'instant',latestMessage:{senderSide:'worker',origin:'direct',body:tokenAddress,truncated:false,attachments:[]}});
 assert.equal(eligibleNearResearchJob(twoTokens.row,twoTokens.fullJob,agentId,options),null);
 assert.equal(eligibleNearResearchJob(truncated.row,truncated.fullJob,agentId,options),null);
 assert.equal(eligibleNearResearchJob(wrongSender.row,wrongSender.fullJob,agentId,options),null);
});

test('accepts zero-cost marketplace test runs while rejecting competitions, attachments, and underfunded assignments',()=>{
 const testRun=fixture({fullJob:{isTestRun:true},assignment:{escrowAmount:'0',escrowToken:'USD'}});
 assert.deepEqual(eligibleNearResearchJob(testRun.row,testRun.fullJob,agentId,options),{service:'token.research',address:tokenAddress});
 const cases=[
  fixture({fullJob:{isTestRun:true},assignment:{escrowAmount:'0.01'}}),
  fixture({jobKind:'competition'}),
  fixture({brief:{attachments:[{fileId:'file'}]}}),
  fixture({assignment:{escrowAmount:'0.99'}})
 ];
 for(const {row,fullJob} of cases)assert.equal(eligibleNearResearchJob(row,fullJob,agentId,options),null);
});

function reworkFixture({feedback=`Please refresh the curve fees and holder activity for ${tokenAddress}`,revisionCount=0,truncated=false}={}){
 const firstMessage={messageId:'message-1',createdAt:'2026-11-13T19:00:00Z',senderSide:'buyer',senderAgentId:'buyer-agent',body:`Research ${tokenAddress}`,truncated:false,attachments:[]};
 const latestMessage={messageId:'message-2',createdAt:'2026-11-13T20:00:00Z',senderSide:'buyer',senderAgentId:'buyer-agent',body:truncated?feedback.slice(0,40):feedback,truncated,attachments:[]};
 const {row,fullJob}=fixture({latestMessage,assignment:{submittedAt:'2026-11-13T19:30:00Z',deliverableUrl:'https://market.near.ai/deliverable/1'}});
 const data={phase:'submitted',markdown:'# Original report',evidenceHash:'a'.repeat(64),service:'token.research',tokenAddress,testRun:false,revisionCount,lastHandledMessageHash:nearMessageFingerprint(firstMessage)};
 return {row,fullJob,data,latestMessage,firstMessage};
}

function workerHarness({row,fullJob,data,fullThreadMessage=null,failFirstSubmit=false,reportResult={status:'completed',deliverableMarkdown:'# Fresh report',evidence:{sha256:'b'.repeat(64)}}}){
 const state={data:structuredClone(data),events:[]},calls={start:0,messages:[],submits:[],reports:[]};
 const store={
  async acquire(){return {worker:agentId,id:assignmentId,token:'lease',data:structuredClone(state.data)};},
  async renew(){},async save(lock,next){state.data=structuredClone(next);lock.data=structuredClone(next);},
  async event(_lock,name){state.events.push(name);},async release(){},async get(){return structuredClone(state.data);}
 };
 const client={
  async assignments(){return [structuredClone(row)];},
  async job(){return fullJob;},async start(){calls.start++;},
  async messages(_id,{limit=100,offset=0}={}){const all=Array.isArray(fullThreadMessage)?fullThreadMessage:[fullThreadMessage].filter(Boolean);return {messages:all.slice(offset,offset+limit),total:all.length};},
  async assignment(){return structuredClone(row);},
  async sendMessage(_id,body,clientRequestId){calls.messages.push({body,clientRequestId});row.latestMessage={messageId:'worker-ack',createdAt:'2026-11-13T20:01:00Z',senderSide:'worker',senderAgentId:agentId,body,truncated:false,attachments:[]};return {ok:true};},
  async submit(_id,markdown){calls.submits.push(markdown);if(failFirstSubmit&&calls.submits.length===1)throw Error('simulated uncertain submission');return {assignmentId,status:'submitted'};},
  async delivered(){return calls.submits.at(-1);}
 };
 const worker=createNearWorker({agentId,minimumEscrow:options.minimumEscrow,escrowToken:options.escrowToken,store,client,wait:async()=>{},now:()=>new Date('2026-11-13T20:02:00Z'),report:async request=>{calls.reports.push(request);return reportResult;}});
 return {worker,state,calls,client};
}

test('a request for supported changes is acknowledged, refreshed once, and submitted as a complete revision',async()=>{
 const f=reworkFixture(),h=workerHarness(f),result=await h.worker.runOnce();
 assert.equal(result.results[0].state,'revised-submitted',JSON.stringify(result.results[0]));
 assert.equal(h.calls.start,0);
 assert.equal(h.calls.messages.length,1);
 assert.match(h.calls.messages[0].body,/refresh the read-only report/);
 assert.equal(h.calls.reports.length,1);
 assert.deepEqual(h.calls.reports[0].input,{address:tokenAddress});
 assert.match(h.calls.submits[0],/\*\*Update:\*\*/);
 assert.match(h.calls.submits[0],/# Fresh report/);
 assert.equal(h.state.data.phase,'submitted');
 assert.equal(h.state.data.revisionCount,1);
 assert.equal(h.state.data.lastHandledMessageHash,nearMessageFingerprint(f.latestMessage));
});

test('truncated feedback is expanded from the assignment thread before being handled',async()=>{
 const f=reworkFixture({truncated:true});
 delete f.latestMessage.messageId;
 const full={messageId:'message-2',createdAt:f.latestMessage.createdAt,senderAgentId:null,body:`${f.latestMessage.body} and include the updated PinkLock vesting and curve inventory`,truncated:false,attachments:[]};
 const h=workerHarness({...f,fullThreadMessage:full}),result=await h.worker.runOnce();
 assert.equal(result.results[0].state,'revised-submitted',JSON.stringify(result.results[0]));
 assert.equal(h.calls.reports.length,1);
});

test('truncated feedback is found when the assignment thread spans multiple API pages',async()=>{
 const f=reworkFixture({truncated:true});
 delete f.latestMessage.messageId;
 const filler=Array.from({length:100},(_,i)=>({messageId:`thread-${i}`,createdAt:`2026-11-13T19:${String(i%60).padStart(2,'0')}:00Z`,senderAgentId:null,body:`Earlier buyer note ${i}`,attachments:[]}));
 const full={messageId:'message-2',createdAt:f.latestMessage.createdAt,senderAgentId:null,body:`${f.latestMessage.body} with complete holder and curve detail`,attachments:[]};
 const h=workerHarness({...f,fullThreadMessage:[...filler,full]}),result=await h.worker.runOnce();
 assert.equal(result.results[0].state,'revised-submitted',JSON.stringify(result.results[0]));
 assert.equal(h.calls.reports.length,1);
});

test('ambiguous truncated feedback is left for review instead of guessing which thread message to use',async()=>{
 const f=reworkFixture({truncated:true});
 delete f.latestMessage.messageId;
 const full={messageId:'message-2',createdAt:f.latestMessage.createdAt,senderAgentId:null,body:`Please refresh the curve fees and holder activity for ${tokenAddress}`,truncated:false,attachments:[]};
 const h=workerHarness({...f,fullThreadMessage:full});
 h.client.messages=async()=>({messages:[full,{...full,messageId:'message-3'}],total:2});
 const result=await h.worker.runOnce();
 assert.equal(result.results[0].state,'awaiting-supported-change-request');
 assert.equal(h.calls.messages.length,0);
 assert.equal(h.calls.reports.length,0);
 assert.equal(h.calls.submits.length,0);
});

test('a different-token change is acknowledged and scoped without researching or changing the original target',async()=>{
 const other='0x1111111111111111111111111111111111111111',f=reworkFixture({feedback:`Please research the holders for ${other}`}),h=workerHarness(f),result=await h.worker.runOnce();
 assert.equal(result.results[0].state,'revised-submitted',JSON.stringify(result.results[0]));
 assert.equal(h.calls.reports.length,0);
 assert.match(h.calls.messages[0].body,/cannot switch to another token/);
 assert.match(h.calls.submits[0],/additional scope.*not performed/i);
 assert.match(h.calls.submits[0],/# Original report/);
 assert.equal(h.state.data.revisionCount,0);
});

test('an audit request is returned with an explicit scope note and no audit claim',async()=>{
 const f=reworkFixture({feedback:`Please audit the contract for vulnerabilities in ${tokenAddress}`}),h=workerHarness(f),result=await h.worker.runOnce();
 assert.equal(result.results[0].state,'revised-submitted');
 assert.equal(h.calls.reports.length,0);
 assert.match(h.calls.submits[0],/additional scope.*not performed/i);
 assert.doesNotMatch(h.calls.submits[0],/security audit completed/i);
});

test('a personal buy recommendation request is returned with a scope note',async()=>{
 const f=reworkFixture({feedback:`Should I buy this token at this price? ${tokenAddress}`}),h=workerHarness(f),result=await h.worker.runOnce();
 assert.equal(result.results[0].state,'revised-submitted');
 assert.equal(h.calls.reports.length,0);
 assert.match(h.calls.submits[0],/additional scope.*not performed/i);
});

test('further supported change requests after the included revision do not trigger another research run',async()=>{
 const f=reworkFixture({revisionCount:1}),h=workerHarness(f),result=await h.worker.runOnce();
 assert.equal(result.results[0].state,'revised-submitted',JSON.stringify(result.results[0]));
 assert.equal(h.calls.reports.length,0);
 assert.match(h.calls.messages[0].body,/already been delivered/);
 assert.match(h.calls.submits[0],/That revision has already been delivered/);
 assert.equal(h.state.data.revisionCount,1);
});

test('the same feedback is not reprocessed after its revision was submitted',async()=>{
 const f=reworkFixture(),h=workerHarness(f);
 await h.worker.runOnce();
 f.row.latestMessage=f.latestMessage;
 const result=await h.worker.runOnce();
 assert.equal(result.results[0].state,'awaiting-supported-change-request',JSON.stringify(result.results[0]));
 assert.equal(h.calls.reports.length,1);
 assert.equal(h.calls.submits.length,1);
});

test('an uncertain revision submit retries the exact stored version without repeating research or acknowledgement',async()=>{
 const f=reworkFixture(),h=workerHarness({...f,failFirstSubmit:true});
 const first=await h.worker.runOnce();
 assert.equal(first.results[0].state,'error');
 const second=await h.worker.runOnce();
 assert.equal(second.results[0].state,'revised-submitted');
 assert.equal(h.calls.reports.length,1);
 assert.equal(h.calls.messages.length,1);
 assert.equal(h.calls.submits.length,2);
 assert.equal(h.calls.submits[0],h.calls.submits[1]);
 assert.equal(h.state.data.revisionCount,1);
});

test('accepted rework is reconciled only when the stored revised deliverable matches marketplace bytes',async()=>{
 const f=reworkFixture(),h=workerHarness(f);
 f.row.assignment.status='accepted';
 h.state.data={...f.data,phase:'rework-submitting',markdown:'# Revised report',revisionCount:0,activeReworkMessageHash:'c'.repeat(64),pendingRevisionIncrement:true};
 h.calls.submits.push('# Revised report');
 const result=await h.worker.runOnce();
 assert.equal(result.results[0].state,'accepted-payout-pending');
 assert.equal(h.state.data.phase,'accepted-payout-pending');
 assert.equal(h.state.data.revisionCount,1);
 assert.equal(Object.keys(h.state.data).some(k=>k.startsWith('activeRework')),false);
});

test('cancellation clears pending rework state without counting an unconfirmed revision',async()=>{
 const f=reworkFixture(),h=workerHarness(f);
 f.row.assignment.status='cancelled';
 h.state.data={...f.data,phase:'rework-submitting',markdown:'# Revised report',revisionCount:0,activeReworkMessageHash:'c'.repeat(64),pendingRevisionIncrement:true};
 const result=await h.worker.runOnce();
 assert.equal(result.results[0].state,'cancelled');
 assert.equal(h.state.data.phase,'cancelled');
 assert.equal(h.state.data.revisionCount,0);
 assert.equal(Object.keys(h.state.data).some(k=>k.startsWith('activeRework')),false);
});
