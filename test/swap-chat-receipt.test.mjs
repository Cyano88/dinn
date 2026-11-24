import test from 'node:test';
import assert from 'node:assert/strict';
import {savedSwap,swapReceipt,isSwapStatusQuestion} from '../public/chat-state.js';
const account='0x'+'1'.repeat(40), hash='0x'+'2'.repeat(64), destinationHash='0x'+'3'.repeat(64);
const record={hash,review:{kind:'swap',account,chainId:8453,destinationChainId:8453}};
test('saved swap reads are scoped to the connected wallet and same-chain receipt',()=>{
 const storage={getItem:()=>JSON.stringify(record)};
 assert.equal(savedSwap(storage,account).hash,hash);
 assert.equal(savedSwap(storage,'0x'+'f'.repeat(40)),null);
 assert.equal(savedSwap({getItem:()=>'{bad'},account),null);
});
test('swap-status chat requests only read the recorded swap',()=>{
 for(const prompt of ['check my swap','did my swap go through?','swap receipt','show my latest swap','what is the status of my swap?']) assert.ok(isSwapStatusQuestion(prompt),prompt);
 for(const prompt of ['swap','swap 0.0001 ETH for USDC','approve','check my balance']) assert.equal(isSwapStatusQuestion(prompt),false);
});
test('chat confirmation needs matching source and verified destination, including after reload',()=>{
 assert.equal(swapReceipt(record).done,false);
 assert.equal(swapReceipt(record,{state:'verified',hash,stage:'source'}).done,false);
 assert.throws(()=>swapReceipt(record,{state:'verified',hash:destinationHash,stage:'destination',destinationHash}));
 const result=swapReceipt(record,{state:'verified',hash,stage:'destination',destinationHash});
 assert.ok(result.done);
 assert.ok(result.text.startsWith('\u2713 Swap completed on Base.'));
 assert.ok(result.text.includes('https://basescan.org/tx/'+destinationHash));
});
