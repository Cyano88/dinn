import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionData,keccak256,zeroAddress} from 'viem';
import {launchAbi,validatePreparedLaunch} from '../src/launch-call.mjs';
import {createLaunchSubmitter,PENDING_KEY} from '../src/launch-submission.mjs';
import {contracts,pairs,validateLaunch} from '../src/domain.mjs';
const config={name:'Orbit',symbol:'ORBT',pair:'USDC',feePercent:'2',account:'0x1111111111111111111111111111111111111111',recipient:'0x2222222222222222222222222222222222222222',cto:false};
const hash='0x'+'a'.repeat(64);
function prepared(){
 const p={name:'Orbit',symbol:'ORBT',quote:pairs.USDC.address,devBuyQuote:0n,minDevOut:0n,salt:'0x'+'c'.repeat(64),creator:zeroAddress,fee:20000,builderFee:0};
 const r={recipient:config.recipient,dev:config.account,builder:zeroAddress,cto:false};
 return {mode:'simulation',broadcast:false,chainId:99901,expiresAt:61000,configuration:validateLaunch(config),transaction:{from:config.account,to:contracts.factory,chainId:'0x1863d',value:'0x0',data:encodeFunctionData({abi:launchAbi,functionName:'launchChecked',args:[p,r,'0x3333333333333333333333333333333333333333',0]})}};
}
function storage(){const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};}
function setup(overrides={}){
 const calls=[],store=storage(),provider={request:async({method})=>{calls.push(method);if(method==='eth_accounts')return [config.account];if(method==='eth_chainId')return '0x1863d';if(method==='eth_sendTransaction')return hash;throw Error('Unexpected method');}};
 const options={storage:store,withLock:task=>task(),now:()=>1000,...overrides},submitter=createLaunchSubmitter(options);
 const request={prepared:prepared(),configuration:config,provider,enabled:true};
 return {submitter,provider,calls,store,request,options};
}
test('sending requires the release gate, matching decoded calldata and a fresh simulation',async()=>{
 const s=setup();
 await assert.rejects(s.submitter.submit({...s.request,enabled:false}),/disabled/);assert.deepEqual(s.calls,[]);
 for(const alter of [
 p=>p.transaction.to=zeroAddress,p=>p.transaction.from=config.recipient,p=>p.transaction.chainId='0x1',
 p=>p.transaction.value='0x1',p=>p.expiresAt=1000,p=>p.mode='draft',p=>p.configuration.feePips=30000,
 p=>p.transaction.gas='0x100',p=>p.transaction.data='0x1234'
 ]){const p=prepared();alter(p);assert.throws(()=>validatePreparedLaunch(p,config,1000));}
 assert.throws(()=>validatePreparedLaunch(prepared(),{...config,recipient:config.account},1000),/calldata/);
});
test('one wallet send is persisted before invocation and only its hash is submitted, not verified',async()=>{
 const s=setup();s.provider.request=async({method,params})=>{
  s.calls.push(method);if(method==='eth_accounts')return [config.account];if(method==='eth_chainId')return '0x1863d';
  assert.equal(JSON.parse(s.store.getItem(PENDING_KEY)).phase,'awaiting-wallet');assert.deepEqual(params,[prepared().transaction]);return hash;
 };
 const result=await s.submitter.submit(s.request);
 assert.equal(result.phase,'submitted');assert.equal(result.hash,hash);assert.deepEqual(s.calls,['eth_accounts','eth_chainId','eth_sendTransaction']);
 await assert.rejects(s.submitter.submit(s.request),/previous launch/);
});
test('wallet changes, expired preparation during preflight, and stale draft prevent sending',async()=>{
 for(const kind of ['account','chain','expiry','draft']){
  let clock=1000,current=true;const s=setup({now:()=>clock});
  s.provider.request=async({method})=>{s.calls.push(method);if(kind==='expiry')clock=62000;if(kind==='draft')current=false;
   return method==='eth_accounts'?[kind==='account'?config.recipient:config.account]:kind==='chain'?'0x1':'0x1863d';};
  await assert.rejects(s.submitter.submit({...s.request,isCurrent:()=>current}));
  assert.ok(!s.calls.includes('eth_sendTransaction'));assert.equal(s.store.getItem(PENDING_KEY),null);
 }
});
test('double clicks cannot create a second wallet request',async()=>{
 const s=setup();let release;
 s.provider.request=async({method})=>{s.calls.push(method);if(method==='eth_accounts')return [config.account];if(method==='eth_chainId')return '0x1863d';return new Promise(r=>release=r);};
 const pending=s.submitter.submit(s.request);await new Promise(r=>setImmediate(r));
 await assert.rejects(s.submitter.submit(s.request),/in progress/);release(hash);await pending;
 assert.equal(s.calls.filter(x=>x==='eth_sendTransaction').length,1);
});
test('a declined request can be retried explicitly; a timeout cannot',async()=>{
 for(const code of [4001,-32000]){
  const s=setup();s.provider.request=async({method})=>{if(method==='eth_accounts')return [config.account];if(method==='eth_chainId')return '0x1863d';throw Object.assign(Error('Wallet error'),{code});};
  const result=await s.submitter.submit(s.request);assert.equal(result.phase,code===4001?'rejected':'unknown');
  if(code!==4001)await assert.rejects(s.submitter.submit(s.request),/previous launch/);
  else{const retry=await s.submitter.submit(s.request);assert.equal(retry.phase,'rejected');}
 }
});
test('refresh during a wallet prompt restores unknown and never automatically resends',async()=>{
 const s=setup();s.store.setItem(PENDING_KEY,JSON.stringify({version:1,phase:'awaiting-wallet',hash:null,configuration:config,transaction:prepared().transaction,createdAt:1000}));
 assert.equal(s.submitter.pending().phase,'unknown');
 await assert.rejects(s.submitter.submit(s.request),/previous launch/);assert.deepEqual(s.calls,[]);
 const recovered=s.submitter.attachHash(hash);assert.equal(recovered.phase,'submitted');
});
test('only a receipt for the exact saved calldata can resolve a pending operation',async()=>{
 const s=setup();await s.submitter.submit(s.request);
 const result={state:'verified',chainId:99901,hash,inputHash:keccak256(prepared().transaction.data)};
 assert.throws(()=>s.submitter.acknowledge({...result,inputHash:hash}),/exact wallet request/);
 assert.throws(()=>s.submitter.acknowledge({...result,chainId:1}),/exact wallet request/);
 assert.equal(s.submitter.acknowledge(result).phase,'verified');
});
test('storage failures or missing browser locking prevent opening a transaction prompt',async()=>{
 const s=setup();s.store.setItem=()=>{throw Error('quota');};
 await assert.rejects(s.submitter.submit(s.request),/Cannot save/);assert.ok(!s.calls.includes('eth_sendTransaction'));
 const noLock=setup({withLock:undefined});await assert.rejects(noLock.submitter.submit(noLock.request),/safely lock/);assert.deepEqual(noLock.calls,[]);
});
test('storage failure after submission retains the hash and blocks retries',async()=>{
 const s=setup(),original=s.store.setItem;let writes=0;
 s.store.setItem=(k,v)=>{writes++;if(writes>1)throw Error('quota');original(k,v);};
 const result=await s.submitter.submit(s.request);assert.equal(result.hash,hash);assert.match(result.recoveryWarning,/Copy/);
 assert.equal(s.submitter.pending().hash,hash);await assert.rejects(s.submitter.submit(s.request),/previous launch/);
});
test('a corrupt persisted request fails closed and UI exceptions cannot turn a send into failure',async()=>{
 const s=setup();s.store.setItem(PENDING_KEY,'{bad');await assert.rejects(s.submitter.submit(s.request),/unreadable/);assert.deepEqual(s.calls,[]);
 const next=setup({onState:()=>{throw Error('UI failure');}});
 assert.equal((await next.submitter.submit(next.request)).phase,'submitted');
});
