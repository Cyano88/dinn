import {keccak256,parseAbi,decodeEventLog,decodeFunctionData,zeroAddress,createPublicClient,http} from 'viem';
import {CHAIN_ID,contracts,pairs,validateLaunch} from './domain.mjs';
export const receiptAbi=parseAbi([
 'function launchChecked((string name,string symbol,address quote,uint256 devBuyQuote,uint256 minDevOut,bytes32 salt,address creator,uint24 fee,uint24 builderFee) p,(address recipient,address dev,address builder,bool cto) r,address expectedRuleSet,int24 expectedStartTick) returns (address token,bytes32 poolId,address escrow)',
 'function escrowOf(bytes32 poolId) view returns (address)',
 'event Launched(bytes32 indexed poolId,address indexed token,address indexed creator,address quote,uint256 supplySeeded,uint256 devBuyTokens,uint24 fee,uint24 builderFee)',
 'event EscrowLaunched(bytes32 indexed poolId,address indexed escrow,address indexed recipient,address dev,address builder,address ruleSet,bool cto)'
]);
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
export function validateReceiptRequest(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['hash','configuration','expectedData'].includes(k)))throw Error('Provide a transaction hash and launch configuration only.');
 if(!/^0x[0-9a-fA-F]{64}$/.test(input.hash||''))throw Error('Enter a transaction hash: 0x followed by 64 hexadecimal characters.');
 if(input.expectedData!==undefined&&(!/^0x(?:[0-9a-fA-F]{2})+$/.test(input.expectedData)||input.expectedData.length>8192))throw Error('Expected calldata must be a hex-encoded launch transaction.');
 return {hash:input.hash,configuration:validateLaunch(input.configuration),expectedData:input.expectedData};
}
export function verifyLaunchEvidence({hash,configuration:v,transaction:tx,receipt,head,canonicalBlockHash,escrowAddress,expectedData}){
 if(!same(receipt.transactionHash,hash)||!same(tx.hash,hash))throw Error('Transaction hash does not match the receipt.');
 if(!same(tx.to,contracts.factory)||!same(tx.from,v.account)||!same(receipt.to,contracts.factory)||!same(receipt.from,v.account))throw Error('This transaction is not an Ascend launch from the draft deployer.');
 if(!same(tx.blockHash,receipt.blockHash)||!same(canonicalBlockHash,receipt.blockHash))throw Error('Receipt is not on the current canonical chain. Check again.');
 if(tx.chainId!==undefined&&Number(tx.chainId)!==CHAIN_ID)throw Error('Transaction belongs to a different chain.');
 if(BigInt(tx.value)!==0n)throw Error('This preview only supports launches with zero native value.');
 if(expectedData!==undefined&&!same(tx.input,expectedData))throw Error('This receipt is for a different transaction than the saved wallet request.');
 const inputHash=keccak256(tx.input);
 const call=decodeFunctionData({abi:receiptAbi,data:tx.input});
 if(call.functionName!=='launchChecked')throw Error('This transaction did not use the supported checked launch.');
 const [p,r,ruleSet]=call.args;
 if(p.name!==v.name||p.symbol!==v.symbol||!same(p.quote,pairs[v.pair].address)||Number(p.fee)!==v.feePips||Number(p.builderFee)!==0||p.devBuyQuote!==0n||p.minDevOut!==0n||!same(p.creator,zeroAddress)||!same(r.dev,v.account)||!same(r.recipient,v.recipient)||!same(r.builder,zeroAddress)||r.cto!==v.cto)throw Error('The onchain launch settings differ from this draft.');
 if(receipt.status==='reverted')return {state:'reverted',hash,inputHash,chainId:CHAIN_ID,message:'The transaction reverted. No successful launch is recorded.'};
 if(receipt.status!=='success')throw Error('Unrecognized receipt status.');
 const launches=[],escrows=[];
 for(const log of receipt.logs){
  if(log.removed)continue;
  const factory=same(log.address,contracts.factory),launchpad=same(log.address,contracts.launchpad);
  if(!factory&&!launchpad)continue;
  let event;try{event=decodeEventLog({abi:receiptAbi,data:log.data,topics:log.topics,strict:true});}catch{continue;}
  if(launchpad&&event.eventName==='Launched')launches.push(event.args);
  if(factory&&event.eventName==='EscrowLaunched')escrows.push(event.args);
 }
 if(launches.length!==1||escrows.length!==1)throw Error('Expected exactly one launch event and one factory escrow event.');
 const launch=launches[0],escrow=escrows[0];
 if(!same(launch.poolId,escrow.poolId)||!same(launch.creator,escrow.escrow)||!same(escrow.recipient,v.recipient)||!same(escrow.dev,v.account)||!same(escrow.builder,zeroAddress)||!same(escrow.ruleSet,ruleSet)||escrow.cto!==v.cto||!same(launch.quote,pairs[v.pair].address)||Number(launch.fee)!==v.feePips||Number(launch.builderFee)!==0||launch.devBuyTokens!==0n||launch.supplySeeded!==1000000000n*10n**18n||same(launch.token,zeroAddress)||same(escrow.escrow,zeroAddress))throw Error('Launch events do not match the reviewed configuration.');
 if(!same(escrowAddress,escrow.escrow))throw Error('Factory escrow mapping does not match the launch receipt.');
 if(BigInt(head)<BigInt(receipt.blockNumber))throw Error('RPC head is behind the receipt. Check again.');
 const confirmations=BigInt(head)-BigInt(receipt.blockNumber)+1n;
 return {state:confirmations>=2n?'verified':'confirming',hash,inputHash,chainId:CHAIN_ID,blockNumber:receipt.blockNumber.toString(),blockHash:receipt.blockHash,confirmations:confirmations.toString(),requiredConfirmations:2,name:v.name,symbol:v.symbol,pair:v.pair,token:launch.token,poolId:launch.poolId,escrow:escrow.escrow,recipient:v.recipient,account:v.account,feePercent:String(v.feePips/10000),message:confirmations>=2n?'Launch matches this draft and has at least two confirmations.':'Launch matches this draft; waiting for a second confirmation.'};
}
export async function readLaunchReceipt(input,rpc,providedClient){
 const {hash,configuration,expectedData}=validateReceiptRequest(input);
 if(!rpc&&!providedClient)throw Error('ELYSIUM_RPC_URL is not configured. Receipt verification is unavailable.');
 const client=providedClient||createPublicClient({transport:http(rpc,{timeout:12000,retryCount:0})});
 if(await client.getChainId()!==CHAIN_ID)throw Error('RPC chain mismatch. Expected Elysium 99901.');
 let receipt;
 try{receipt=await client.getTransactionReceipt({hash});}
 catch(error){if(error.name==='TransactionReceiptNotFoundError')return {state:'pending',hash,chainId:CHAIN_ID,message:'No mined receipt found. This can mean pending, unknown, replaced, or a hash from another chain. Nothing has been resubmitted.'};throw error;}
 const [transaction,head,block]=await Promise.all([client.getTransaction({hash}),client.getBlockNumber(),client.getBlock({blockNumber:receipt.blockNumber})]);
 let escrowAddress=zeroAddress;
 if(receipt.status==='success'){
  const events=receipt.logs.filter(log=>same(log.address,contracts.factory)&&!log.removed).flatMap(log=>{try{const decoded=decodeEventLog({abi:receiptAbi,data:log.data,topics:log.topics,strict:true});return decoded.eventName==='EscrowLaunched'?[decoded.args]:[];}catch{return [];}});
  if(events.length===1)escrowAddress=await client.readContract({address:contracts.factory,abi:receiptAbi,functionName:'escrowOf',args:[events[0].poolId],blockNumber:receipt.blockNumber});
 }
 return verifyLaunchEvidence({hash,configuration,transaction,receipt,head,canonicalBlockHash:block.hash,escrowAddress,expectedData});
}
