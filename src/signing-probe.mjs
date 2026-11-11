import {validateSignedDelivery} from './delivery-policy.mjs';
import {isAddress} from 'viem';
// Deliberately below intrinsic gas. Never broadcast, store or return signed bytes.
export async function checkWalletSigning({address,signTransaction,isCurrent=()=>true}){
 if(!isAddress(address||'',{strict:false})||/^0x0{40}$/i.test(address))throw Error('An embedded wallet is required.');
 const review={from:address,to:address,chainId:99901,data:'0x',value:'0x0',nonce:0,gas:'0x1',maxFeePerGas:'0x1',maxPriorityFeePerGas:'0x0'};
 if(!isCurrent())throw Error('Account changed. Start again.');
 const result=await signTransaction({type:2,chainId:99901,to:address,data:'0x',value:'0x0',nonce:0,gasLimit:'0x1',maxFeePerGas:'0x1',maxPriorityFeePerGas:'0x0'},{address,uiOptions:{showWalletUIs:true}});
 if(!isCurrent())throw Error('Account changed. The result was discarded.');
 await validateSignedDelivery(result?.signature,review);
 return {verified:true,chainId:99901,broadcast:false,message:'Elysium transaction signing verified. Nothing was sent. Trading remains disabled.'};
}
