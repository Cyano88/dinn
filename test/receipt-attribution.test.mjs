import test from 'node:test';
import assert from 'node:assert/strict';
import {ponsReceiptText} from '../public/launch-activity.js';
const address='0x'+'1'.repeat(40);
const receipt={chainId:4663,state:'verified',hash:'0x'+'2'.repeat(64),token:address,curve:address};
test('verified Pons receipts attribute the launch and distinguish the creator tax from earnings',()=>{
 const text=ponsReceiptText(receipt,{creatorTaxBps:125,creatorFeeRecipient:address});
 assert.match(text,/with Dinn, powered by Pons/);assert.match(text,/1\.25%/);assert.ok(text.includes(address));
 assert.doesNotMatch(ponsReceiptText(receipt,{}),/0%/);
 assert.doesNotMatch(ponsReceiptText(receipt,{creatorTaxBps:0,creatorFeeRecipient:address}),/fee wallet/);
 assert.equal(ponsReceiptText({...receipt,state:'pending'},{}),'');
});
