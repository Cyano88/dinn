import test from 'node:test';
import assert from 'node:assert/strict';
import {compareBaseStock} from '../src/base-stock-comparison.mjs';

const token='0x'+'1'.repeat(40),pool='0x'+'2'.repeat(40),prior=Date.UTC(2026,10,20,21)/1000,end=Date.UTC(2026,10,23,17,45,42)/1000;
const input={token,symbol:'TSLAc',equity:{ticker:'TSLA',quote:{asOf:new Date(end*1000).toISOString(),priceUsd:208,previousCloseUsd:200,url:'https://finance.yahoo.com/quote/TSLA/'}},market:{pairs:[{pairAddress:pool,baseToken:{address:token},liquidityUsd:50000}]}};
async function run(makeRows,metaAddress=token,periods=[[{start:prior-23400,end:prior}],[{start:end-10000,end:end+10000}]]){
 const fetchImpl=async url=>{
  if(url.includes('/chart/'))return Response.json({chart:{result:[{meta:{symbol:'TSLA',tradingPeriods:periods}}]}});
  const u=new URL(url),cutoff=Number(u.searchParams.get('before_timestamp'));assert.equal(u.searchParams.get('token'),token);assert.equal(u.searchParams.get('include_empty_intervals'),'false');
  return Response.json({meta:{base:{address:metaAddress}},data:{attributes:{ohlcv_list:makeRows(cutoff)}}});
 };
 return compareBaseStock(input,fetchImpl);
}
test('compares traded candles in one exact pool around the verified Friday close and Monday quote',async()=>{
 const c=await run(t=>[[t-60,200,220,195,t===prior?200:210,15]]);
 assert.equal(c.status,'available');assert.ok(Math.abs(c.tokenChangePercent-5)<1e-10);assert.ok(Math.abs(c.stockChangePercent-4)<1e-10);assert.equal(c.opening.minuteEnd,new Date(prior*1000).toISOString());assert.equal(c.pool,pool);
});
test('a stale, unfinished or empty candle cannot establish a token return',async()=>{
 for(const [offset,vol] of [[-600,9],[0,9],[-60,0]]){
  const c=await run(t=>[[t+offset,1,1,1,1,vol]]);
  assert.equal(c.status,'unavailable');assert.equal(c.tokenChangePercent,undefined);
 }
});
test('mismatched token and missing session history fail closed',async()=>{
 assert.equal((await run(t=>[[t-60,1,1,1,1,1]],pool)).status,'unavailable');
 assert.equal((await run(()=>[],token,[])).status,'unavailable');
});
