import test from 'node:test';
import assert from 'node:assert/strict';
import {eligibleNearResearchJob} from '../src/near-worker.mjs';

const agentId='11111111-1111-4111-8111-111111111111';
const assignmentId='22222222-2222-4222-8222-222222222222';
const jobId='33333333-3333-4333-8333-333333333333';
const tokenAddress='0x32d5ee0142db8769d954a7c2521e76ca3241fb32';
const options={minimumEscrow:'1.00',escrowToken:'USDC'};

function fixture({origin=null,isPrivate=false,jobKind='standard',description=`Research ${tokenAddress}`,latestMessage=null,...overrides}={}){
 const row={
  assignment:{assignmentId,jobId,workerAgentId:agentId,status:'in_progress',deliverableUrl:null,submittedAt:null,escrowAmount:'1.000000000000',escrowToken:'USDC'},
  job:{jobId,title:'Dinn Token Research',description,tags:[],jobKind,status:'in_progress',attachments:[]},
  latestMessage
 };
 const fullJob={jobId,title:'Dinn Token Research',description,status:'in_progress',jobKind,isPrivate,isTestRun:false,origin};
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
 assert.deepEqual(eligibleNearResearchJob(row,fullJob,agentId,options),{address:tokenAddress});
});

test('accepts a private marketplace instant hire',()=>{
 const {row,fullJob}=fixture({jobKind:'instant',isPrivate:true});
 assert.deepEqual(eligibleNearResearchJob(row,fullJob,agentId,options),{address:tokenAddress});
});

test('accepts a private A2A instant hire and reads its buyer brief',()=>{
 const message={senderSide:'buyer',origin:'direct',body:`Please research ${tokenAddress}`,truncated:false,attachments:[]};
 const {row,fullJob}=fixture({origin:'a2a',isPrivate:true,jobKind:'instant',description:'On-chain token report',latestMessage:message});
 assert.deepEqual(eligibleNearResearchJob(row,fullJob,agentId,options),{address:tokenAddress});
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

test('continues to reject test runs, competitions, attachments, and underfunded assignments',()=>{
 const cases=[
  fixture({fullJob:{isTestRun:true}}),
  fixture({jobKind:'competition'}),
  fixture({brief:{attachments:[{fileId:'file'}]}}),
  fixture({assignment:{escrowAmount:'0.99'}})
 ];
 for(const {row,fullJob} of cases)assert.equal(eligibleNearResearchJob(row,fullJob,agentId,options),null);
});
