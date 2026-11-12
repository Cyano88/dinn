import test from 'node:test';
import assert from 'node:assert/strict';
import {PINKLOCK_ADAPTERS,researchPinkLocks} from '../src/pinklock-research.mjs';

const token='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40),owner='0x'+'3'.repeat(40),raw=1000n*10n**18n;
const grail='0x43468fc21c46d30cf765e1a1d0ed32ecb6bd89a4',pinkLock02='0xBE0b139ABc90723Af76a89D3051f60Ba1B64c8d9',runtime='0x12345678';
const lock={id:7n,token,owner,amount:raw,lockDate:1_800_000_000n,tgeDate:1_831_536_000n,tgeBps:1000n,cycle:2_592_000n,cycleBps:500n,unlockedAmount:200n*10n**18n,description:'Team vesting'};

test('PinkLock output includes the exact lock amount, vested schedule and current withdrawable amount',async()=>{
 const client={readContract:async({address,functionName})=>{
  if(functionName==='totalLockCountForToken')return address===PINKLOCK_ADAPTERS[0].address?1n:0n;
  if(functionName==='getLocksForToken')return [lock];
  if(functionName==='isLpToken')return false;
  if(functionName==='withdrawableTokens')return 25n*10n**18n;
  throw Error('unexpected read');
 }};
 const report=await researchPinkLocks({address:token,decimals:18,client,blockNumber:123n});
 assert.equal(PINKLOCK_ADAPTERS[0].address.length,42);assert.equal(report.status,'observed');assert.equal(report.records.length,1);assert.equal(report.records[0].remaining,'800');assert.equal(report.records[0].unlocked,'200');assert.equal(report.records[0].currentlyWithdrawable,'25');assert.equal(report.records[0].tgeReleasePercent,10);assert.equal(report.records[0].cycleDays,30);assert.equal(report.records[0].cycleReleasePercent,5);assert.equal(report.records[0].kind,'token');
});

test('no matching rows in checked adapters is not described as proof that supply is unlocked',async()=>{
 const report=await researchPinkLocks({address:token,decimals:18,blockNumber:123n,holders:[{address:owner,walletType:'externally-owned'}],client:{readContract:async({functionName})=>functionName==='totalLockCountForToken'?0n:null}});
 assert.equal(report.status,'observed');assert.equal(report.records.length,0);assert.match(report.reason,/not proof that the supply is unlocked/);
});

test('records for another token are excluded and adapter/read failures stay partial or unavailable',async()=>{
 const report=await researchPinkLocks({address:token,decimals:18,blockNumber:123n,client:{readContract:async({functionName,address})=>{if(functionName==='totalLockCountForToken')return address===PINKLOCK_ADAPTERS[0].address?1n:0n;if(functionName==='getLocksForToken')return [{...lock,token:other}];if(functionName==='isLpToken')return false;if(functionName==='withdrawableTokens')return 0n;throw Error();}}});
 assert.equal(report.records.length,0);assert.equal(report.status,'partial');assert.match(report.reason,/absence of a record is inconclusive/);
});

test('discovers a verified PinkLock02 holder and returns the onchain amount, schedule and PinkSale record link',async()=>{
 const lock={id:1000858n,token:grail,owner:'0xAC7F08Dc859206f95338A9aB318EfC9e152852e4',amount:67061829096493628409909994n,lockDate:BigInt(Date.parse('2026-09-15T01:47:03Z')/1000),tgeDate:BigInt(Date.parse('2026-12-05T01:43:00Z')/1000),tgeBps:0n,cycle:0n,cycleBps:0n,unlockedAmount:0n,description:'{"l":"Grail Lock"}'};
 const client={getCode:async({address,blockNumber})=>{assert.equal(address,pinkLock02);assert.equal(blockNumber,123n);return runtime;},readContract:async({address,functionName,args})=>{
  if(functionName==='totalLockCountForToken')return address.toLowerCase()===pinkLock02.toLowerCase()?1n:0n;
  if(functionName==='getLocksForToken')return address.toLowerCase()===pinkLock02.toLowerCase()?[lock]:[];
  if(functionName==='withdrawableTokens')return 0n;
  if(functionName==='isLpToken')return false;
  throw Error('unexpected read');
 }};
 const report=await researchPinkLocks({address:grail,decimals:18,client,blockNumber:123n,holders:[{address:pinkLock02,walletType:'contract'}],env:{},read:async path=>{
  assert.equal(path,'smart-contracts/'+pinkLock02);
  return {name:'PinkLock02',is_verified:true,deployed_bytecode:runtime};
 }});
 assert.equal(report.status,'observed');assert.equal(report.records.length,1);
 const found=report.records[0];assert.equal(found.id,'1000858');assert.equal(found.adapter,'PinkLock02');assert.equal(found.amount,'67061829.096493628409909994');assert.equal(found.remaining,found.amount);assert.equal(found.unlocked,'0');assert.equal(found.currentlyWithdrawable,'0');assert.equal(found.owner,lock.owner);assert.equal(found.lockDate,'2026-09-15T01:47:03.000Z');assert.equal(found.tgeOrUnlockDate,'2026-12-05T01:43:00.000Z');assert.equal(found.description,'{"l":"Grail Lock"}');assert.equal(found.pinkSaleUrl,'https://www.pinksale.finance/pinklock/robinhood/record/1000858');assert.match(found.sourceUrl,new RegExp(pinkLock02,'i'));
});

test('does not treat unverified or bytecode-mismatched holder contracts as PinkLock02',async()=>{
 for(const {metadata,runtimeCode,expected,reportStatus} of [
  {metadata:{name:'PinkLock02',is_verified:false,deployed_bytecode:runtime},runtimeCode:runtime,expected:'unverified',reportStatus:'partial'},
  {metadata:{name:'PinkLock02',is_verified:true,deployed_bytecode:'0x87654321'},runtimeCode:runtime,expected:'source-mismatch',reportStatus:'partial'},
  {metadata:{name:'OtherLock',is_verified:true,deployed_bytecode:runtime},runtimeCode:runtime,expected:'not-pinklock02',reportStatus:'observed'}
 ]){
  let reads=0;const report=await researchPinkLocks({address:token,decimals:18,blockNumber:123n,holders:[{address:pinkLock02,walletType:'contract'}],client:{getCode:async()=>runtimeCode,readContract:async({functionName})=>{if(functionName==='totalLockCountForToken')return 0n;reads++;throw Error('unexpected');}},env:{},read:async()=>metadata});
  assert.equal(report.records.length,0);assert.equal(report.adapters.at(-1).status,expected);assert.equal(reads,0);assert.equal(report.status,reportStatus);
 }
});
