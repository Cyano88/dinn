import test from 'node:test';
import assert from 'node:assert/strict';
import {requestedLockFocus,lockFinding} from '../src/research-finding.mjs';
const symbol='BGAP',blockNumber='123';
test('a locker brief leads with the matched record and the snapshot',()=>{
 const row={id:'0',kind:'fixed',locked:'11299435.02',withdrawable:'0',unlockDate:'2026-12-14T16:19:00Z',child:'0x123'};
 const report={chainId:4663,symbol,blockNumber,titanLocks:[{version:'V2.2',status:'observed',records:[row]}]};
 const focus=requestedLockFocus('Check Titan Locker for its unlock date');
 const lead=lockFinding(report,focus);
 for(const part of ['BGAP','Titan V2.2 #0','11299435.02','Withdrawable 0','2026-12-14','/address/0x123','block 123'])assert.ok(lead.includes(part),part);
 assert.equal(lockFinding(report,requestedLockFocus('Research BGAP on Robinhood Chain')),'');
});
test('missing checks stay unknown and paired asset findings are kept distinct',()=>{
 const report={chainId:4663,symbol,blockNumber,stockInspection:{symbol:'NVDA',blockNumber:'124'}};
 const lead=lockFinding(report,'uncx');
 assert.match(lead,/BGAP lock findings[\s\S]+incomplete[\s\S]+NVDA lock findings/);
 assert.doesNotMatch(lead,/Withdrawable 0/);
});
