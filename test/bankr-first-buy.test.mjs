import test from 'node:test';
import assert from 'node:assert/strict';
import {erc20Abi,encodeFunctionData} from 'viem';
import {bankrLaunchPreview} from '../src/bankr-launch-preview.mjs';
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
 return {client,readBalance:async()=>balance,env:{DINN_BANKR_BASE_LAUNCHPAD_ID:'6',DINN_BANKR_BASE_FEE_RECIPIENT:treasury},lookup:async()=>({stocks:[{address:quote,symbol:'NFLXc',decimals:8,bankrPairSupported:true}]})};
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
