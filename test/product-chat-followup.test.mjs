import test from 'node:test';
import assert from 'node:assert/strict';
import {streamProductChat} from '../src/product-chat.mjs';

test('why after a wallet balance explains the read without reviving launch context',async()=>{
 const history=[{role:'user',content:'What is my Base ETH balance?'},{role:'assistant',content:'Base ETH balance: 0.5 ETH. Checked at block 5.'}],events=[];
 for await(const event of streamProductChat({message:'Why?',walletAccount:'0x'+'1'.repeat(40),ponsBrief:{name:'Old launch'},ponsSetup:{active:true,field:'openingPurchase'},history},history,{env:{OG_API_KEY:'test',OG_MODEL:'test'},fetchImpl:async()=>{throw Error('inference must not be called');}}))events.push(event);
 const result=events.at(-1).result;
 assert.match(result.message,/I checked Base ETH because you asked for that balance/);
 assert.match(result.message,/Block 5/);
 assert.match(result.message,/No transaction was prepared or sent/);
 assert.deepEqual(result.actions,[]);
});
test('asking why a Base balance has that amount does not offer unsupported transaction history',async()=>{
 const history=[{role:'user',content:'What is my Base ETH balance?'},{role:'assistant',content:'Base ETH balance: 0.5 ETH. Checked at block 5.'}],events=[];
 for await(const event of streamProductChat({message:'Why is that amount?',walletAccount:'0x'+'1'.repeat(40),history},history,{env:{OG_API_KEY:'test',OG_MODEL:'test'},fetchImpl:async()=>{throw Error('inference must not be called');}}))events.push(event);
 const result=events.at(-1).result;
 assert.match(result.message,/Base/);
 assert.match(result.message,/cannot show where the funds came from/);
 assert.match(result.message,/do not have Base wallet transaction history/);
 assert.deepEqual(result.actions,[]);
});
