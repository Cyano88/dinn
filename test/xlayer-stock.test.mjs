import assert from 'node:assert/strict';
import test from 'node:test';
import {stockPools} from '../src/xlayer-stock.mjs';
import {paidResearch} from '../src/base-paid-research.mjs';

test('unlisted and unavailable X Layer pools never trigger a payment challenge',async()=>{
 const request={service:'xlayer.stock.research',requestId:'lookup',input:{query:'Tesla'}};
 for(const [payload,status] of [
  [{code:'0',data:[{assetInfo:[]}]},422],
  [{code:'50001',data:[]},503],
  [{code:'0',data:[{assetInfo:[{stockSymbol:'COIN'}]}]},503]
 ]){
  const xlayerLookup=query=>stockPools(query,async url=>{
   assert.equal(new URL(url).searchParams.get('stockCode'),'TSLA');
   return Response.json(payload);
  });
  const reply=await paidResearch(request,null,{runtime:{},xlayerLookup,launchLookup:async()=>({xLayer:'coming_soon',routes:[]})});
  assert.equal(reply.status,status);
  assert.equal(reply.headers['PAYMENT-REQUIRED'],undefined);
 }
});
import {issuerStock} from '../src/xlayer-issuer.mjs';
import {xLayerTarget} from '../src/xlayer-stock.mjs';
import {encodeAbiParameters} from 'viem';

const stock={symbol:'NFLXx',underlyingSymbol:'NFLX',name:'Netflix xStock',deployments:[{chainId:196,address:'0x'+'a'.repeat(40)}]};
function source({asset=stock,chain='0xc4',symbol='NFLXx',venueOK=true}={}){
 return async(url,opts)=>{
  if(url.includes('api.xstocks.fi')){
   const page=Number(new URL(url).searchParams.get('page'));
   return Response.json({nodes:page===1?[asset]:[],page:{currentPage:page,hasNextPage:page===0}});
  }
  if(url.includes('web3.okx.com'))return Response.json({code:'0',data:[{assetInfo:[]}]},{status:venueOK?200:503});
  const {method}=JSON.parse(opts.body);
  return Response.json({result:{eth_chainId:chain,eth_blockNumber:'0x10',eth_call:encodeAbiParameters([{type:'string'}],[symbol])}[method]});
 };
}
test('issuer deployments qualify independently of venue coverage across paginated company and ticker lookups',async()=>{
 for(const query of ['Netflix','NFLX','NFLXx','XNFLX']){
  const r=await xLayerTarget(query,source());
  assert.equal(r.symbol,'NFLX');assert.equal(r.issuerIdentity.blockNumber,'16');assert.deepEqual(r.pools,[]);
 }
 assert.equal((await xLayerTarget('NFLX',source({venueOK:false}))).poolStatus,'unavailable');
});
test('wrong deployment, wrong chain and mismatched contract symbols cannot verify a stock',async()=>{
 assert.equal((await issuerStock('NFLX',source({asset:{...stock,deployments:[{...stock.deployments[0],chainId:1}]}}))).identity,null);
 for(const options of [{chain:'0x1'},{symbol:'FAKE'}])await assert.rejects(xLayerTarget('NFLX',source(options)));
});
test('an exact issuer record skips pagination and still checks the chain and deployed symbol',async()=>{
 const calls=[];
 const read=async(url,opts)=>{
  if(url.endsWith('/NFLXx'))return Response.json(stock);
  assert.ok(!url.includes('api.xstocks.fi'));
  calls.push(JSON.parse(opts.body).method);
  return source()(url,opts);
 };
 assert.equal((await issuerStock('NFLX',read)).identity.blockNumber,'16');
 assert.deepEqual(calls.sort(),['eth_blockNumber','eth_call','eth_chainId']);
});
