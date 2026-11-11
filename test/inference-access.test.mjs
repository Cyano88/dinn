import test from 'node:test';
import assert from 'node:assert/strict';
import {inferenceAccess} from '../src/inference-access.mjs';
test('production inference requires a verified session while local fixtures remain usable',async()=>{
 const guard=inferenceAccess({env:{NODE_ENV:'production'},verify:async token=>{if(token==='valid')return 'alice';throw Error();}});
 assert.equal((await guard({headers:{}})).status,401);
 assert.equal((await guard({headers:{authorization:'Bearer invalid'}})).status,401);
 assert.equal(await guard({headers:{authorization:'Bearer valid'}}),null);
 assert.equal(await inferenceAccess({env:{}})({headers:{}}),null);
});
test('inference rate limits are scoped per verified user and expire',async()=>{
 let time=100000;const guard=inferenceAccess({env:{RENDER:'true'},verify:async token=>token,now:()=>time});
 for(let i=0;i<12;i++)assert.equal(await guard({headers:{authorization:'Bearer alice'}}),null);
 assert.equal((await guard({headers:{authorization:'Bearer alice'}})).status,429);
 assert.equal(await guard({headers:{authorization:'Bearer bob'}}),null);
 time+=60001;assert.equal(await guard({headers:{authorization:'Bearer alice'}}),null);
});
