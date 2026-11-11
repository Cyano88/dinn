import test from 'node:test';
import assert from 'node:assert/strict';
import {createInspectionCache} from '../src/inspection-cache.mjs';
const address='0x1111111111111111111111111111111111111111',opts={rpc:'https://fixture.invalid',chainId:99801};
test('cache preserves evidence, expires and separates chains and RPC providers',async()=>{
 let time=0,calls=0;const run=createInspectionCache({now:()=>time,inspect:async()=>({blockNumber:String(++calls),checkedAt:'original',checks:[]})});
 const first=await run(address,opts);first.checks.push('mutated');
 const second=await run(address,opts);assert.equal(calls,1);assert.equal(second.cache.hit,true);assert.equal(second.checkedAt,'original');assert.deepEqual(second.checks,[]);
 time=30001;await run(address,opts);assert.equal(calls,2);await run(address,{...opts,chainId:99901});await run(address,{...opts,rpc:'https://other.invalid'});assert.equal(calls,4);
});
test('concurrent requests share a check and fresh checks obey global budget',async()=>{
 let done,calls=0,time=0;const run=createInspectionCache({now:()=>time,maxPerMinute:1,inspect:()=>{calls++;return new Promise(r=>done=r);}});
 const a=run(address,opts),b=run(address,opts);await Promise.resolve();assert.equal(calls,1);done({blockNumber:'1'});await a;assert.equal((await b).cache.hit,true);
 await assert.rejects(run('0x2222222222222222222222222222222222222222',opts),/busy/);assert.equal((await run(address,opts)).cache.hit,true);
});
test('failed checks are not cached and cancellation cannot poison shared work',async()=>{
 let calls=0;const run=createInspectionCache({inspect:async()=>{if(++calls===1)throw Error('failed');return {blockNumber:'2'};}});
 await assert.rejects(run(address,opts),/failed/);await run(address,opts);assert.equal(calls,2);
 const controller=new AbortController();controller.abort();await assert.rejects(run(address,{...opts,signal:controller.signal}),/cancelled/);assert.equal((await run(address,opts)).cache.hit,true);
});

test('explicit fresh requests bypass a completed cached report',async()=>{let count=0;const run=createInspectionCache({inspect:async()=>({blockNumber:String(++count)})});await run(address,opts);const r=await run(address,{...opts,fresh:true});assert.equal(r.blockNumber,'2');assert.equal(r.cache.hit,false);});
