import test from 'node:test';
import assert from 'node:assert/strict';
import {toFunctionSelector,encodeAbiParameters,parseAbiParameters} from 'viem';
import {baseLockEvidence} from '../src/base-lock-evidence.mjs';

test('a native allocation survives another locker outage and excludes vested, claimable tokens',async()=>{
 const token='0x0000000000000000000000000000000000000001';
 const fetchImpl=async(_url,options)=>{
  const {params}=JSON.parse(options.body);
  assert.equal(params[1],'0x14');
  const selector=params[0].data.slice(0,10);
  if(selector===toFunctionSelector('getTokenLocksLength(address)'))throw Error('RPC unavailable');
  let types='uint256',values=[0n];
  if(selector===toFunctionSelector('allocation(address)')){
   types='address,uint256,uint256,uint256,uint256,address';
   values=[token,100n,20n,200n,300n,token];
  }else if(selector===toFunctionSelector('amountAvailableToClaim(address)'))values=[15n];
  return {ok:true,json:async()=>({result:encodeAbiParameters(parseAbiParameters(types),values)})};
 };
 const report=await baseLockEvidence(token,20,'https://example.invalid',fetchImpl);
 assert.equal(report.sources.find(s=>s.name.startsWith('PinkLock')).count,'0');
 assert.equal(report.sources.find(s=>s.name.startsWith('UNCX')).status,'unavailable');
 const native=report.sources.find(s=>s.name.startsWith('Clanker')).records[0];
 assert.equal(native.lockedRaw,'65');
 assert.equal(native.claimableRaw,'15');
 assert.equal(native.cliffUtc,new Date(200000).toISOString());
});
