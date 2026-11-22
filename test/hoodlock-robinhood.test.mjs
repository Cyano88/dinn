import test from 'node:test';
import assert from 'node:assert/strict';
import {hoodRecord} from '../src/hoodlock-robinhood.mjs';
const input={address:'0xa',decimals:2,timestamp:200n};
test('withdrawn and matured HoodLock balances are excluded from locked supply',()=>{
 for(const [end,withdrawn,status,locked,withdrawable] of [[201n,false,'locked','1','0'],[200n,false,'withdrawable','0','1'],[201n,true,'withdrawn','0','0']]){
  const r=hoodRecord('lock',1n,[['owner','0xA',100n,end,withdrawn]],input);
  assert.deepEqual([r.status,r.locked,r.withdrawable],[status,locked,withdrawable]);
 }
});
test('vesting checks the token and preserves unknown claimable balances',()=>{
 const row=['creator',50n,'beneficiary',100n,'0xA',300n,1000n,100n];
 const r=hoodRecord('vesting',1n,[row,250n],input);
 assert.deepEqual([r.status,r.locked,r.withdrawable],['vesting','6.5','2.5']);
 assert.equal(hoodRecord('vesting',1n,[row],input).locked,null);
 assert.equal(hoodRecord('vesting',1n,[row],{...input,address:'0xb'}),null);
});
