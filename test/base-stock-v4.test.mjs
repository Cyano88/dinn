import test from 'node:test';
import assert from 'node:assert/strict';
import {baseV4PoolId} from '../src/base-stock-v4.mjs';
import {robinhoodRouteQuote,prepareRobinhoodRoute} from '../src/robinhood-routes.mjs';
import {walletTransaction} from '../src/robinhood-wallet-call.mjs';

const account='0x'+'1'.repeat(40),token='0x8f277eee1254d3319355e76a8c6594e7d3e2eba3',stock='0xb20000000000000000000016e38fd364d271ba28',blockHash='0x'+'b'.repeat(64);
const poolKey={currency0:token,currency1:stock,fee:8388608,tickSpacing:200,hooks:'0xBDF938149ac6a781F94FAa0ed45E6A0e984c6544'},poolId=baseV4PoolId(poolKey),now=Date.now();
const report={address:token,classification:'verified-bankr-stock-paired-token',verification:{status:'verified',blockHash,computedPoolId:poolId},checkedAt:new Date(now).toISOString(),launch:{symbol:'NTA',poolId,poolKey,pairedStock:{address:stock,symbol:'NVDA'}},stock:{address:stock,symbol:'NVDA'},market:{matchesBankrPool:true}};
function fixture(){return {getChainId:async()=>8453,getBlock:async()=>({number:123n,hash:blockHash,timestamp:BigInt(Math.floor(now/1000))}),readContract:async({address,functionName})=>functionName==='symbol'?(address===stock?'NVDA':'NTA'):functionName==='decimals'?(address===stock?8:18):0,simulateContract:async({address,functionName,args})=>{assert.equal(address,'0xE1A6C5803e3c44368b171BD680c7D32dfc92CA47');assert.equal(functionName,'quoteExactInputSingle');assert.equal(args[0].poolKey,poolKey);return {result:[700230599727128292141976176n,150000n]};}};}

test('verified Bankr pool identifiers are recomputed from the full V4 pool key',()=>{
 assert.equal(poolId,'0x5f4a94686077316c8aed8a3e7b85fdec8f4f68c52dac06bbc04fdc7daff38f26');
 assert.notEqual(baseV4PoolId({...poolKey,fee:3000}),poolId);
});

test('Base stock-pair trade requests return a read-only pool estimate and never wallet calldata',async()=>{
 const input={kind:'swap',chainId:8453,account,asset:stock,outputAsset:token,amount:'1'},options={client:fixture(),now:()=>now,baseResearchResult:report};
 const quote=await robinhoodRouteQuote(input,options);
 assert.equal(quote.provider,'Uniswap V4 pool reference');
 assert.equal(quote.expectedAmount,'700230599.727128292141976176');
 assert.equal(quote.minimumAmount,'693228293.729857009220556414');
 assert.equal(quote.executionEnabled,false);
 assert.equal(quote.transaction,undefined);
 assert.equal(quote.executionProvider,undefined);
 const disconnectedQuote=await robinhoodRouteQuote({...input,account:undefined},options);
 assert.equal(disconnectedQuote.expectedAmount,quote.expectedAmount);
 await assert.rejects(()=>prepareRobinhoodRoute(input,options),/Bankr must perform its location check/);
 assert.throws(()=>walletTransaction({kind:'swap',chainId:8453,account,recipient:account,asset:{address:stock,decimals:8},outputAsset:{address:token,decimals:18},amount:'1',requestId:'0x'+'a'.repeat(64),depositAddress:account,destinationChainId:8453,baseStockPair:{tokenAddress:token,stockAddress:stock,bankrPoolId:poolId,locationConfirmedByUser:true},bankrLocationConfirmed:true}),/Unsupported source asset/);
});

test('an unverified or different Bankr stock pair cannot receive a quote',async()=>{
 const input={kind:'swap',chainId:8453,account,asset:stock,outputAsset:'0x'+'7'.repeat(40),amount:'1'};
 await assert.rejects(()=>robinhoodRouteQuote(input,{client:fixture(),now:()=>now,baseResearchResult:report,baseResearch:async()=>null}),/exact Bankr token and stock pair/);
});
