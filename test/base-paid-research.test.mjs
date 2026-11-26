import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {encodePaymentSignatureHeader} from '@x402/core/http';
import {encodeEventTopics,encodeAbiParameters,parseAbiItem} from 'viem';
import {paidResearch} from '../src/base-paid-research.mjs';

const payer='0x'+'1'.repeat(40),payTo='0x'+'2'.repeat(40),tx='0x'+'3'.repeat(64);
const usdc='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',network='eip155:8453';
const resource={url:'https://example.test/api/paid/research'};
const terms={scheme:'exact',network,asset:usdc,amount:'100000',payTo,maxTimeoutSeconds:180,extra:{}};
const services=[
 ['xlayer.stock.research',{query:'Tesla'},{query:'Tesla',symbol:'TSLA',chainId:196,pools:[],issuerIdentity:{status:'verified'}}],
 ['stock.launch-idea',{chainId:8453},{outcome:'wait',chainId:8453}],
 ['pons.stock.research',{query:'NVDA'},{classification:'verified-robinhood-stock',stock:{symbol:'NVDA'}}],
 ['pons.stock-paired.research',{address:payer},{address:payer,classification:'verified-pons-stock-pair',ponsState:{pair:{address:payTo}},stock:{address:payTo}}],
 ['base.stock.research',{query:'NVIDIA'},{address:payTo,identity:{status:'matched',symbol:'NVDAc'}}],
 ['base.stock-paired.research',{address:payer},{classification:'verified-bankr-stock-paired-token'}],
 ['base.stock-paired.discover',{metric:'liquidity'},{candidates:[]}],
 ['token.research',{address:payer},{protocol:{name:'Pons v2'}}]
];
function signed(id,target=resource,accepted=terms){
 return encodePaymentSignatureHeader({x402Version:2,resource:target,accepted,payload:{
  signature:'0x'+id.toString(16).padStart(130,'0'),authorization:{from:payer,to:payTo,value:'100000',validAfter:'0',validBefore:'9999999999',nonce:'0x'+id.toString(16).padStart(64,'0')}
 }});
}
test('direct payment endpoint is disabled without merchant configuration',async()=>{
 assert.equal((await paidResearch({},null,{env:{}})).status,503);
});
test('all supported report types use the same settlement and recovery path',async()=>{
 const db=new PGlite();
 await db.query('CREATE TABLE dinn_base_research_payments(payer text,request_id text,nonce text,proof text,request_hash text,start_block bigint,valid_before bigint,report jsonb,receipt jsonb,PRIMARY KEY(payer,request_id),UNIQUE(payer,nonce))');
 const receipt={payer,network,success:true,transaction:tx};
 let settlements=0,reportCalls=0,uncertain=false;
 const client={query:async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows};},release:()=>{}};
 const server={findMatchingRequirements:()=>terms,validateExtensions:()=>({valid:true}),verifyPayment:async()=>({isValid:true,payer}),settlePayment:async()=>{
  settlements++;if(uncertain)throw Error('Lost settlement response');return receipt;
 }};
 const runtime={db:{connect:async()=>client},resource,requirements:terms,challenge:{x402Version:2,resource,accepts:[terms]},server,
  chain:{getBlockNumber:async()=>50n,getLogs:async()=>[{transactionHash:tx}],getTransactionReceipt:async()=>({status:'success',logs:[{
   address:usdc,topics:encodeEventTopics({abi:[parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)')],args:{from:payer,to:payTo}}),
   data:encodeAbiParameters([{type:'uint256'}],[100000n])}]})}};
 const deps={runtime,xlayerLookup:async()=>({symbol:'TSLA',pools:[],issuerIdentity:{status:'verified'}}),lookup:async()=>({sources:{coinbase:{status:'available'}},stocks:[{address:payTo,symbol:'NVDAc',name:'NVIDIA Corporation'}]}),
  report:async(req,{paidResearch:paid})=>{assert.equal(paid,true);reportCalls++;return {status:'completed',service:req.service,result:services.find(s=>s[0]===req.service)[2]};}};
 try{
  for(const [i,[service,input]] of services.entries()){
   const req={requestId:'order-'+i,service,input};
   const free=await paidResearch(req,null,deps);assert.equal(free.status,402);assert.ok(free.headers['PAYMENT-REQUIRED']);
   const done=await paidResearch(req,signed(i+1),deps);assert.equal(done.status,200);assert.equal(done.body.payment.transaction,tx);
   assert.deepEqual((await paidResearch(req,signed(i+1),deps)).body,done.body);
   assert.equal((await paidResearch(req,signed(i+10),deps)).status,409);
   assert.equal((await paidResearch({...req,requestId:'different'},signed(i+1),deps)).status,409);
  }
  assert.equal(settlements,services.length);assert.equal(reportCalls,services.length);
  const req={requestId:'recover',service:'base.stock.research',input:{query:'NVDAc'}};
  assert.equal((await paidResearch({...req,input:JSON.stringify(req.input)},null,deps)).status,402);
  assert.equal((await paidResearch({...req,input:'null'},null,deps)).status,400);
  assert.equal((await paidResearch({...req,input:{query:'UNKNOWN'}},null,deps)).status,422);
  assert.equal((await paidResearch({...req,service:'swap.quote'},null,deps)).status,400);
  assert.equal((await paidResearch(req,'invalid',deps)).status,400);
  assert.equal((await paidResearch(req,signed(20),{...deps,report:async()=>({status:'completed',result:{identity:{status:'mismatch'}}})})).status,422);
  assert.equal((await paidResearch(req,signed(20),{...deps,report:async()=>({status:'completed',result:{address:payer,identity:{status:'matched'}}})})).status,422);
  const tesla={...req,input:{query:'Tesla'}};
  const stock={address:payTo,name:'Tesla, Inc.',symbol:'TSLAc'};
  const lookup=stocks=>async()=>({sources:{coinbase:{status:'available'}},stocks});
  assert.equal((await paidResearch(tesla,null,{...deps,lookup:lookup([stock])})).status,402);
  assert.equal((await paidResearch(tesla,null,{...deps,lookup:lookup([stock,{...stock,address:payer}])})).status,422);
  let notifyEntered,finish;
  const entered=new Promise(resolve=>{notifyEntered=resolve;});
  const waiting=new Promise(resolve=>{finish=resolve;});
  let held=false;
  const concurrentClient={...client,query:async(sql,args)=>{
   // Each HTTP request uses a different Postgres session. PGlite uses one.
   if(sql.startsWith('SELECT pg_try_advisory_lock')){const available=!held;held=true;return {rows:[{locked:available}]};}
   if(sql.startsWith('SELECT pg_advisory_unlock')){held=false;return {rows:[]};}
   return client.query(sql,args);
  }};
  const parallel={...deps,runtime:{...runtime,db:{connect:async()=>concurrentClient}},report:async(...args)=>{
   notifyEntered();await waiting;return deps.report(...args);
  }};
  const simultaneous={...req,requestId:'simultaneous'};
  const first=paidResearch(simultaneous,signed(30),parallel);
  await entered;
  try{assert.equal((await paidResearch(simultaneous,signed(30),parallel)).status,409);}
  finally{finish();}
  assert.equal((await first).status,200);
  uncertain=true;
  await assert.rejects(paidResearch(req,signed(20),deps),/Lost settlement response/);
  assert.equal((await paidResearch(req,signed(20),deps)).status,200);
  assert.equal(settlements,services.length+2);assert.equal(reportCalls,services.length+2);
  uncertain=false;
  const queryRequest={service:'xlayer.stock.research',requestId:'query-replay',input:{query:'Tesla'}};
  const queryUrl='/api/paid/research?'+new URLSearchParams({...queryRequest,input:JSON.stringify(queryRequest.input)});
  const queryDeps={...deps,queryUrl,runtime:{...runtime,server:{...server,
   createPaymentRequiredResponse:async(accepts,resource)=>({x402Version:2,resource,accepts})}}};
  const challenge=await paidResearch(queryRequest,null,queryDeps);
  assert.equal(challenge.status,402);
  assert.equal(challenge.body.resource.url,'https://example.test'+queryUrl);
  assert.equal((await paidResearch(queryRequest,signed(41),queryDeps)).status,400);
  const authorization=signed(41,challenge.body.resource);
  const firstGet=await paidResearch(queryRequest,authorization,queryDeps);
  assert.equal(firstGet.status,200);
  assert.deepEqual((await paidResearch(queryRequest,authorization,queryDeps)).body,firstGet.body);
  assert.equal(settlements,services.length+3);
  // Same buyer, nonce and request ID on another chain have a separate settlement record.
  await db.query('CREATE TABLE dinn_okx_research_payments (LIKE dinn_base_research_payments INCLUDING ALL)');
  const okxTerms={...terms,network:'eip155:196',asset:'0x779ded0c9e1022225f8e0630b35a9b54be713736'};
  const okxPath=queryUrl.replace('/api/paid/', '/api/okx/');
  const okxResource={url:'https://example.test/api/okx/research'};
  const okxServer={...queryDeps.runtime.server,findMatchingRequirements:(_,p)=>p.accepted.network===okxTerms.network?okxTerms:null,
   settlePayment:async()=>({status:'pending'})};
  const okxChain={...runtime.chain,getBlockNumber:async options=>options?550n:50n,getLogs:async({address,fromBlock,toBlock})=>{
   assert.ok(toBlock-fromBlock<100n);
   assert.equal(address,okxTerms.asset);return [{transactionHash:tx}];
  },getTransactionReceipt:async()=>{
   const receipt=await runtime.chain.getTransactionReceipt();
   return {...receipt,logs:receipt.logs.map(log=>({...log,address:okxTerms.asset}))};
  }};
  const okxDeps={...queryDeps,okx:true,queryUrl:okxPath,runtime:{...runtime,server:okxServer,resource:okxResource,requirements:okxTerms,chain:okxChain}};
  const offer=await paidResearch(queryRequest,null,okxDeps);
  assert.equal(offer.body.accepts[0].asset,okxTerms.asset);
  const okxAuth=signed(41,offer.body.resource,okxTerms);
  assert.equal((await paidResearch(queryRequest,authorization,okxDeps)).status,400);
  assert.equal((await paidResearch(queryRequest,okxAuth,okxDeps)).body.payment.network,'eip155:196');
 }finally{await db.close();}
});

test('launch ideas clarify a missing or unsupported chain before requesting payment',async()=>{
 for(const chainId of [undefined,1,'8453']){
  const request={service:'stock.launch-idea',requestId:'choose-chain',input:{chainId}};
  const reply=await paidResearch(request,null,{runtime:{},report:()=>assert.fail()});
  assert.equal(reply.status,400);
  assert.match(JSON.stringify(reply.body),/8453 for Base or 4663 for Robinhood Chain/);
  assert.equal(reply.headers?.['PAYMENT-REQUIRED'],undefined);
 }
});
