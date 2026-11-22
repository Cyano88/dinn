import test from 'node:test';
import assert from 'node:assert/strict';
import {robinhoodStock} from '../src/robinhood-stock.mjs';
import {directProductIntent} from '../src/product-tools.mjs';
const address='0x'+'1'.repeat(40);
const asset={tokenSymbol:'NVDA',status:'ASSET_STATUS_ACTIVE',deployments:[{chainId:4663,contractAddress:address}]};
const registry=assets=>async()=>({ok:true,json:async()=>({assets})});
test('Robinhood stock resolution requires one active deployment on the right network',async()=>{
 assert.equal((await robinhoodStock('nvda',registry([asset]))).address,address);
 for(const rows of [[asset,asset],[{...asset,status:'inactive'}],[{...asset,deployments:[{chainId:8453,contractAddress:address}]}]]){
  await assert.rejects(robinhoodStock(address,registry(rows)),/unique active/);
 }
});
test('both Robinhood research prompts accept their follow-up without switching to Base',()=>{
 const ask=(text,previous='')=>directProductIntent(text,{history:[{role:'assistant',content:previous}]});
 assert.equal(ask('Research NVDA on Robinhood Chain').name,'research_pons_stock');
 assert.deepEqual(ask('NVDA',ask('Research a stock token on Robinhood Chain').message).args,{query:'NVDA'});
 assert.deepEqual(ask(address,ask('Research a stock-paired launch on Pons').message),{name:'research_pons_stock_pair',args:{address}});
 assert.equal(ask('Research NVDAc on Base').name,'research_base_stock');
});
