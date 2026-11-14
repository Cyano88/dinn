import test from 'node:test';
import assert from 'node:assert/strict';
import {sendReviewedTransaction} from '../src/send-reviewed-transaction.mjs';

const tx={from:'0x0000000000000000000000000000000000000001',to:'0x0000000000000000000000000000000000000002',data:'0x1234',value:'0x0',chainId:'0x1237'};

test('embedded wallet sends only the reviewed transaction with its wallet UI suppressed per call',async()=>{
 let sent,options,providerCalled=false;
 const result=await sendReviewedTransaction({transaction:tx,address:tx.from,chainId:4663,source:'embedded',provider:{request(){providerCalled=true;}},sendTransaction:async(transaction,opts)=>{sent=transaction;options=opts;return {hash:'0x'+'1'.repeat(64)};}});
 assert.equal(result,'0x'+'1'.repeat(64));
 assert.equal(providerCalled,false);
 assert.deepEqual(sent,{from:tx.from,to:tx.to,data:tx.data,value:0n,chainId:4663});
 assert.deepEqual(options,{address:tx.from,uiOptions:{showWalletUIs:false}});
});

test('embedded wallet refuses a sender mismatch without signing',async()=>{
 let sent=false;
 await assert.rejects(sendReviewedTransaction({transaction:tx,address:'0x0000000000000000000000000000000000000003',chainId:4663,source:'embedded',sendTransaction:async()=>{sent=true;}}),/does not match/);
 assert.equal(sent,false);
});

test('external wallet keeps using its own provider approval flow',async()=>{
 let request;
 const result=await sendReviewedTransaction({transaction:tx,address:tx.from,chainId:4663,provider:{request:async value=>{request=value;return '0x'+'2'.repeat(64);}}});
 assert.equal(result,'0x'+'2'.repeat(64));
 assert.deepEqual(request,{method:'eth_sendTransaction',params:[tx]});
});
