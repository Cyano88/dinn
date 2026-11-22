import test from 'node:test';
import assert from 'node:assert/strict';
import {eligibleNearResearchJob,createNearWorker,submittedReportStatusMessage} from '../src/near-worker.mjs';

const agentId='11111111-1111-4111-8111-111111111111';
const assignmentId='22222222-2222-4222-8222-222222222222';
const jobId='33333333-3333-4333-8333-333333333333';
const tokenAddress='0x32d5ee0142db8769d954a7c2521e76ca3241fb32';
const options={minimumEscrow:'1.00',escrowToken:'USDC'};

test('worker logs distinguish zero-cost test-run delivery from paid-hire payout',()=>{
 assert.equal(submittedReportStatusMessage({state:'submitted',testRun:true}),'NEAR worker submitted an authorized zero-cost test-run report; no payout is due.');
 assert.equal(submittedReportStatusMessage({state:'submitted',testRun:false}),'NEAR worker submitted a report; payout awaits buyer acceptance.');
 assert.equal(submittedReportStatusMessage({state:'accepted-test-run',testRun:true}),null);
});

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

test('routes an A2A buyer message that explicitly names Base',()=>{
 const message={senderSide:'buyer',origin:'direct',body:`Please research this token on Base: ${tokenAddress}`,truncated:false,attachments:[]};
 const {row,fullJob}=fixture({origin:'a2a',isPrivate:true,jobKind:'instant',description:'On-chain token report',latestMessage:message});
 assert.deepEqual(eligibleNearResearchJob(row,fullJob,agentId,options),{service:'base.stock-paired.research',address:tokenAddress});
});

test('routes explicit Robinhood token inspections to the inspection service',()=>{
 const {row,fullJob}=fixture({description:`Service: token.inspect\nChain: 4663\nToken: ${tokenAddress}`});
 assert.deepEqual(eligibleNearResearchJob(row,fullJob,agentId,options),{service:'token.inspect',address:tokenAddress,chainId:4663});
});

test('routes explicit Base stock-paired research to the Base service',()=>{
 for(const chain of ['',`\nChain: 8453`]){
  const {row,fullJob}=fixture({description:`Service: base.stock-paired.research${chain}\nToken: ${tokenAddress}`});
  assert.deepEqual(eligibleNearResearchJob(row,fullJob,agentId,options),{service:'base.stock-paired.research',address:tokenAddress});
 }
});
test('routes normal Coinbase stock research by ticker or exact token address',()=>{
 for(const target of ['NVDAc',tokenAddress]){
  const {row,fullJob}=fixture({description:`Service: base.stock.research\nChain: 8453\nTicker: ${target}`});
  assert.deepEqual(eligibleNearResearchJob(row,fullJob,agentId,options),{service:'base.stock.research',query:target});
 }
 const {row,fullJob}=fixture({description:`Service: base.stock.research\nTicker: NVDAc\nTicker: TSLA`});
 assert.equal(eligibleNearResearchJob(row,fullJob,agentId,options),null);
});

test('routes clearly requested Base research without requiring a service selector',()=>{
 for(const description of [
  `Research this Base stock-paired token ${tokenAddress}`,
  `Research token ${tokenAddress}\nChain: 8453`,
  `Check the Bankr launch for ${tokenAddress}`
 ]){
  const {row,fullJob}=fixture({description});
  assert.deepEqual(eligibleNearResearchJob(row,fullJob,agentId,options),{service:'base.stock-paired.research',address:tokenAddress},description);
 }
});

test('delivers an explicit Base marketplace hire through the Base research service',async()=>{
 const {row,fullJob}=fixture({description:`Service: base.stock-paired.research\nChain: 8453\nToken: ${tokenAddress}`});
 const calls=[],events=[],reportContexts=[],lock={data:null};
 const store={acquire:async()=>lock,renew:async()=>{},save:async(_lock,data)=>{lock.data=data;},event:async(_lock,name)=>events.push(name),release:async()=>{},get:async()=>null};
 const client={assignments:async()=>[row],job:async()=>fullJob,start:async()=>calls.push('start'),assignment:async()=>row,submit:async(_id,markdown)=>{calls.push(markdown);return {assignmentId,status:'submitted'};}};
 const worker=createNearWorker({agentId,minimumEscrow:options.minimumEscrow,escrowToken:options.escrowToken,store,client,wait:async()=>{},report:async(request,context)=>{calls.push(request);reportContexts.push(context);return {status:'completed',deliverableMarkdown:'# Base stock-paired research',evidence:{sha256:'a'.repeat(64)}};}});
 const result=await worker.runOnce();
 assert.equal(result.results[0].state,'submitted',JSON.stringify(result.results[0]));
 assert.deepEqual(calls[1],{service:'base.stock-paired.research',requestId:'near-'+assignmentId,input:{address:tokenAddress}});
 assert.deepEqual(reportContexts,[{paidMarketplaceHire:true}]);
 assert.equal(lock.data.service,'base.stock-paired.research');
 assert.equal(lock.data.markdown,'# Base stock-paired research');
 assert.ok(events.includes('submitted'));
});
test('delivers a Coinbase stock research hire to the separate stock service',async()=>{
 const {row,fullJob}=fixture({description:'Service: base.stock.research\nChain: 8453\nTicker: NVDAc'});
 const calls=[],lock={data:null};
 const store={acquire:async()=>lock,renew:async()=>{},save:async(_lock,data)=>{lock.data=data;},event:async()=>{},release:async()=>{},get:async()=>null};
 const client={assignments:async()=>[row],job:async()=>fullJob,start:async()=>{},assignment:async()=>row,submit:async(_id,markdown)=>{calls.push(markdown);return {assignmentId,status:'submitted'};}};
 const worker=createNearWorker({agentId,minimumEscrow:options.minimumEscrow,escrowToken:options.escrowToken,store,client,wait:async()=>{},report:async(request)=>{calls.push(request);return {status:'completed',deliverableMarkdown:'# Coinbase stock report',evidence:{sha256:'c'.repeat(64)}};}});
 const result=await worker.runOnce();
 assert.equal(result.results[0].state,'submitted',JSON.stringify(result.results[0]));
 assert.deepEqual(calls[0],{service:'base.stock.research',requestId:'near-'+assignmentId,input:{query:'NVDAc'}});
 assert.equal(calls[1],'# Coinbase stock report');assert.equal(lock.data.service,'base.stock.research');
});

test('delivers a zero-cost Base stock research test run without paid-hire accounting',async()=>{
 const {row,fullJob}=fixture({
  description:`Service: base.stock-paired.research\nChain: 8453\nToken address: ${tokenAddress}; read only, do not trade.`,
  fullJob:{isTestRun:true},
  assignment:{escrowAmount:'0',escrowToken:'USD'}
 });
 const calls=[],reportContexts=[],lock={data:null};
 const store={acquire:async()=>lock,renew:async()=>{},save:async(_lock,data)=>{lock.data=data;},event:async()=>{},release:async()=>{},get:async()=>null};
 const client={assignments:async()=>[row],job:async()=>fullJob,start:async()=>calls.push('start'),assignment:async()=>row,submit:async(id,markdown)=>{calls.push({id,markdown});return {assignmentId:id,status:'submitted'};}};
 const worker=createNearWorker({agentId,minimumEscrow:options.minimumEscrow,escrowToken:options.escrowToken,store,client,wait:async()=>{},report:async(request,context)=>{calls.push(request);reportContexts.push(context);return {status:'completed',deliverableMarkdown:'# Base stock-paired test report',evidence:{sha256:'b'.repeat(64)}};}});
 const result=await worker.runOnce();
 assert.deepEqual(result.results[0],{assignmentId,state:'submitted',testRun:true,payout:'none'});
 assert.equal(calls[0],'start');
 assert.deepEqual(calls[1],{service:'base.stock-paired.research',requestId:'near-'+assignmentId,input:{address:tokenAddress}});
 assert.deepEqual(reportContexts,[{paidMarketplaceHire:false}]);
 assert.deepEqual(calls[2],{id:assignmentId,markdown:'# Base stock-paired test report'});
 assert.equal(lock.data.testRun,true);
});

test('prioritizes unstarted hires instead of waiting behind older reports',async()=>{
 const {row:target,fullJob}=fixture({
  description:`Service: base.stock-paired.research\nChain: 8453\nToken: ${tokenAddress}`,
  fullJob:{isTestRun:true},
  assignment:{escrowAmount:'0',escrowToken:'USD',slaDeadlineAt:'2099-01-01T00:00:00Z'}
 });
 const older=Array.from({length:3},(_,index)=>{
  const {row}=fixture({assignment:{startedAt:'2026-11-20T00:00:00Z'}});
  row.assignment.assignmentId=`44444444-4444-4444-8444-44444444444${index}`;
  row.assignment.jobId=`55555555-5555-4555-8555-55555555555${index}`;
  row.job.jobId=row.assignment.jobId;
  return row;
 });
 let releaseBlocked,notifyStarted;
 const blocked=new Promise(resolve=>{releaseBlocked=resolve;});
 const started=new Promise(resolve=>{notifyStarted=resolve;});
 const rows=[...older,target];
 const store={acquire:async()=>({data:null}),renew:async()=>{},save:async(lock,data)=>{lock.data=data;},event:async()=>{},release:async()=>{},get:async()=>null};
 const client={
  assignments:async()=>rows,
  job:async id=>id===jobId?fullJob:blocked,
  start:async id=>{if(id===assignmentId)notifyStarted();},
  assignment:async id=>rows.find(item=>item.assignment.assignmentId===id)||null,
  submit:async id=>({assignmentId:id,status:'submitted'})
 };
 const worker=createNearWorker({agentId,minimumEscrow:options.minimumEscrow,escrowToken:options.escrowToken,store,client,wait:async()=>{},report:async()=>({status:'completed',deliverableMarkdown:'# Test report',evidence:{sha256:'c'.repeat(64)}})});
 const polling=worker.runOnce();
 let timer,reached=false;
 try{await Promise.race([started,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('The new hire was blocked by older reports.')),1500);})]);reached=true;}
 catch{}
 finally{clearTimeout(timer);releaseBlocked(null);}
 const result=await polling;
 assert.equal(reached,true,'The unstarted hire should start while older reports are pending.');
 assert.ok(result.results.some(item=>item.assignmentId===assignmentId&&item.state==='submitted'));
});
test('does not start an assignment after its marketplace start window expires',async()=>{
 const {row}=fixture({
  fullJob:{isTestRun:true},
  assignment:{escrowAmount:'0',escrowToken:'USD',startedAt:null,slaDeadlineAt:'2026-11-19T21:58:36.695402Z'}
 });
 const lock={data:null},calls=[],events=[];
 const store={acquire:async()=>lock,renew:async()=>{},save:async(_lock,data)=>{lock.data=data;},event:async(_lock,name)=>events.push(name),release:async()=>{},get:async()=>null};
 const client={assignments:async()=>[row],job:async()=>{calls.push('job');return null;},start:async()=>calls.push('start'),assignment:async()=>row,submit:async()=>calls.push('submit')};
 const worker=createNearWorker({agentId,minimumEscrow:options.minimumEscrow,escrowToken:options.escrowToken,store,client,now:()=>new Date('2026-11-20T00:00:00Z'),report:async()=>{calls.push('report');}});
 const result=await worker.runOnce();
 assert.deepEqual(result.results[0],{assignmentId,state:'start-window-expired',recorded:true});
 assert.deepEqual(calls,[]);
 assert.deepEqual(events,['start-window-expired']);
 assert.equal(lock.data.phase,'start-window-expired');
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
  fixture({description:`Service: token.inspect\nToken: ${tokenAddress}`}),
  fixture({description:`Service: base.stock-paired.research\nChain: 4663\nToken: ${tokenAddress}`}),
  fixture({description:`Service: base.stock-paired.research\nChain: 8453\nChain: 42161\nToken: ${tokenAddress}`}),
  fixture({description:`Service: token.research\nChain: 8453\nToken: ${tokenAddress}`}),
  fixture({description:`Chain: 8453\nChain: 42161\nToken: ${tokenAddress}`}),
  fixture({description:`Service: base.stock-paired.research\nService: token.research\nToken: ${tokenAddress}`}),
  fixture({description:`Service: base.stock-paired.research\nChain: 8453\nChain: invalid\nToken: ${tokenAddress}`}),
  fixture({description:`Research this token on Base and Robinhood Chain: ${tokenAddress}`})
 ];
 for(const {row,fullJob} of requests)assert.equal(eligibleNearResearchJob(row,fullJob,agentId,options),null,fullJob.description);
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
test('caches unchanged unsupported briefs after refreshing full-job eligibility metadata',async()=>{
 const {row,fullJob}=fixture({description:'No token address or supported service was requested.'});
 let saved=null,jobCalls=0;
 const store={acquire:async()=>({data:saved}),renew:async()=>{},save:async(_lock,data)=>{saved=data;},event:async()=>{},release:async()=>{},get:async()=>null};
 const client={assignments:async()=>[row],job:async()=>{jobCalls++;return fullJob;}};
 const worker=createNearWorker({agentId,minimumEscrow:options.minimumEscrow,escrowToken:options.escrowToken,store,client});
 const first=await worker.runOnce();
 assert.equal(first.results[0].state,'not-eligible');
 assert.equal(jobCalls,1);
 const second=await worker.runOnce();
 assert.deepEqual(second.results[0],{assignmentId,state:'not-eligible',recorded:false,cached:true});
 assert.equal(jobCalls,2);
});
test('retries a cached test run when the full job becomes eligible',async()=>{
 const {row,fullJob}=fixture({
  jobKind:'instant',isPrivate:true,
  description:'Service: base.stock.research\nChain: 8453\nTicker: NVDAc',
  assignment:{escrowAmount:'0',escrowToken:'USD'},
  fullJob:{isPrivate:true,isTestRun:false}
 });
 const calls=[],events=[],lock={data:null};let jobCalls=0;
 const store={acquire:async()=>lock,renew:async()=>{},save:async(_lock,data)=>{lock.data=data;},event:async(_lock,name)=>events.push(name),release:async()=>{},get:async()=>null};
 const client={
  assignments:async()=>[row],
  job:async()=>{jobCalls++;return jobCalls===1?fullJob:{...fullJob,isTestRun:true};},
  start:async()=>calls.push('start'),
  assignment:async()=>row,
  submit:async(id,markdown)=>({assignmentId:id,status:'submitted',markdown})
 };
 const worker=createNearWorker({agentId,minimumEscrow:options.minimumEscrow,escrowToken:options.escrowToken,store,client,wait:async()=>{},report:async request=>{calls.push(request);return {status:'completed',deliverableMarkdown:'# Coinbase stock report',evidence:{sha256:'d'.repeat(64)}};}});
 const first=await worker.runOnce();
 assert.equal(first.results[0].state,'not-eligible');
 const second=await worker.runOnce();
 assert.deepEqual(second.results[0],{assignmentId,state:'submitted',testRun:true,payout:'none'});
 assert.equal(jobCalls,3);
 assert.deepEqual(calls,['start',{service:'base.stock.research',requestId:'near-'+assignmentId,input:{query:'NVDAc'}}]);
 assert.deepEqual(events,['not-eligible','started','report-prepared','submission-attempted','submitted']);
 assert.equal(lock.data.phase,'submitted');
});

test('rechecks a cached test run when escrow details arrive after the brief',async()=>{
 const {row,fullJob}=fixture({
  jobKind:'instant',isPrivate:true,
  description:'Service: base.stock.research\nChain: 8453\nTicker: NVDAc',
  assignment:{escrowAmount:undefined,escrowToken:undefined},
  fullJob:{isPrivate:true,isTestRun:true}
 });
 const calls=[],events=[],lock={data:null};let jobCalls=0;
 const store={acquire:async()=>lock,renew:async()=>{},save:async(_lock,data)=>{lock.data=data;},event:async(_lock,name)=>events.push(name),release:async()=>{},get:async()=>null};
 const client={
  assignments:async()=>[row],
  job:async()=>{jobCalls++;return fullJob;},
  start:async()=>calls.push('start'),
  assignment:async()=>row,
  submit:async(id)=>({assignmentId:id,status:'submitted'})
 };
 const worker=createNearWorker({agentId,minimumEscrow:options.minimumEscrow,escrowToken:options.escrowToken,store,client,wait:async()=>{},report:async request=>{calls.push(request);return {status:'completed',deliverableMarkdown:'# Coinbase stock report',evidence:{sha256:'e'.repeat(64)}};}});
 const first=await worker.runOnce();
 assert.equal(first.results[0].state,'not-eligible');
 row.assignment.escrowAmount='0';row.assignment.escrowToken='USD';
 const second=await worker.runOnce();
 assert.deepEqual(second.results[0],{assignmentId,state:'submitted',testRun:true,payout:'none'});
 assert.equal(jobCalls,3);
 assert.deepEqual(calls,['start',{service:'base.stock.research',requestId:'near-'+assignmentId,input:{query:'NVDAc'}}]);
 assert.deepEqual(events,['not-eligible','started','report-prepared','submission-attempted','submitted']);
 assert.equal(lock.data.phase,'submitted');
});

test('reopened paid hire refreshes the original token once without starting a second hire',async()=>{
 const {row,fullJob}=fixture({description:'Research this Bankr launch '+tokenAddress,latestMessage:{senderSide:'buyer',body:'Refresh holders',attachments:[]}});
 row.assignment.startedAt='2026-11-20T10:00:00Z';
 row.assignment.submittedAt='2026-11-20T10:01:00Z';
 row.assignment.deliverableUrl='https://market.near.ai/previous-version';
 const lock={data:{phase:'submitted',submittedAt:'2026-11-20T10:01:00Z',service:'base.stock-paired.research',tokenAddress,testRun:false,markdown:'old'}};
 const store={acquire:async()=>lock,renew:async()=>{},save:async(_,d)=>{lock.data=d;},event:async()=>{},release:async()=>{}};
 const client={assignments:async()=>[row],assignment:async()=>row,job:async()=>fullJob,submit:async()=>({assignmentId,status:'submitted'})};
 let calls=0;
 const worker=createNearWorker({agentId,...options,store,client,report:async(req,ctx)=>{
  assert.equal(req.input.address,tokenAddress);
  assert.equal(req.requestId,'near-'+assignmentId+'-refresh');
  assert.equal(ctx.paidMarketplaceHire,true);
  calls++;
  return {status:'completed',deliverableMarkdown:'new',evidence:{sha256:'a'.repeat(64)}};
 }});
 assert.equal((await worker.runOnce()).results[0].state,'submitted');
 assert.equal((await worker.runOnce()).results[0].state,'refresh-limit');
 assert.equal(calls,1);
});
test('an unsupported private Base pair receives one scope notice before research starts',async()=>{
 const {row,fullJob}=fixture({jobKind:'instant',isPrivate:true,description:'Research '+tokenAddress+' on Base paired with USDC'});
 const lock={data:null},messages=[];
 const store={acquire:async()=>lock,renew:async()=>{},save:async(_,d)=>{lock.data=d;},release:async()=>{}};
 const client={job:async()=>fullJob,scopeMessage:async(_,body)=>messages.push(body)};
 const worker=createNearWorker({agentId,...options,client,store});
 assert.equal((await worker.process(row)).state,'unsupported-scope');
 assert.equal((await worker.process(row)).state,'unsupported-scope');
 assert.equal(messages.length,1);
 assert.match(messages[0],/does not cover this request today/);
});
test('private ticker hire waits for chain and stock type and resumes once in the same assignment',async()=>{
 const {row,fullJob}=fixture({jobKind:'instant',isPrivate:true,description:'NVDAc'});
 const calls=[],prompts=[],requests=[],lock={data:null};
 const store={acquire:async()=>lock,renew:async()=>{},save:async(_,d)=>{lock.data=d;},event:async()=>{},release:async()=>{}};
 const client={job:async()=>fullJob,assignment:async()=>row,scopeMessage:async(_,body)=>prompts.push(body),start:async()=>calls.push('start'),submit:async()=>({assignmentId,status:'submitted'})};
 const worker=createNearWorker({agentId,...options,store,client,wait:async()=>{},report:async request=>{requests.push(request);return {status:'completed',deliverableMarkdown:'Checked.',evidence:{sha256:'a'.repeat(64)}};}});
 assert.equal((await worker.process(row)).state,'awaiting-research-details');
 await worker.process(row);assert.equal(prompts.length,1);
 row.latestMessage={senderSide:'buyer',origin:'direct',truncated:false,body:'Base'};
 await worker.process(row);assert.match(prompts[1],/Bankr/);assert.deepEqual(calls,[]);
 row.latestMessage.body='Coinbase stock token';
 assert.equal((await worker.process(row)).state,'submitted');
 assert.deepEqual(requests[0].input,{query:'NVDAc'});assert.equal(requests[0].service,'base.stock.research');
});
test('missing-target hire gets one prompt and can choose a ranked contract in the same job',async()=>{
 const {row,fullJob}=fixture({jobKind:'instant',isPrivate:true,description:'My trading agent uses research to decide whether to trade or skip.'});
 const lock={data:null},messages=[],requests=[],calls=[];
 const store={acquire:async()=>lock,renew:async()=>{},save:async(_,d)=>{lock.data=d;},event:async()=>{},release:async()=>{}};
 const client={job:async()=>fullJob,assignment:async()=>row,scopeMessage:async(_,body)=>messages.push(body),start:async()=>calls.push('start'),submit:async()=>({assignmentId,status:'submitted'})};
 const candidates=[agentId,tokenAddress].map((address,i)=>({address,symbol:'Token'+i,stock:'NVDAc',liquidity:200-i,source:'pool',receipt:'launch'}));
 const worker=createNearWorker({agentId,...options,store,client,wait:async()=>{},discover:async metric=>({metric,candidates,listed:50,checked:2,eligible:2,comparable:2,checkedAt:'today',feedUrl:'feed'}),report:async req=>{requests.push(req);return {status:'completed',deliverableMarkdown:'Verified report.',evidence:{sha256:'a'.repeat(64)}};}});
 await worker.process(row);await worker.process(row);assert.equal(messages.length,1);assert.match(messages[0],/Do you have a token/);
 const answer=async body=>{row.latestMessage={senderSide:'buyer',origin:'direct',truncated:false,body};return worker.process(row);};
 await answer('find a pair');assert.match(messages.at(-1),/market you want/);
 await answer('Base');assert.match(messages.at(-1),/Which matters more/);
 await answer('liquidity');assert.match(messages.at(-1),/stock-pair shortlist/);assert.equal(calls.length,0);
 assert.equal((await answer('research the second one')).state,'submitted');
 assert.deepEqual(requests[0].input,{address:tokenAddress});
});
