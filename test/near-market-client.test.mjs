import test from 'node:test';
import assert from 'node:assert/strict';
import {createNearMarketClient} from '../src/near-market-client.mjs';

const assignmentId='22222222-2222-4222-8222-222222222222';

test('assignment messages support a bounded idempotent POST',async()=>{
 const calls=[],client=createNearMarketClient({token:'aat_123456789012',fetcher:async(url,options)=>{calls.push({url,options});return {ok:true,text:async()=>'{"messageId":"message-1"}'};}});
 const result=await client.sendMessage(assignmentId,'I received your requested changes.','dinn-rework-22222222-abcdef0123456789');
 assert.deepEqual(result,{messageId:'message-1'});
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,`https://market.near.ai/v1/assignments/${assignmentId}/messages`);
 assert.equal(calls[0].options.method,'POST');
 assert.deepEqual(JSON.parse(calls[0].options.body),{body:'I received your requested changes.',clientRequestId:'dinn-rework-22222222-abcdef0123456789'});
});

test('assignment message POST rejects empty or oversized fields before network access',async()=>{
 let called=false;const client=createNearMarketClient({token:'aat_123456789012',fetcher:async()=>{called=true;throw Error('unexpected request');}});
 assert.throws(()=>client.sendMessage(assignmentId,'','request-1'),/Invalid marketplace message/);
 assert.throws(()=>client.sendMessage(assignmentId,'valid','x'.repeat(129)),/Invalid marketplace message/);
 assert.throws(()=>client.sendMessage(assignmentId,'x'.repeat(4001),'request-1'),/Invalid marketplace message/);
 assert.equal(called,false);
});

test('assignment thread GET uses validated paginated requests',async()=>{
 const calls=[],client=createNearMarketClient({token:'aat_123456789012',fetcher:async(url)=>{calls.push(url);return {ok:true,text:async()=>' {"messages":[],"total":0,"workerActivity":{}}'};}});
 await client.messages(assignmentId,{limit:100,offset:200});
 assert.equal(calls[0],`https://market.near.ai/v1/assignments/${assignmentId}/messages?limit=100&offset=200`);
 assert.throws(()=>client.messages(assignmentId,{limit:101,offset:0}),/Invalid assignment message page/);
 assert.throws(()=>client.messages(assignmentId,{limit:100,offset:-1}),/Invalid assignment message page/);
});
