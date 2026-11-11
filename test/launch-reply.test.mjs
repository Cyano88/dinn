import test from 'node:test';
import assert from 'node:assert/strict';
import {launchReplyContext} from '../src/launch-reply.mjs';
import {streamProductChat} from '../src/product-chat.mjs';
const state={brief:{name:'LOKI'},settings:{creatorTaxBps:100,socials:{website:'https://example.com'}},active:true};
test('configuration guidance exposes checked economics and uses the selected pair units',()=>{
 const options={configs:[{id:0,supply:'1000000000000000000000000000',curveFeeBps:'100',graduationThreshold:'10000000000000000000'}],maxCreatorTaxBps:1000,launchFee:'0.0005'};
 const result=pair=>launchReplyContext({data:{operation:'inspect',changedFields:[],nextRequiredField:'configId',readyForReview:false,draft:{...state,settings:{pairToken:pair?'0x1111111111111111111111111111111111111111':'0x'+'0'.repeat(40)},options,pair}}});
 const native=result(null);assert.equal(native.availableConfigurations[0].tokenSupply,'1000000000');assert.equal(native.availableConfigurations[0].baseTradingFeePercent,1);assert.equal(native.availableConfigurations[0].graduationTarget,'10');assert.match(native.stepGuidance,/preset supplied by Pons/);
 const stock=result({symbol:'NVDA',graduationTarget:'41.6'});assert.equal(stock.availableConfigurations[0].graduationTarget,'41.6');assert.equal(stock.availableConfigurations[0].graduationAsset,'NVDA');
 const unavailable=result({symbol:'NVDA'});assert.equal(unavailable.availableConfigurations[0].graduationTarget,undefined);
});
test('starting setup does not present retained fees and socials as changes',()=>{
 const r=launchReplyContext({data:{operation:'start',draft:state,changedFields:[],nextRequiredField:'symbol',readyForReview:false}});
 assert.deepEqual(r.changesThisTurn,[]);assert.equal(r.nextRequiredField,'ticker');assert.equal(JSON.stringify(r).includes('example.com'),false);
});
test('reply data uses human labels and percentage units',()=>{
 const r=launchReplyContext({data:{operation:'update',draft:state,changedFields:['creatorTaxBps'],nextRequiredField:'pairToken',readyForReview:false}});
 assert.deepEqual(r.changesThisTurn,[{field:'creator tax percentage',value:'1%'}]);assert.equal(r.nextRequiredField,'pairing asset');assert.doesNotMatch(JSON.stringify(r),/creatorTaxBps|pairToken/);
});
test('temporary gateway failures retry once with a fresh attempt signal',async()=>{
 const signals=[];let calls=0,result;
 for await(const e of streamProductChat({message:'hi'},[],{env:{OG_API_KEY:'test',OG_MODEL:'test'},fetchImpl:async(u,o)=>{signals.push(o.signal);if(++calls===1)return new Response('unavailable',{status:503});return new Response('data: '+JSON.stringify({choices:[{delta:{content:'Hello.'},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');}}))if(e.type==='done')result=e.result;
 assert.equal(calls,2);assert.notEqual(signals[0],signals[1]);assert.equal(result.message,'Hello.');
});
test('cancelled conversation never retries the provider',async()=>{
 const controller=new AbortController();let calls=0;
 await assert.rejects(async()=>{for await(const e of streamProductChat({message:'hi'},[],{signal:controller.signal,env:{OG_API_KEY:'test',OG_MODEL:'test'},fetchImpl:async()=>{calls++;controller.abort();throw Error('connection closed');}})){}},e=>e.name==='AbortError');assert.equal(calls,1);
});
