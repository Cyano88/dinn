import assert from 'node:assert/strict';
import test from 'node:test';
import {titanRecord} from '../src/titan-robinhood.mjs';
const input={address:'0xab',timestamp:200n,decimals:2};
const fixed=[0,7,'child','owner','0xAB',0n,'creator',10,200,150n];
test('manager indexes can return underlying LP assets or unrelated locks',()=>{
 assert.equal(titanRecord('V2',7,[1,...fixed.slice(1)],[],input),null);
 assert.equal(titanRecord('V2',7,fixed,[],{...input,address:'0xcd'}),null);
 assert.throws(()=>titanRecord('V2',8,fixed,[],input));
});
test('fixed custody uses the correct version layout and exact maturity boundary',()=>{
 const v1=[false,7,'child','owner','0xAB','creator',10,200,150n,9999n];
 for(const [version,row] of [['V1',v1],['V2.2',fixed]]){
  assert.equal(titanRecord(version,7,row,[],input).withdrawable,'1.5');
  assert.equal(titanRecord(version,7,row,[],{...input,timestamp:199n}).locked,'1.5');
 }
});
test('vesting distinguishes nominal grant from child balance and releasable amount',()=>{
 const row=[3,...fixed.slice(1)];
 const r=titanRecord('V2.1',7,row,[[10,20,300,1000n,50n],400n,150n],input);
 assert.equal(r.scheduledUnvested,'6');
 assert.equal(r.withdrawable,'1.5');
 assert.equal(titanRecord('V2.1',7,row,[],input).withdrawable,null);
});
