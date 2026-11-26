import test from 'node:test';
import assert from 'node:assert/strict';
import {erc20Abi,encodeFunctionData} from 'viem';
import {bankrLaunchPreview,purchaseUsdEstimate} from '../src/bankr-launch-preview.mjs';
import {readOpeningPurchase} from '../public/bankr-launch-action.js';

const address=n=>'0x'+n.repeat(40);
const launcher=address('1'),quote=address('2'),factory=address('3'),treasury=address('4'),token=address('5');
const poolId='0x'+'a'.repeat(64);
const input={name:'Turkey',symbol:'TURKEY',ticker:'NFLX',launcher,startFdv:'100'};
function options({allow=false,balance=500000000n,wrong=false}={}){
 const out=500n*10n**18n;
 const client={status:async()=>({deployed:true}),contracts:()=>({settings:{padQuote:async()=>({launches:true})}}),
  publicClient:{request:async({method})=>{if(method==='eth_gasPrice')return '0x100';if(method==='eth_estimateGas')return '0xffff';throw Error(method);}},
  plan:async p=>{
   const amount=p.devBuy?.amount||0n;
   const data=encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[factory,wrong?amount+1n:amount]});
   const schedule={startPips:500,steadyPips:500,decaySecs:0};
   return {value:0n,factory,predictedToken:token,poolId,approvals:amount&&!allow?[{to:quote,from:launcher,value:0n,chainId:8453,data}]:[],
    params:{devBuyAmountIn:amount,devBuyMinOut:out*99n/100n,deadline:BigInt(Math.floor(Date.now()/1000)+300)},
    volumeSplit:{feePips:500,creatorPips:190},economics:{buy:schedule,sell:schedule},resolved:{padTerms:{payees:[treasury],steadySharesWad:[100000000000000000n],decay:{on:false}}}};
  },simulate:async p=>({token,poolId,devBuyOut:out,assumedApprovals:p.approvals.length>0}),
  buildLaunchTx:()=>({chainId:8453,from:launcher,to:factory,value:0n,data:'0x1234',gas:100000n})};
 return {client,readMarket:async()=>({checkedAt:new Date().toISOString(),pairs:[{tokenIsBase:true,baseToken:{address:quote},pairAddress:factory,tokenPriceUsd:60,volume1hUsd:100,liquidityUsd:2000}]}),readBalance:async()=>balance,env:{DINN_BANKR_BASE_LAUNCHPAD_ID:'6',DINN_BANKR_BASE_FEE_RECIPIENT:treasury},lookup:async()=>({stocks:[{address:quote,symbol:'NFLXc',decimals:8,bankrPairSupported:true}]})};
}
test('explicit purchase choice is required; decimals and wallet balance are checked',async()=>{
 for(const purchase of [undefined,'0','-1','0.000000001','20']){
  const r=await bankrLaunchPreview({...input,openingPurchase:purchase},options());assert.equal(r.status,'purchase');assert.equal(r.execution,undefined);
 }
});
test('the exact permission and launch reviews are mutually exclusive',async()=>{
 const r=await bankrLaunchPreview({...input,openingPurchase:'1.5'},options());
 assert.equal(r.status,'approval');assert.equal(r.execution,undefined);assert.equal(r.approval.to,quote);assert.match(r.message,/495 TURKEY/);
 await assert.rejects(()=>bankrLaunchPreview({...input,openingPurchase:'1.5'},options({wrong:true})),/Unexpected purchase permission/);
 const fresh=await bankrLaunchPreview({...input,openingPurchase:'1.5'},options({allow:true}));
 assert.ok(fresh.execution);assert.equal(fresh.approval,undefined);assert.match(fresh.message,/spends 1.5 NFLXc/);assert.doesNotMatch(fresh.message,/No opening purchase/);
 const skipped=await bankrLaunchPreview({...input,openingPurchase:'skip'},options());assert.ok(skipped.execution);assert.match(skipped.message,/No opening purchase/);
});
test('conversational amounts, explicit skip, and wrong-currency replies',()=>{
 for(const value of ['spend .5 NFLXc','buy with 0.5 NFLXc','0.5'])assert.equal(readOpeningPurchase(value,'NFLXc'),'0.5');
 assert.equal(readOpeningPurchase('skip purchase','NFLXc'),'skip');assert.equal(readOpeningPurchase('1 ETH','NFLXc'),null);
});
test('USD is shown on insufficient balance, permission and final launch reviews',async()=>{
 for(const opts of [{balance:0n},{allow:false},{allow:true}]){
  const r=await bankrLaunchPreview({...input,openingPurchase:'0.01'},options(opts));
  assert.match(r.message,/\$0\.60 USD/);assert.match(r.message,/DEX Screener/);assert.match(r.message,/UTC/);
 }
 const r=await bankrLaunchPreview({...input,openingPurchase:'0.01'},{...options({allow:true}),readMarket:async()=>{throw Error('offline');}});
 assert.match(r.message,/USD estimate unavailable/);assert.ok(r.execution);
});
test('stale, inactive and mismatched prices never become dollar estimates',()=>{
 const now=Date.now(), stock={address:quote},pool={pairAddress:factory,tokenIsBase:true,baseToken:{address:quote},liquidityUsd:42,volume1hUsd:13,tokenPriceUsd:60};
 for(const [age,changes] of [[130000,{}],[-1000,{}],[0,{baseToken:{address:factory}}],[0,{volume1hUsd:0}],[0,{tokenIsBase:false}],[0,{tokenPriceUsd:null}]]){
  assert.equal(purchaseUsdEstimate(stock,'0.01',{checkedAt:new Date(now-age).toISOString(),pairs:[{...pool,...changes}]},now),'USD estimate unavailable.');
 }
});
test('stock simulation calls approve and launch sequentially without submitting either',async()=>{
 const {firstBuySimulation}=await import('../src/bankr-first-buy-simulation.mjs');
 const {createPublicClient,custom}=await import('viem');
 const {base}=await import('viem/chains');
 const {BANKR_V4_LAUNCH_ADDRESSES}=await import('@bankr/launch-sdk');
 const actualFactory=BANKR_V4_LAUNCH_ADDRESSES.base.factory,methods=[];
 const rpc=createPublicClient({chain:base,transport:custom({request:async req=>{
  methods.push(req.method);
  if(req.method==='eth_call')return '0x'+'0'.repeat(64);
  assert.equal(req.method,'eth_simulateV1');
  const [approval,launch]=req.params[0].blockStateCalls[0].calls;
  assert.equal(approval.from,launcher);assert.equal(approval.to,quote);
  assert.equal(approval.data,encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[actualFactory,100n]}));
  assert.equal(launch.to,actualFactory);
  return [{calls:[{status:'0x1',returnData:'0x'+'1'.padStart(64,'0')},{status:'0x1',returnData:'0x1234',gasUsed:'0x123'}]}];
 }})});
 const c=await firstBuySimulation({publicClient:rpc},launcher,quote,100n);
 const result=await c.publicClient.request({method:'eth_call',params:[{from:launcher,to:actualFactory,data:'0x3dea0225',value:'0x0'},'latest']});
 assert.equal(result,'0x1234');assert.deepEqual(methods,['eth_call','eth_simulateV1']);
});
