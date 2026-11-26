import test from 'node:test';
import assert from 'node:assert/strict';
import {submitBankrLaunch,refreshBankrLaunch} from '../public/bankr-launch-action.js';
const launcher='0x'+'a'.repeat(40),hash='0x'+'b'.repeat(64);
function setup(){
 let value=null,sends=0;
 const storage={getItem:()=>value,setItem:async(k,v)=>{value=v;},removeItem:async()=>{value=null;}};
 const provider={request:async({method})=>{
  if(method==='eth_accounts')return [launcher];
  if(method==='eth_chainId')return '0x2105';
  if(method==='eth_sendTransaction'){sends++;return hash;}
 }};
 const review={launcher,predictedToken:launcher,poolId:hash,quote:launcher,execution:{expiry:Date.now()+60000,gas:'0xab',to:launcher,data:'0x12',callHash:hash}};
 return {args:{review,provider,storage,current:()=>true},sends:()=>sends};
}
test('a submitted Base launch blocks a repeat while its receipt is pending',async()=>{
 const {args,sends}=setup(),record=await submitBankrLaunch(args);
 await assert.rejects(()=>submitBankrLaunch(args),/previous Base launch/);
 assert.equal(sends(),1);
 const result=await refreshBankrLaunch({record,storage:args.storage,check:async()=>({state:'verified',token:launcher,hash})});
 assert.match(result,/powered by Bankr/);
});
test('expired reviews and switched wallets never submit',async()=>{
 const {args,sends}=setup();args.review.execution.expiry=0;
 await assert.rejects(()=>submitBankrLaunch(args),/Refresh/);
 assert.equal(sends(),0);
});
