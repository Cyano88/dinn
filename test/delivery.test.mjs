import test from 'node:test';import assert from 'node:assert/strict';import {privateKeyToAccount} from 'viem/accounts';import {validateSignedDelivery,interpretDelivery,classifyWalletCode} from '../src/delivery-policy.mjs';import {trackMontraDelivery,walletRouteCheck} from '../src/delivery-status.mjs';
const account=privateKeyToAccount('0x'+'1'.repeat(64)),to='0x2222222222222222222222222222222222222222',hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64);
const expected={from:account.address,to,data:'0x',value:'0x1',chainId:99901};
const block={number:10n,hash:blockHash,timestamp:BigInt(Math.floor(Date.now()/1000))};
const client=()=>({getChainId:async()=>99901,getBlock:async()=>block,getBlockNumber:async()=>11n,getTransactionReceipt:async()=>({transactionHash:hash,status:'success',blockNumber:10n,blockHash}),getTransaction:async()=>({hash,from:account.address,to,input:'0x',value:1n,chainId:99901})});
test('signed transaction matches wallet, network, intent, nonce and fees before use',async()=>{
 const review={...expected,nonce:0,gas:'0x5208',maxFeePerGas:'0x3b9aca00',maxPriorityFeePerGas:'0x1'};
 const raw=await account.signTransaction({type:'eip1559',chainId:99901,to,data:'0x',value:1n,nonce:0,gas:21000n,maxFeePerGas:1000000000n,maxPriorityFeePerGas:1n});
 assert.equal((await validateSignedDelivery(raw,review)).from,account.address.toLowerCase());
 for(const altered of [{to:account.address},{from:to},{chainId:99801},{value:'0x2'},{nonce:1},{gas:'0x5209'},{data:'0x01'},{maxFeePerGas:'0x2'},{maxPriorityFeePerGas:'0x2'}])await assert.rejects(validateSignedDelivery(raw,{...review,...altered}));
 const legacy=await account.signTransaction({chainId:99901,to,value:1n,nonce:0,gas:21000n,gasPrice:1000000000n});await assert.rejects(validateSignedDelivery(legacy,review));
});
test('relayer reports never prove receipt success or permit blind retries',()=>{
 for(const status of [null,{status:'queued'},{status:'posted',l1Hash:hash},{status:'landed'},{status:'failed',code:'not-posted'},{status:'dropped',code:'lost'},{status:'dropped',code:'nonce-used'}]){const r=interpretDelivery(status);assert.equal(r.receiptVerified,false);assert.equal(r.retryAllowed,false);assert.notEqual(r.state,'confirmed');}
 assert.equal(interpretDelivery({status:'failed',code:'not-posted'}).state,'unknown');
});
test('canonical matching receipts override relayer status; wrong calldata and reorgs fail',async()=>{
 let c=client();assert.equal((await trackMontraDelivery({hash,expected},{elysium:c})).state,'confirmed');
 await assert.rejects(trackMontraDelivery({hash,expected:{...expected,data:'0x01'}},{elysium:c}),/match/);
 c.getBlockNumber=async()=>10n;assert.equal((await trackMontraDelivery({hash,expected},{elysium:c})).state,'confirming');
 c.getTransactionReceipt=async()=>({transactionHash:hash,status:'reverted',blockNumber:10n,blockHash});assert.equal((await trackMontraDelivery({hash,expected},{elysium:c})).state,'reverted');
 c.getBlock=async()=>({...block,hash:'0x'+'c'.repeat(64)});await assert.rejects(trackMontraDelivery({hash,expected},{elysium:c}),/canonical/);
});
test('pending tracking preserves ambiguous status and distinguishes provider failure',async()=>{
 const c=client();c.getTransactionReceipt=async()=>{throw {name:'TransactionReceiptNotFoundError'};};c.request=async()=>({status:'posted',l1Hash:hash});assert.equal((await trackMontraDelivery({hash,expected},{elysium:c})).state,'awaiting-elysium');c.request=async()=>null;assert.equal((await trackMontraDelivery({hash,expected},{elysium:c})).state,'unknown');c.getTransactionReceipt=async()=>{throw Error('offline');};await assert.rejects(trackMontraDelivery({hash,expected},{elysium:c}),/offline/);
});
test('bridge check distinguishes delegated HyperEVM account from Montra sender compatibility',async()=>{
 const e={...client(),getCode:async()=>'0xef0100'+to.slice(2),getBalance:async()=>0n};const h={...e,getChainId:async()=>999,readContract:async({functionName})=>({bridge:to,rollup:to,chainId:99901n,paused:false,confirmPeriodBlocks:483840n}[functionName])};
 const fetchImpl=async()=>({ok:true,json:async()=>({chainId:99901,sends:{enabled:true,reason:null}})});
 const r=await walletRouteCheck({account:account.address},{elysium:e,hyper:h,fetchImpl});assert.equal(r.bridge.sameAddressDepositCompatible,false);assert.equal(r.submission.accountCompatible,true);assert.equal(r.submission.walletSigningVerified,false);assert.equal(r.submission.liveExecutionEnabled,false);
 h.getCode=async()=>'0x';assert.equal((await walletRouteCheck({account:account.address},{elysium:e,hyper:h,fetchImpl})).bridge.sameAddressDepositCompatible,true);assert.equal(classifyWalletCode('0x1234'),'contract');
 h.readContract=async({functionName})=>({bridge:to,rollup:to,chainId:99801n}[functionName]);await assert.rejects(walletRouteCheck({account:account.address},{elysium:e,hyper:h,fetchImpl}),/inbox|Inbox/);
});
