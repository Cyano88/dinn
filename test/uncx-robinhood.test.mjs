import test from 'node:test';
import assert from 'node:assert/strict';
import {scanSchedules} from '../src/uncx-robinhood.mjs';
const address='0x'+'1'.repeat(40);
const other='0x'+'2'.repeat(40);
const ok=result=>({status:'success',result});
const fail={status:'failure'};
async function check(target){
 const client={multicall:async({blockNumber,contracts})=>{
  assert.equal(blockNumber,123n);
  return contracts.map(({functionName,args:[id]})=>{
   const cancelled=id===2n;
   if(functionName==='vestingSchedules')return ok([address,null,null,null,null,null,null,cancelled]);
   if(functionName==='getVestingSchedule')return ok({token:address,totalAmount:100n,cancelled,tranches:[{time:200n}]});
   if(functionName==='getVestedAmount')return ok(25n);
   return cancelled?fail:ok(7n);
  });
 }};
 return scanSchedules({client,address:target,blockNumber:123n,timestamp:150n,decimals:0,next:3n,report:{records:[],scanned:0,matched:0}});
}
test('UNCX keeps cancelled schedules out of pending unlocks and preserves unavailable amounts',async()=>{
 const r=await check(address);
 assert.equal(r.status,'observed');
 assert.equal(r.records[0].scheduledUnvested,'75');
 assert.equal(r.records[0].currentlyWithdrawable,'7');
 assert.equal(r.records[0].nextScheduleDate,'1970-01-01T00:03:20.000Z');
 const row=r.records.find(r=>r.cancelled);
 assert.equal(row.scheduledUnvested,null);
 assert.equal(row.currentlyWithdrawable,null);
 assert.equal(row.nextScheduleDate,null);
});
test('UNCX no-match applies only to the requested token in the scanned schedules',async()=>{
 const r=await check(other);
 assert.equal(r.scanned,3);
 assert.equal(r.status,'no-match');
 assert.equal(r.records.length,0);
});
