import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,encodeAbiParameters,encodeEventTopics,parseAbi,parseAbiItem} from 'viem';
import {PONS_FACTORY} from '../src/pons.mjs';
import {ZERO,walletTransaction,validatedWalletReview} from '../src/robinhood-wallet-call.mjs';
import {preparePonsTrade,ponsTradeReceipt,quotePonsBuy,quotePonsSell} from '../src/pons-trading.mjs';

const account='0x1111111111111111111111111111111111111111';
const token='0x2222222222222222222222222222222222222222';
const curve='0x3333333333333333333333333333333333333333';
const pair='0x4444444444444444444444444444444444444444';
const blockHash='0x'+'a'.repeat(64);
const txHash='0x'+'b'.repeat(64);
const now=()=>1_800_000_000_000;
const launch={token,curve,deployer:account,creatorFeeRecipient:account,pairToken:ZERO,graduationThreshold:1n,poolFee:0,tickSpacing:1,creatorTaxBps:200,buybackEnabled:false,phase:0,sweptQuote:0n,sweptTokens:0n,sweptAt:0n,exists:true};
function mockClient({customPair=false,allowance=10n**30n,phase=0}={}){
 const selectedLaunch={...launch,phase,...(customPair?{pairToken:pair}:{})};
 const block={number:100n,hash:blockHash,timestamp:BigInt(Math.floor(now()/1000))};
 return {getChainId:async()=>4663,getBlock:async()=>block,getCode:async({address})=>address.toLowerCase()===PONS_FACTORY.toLowerCase()||address.toLowerCase()===curve.toLowerCase()?'0x1234':'0x1234',getBalance:async()=>10n**20n,estimateGas:async()=>120000n,getGasPrice:async()=>1n,call:async()=>({data:'0x'}),readContract:async({address,functionName})=>{
  if(functionName==='getLaunchedToken')return selectedLaunch;
  if(functionName==='symbol')return address.toLowerCase()===token.toLowerCase()?'TOK':'NVDA';
  if(functionName==='decimals')return customPair&&address.toLowerCase()===pair.toLowerCase()?6:18;
  if(functionName==='getReserves')return [10n**18n,1000n*10n**18n];
  if(functionName==='sellableTokens')return 500n*10n**18n;
  if(functionName==='readyToGraduate')return false;
  if(functionName==='feeBps')return 100n;
  if(functionName==='creatorTaxBps')return 200n;
  if(functionName==='currentSnipeTaxBps')return 0n;
  if(functionName==='balanceOf')return 10n**30n;
  if(functionName==='allowance')return allowance;
  throw Error('Unexpected read '+functionName);
 }};
}
function reviewFor(kind='buy',native=true){const outputDecimals=kind==='buy'?18:native?18:6,outputAmountRaw=(90n*10n**BigInt(outputDecimals)).toString(),minimumOutputRaw=(90n*99n*10n**BigInt(outputDecimals)/100n).toString();return {kind:kind==='buy'?'pons-buy':'pons-sell',tradeAdapter:'pons-v2',tradeSide:kind,chainId:4663,account,recipient:account,curve,tokenAddress:token,curveToken:token,pairToken:native?ZERO:pair,nativeQuote:native,asset:kind==='buy'?{address:native?ZERO:pair,symbol:native?'ETH':'NVDA',decimals:native?18:6}:{address:token,symbol:'TOK',decimals:18},outputAsset:kind==='buy'?{address:token,symbol:'TOK',decimals:18}:{address:native?ZERO:pair,symbol:native?'ETH':'NVDA',decimals:native?18:6},amount:'0.1',amountRaw:kind==='buy'&&!native?'100000': '100000000000000000',outputAmountRaw,outputAmount:'90',minimumOutputRaw,minimumOutput:'89.1',slippageBps:100,baseFeeBps:'100',creatorTaxBps:'200',openingTaxBps:'0',blockNumber:'100',blockHash};}

test('Pons curve buy quote includes fees and the recipient-specific opening tax',()=>{
 const q=quotePonsBuy({quoteIn:100000n,quoteReserve:1000000n,tokenReserve:10000000n,sellableTokens:500000n,feeBps:100n,creatorTaxBps:500n,snipeTaxBps:9500n});
 assert.equal(q.snipeBps,9300n);assert.equal(q.fee,1000n);assert.equal(q.tax,5000n);assert.ok(q.tokensOut>0n);assert.equal(q.refund,0n);
});
test('Pons curve buy quote clamps near graduation and reports the unused amount',()=>{
 const q=quotePonsBuy({quoteIn:100000000n,quoteReserve:1000000n,tokenReserve:10000000n,sellableTokens:500000n,feeBps:100n,creatorTaxBps:200n,snipeTaxBps:0n});
 assert.equal(q.tokensOut,500000n);assert.ok(q.spent<100000000n);assert.equal(q.refund,100000000n-q.spent);
});
test('Pons curve sell quote charges fees on proceeds, not on token input',()=>{
 const q=quotePonsSell({tokensIn:1000000n,quoteReserve:1000000n,tokenReserve:10000000n,feeBps:100n,creatorTaxBps:500n});
 assert.equal(q.gross,90909n);assert.equal(q.fee,909n);assert.equal(q.tax,4545n);assert.equal(q.quoteOut,85455n);
});
test('Pons wallet review encodes a bounded buy or sell for the connected wallet',()=>{
 const abi=parseAbi(['function buy(uint256 quoteIn,uint256 minTokensOut,address recipient) payable returns(uint256 tokensOut)','function sell(uint256 tokensIn,uint256 minQuoteOut,address recipient) returns(uint256 quoteOut)']);
 for(const kind of ['buy','sell']){const q=reviewFor(kind),tx=walletTransaction(q),decoded=decodeFunctionData({abi,data:tx.data});assert.equal(tx.to,curve);assert.equal(decoded.functionName,kind);assert.equal(decoded.args[0],BigInt(q.amountRaw));assert.equal(decoded.args[1],BigInt(q.minimumOutputRaw));assert.equal(decoded.args[2],account);assert.equal(tx.value,kind==='buy'?'0x16345785d8a0000':'0x0');}
});
test('Robinhood-pair buy returns an exact-spend approval review before any trade',async()=>{
 const client=mockClient({customPair:true,allowance:0n});const r=await preparePonsTrade({kind:'buy',account,token,amount:'0.5'},{client,now});
 assert.equal(r.kind,'pons-approval');assert.equal(r.asset.symbol,'NVDA');assert.equal(r.amountRaw,'500000');assert.equal(r.spender,curve);assert.equal(r.simulated,true);assert.deepEqual(validatedWalletReview(r,now()),r.transaction);assert.equal(r.transaction.to,pair);const decoded=decodeFunctionData({abi:parseAbi(['function approve(address spender,uint256 amount) returns(bool)']),data:r.transaction.data});assert.equal(decoded.args[0],curve);assert.equal(decoded.args[1],500000n);
});
test('Pons sell returns an exact token approval review when curve allowance is missing',async()=>{
 const client=mockClient({allowance:0n}),r=await preparePonsTrade({kind:'sell',account,token,amount:'2'},{client,now});assert.equal(r.kind,'pons-approval');assert.equal(r.tradeSide,'sell');assert.equal(r.asset.address,token);assert.equal(r.pairToken,token);assert.equal(r.amountRaw,'2000000000000000000');assert.deepEqual(validatedWalletReview(r,now()),r.transaction);assert.equal(r.transaction.to,token);const decoded=decodeFunctionData({abi:parseAbi(['function approve(address spender,uint256 amount) returns(bool)']),data:r.transaction.data});assert.equal(decoded.args[0],curve);assert.equal(decoded.args[1],2000000000000000000n);
});
test('native Pons curve buy review quotes fees, minimum receive, and simulates without broadcasting',async()=>{
 const client=mockClient();const r=await preparePonsTrade({kind:'buy',account,token,amount:'0.1'},{client,now});
 assert.equal(r.kind,'pons-buy');assert.equal(r.venue,'bonding-curve');assert.equal(r.asset.symbol,'ETH');assert.equal(r.outputAsset.symbol,'TOK');assert.equal(r.slippageBps,100);assert.equal(r.simulated,true);assert.deepEqual(validatedWalletReview(r,now()),r.transaction);assert.ok(BigInt(r.minimumOutputRaw)>0n);assert.equal(r.transaction.to,curve);assert.ok(BigInt(r.transaction.value)>0n);
});
test('Pons trade receipt requires the matching curve event and minimum receive',async()=>{
 const review=reviewFor('buy'),expected=walletTransaction(review),event=parseAbiItem('event CurveBuy(address indexed buyer,address indexed recipient,uint256 quoteIn,uint256 tokensOut,uint256 fee,uint256 tax)'),topics=encodeEventTopics({abi:[event],eventName:'CurveBuy',args:{buyer:account,recipient:account}}),data=encodeAbiParameters([{type:'uint256'},{type:'uint256'},{type:'uint256'},{type:'uint256'}],[BigInt(review.amountRaw),BigInt(review.outputAmountRaw),100n,200n]);
 const latest={number:102n,hash:blockHash,timestamp:BigInt(Math.floor(now()/1000))},client={getChainId:async()=>4663,getBlock:async({blockNumber}={})=>blockNumber===99n?{...latest,hash:blockHash}:latest,getTransaction:async()=>({from:account,to:expected.to,input:expected.data,value:BigInt(expected.value),blockHash}),getTransactionReceipt:async()=>({transactionHash:txHash,blockHash,blockNumber:99n,status:'success',logs:[{address:curve,topics,data,removed:false}]})};
 const result=await ponsTradeReceipt({hash:txHash,review},{client,now});assert.equal(result.state,'verified');assert.equal(result.side,'buy');assert.equal(result.amount,'90');
});
