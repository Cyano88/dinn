import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {encodeAbiParameters,encodeFunctionData,parseAbi} from 'viem';
import {magnaAllocation,projectVesting,projectVestingLines} from '../src/base-project-vesting.mjs';

const escrow='0x4c8192b4ab484e16b6cad6c94345904496c2f611', hash='0x'+'a'.repeat(64);
const tx=(kind='calendar')=>({hash,to:escrow,blockNumber:'0x01',input:encodeFunctionData({
 abi:parseAbi(['function withdraw(uint256,uint32,bytes,bytes32[])']),functionName:'withdraw',
 args:[0n,0,encodeAbiParameters([{type:'string'}],[kind]),[]]
})});
const allocation={allocation:{id:'public-allocation',total:100n},state:{terminated:0,withdrawn:5n,funded:80n},scheduleId:'abc'};

test('Magna reports dates only after the escrow accepts the exact proof at the checked block',async()=>{
 const read={tag:'0x64',rpc:async name=>name==='eth_getTransactionByHash'?tx():{number:'0x64',timestamp:'0xc8'},call:async(address,name)=>{
  assert.equal(address,escrow);assert.equal(name,'getCalendarLeafAllocationData');
  return [allocation,{id:'abc',times:[100,200,300],amounts:[50n,30n,20n]}];
 }};
 const report=await magnaAllocation(hash,escrow,100,read);
 assert.equal(report.nextScheduledUtc,'1970-01-01T00:05:00.000Z');
 assert.equal(report.fundedRaw,'80');
 await assert.rejects(magnaAllocation(hash,escrow,100,{...read,call:async()=>{throw Error('invalid proof');}}));
 await assert.rejects(magnaAllocation(hash,escrow,100,{...read,rpc:async()=>({...tx(),to:'0x'+'0'.repeat(40)})}));
});

test('terminated intervals have no next release even when the original end is in the future',async()=>{
 const result=await magnaAllocation(hash,escrow,100,{tag:'0x64',rpc:async name=>name==='eth_getTransactionByHash'?tx('interval'):{number:'0x64',timestamp:'0xc8'},call:async()=>[
  {...allocation,state:{...allocation.state,terminated:1}},
  {id:'abc',pieces:[{start:100,period:100,count:4,amount:100n}]}
 ]});
 assert.equal(result.nextScheduledUtc,null);assert.equal(result.terminated,true);
 assert.equal(result.endUtc,'1970-01-01T00:08:20.000Z');
});

test('an unknown asset and absent holder snapshot leave custom schedule coverage open',async()=>{
 const report=await projectVesting('0x'+'1'.repeat(40),100,'unused',()=>{throw Error('unexpected IO');},{},null,AbortSignal.timeout(1000));
 assert.equal(report.magna.status,'no-catalog-match');assert.equal(report.wallets.status,'not-sampled');
 assert.ok(projectVestingLines(report).some(line=>line.includes('not checked')));
});

test('a failed finalized factory range cannot advance reported coverage; the next verified range can',async()=>{
 const through=JSON.parse(readFileSync(new URL('../src/base-magna-escrows.json',import.meta.url),'utf8')).throughBlock,token='0x'+'1'.repeat(40);
 const reader=ok=>async(_url,{body})=>{
  const {method}=JSON.parse(body);
  if(method==='eth_getBlockByNumber')return {ok:true,json:async()=>({result:{number:'0x'+(through+10).toString(16)}})};
  if(method==='eth_getLogs'&&ok)return {ok:true,json:async()=>({result:[]})};
  throw Error('unavailable');
 };
 const run=fetchImpl=>projectVesting(token,through+20,'https://rpc.invalid',fetchImpl,{},null,AbortSignal.timeout(1000));
 assert.equal((await run(reader(false))).magna.catalogThroughBlock,through);
 assert.equal((await run(reader(true))).magna.catalogThroughBlock,through+10);
});
