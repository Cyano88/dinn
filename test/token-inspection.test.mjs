import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectToken,sourceVerification,inspectionSummary} from '../src/token-inspection.mjs';
import {inspectionRequest} from '../public/inspection.js';
import {tokenChatResult} from '../src/chat.mjs';
const address='0x1111111111111111111111111111111111111111',hash='0x'+'a'.repeat(64),code='0x60016000';
function fixture(){const calls=[];return {calls,getChainId:async()=>99801,getBlock:async input=>{calls.push(['block',input]);return {number:123n,hash};},getCode:async input=>{calls.push(['code',input]);return code;},readContract:async input=>{calls.push(['read',input]);const v={name:'Test',symbol:'TST',decimals:18,totalSupply:1000000000000000000000000000n,owner:address};return v[input.functionName];},getStorageAt:async input=>{calls.push(['storage',input]);return '0x'+'0'.repeat(64);}};}
const verified=async()=>new Response(JSON.stringify({chainId:'99801',address,runtimeMatch:'exact_match',runtimeBytecode:{onchainBytecode:code},abi:[{type:'function',name:'mint'}]}));
test('reads at one block, checks chain, matches source bytecode, and never assumes LP or sell safety',async()=>{
 const client=fixture();const r=await inspectToken(address,{chainId:99801,client,fetchImpl:verified});
 assert.equal(r.blockNumber,'123');assert.equal(r.checks.find(c=>c.label==='Total supply (TS)').value,'1000000000');
 assert.equal(r.checks.find(c=>c.label==='Source verification').status,'verified');
 assert.equal(r.checks.find(c=>c.label==='Control functions').status,'attention');
 for(const label of ['LP lock','Can I sell?','Holder concentration'])assert.equal(r.checks.find(c=>c.label===label).status,'unknown');
 assert.equal(r.checks.find(c=>c.label==='Proxy indicators').status,'observed');assert.match(r.checks.find(c=>c.label==='Proxy indicators').detail,/Other proxy patterns/);
 for(const [method,args]of client.calls.filter(([m])=>m!=='block'))assert.equal(args.blockNumber,123n,method);
 assert.match(inspectionSummary(r,'is lp locked?'),/Not verified/);
});
test('wrong-chain RPC and reorg results are rejected without leaking endpoints',async()=>{
 const wrong=fixture();wrong.getChainId=async()=>99901;await assert.rejects(inspectToken(address,{chainId:99801,client:wrong}),/network does not match/);assert.equal(wrong.calls.length,0);
 const reorg=fixture();reorg.getBlock=async input=>({number:123n,hash:input?'0x'+'b'.repeat(64):hash});await assert.rejects(inspectToken(address,{chainId:99801,client:reorg,fetchImpl:verified}),/block changed/);
 const failing=fixture();failing.getBlock=async()=>{throw Error('https://private.rpc/SECRET');};await assert.rejects(inspectToken(address,{client:failing}),e=>!e.message.includes('SECRET'));
});
test('verification must match chain, address and runtime, not merely a verified status',async()=>{
 const base={chainId:'99801',address,runtimeMatch:'exact_match',runtimeBytecode:{onchainBytecode:code}};
 for(const patch of [{chainId:'99901'},{address:'0x2222222222222222222222222222222222222222'},{runtimeBytecode:{onchainBytecode:'0xdead'}},{runtimeMatch:null}]){
  const r=await sourceVerification(99801,address,code,{fetchImpl:async()=>new Response(JSON.stringify({...base,...patch}))});assert.equal(r.status,'unknown');
 }
 assert.equal((await sourceVerification(99801,address,code,{fetchImpl:async()=>new Response('',{status:404})})).status,'unknown');
});
test('missing code and unsupported ERC20 calls never imply zero supply or renounced ownership',async()=>{
 const empty=fixture();empty.getCode=async()=>undefined;const a=await inspectToken(address,{chainId:99801,client:empty});assert.equal(a.checks[0].status,'not-found');assert.equal(a.checks.some(c=>c.label==='Total supply (TS)'),false);
 const broken=fixture();broken.readContract=async()=>{throw Error('revert');};broken.getStorageAt=async()=>{throw Error('unavailable');};
 const b=await inspectToken(address,{chainId:99801,client:broken,fetchImpl:async()=>new Response('',{status:503})});
 for(const label of ['Total supply (TS)','Reported owner','Source verification','Proxy indicators'])assert.equal(b.checks.find(c=>c.label===label).status,'unknown');
});
test('explicit address selection and follow-up shorthand do not confuse general questions or wallet setup',()=>{
 assert.equal(inspectionRequest(address,null).address,address);
 assert.equal(inspectionRequest('TS?',address).address,address);
 assert.equal(inspectionRequest('is token lp locked?',null).needsAddress,true);
 assert.equal(inspectionRequest('What is LP?'),null);
 assert.equal(inspectionRequest(address,null,{setupField:'recipient'}),null);
 assert.equal(inspectionRequest('check '+address+' 0x2222222222222222222222222222222222222222').multiple,true);
});
test('network requests and missing addresses cannot trigger arbitrary or wrong-network reads',async()=>{
 let called=false;const inspect=async()=>{called=true;throw Error('Unexpected inspection');};
 const env={ELYSIUM_AUTH_CHAIN_ID:'99801'};
 assert.match((await tokenChatResult({message:'SC verified?'},{env,inspect})).message,/Paste an Elysium token/);
 assert.match((await tokenChatResult({message:'check mainnet token '+address,inspectionChainId:99801},{env,inspect})).message,/not connected/);
 assert.equal(called,false);
});

 test('inspection requires an explicit available network before any RPC access',async()=>{
 let calls=0;const inspect=async()=>{calls++;return {address,checks:[]};};const env={ELYSIUM_AUTH_CHAIN_ID:'99801'};
 assert.match((await tokenChatResult({message:address},{env,inspect})).message,/Choose an inspection network/);
 assert.match((await tokenChatResult({message:address,inspectionChainId:196},{env,inspect})).message,/unavailable/);
 assert.equal(calls,0);
 });

test('minimal proxies are reported without assuming an empty EIP-1967 slot rules them out',async()=>{const client=fixture();client.getCode=async()=> '0x363d3d373d3d3d363d73'+address.slice(2)+'5af43d82803e903d91602b57fd5bf3';const r=await inspectToken(address,{chainId:99801,client,fetchImpl:async()=>new Response('',{status:404})});assert.equal(r.implementationAddress,address);assert.match(r.checks.find(c=>c.label==='Proxy indicators').detail,/ERC-1167/);assert.equal(r.checks.find(c=>c.label==='Source verification').status,'unknown');});
test('holder behavior chat shows bounded current holdings and linked swap evidence without labelling people',()=>{
 const wallet='0x'+'3'.repeat(40),transaction='https://robinhoodchain.blockscout.com/tx/'+'a'.repeat(64);
 const report={network:'Robinhood Chain',chainId:4663,blockNumber:'123',checkedAt:'2026-11-12T12:00:00Z',symbol:'TOK',checks:[],holders:{rows:[{address:wallet,kind:'Address without deployed code',balance:'10',sharePercent:'1.25',otherTokens:[{address:'0x'+'4'.repeat(40),symbol:'ALT',balance:'2',estimatedUsd:'3'}]}],behavior:{status:'available',summary:{holderSignal:'mixed or low-coverage target-token activity',nextStep:'manual_review',targetTokenBuyCandidates:1,targetTokenSellCandidates:0,walletsAnalyzed:1},rows:[{address:wallet,status:'available',recentSwaps:[{classification:'two-sided swap candidate',targetTokenAction:'target-token buy candidate',timestamp:'2026-11-12T11:00:00Z',transactionUrl:transaction,tokenFlows:[{direction:'in',amount:'1',symbol:'TOK',tokenAddress:'0x'+'5'.repeat(40)}],nativeFlows:[{direction:'out',amount:'0.1',symbol:'ETH'}]}]}]}}};
 const message=inspectionSummary(report,'show what holders hold or traded before');
 assert.match(message,/ALT 2 \(est\. \$3\)/);assert.match(message,/target-token buy candidate/);assert.ok(message.includes(transaction));assert.match(message,/An address is not a person/);assert.match(message,/research triage, not a buy recommendation/);
});
test('Robinhood stale snapshots are rejected before token reads',async()=>{const client=fixture();client.getChainId=async()=>4663;client.getBlock=async()=>({number:123n,hash,timestamp:1n});await assert.rejects(inspectToken(address,{chainId:4663,client}),/stale/);assert.equal(client.calls.length,0);});
