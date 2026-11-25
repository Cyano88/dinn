import test from 'node:test';
import assert from 'node:assert/strict';
import {executeProductTool} from '../src/product-tools.mjs';
import {chatSwap} from '../src/chat-swap.mjs';
const account='0x'+'1'.repeat(40);
const start='swap all usdc on base to eth on base';
const ctx=(message,history=[])=>({message,history,walletAccount:account});
const open=(context,deps)=>executeProductTool('open_wallet_action',{kind:'swap'},context,deps);
test('all uses the input-token balance from the selected wallet and only returns a quote',async()=>{
 const result=await open(ctx(start),{
  balance:async input=>{assert.deepEqual(input,{account,chainId:8453,asset:'USDC'});return {balance:'17.123456'};},
  prepareRoute:async input=>{assert.equal(input.amount,'17.123456');assert.equal(input.account,account);return {kind:'swap',amount:input.amount,chainId:8453,asset:{symbol:'USDC'},outputAsset:{symbol:'ETH'},expectedAmount:'0.01',minimumAmount:'0.0099',networkFee:'0.000001'};}
 });
 assert.match(result.message,/review: swap 17\.123456 USDC on Base for ETH/);
 assert.equal(result.actions[0].id,'wallet_approve');
});
test('a failed balance check retains pair and network for a replacement amount',async()=>{
 const first=await open(ctx(start),{balance:async()=>{throw Error();}});
 assert.match(first.message,/how much USDC would you like to swap for ETH on Base/);
 const history=[{role:'user',content:start},{role:'assistant',content:first.message}];
 for(const text of ['17','17 usdc'])assert.deepEqual(chatSwap(ctx(text,history)),{asset:'USDC',outputAsset:'ETH',chainId:8453,amount:'17'});
 assert.equal(chatSwap(ctx('yes',history)),null);
 assert.equal(chatSwap(ctx('17',[...history,{role:'user',content:'something else'},{role:'assistant',content:'Hello'}])),null);
 assert.equal(chatSwap(ctx('17',[history[0],{role:'assistant',content:'To swap this, review: swap 1 USDC'}])),null);
});
test('all native ETH requests an amount so gas can be covered',async()=>{
 const result=await open(ctx('swap all ETH for USDC on Base'),{});
 assert.match(result.message,/leave some ETH/);assert.deepEqual(result.actions,[]);
});
