import test from 'node:test';
import assert from 'node:assert/strict';
import {rankLaunches,poolCandles} from '../src/launch-directory-trends.mjs';
import {createPonsLaunchService} from '../src/pons-launch-service.mjs';
test('liquidity leads the directory, market cap breaks ties and trending requires positive volume and movement',()=>{
 const row=(token,liquidityUsd,marketCapUsd,change24h,volume24hUsd)=>({token,metrics:{market:{liquidityUsd,marketCapUsd,change24h,volume24hUsd}}});
 const rows=[row('a',null,400,10,0),row('b',5,10,1,8),row('c',5,200,0,4),row('d',1,90,3,5)];
 assert.deepEqual(rankLaunches(rows,'all').map(r=>r.token),['c','b','d','a']);
 assert.deepEqual(rankLaunches(rows,'trending').map(r=>r.token),['d','b']);
});
test('a high-liquidity launch from the second database page appears first, and pages do not overlap',async()=>{
 const launches=Array.from({length:12},(_,i)=>({name:String(i),token:'0x'+String(i+1).padStart(40,'0')}));
 const service=createPonsLaunchService({env:{DATABASE_URL:'configured'},verify:async()=>'tester',storeFactory:async()=>({list:async({limit,offset})=>({total:12,items:launches.slice(offset,offset+limit)})}),readMetrics:async({address})=>({market:{liquidityUsd:Number(address.slice(-2))},phase:0})});
 const page=async offset=>(await service.handle({headers:{authorization:'Bearer test'}},'/api/dinn/launches/list',{offset,filter:'all'})).body;
 const first=await page(0),second=await page(10);
 assert.equal(first.items[0].name,'11');assert.equal(first.items.length,10);assert.equal(second.items.length,2);
 assert.equal(new Set([...first.items,...second.items].map(x=>x.token)).size,12);
});
test('candles require matching token, recent timestamps and actual trading',async()=>{
 const now=1800000000000,t=now/1000,token='0x'+'2'.repeat(40),row={token,chainId:8453,metrics:{market:{chartPool:'0x'+'4'.repeat(64)}}};
 const data={attributes:{ohlcv_list:[[t,1,3,1,2,3],[t-3600,2,2,2,2,1],[t-7200,2,2,2,2,0],[t-90000,1,1,1,1,2]]}};
 const candles=address=>poolCandles(row,async()=>Response.json({meta:{base:{address}},data}),now);
 assert.deepEqual((await candles(token)).map(x=>x[0]),[t-3600,t]);assert.deepEqual(await candles('wrong'),[]);
});
