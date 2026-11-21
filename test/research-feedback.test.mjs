import test from 'node:test';
import assert from 'node:assert/strict';
import {feedbackRequest} from '../src/research-feedback.mjs';
const id='11111111-1111-4111-8111-111111111111',target='0x'+'3'.repeat(40),code='a'.repeat(64);
const req={headers:{}};
test('chat feedback needs sign-in and rejects empty answers',async()=>{
 const path='/api/feedback/chat',data={id,target,chainId:8453};
 assert.equal((await feedbackRequest(req,path,data)).status,401);
 assert.equal((await feedbackRequest(req,path,{...data,reply:'  '})).status,400);
});
test('market feedback only opens for the accepted private assignment capability',async()=>{
 let phase='submitted',writes=0;
 const database=async()=>({query:async(sql,args)=>{
  if(sql.startsWith('SELECT')){assert.equal(args[0],id);assert.notEqual(args[1],code);return {rows:[{phase,target,test:'true'}]};}
  writes++;return {rowCount:1};
 }});
 const run=()=>feedbackRequest(req,'/api/feedback/market',{id,code,reply:'Notify on unlocks'},{database});
 assert.equal((await run()).status,409);assert.equal(writes,0);
 phase='accepted-test-run';assert.equal((await run()).body.saved,true);assert.equal(writes,2);
});
