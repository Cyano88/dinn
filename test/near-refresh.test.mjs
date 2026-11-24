import test from 'node:test';
import assert from 'node:assert/strict';
import {researchSnapshot as snapshot,refreshSummary as summary} from '../src/near-refresh.mjs';

const address='0x'+'1'.repeat(40),pool='0x'+'2'.repeat(40),wallet='0x'+'3'.repeat(40);
const hash='0x'+'4'.repeat(64);
const first='2026-11-21T10:00:00Z',second='2026-11-22T10:00:00Z';
function base(checkedAt,liquidityUsd,activity=[]){
 return snapshot({checkedAt,address,chainId:8453,market:{source:'DEX Screener',pairs:[{pairAddress:pool,liquidityUsd}]},
  holders:{holderActivity:[{address:wallet,status:'available',recentSwaps:activity}]}});
}
test('refresh compares the original pool and deduplicates dated activity across overlapping histories',()=>{
 const buy={side:'buy',at:'2026-11-22T07:00:00Z',transactionHash:hash};
 const old=base(first,1000),fresh=base(second,800,[buy,buy,{...buy,side:'sell',at:first}]);
 fresh.pools.unshift({...fresh.pools[0],id:address,usd:5000});
 const text=summary(old,fresh);
 assert.match(text,/\$1,000.00 to \$800.00/);assert.match(text,/1 buy and 0 sell/);
 fresh.pools[1].source='Other';fresh.wallets[0].address=address;
 assert.match(summary(old,fresh),/could not be rechecked/);assert.match(summary(old,fresh),/could not be compared/);
});
test('reports curve graduation and a past scheduled date without claiming a withdrawal',()=>{
 const report={chainId:4663,address,checkedAt:first,ponsState:{phase:0,curve:{progressPercent:97}},pinkLock:{records:[{remaining:'5',tgeOrUnlockDate:'2026-11-22T00:00:00Z'}]}};
 const old=snapshot(report),fresh=snapshot({...report,checkedAt:second,ponsState:{phase:2}});
 const text=summary(old,fresh);
 assert.match(text,/moved from the bonding curve/);assert.match(text,/schedule date .* has passed/);assert.match(text,/withdrawal still needs separate evidence/i);
 assert.match(summary(null,fresh),/unavailable/);assert.match(summary(old,{...fresh,address:wallet}),/unavailable/);
});
