import {createLaunchClient} from '@bankr/launch-sdk';
import {isAddress,keccak256,erc20Abi} from 'viem';
import {getTransaction,getTransactionReceipt,getBlockNumber,getBlock,readContract} from 'viem/actions';
import {serverRpcUrl} from './rpc-config.mjs';

export async function checkBankrReceipt(review,env){
 const {hash,token,poolId,launcher,quote,callHash}=review;
 if(![hash,poolId,callHash].every(value=>/^0x[0-9a-f]{64}$/i.test(value))||![token,launcher,quote].every(value=>isAddress(value)))throw Error('Invalid review');
 const sdk=createLaunchClient({chain:'base',rpcUrl:serverRpcUrl(8453,env)});
 const client=sdk.publicClient;
 let receipt;
 try{receipt=await getTransactionReceipt(client,{hash});}
 catch(error){if(error.name==='TransactionReceiptNotFoundError')return {state:'pending'};throw error;}
 const tx=await getTransaction(client,{hash});
 if(tx.chainId!==8453||tx.from.toLowerCase()!==launcher.toLowerCase()||tx.value!==0n||keccak256(tx.input)!==callHash)throw Error('Transaction mismatch');
 const block=await getBlock(client,{blockNumber:receipt.blockNumber});
 if(block.hash!==receipt.blockHash||await getBlockNumber(client)<receipt.blockNumber+2n)return {state:'pending'};
 if(receipt.status==='reverted')return {state:'reverted'};
 const launch=sdk.parseLaunchReceipt(receipt,token);
 if(launch.poolId!==poolId||launch.launcher.toLowerCase()!==launcher.toLowerCase()||launch.quote.toLowerCase()!==quote.toLowerCase()||String(launch.launchpadId)!==env.DINN_BANKR_BASE_LAUNCHPAD_ID)throw Error('Launch mismatch');
 const read=(address,functionName)=>readContract(client,{address,abi:erc20Abi,functionName,blockNumber:receipt.blockNumber});
 const [name,symbol,pairSymbol]=await Promise.all([read(launch.token,'name'),read(launch.token,'symbol'),read(launch.quote,'symbol')]);
 return {state:'verified',token:launch.token,hash,item:{hash,token:launch.token,poolId:launch.poolId,name,symbol,pairToken:launch.quote,pairSymbol,metadataUri:launch.metadataUri,blockNumber:String(receipt.blockNumber),launchedAtSeconds:Number(block.timestamp)}};

}
