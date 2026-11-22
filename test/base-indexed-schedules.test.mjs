import test from 'node:test';
import assert from 'node:assert/strict';
import {additionalBaseSchedules,additionalScheduleLines} from '../src/base-indexed-schedules.mjs';

const asset='0x0000000000000000000000000000000000000001';
const stream={asset_id:'asset-8453-'+asset,chainId:'8453',contract:asset,tokenId:'1',startTime:'100',endTime:'2000000000',cliffTime:null,cancelable:true};
const asJson=value=>({ok:true,json:async()=>value});

test('index failures and wrong-asset rows cannot become empty successful lock checks',async()=>{
 const read=async url=>{
  if(url.includes('hyperindex'))return asJson({data:{LockupStream:[{...stream,asset_id:'other'}]}});
  throw Error('RPC unavailable');
 };
 const result=await additionalBaseSchedules(asset,100,'https://rpc.invalid',read,AbortSignal.timeout(1000));
 assert.ok(result.every(source=>source.status==='unavailable'));
});

test('bounded Sablier sample is dated, distinguishes cancelability and leaves zero custody scoped to each Hedgey contract',async()=>{
 const read=async(url,{body})=>{
  if(url.includes('hyperindex')){
   assert.equal(JSON.parse(body).variables.asset,stream.asset_id);
   return asJson({data:{LockupStream:Array.from({length:6},(_,i)=>({...stream,tokenId:String(i+1)}))}});
  }
  assert.equal(JSON.parse(body).params[1],'0x64');
  return asJson({result:'0x'+'0'.repeat(64)});
 };
 const result=await additionalBaseSchedules(asset,100,'https://rpc.invalid',read,AbortSignal.timeout(1000));
 assert.equal(result[0].status,'partial');
 assert.equal(result[0].records.length,5);
 assert.equal(result[0].records[0].endUtc,'2033-05-18T03:33:20.000Z');
 assert.ok(result.slice(1).every(s=>s.custodyRaw==='0'));
 assert.match(additionalScheduleLines(result)[1],/plan contract held none/);
});
