import assert from 'node:assert/strict';
import test from 'node:test';
import {bankrDirectoryMarket} from '../src/bankr-directory-market.mjs';

const item={token:'0xabc',curve:'0x123',pairToken:'0xdef'};
const bankr={chain:'base',tokenAddress:item.token,poolId:item.curve,quoteAddress:item.pairToken,market:{marketCapUsd:80}};
const dex={chainId:'base',pairAddress:item.curve,baseToken:{address:item.token},quoteToken:{address:item.pairToken},fdv:120,marketCap:100};
const read=(index,pool)=>bankrDirectoryMarket(item,async url=>Response.json(url.includes('api.bankr.bot')?index:{pairs:[pool]}));
test('directory prefers the matched Bankr cap and independently reports pool FDV',async()=>{
 assert.deepEqual(await read(bankr,dex),{liquidityUsd:null,change24h:null,volume24hUsd:null,chartPool:item.curve,marketCapUsd:'80',marketCapSource:'Bankr',fdvUsd:'120',fdvSource:'DEX Screener'});
});
test('unpriced and unrelated Bankr launches fall back only to a matching pool',async()=>{
 for(const index of [{...bankr,market:{marketCapUsd:null,volume24hUsd:0}},{...bankr,poolId:'other'}]){
  assert.equal((await read(index,dex)).marketCapSource,'DEX Screener');
  assert.equal((await read(index,{...dex,pairAddress:'other'})).marketCapUsd,null);
 }
});
