import {parseTransaction,recoverTransactionAddress,keccak256,isAddress} from 'viem';
const address=x=>typeof x==='string'&&isAddress(x,{strict:false})&&!/^0x0{40}$/i.test(x);
export function deliveryIntent(value){
 if(!value||value.chainId!==99901||!address(value.from)||!address(value.to)||!/^0x(?:[0-9a-f]{2})*$/i.test(value.data||'')||value.data.length>16386||!/^0x[0-9a-f]+$/i.test(value.value||''))throw Error('Invalid reviewed Elysium transaction.');
 return {from:value.from.toLowerCase(),to:value.to.toLowerCase(),data:value.data.toLowerCase(),value:BigInt(value.value),chainId:99901};
}
// Checks raw bytes returned by a wallet. It neither signs nor submits anything.
export async function validateSignedDelivery(raw,review){
 const expected=deliveryIntent(review);
 if(typeof raw!=='string'||!/^0x[0-9a-f]+$/i.test(raw)||raw.length>16386)throw Error('Invalid signed transaction.');
 if(!Number.isSafeInteger(review.nonce)||review.nonce<0||!/^0x[0-9a-f]+$/i.test(review.gas||'')||BigInt(review.gas)<=0n||BigInt(review.gas)>32000000n||!/^0x[0-9a-f]+$/i.test(review.maxFeePerGas||'')||!/^0x[0-9a-f]+$/i.test(review.maxPriorityFeePerGas||''))throw Error('Explicit nonce, gas and fee limits are required.');
 if(BigInt(review.maxFeePerGas)<=0n||BigInt(review.maxPriorityFeePerGas)>BigInt(review.maxFeePerGas))throw Error('Invalid fee limits.');
 const tx=parseTransaction(raw);
 if(tx.type!=='eip1559'||tx.chainId!==99901||tx.nonce!==review.nonce||tx.to?.toLowerCase()!==expected.to||(tx.data||'0x').toLowerCase()!==expected.data||(tx.value||0n)!==expected.value||tx.gas!==BigInt(review.gas)||tx.maxFeePerGas!==BigInt(review.maxFeePerGas)||(tx.maxPriorityFeePerGas||0n)!==BigInt(review.maxPriorityFeePerGas)||(tx.accessList?.length||0)!==0)throw Error('Signed transaction differs from the approved review.');
 if((await recoverTransactionAddress({serializedTransaction:raw})).toLowerCase()!==expected.from)throw Error('Signed transaction belongs to another wallet.');
 return {hash:keccak256(raw),chainId:99901,from:expected.from};
}
export function interpretDelivery(status){
 const phase=status?.status||status?.state;
 const common={receiptVerified:false,retryAllowed:false};
 if(phase==='queued')return {...common,state:'queued',message:'The relayer reports this transaction is queued.'};
 if(phase==='posted')return {...common,state:'awaiting-elysium',message:'The relayer reports a HyperEVM post. Waiting for the Elysium receipt.',...(/^0x[0-9a-f]{64}$/i.test(status.l1Hash||'')?{l1Hash:status.l1Hash}:{})};
 if(phase==='landed')return {...common,state:'awaiting-receipt',message:'The relayer reports execution. The Elysium receipt still needs verification.'};
 if(phase==='dropped'&&['nonce-used','not-run'].includes(status.code))return {...common,state:'reported-dropped',message:'The relayer reports this transaction was dropped. Resolve its nonce and wallet activity before retrying.'};
 return {...common,state:'unknown',message:'Delivery is unresolved. Do not resend; the original transaction may still arrive.'};
}
export function classifyWalletCode(code){if(code===undefined||code==='0x')return 'plain';if(/^0xef0100[0-9a-f]{40}$/i.test(code))return 'delegated';return 'contract';}
