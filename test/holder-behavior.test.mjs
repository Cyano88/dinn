import test from 'node:test';
import assert from 'node:assert/strict';
import {researchHolderBehavior} from '../src/holder-behavior.mjs';

const token='0x'+'a'.repeat(40),quote='0x'+'b'.repeat(40);
const address=n=>'0x'+n.toString(16).padStart(40,'0');
const hash=n=>'0x'+n.toString(16).padStart(64,'0');
const checkedAt='2026-11-12T12:00:00.000Z';
const wallets=[address(1),address(2),address(3)];
const item=(from,to,asset,symbol,raw)=>({from:{hash:from},to:{hash:to},token:{address_hash:asset,symbol,decimals:'18'},total:{value:raw,decimals:'18'}});
const rows=wallets=>wallets.map(address=>({address,walletType:'externally-owned',infrastructure:false,sink:false}));
function readFor(walletList,{nativePair=false,truncatedTransfers=false,internalFailure=false}={}){
 const ownerByHash=new Map(walletList.map((wallet,index)=>[hash(index+1),wallet]));
 return async(path)=>{
  if(path.startsWith('addresses/')&&path.endsWith('/transactions')){
   const wallet=path.split('/')[1],index=walletList.indexOf(wallet);
   return {items:[{hash:hash(index+1),from:{hash:wallet},to:{is_contract:true},block_number:'100',timestamp:checkedAt,status:'ok',method:'swapExactTokensForTokens',value:nativePair?'1000000000000000000':'0'}],next_page_params:null};
  }
  if(path.startsWith('transactions/')&&path.endsWith('/token-transfers')){
   const transactionHash=path.split('/')[1],wallet=ownerByHash.get(transactionHash);
   const result={items:[item(quote,wallet,token,'TOK','1000000000000000000'),item(wallet,quote,quote,'PAIR','1000000000000000000')],next_page_params:null};
   if(truncatedTransfers)result.next_page_params={block_number:99,index:1,items_count:50};
   return result;
  }
  if(path.startsWith('transactions/')&&path.endsWith('/internal-transactions')){
   if(internalFailure)throw Error('internal lookup unavailable');
   return {items:[],next_page_params:null};
  }
  throw Error('Unexpected explorer route: '+path);
 };
}

test('continues to simulation only for complete buy flow across three distinct holders',async()=>{
 const report=await researchHolderBehavior({tokenAddress:token,tokenDecimals:18,rows:rows(wallets),blockNumber:'100',checkedAt,read:readFor(wallets)});
 assert.equal(report.status,'available');
 assert.equal(report.summary.nextStep,'continue_to_simulation');
 assert.equal(report.summary.targetTokenBuyWallets,3);
 assert.equal(report.summary.targetTokenBuyAmount,'3');
 assert.equal(report.summary.targetTokenSellAmount,'0');
});

test('recognizes an observed native ETH outflow paired with target-token receipt',async()=>{
 const [wallet]=wallets,read=readFor([wallet],{nativePair:true});
 const report=await researchHolderBehavior({tokenAddress:token,tokenDecimals:18,rows:rows([wallet]),blockNumber:'100',checkedAt,read});
 const trade=report.rows[0].recentSwaps[0];
 assert.equal(trade.classification,'two-sided swap candidate');
 assert.equal(trade.targetTokenAction,'target-token buy candidate');
 assert.deepEqual(trade.nativeFlows,[{symbol:'ETH',amount:'1',direction:'out'}]);
 assert.equal(report.summary.nextStep,'manual_review');
});

test('marks a swap history partial when transfer legs have another explorer page',async()=>{
 const [wallet]=wallets,read=readFor([wallet],{truncatedTransfers:true});
 const report=await researchHolderBehavior({tokenAddress:token,tokenDecimals:18,rows:rows([wallet]),blockNumber:'100',checkedAt,read});
 assert.equal(report.status,'partial');
 assert.equal(report.rows[0].status,'partial');
 assert.equal(report.summary.nextStep,'manual_review');
});

test('does not attribute contract holders or infer clean history after native lookup fails',async()=>{
 let calls=0;
 const contractReport=await researchHolderBehavior({tokenAddress:token,tokenDecimals:18,rows:[{...rows([wallets[0]])[0],walletType:'contract'}],blockNumber:'100',checkedAt,read:async()=>{calls++;throw Error('must not query a contract candidate');}});
 assert.equal(contractReport.status,'unavailable');
 assert.equal(calls,0);

 const wallet=wallets[0],read=async(path,options)=>{
  if(path.endsWith('/token-transfers'))return {items:[item(quote,wallet,token,'TOK','1000000000000000000')],next_page_params:null};
  if(path.endsWith('/internal-transactions'))throw Error('internal lookup unavailable');
  return readFor([wallet])(path,options);
 };
 const partial=await researchHolderBehavior({tokenAddress:token,tokenDecimals:18,rows:rows([wallet]),blockNumber:'100',checkedAt,read});
 assert.equal(partial.status,'partial');
 assert.equal(partial.summary.nextStep,'manual_review');
});
