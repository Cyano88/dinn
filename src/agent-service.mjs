import {validateReceiptRequest} from './launch-receipt.mjs';
﻿import {capabilities,validateLaunch} from './domain.mjs';
export const launchFields=['name','symbol','pair','feePercent','account','recipient','cto'];
export function manifest(){return {
 schemaVersion:'1.0',name:'Dinn',description:'One token-operations service for human chat and terminal agents.',
 status:'local-preview',discovery:{instructions:'/agent-guide.md',schema:'/api/agent/schema'},
 transport:{type:'http-json',endpoint:'/api/agent/request'},
 services:['plan','launch.review','launch.simulate','launch.verify'],capabilities,
 payment:{mode:'free-local-preview',paymentRequired:false},
 marketplace:{provider:'NEAR Agent Market',status:'not-listed',agentId:null,handle:null,pricingPlanId:null,buyerMcp:'https://market.near.ai/mcp'},
 authorization:{broadcastEnabled:false,acceptsPrivateKeys:false,servicePaymentAuthorizesWallet:false},
 };
}
export const requestSchema={
 type:'object',additionalProperties:false,required:['service','input'],properties:{
 service:{enum:['plan','launch.review','launch.simulate','launch.verify']},
 input:{type:'object'},requestId:{type:'string',minLength:1,maxLength:100,pattern:'^[A-Za-z0-9._-]+$'}
 },
 serviceInputs:{plan:{type:'object',additionalProperties:false,required:['message'],properties:{message:{type:'string',minLength:1,maxLength:6000}}},
 'launch.review':{description:'May contain incomplete configuration. Missing fields are returned without invented values.',fields:launchFields},
 'launch.verify':{description:'Read-only receipt verification against an expected launch draft.',fields:['hash','configuration'],optionalFields:['expectedData']},
 'launch.simulate':{description:'Requires all launch fields. Read-only RPC simulation, no signing.',fields:launchFields}}
};
export async function agentRequest(request,{plan,simulate,verify}){
 if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(k=>!['service','input','requestId'].includes(k)))throw new Error('Expected service, input and optional requestId only.');
 if(request.requestId!==undefined&&(typeof request.requestId!=='string'||!/^[A-Za-z0-9._-]{1,100}$/.test(request.requestId)))throw new Error('Invalid requestId.');
 if(!['plan','launch.review','launch.simulate','launch.verify'].includes(request.service))throw new Error('Unsupported service. Trading and broadcasting are not enabled.');
 const input=request.input;
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('input must be an object.');
 const base={schemaVersion:'1.0',requestId:request.requestId??null,service:request.service,broadcast:false,charged:false};
 if(request.service==='launch.verify'){
  validateReceiptRequest(input);
  const result=await verify(input);
  return {...base,status:result.state,result,next:{type:'stop',message:'Do not resubmit a transaction because a receipt is missing. Verification is a chain snapshot, not irreversible finality.'}};
 }
 if(request.service==='plan'){
  if(Object.keys(input).some(k=>k!=='message'))throw new Error('Plan input accepts message only.');
  return {...base,status:'draft',result:await plan(input.message),next:{type:'review_actions',message:'Clarify the intended action; do not interpret a draft as authorization.'}};
 }
 if(Object.keys(input).some(k=>!launchFields.includes(k)))throw new Error('Unsupported launch field. Never include signing keys, payment proofs or execution flags.');
 const missing=launchFields.filter(k=>input[k]===undefined||input[k]===null||input[k]==='');
 if(missing.length)return {...base,status:'needs_input',missingFields:missing,next:{type:'collect_fields',message:'Ask the user for missing fields. Do not guess wallets, fees or takeover permission.'}};
 const configuration=validateLaunch(input);
 if(request.service==='launch.review')return {...base,status:'review_ready',result:{configuration},next:{type:'user_review',message:'Present the exact configuration. Simulation is read-only and requires a configured Elysium RPC. Live execution is unavailable.'}};
 return {...base,status:'simulated',result:await simulate(input),next:{type:'stop',message:'Simulation is not deployment. No signing or broadcast endpoint exists.'}};
}
