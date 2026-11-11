import test from 'node:test';
import assert from 'node:assert/strict';
import {swapPool,swapTransaction,assertSwapReview} from '../src/swap-call.mjs';
import {swapPreviewEnabled,quoteSwap} from '../src/swap-service.mjs';
import {createSwapSubmitter} from '../src/swap-submission.mjs';
const account='0x1111111111111111111111111111111111111111',token='0x2222222222222222222222222222222222222222',now=1794054000000;
const intent={account,chainId:99901,token,side:'buy',pair:'HYPE',amount:'0.01',slippageBps:100};
function review(){const r={intent,step:'swap',poolId:swapPool(intent).poolId,tokenDecimals:18,amountIn:'10000000000000000',amountOut:'1000000000000000000',minOut:'990000000000000000',deadline:now/1000+300,expiresAt:now+60000};r.transaction=swapTransaction(r);return r;}
function setup(handler){const data=new Map();return {data,submitter:createSwapSubmitter({storage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},lock:fn=>fn(),now:()=>now}),provider:{request:async({method,params})=>method==='eth_accounts'?[account]:method==='eth_chainId'?'0x1863d':method==='eth_call'?'0x':handler(method,params)}};}
test('swap review binds pool, spender, amount and output floor; rejects expired and extra calldata fields',()=>{
 const r=review();assert.deepEqual(assertSwapReview(r,intent,now),r.transaction);
 for(const change of [x=>x.transaction.to=token,x=>x.minOut='1',x=>x.amountIn='1',x=>x.poolId='0x'+'0'.repeat(64),x=>x.transaction.gas='0x1',x=>x.expiresAt=now,x=>x.deadline=now/1000-1]){const bad=structuredClone(r);change(bad);assert.throws(()=>assertSwapReview(bad,intent,now));}
 assert.throws(()=>assertSwapReview(r,{...intent,amount:'1'},now));
});
test('swap execution is local-fork-only even if a live endpoint has a preview flag',async()=>{
 assert.equal(swapPreviewEnabled({ELYSIUM_RPC_URL:'https://rpc.boxa.club',ELYSIUM_AUTH_CHAIN_ID:'99901',ENABLE_LOCAL_SWAP_PREVIEW:'true'}),false);
 assert.equal(swapPreviewEnabled({ELYSIUM_RPC_URL:'http://127.0.0.1:18545',ELYSIUM_AUTH_CHAIN_ID:'99901',ENABLE_LOCAL_SWAP_PREVIEW:'true'}),true);
 await assert.rejects(quoteSwap(intent,{env:{},client:{getChainId(){throw Error('must not connect');}}}),/not live/);
});
test('swap submission persists before send and blocks a second send until confirmed',async()=>{
 let sends=0;const hash='0x'+'a'.repeat(64);const s=setup(async()=>{sends++;assert.match([...s.data.values()][0],/awaiting-wallet/);return hash;});
 await s.submitter.submit(review(),intent,s.provider,()=>true);assert.equal(sends,1);
 await assert.rejects(s.submitter.submit(review(),intent,s.provider,()=>true),/Resolve/);assert.equal(sends,1);
 s.submitter.settle(intent,'confirmed');assert.equal(s.submitter.pending(intent).state,'confirmed');
});
test('unknown wallet outcome never retries; recovery validates the hash',async()=>{
 let sends=0;const s=setup(async()=>{sends++;throw Error('disconnected');});
 await assert.rejects(s.submitter.submit(review(),intent,s.provider,()=>true),/unknown/);
 assert.equal(s.submitter.pending(intent).state,'unknown');
 await assert.rejects(s.submitter.submit(review(),intent,s.provider,()=>true),/Resolve/);assert.equal(sends,1);
 assert.throws(()=>s.submitter.recover(intent,'bad'));s.submitter.recover(intent,'0x'+'b'.repeat(64));assert.equal(s.submitter.pending(intent).state,'submitted');
});
test('changed wallet or unavailable recovery storage prevents sending',async()=>{
 let sends=0;const s=setup(async()=>{sends++;});await assert.rejects(s.submitter.submit(review(),intent,s.provider,()=>false),/changed/);assert.equal(sends,0);
 const broken=createSwapSubmitter({storage:{getItem:()=>null,setItem:()=>{throw Error();}},lock:fn=>fn(),now:()=>now});await assert.rejects(broken.submit(review(),intent,s.provider,()=>true),/Cannot save/);assert.equal(sends,0);
});
