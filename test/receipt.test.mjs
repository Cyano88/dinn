import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters,encodeEventTopics,encodeFunctionData,zeroAddress} from 'viem';
import {receiptAbi,verifyLaunchEvidence,readLaunchReceipt,validateReceiptRequest} from '../src/launch-receipt.mjs';
import {contracts,pairs,validateLaunch} from '../src/domain.mjs';
import {restoreTracked} from '../public/launches.js';
const config={name:'Orbit',symbol:'ORBT',pair:'USDC',feePercent:'2',account:'0x1111111111111111111111111111111111111111',recipient:'0x2222222222222222222222222222222222222222',cto:false};
const hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64),poolId='0x'+'c'.repeat(64),token='0x3333333333333333333333333333333333333333',escrow='0x4444444444444444444444444444444444444444',ruleSet='0x5555555555555555555555555555555555555555';
function event(name,address,args){
 const entry=receiptAbi.find(a=>a.type==='event'&&a.name===name);
 return {address,topics:encodeEventTopics({abi:receiptAbi,eventName:name,args}),data:encodeAbiParameters(entry.inputs.filter(i=>!i.indexed),entry.inputs.filter(i=>!i.indexed).map(i=>args[i.name])),removed:false};
}
function fixture(){
 const p={name:config.name,symbol:config.symbol,quote:pairs.USDC.address,devBuyQuote:0n,minDevOut:0n,salt:'0x'+'d'.repeat(64),creator:zeroAddress,fee:20000,builderFee:0};
 const r={recipient:config.recipient,dev:config.account,builder:zeroAddress,cto:false};
 const transaction={hash,blockHash,chainId:99901,from:config.account,to:contracts.factory,value:0n,input:encodeFunctionData({abi:receiptAbi,functionName:'launchChecked',args:[p,r,ruleSet,0]})};
 const receipt={transactionHash:hash,blockHash,blockNumber:100n,status:'success',from:config.account,to:contracts.factory,logs:[
  event('Launched',contracts.launchpad,{poolId,token,creator:escrow,quote:pairs.USDC.address,supplySeeded:10n**27n,devBuyTokens:0n,fee:20000,builderFee:0}),
  event('EscrowLaunched',contracts.factory,{poolId,escrow,recipient:config.recipient,dev:config.account,builder:zeroAddress,ruleSet,cto:false})
 ]};
 return {hash,configuration:validateLaunch(config),transaction,receipt,head:101n,canonicalBlockHash:blockHash,escrowAddress:escrow};
}
test('launch evidence needs matching settings, trusted events, factory mapping and two confirmations',()=>{
 const evidence=fixture();assert.equal(verifyLaunchEvidence(evidence).state,'verified');
 assert.equal(verifyLaunchEvidence({...evidence,head:100n}).state,'confirming');
 assert.equal(verifyLaunchEvidence({...evidence,receipt:{...evidence.receipt,status:'reverted',logs:[]}}).state,'reverted');
});
test('successful receipt cannot impersonate another deployer, destination, draft or canonical block',()=>{
 for(const mutate of [
 e=>e.transaction.from=token,e=>e.transaction.to=token,e=>e.receipt.from=token,e=>e.transaction.value=1n,
 e=>e.configuration.name='Different',e=>e.configuration.recipient=token,e=>e.configuration.cto=true,
 e=>e.canonicalBlockHash=hash,e=>e.transaction.chainId=1,e=>e.escrowAddress=token,e=>e.receipt.transactionHash=blockHash,
 e=>e.head=99n]){
  const e=fixture();mutate(e);assert.throws(()=>verifyLaunchEvidence(e));
 }
});
test('forged, removed, duplicate and unrelated events do not prove deployment',()=>{
 for(const mutate of [
 e=>e.receipt.logs[0].address=token,e=>e.receipt.logs[1].address=token,e=>e.receipt.logs[0].removed=true,
 e=>e.receipt.logs.push(e.receipt.logs[0]),e=>e.receipt.logs=[],
 e=>e.receipt.logs[0].data='0x'
 ]){const e=fixture();mutate(e);assert.throws(()=>verifyLaunchEvidence(e));}
});
test('read-only verifier separates missing receipts from network failure and checks the chain',async()=>{
 const missing={getChainId:async()=>99901,getTransactionReceipt:async()=>{throw Object.assign(Error('not found'),{name:'TransactionReceiptNotFoundError'});}};
 assert.equal((await readLaunchReceipt({hash,configuration:config},null,missing)).state,'pending');
 await assert.rejects(readLaunchReceipt({hash,configuration:config},null,{...missing,getChainId:async()=>1}),/chain mismatch/);
 await assert.rejects(readLaunchReceipt({hash,configuration:config},null,{...missing,getTransactionReceipt:async()=>{throw Error('RPC timeout');}}),/RPC timeout/);
 await assert.rejects(readLaunchReceipt({hash,configuration:config},''),/not configured/);
});
test('RPC adapter verifies mined evidence and reads the escrow mapping at the receipt block',async()=>{
 const e=fixture();let read;
 const client={getChainId:async()=>99901,getTransactionReceipt:async()=>e.receipt,getTransaction:async()=>e.transaction,getBlockNumber:async()=>e.head,getBlock:async()=>({hash:blockHash}),readContract:async args=>{read=args;return escrow;}};
 assert.equal((await readLaunchReceipt({hash,configuration:config},null,client)).state,'verified');
 assert.equal(read.blockNumber,100n);assert.equal(read.address,contracts.factory);assert.equal(read.functionName,'escrowOf');
});
test('tracking restore preserves expected settings but never restores a cached success claim',()=>{
 assert.throws(()=>validateReceiptRequest({hash:'bad',configuration:config}));
 assert.throws(()=>validateReceiptRequest({hash,configuration:config,verified:true}));
 const stored=restoreTracked(JSON.stringify([{hash,configuration:config,state:'verified',token:'fake'}]));
 assert.deepEqual(stored,[{hash,configuration:config}]);assert.deepEqual(restoreTracked('bad'),[]);
});

test('agents receive the same read-only verification state without turning pending into success',async()=>{
 const {agentRequest}=await import('../src/agent-service.mjs');
 const response=await agentRequest({service:'launch.verify',input:{hash,configuration:config}},{verify:async input=>{assert.equal(input.hash,hash);return {state:'pending',hash};}});
 assert.equal(response.status,'pending');assert.equal(response.broadcast,false);assert.equal(response.charged,false);
 await assert.rejects(agentRequest({service:'launch.verify',input:{hash,configuration:config,execute:true}},{verify:()=>{throw Error('Must not call');}}),/only/);
});

test('receipt verification binds recovery to the exact original calldata, including its salt',()=>{
 const e=fixture();
 assert.throws(()=>verifyLaunchEvidence({...e,expectedData:'0x00'}),/different transaction/);
 const result=verifyLaunchEvidence({...e,expectedData:e.transaction.input});assert.match(result.inputHash,/^0x[0-9a-f]{64}$/);
});
