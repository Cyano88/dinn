import {createPublicClient,http,formatUnits,toHex,parseAbi,parseEventLogs,keccak256} from 'viem';
import {inspectCreatorFees} from './ascend-fees.mjs';
import {ascendFeesEnabled} from './execution-policy.mjs';
import {feeAbi,feeIntent,feeTransaction,assertFeeReview,same} from './ascend-fee-call.mjs';
import {pairs,contracts} from './domain.mjs';
const links=parseAbi(['function escrowOf(bytes32) view returns(address)','function poolCreator(bytes32) view returns(address)']);
const clientFor=o=>o.client||createPublicClient({transport:http(o.rpc||(o.env||process.env).ELYSIUM_RPC_URL,{timeout:12000,retryCount:0})});
export async function prepareCreatorFee(input,options={}){
 const env=options.env||process.env;if(!ascendFeesEnabled(env))throw Error('Creator fee transactions are not enabled on this connection.');
 const intent=feeIntent(input),client=clientFor(options),now=options.now||Date.now;
 const snapshot=await inspectCreatorFees(intent,{client,now});
 const amountRaw=intent.action==='claim'?snapshot.claimableRaw:snapshot.unsettledRaw;
 if(BigInt(amountRaw)<=0n)throw Error(intent.action==='claim'?'No claimable fees for this wallet. Settle pool fees first if available.':'No pool fees await settlement.');
 const review={intent,escrow:snapshot.escrow,poolId:snapshot.poolId,amountRaw,expiresAt:now()+60000,blockNumber:snapshot.blockNumber};
 const tx=feeTransaction(review),request={account:intent.account,to:tx.to,data:tx.data,value:0n};
 await client.call({...request,blockNumber:BigInt(snapshot.blockNumber)});
 const [estimate,price,balance]=await Promise.all([client.estimateGas(request),client.getGasPrice(),client.getBalance({address:intent.account})]);
 review.gas=toHex((estimate*120n+99n)/100n);review.gasPrice=toHex(price*2n);
 const maxFee=BigInt(review.gas)*BigInt(review.gasPrice);
 if(balance<maxFee)throw Error('Insufficient HYPE for network fees. Add funds to your Dinn wallet first.');
 if((await client.getBlock({blockNumber:BigInt(snapshot.blockNumber)})).hash!==snapshot.blockHash)throw Error('Fee snapshot changed. Review again.');
 assertFeeReview(review,intent,now());
 return {review,networkFee:formatUnits(maxFee,18),amount:formatUnits(BigInt(amountRaw),pairs[intent.pair].decimals),symbol:snapshot.symbol,executionEnabled:true};
}
export async function creatorFeeReceipt(input,options={}){
 if(!/^0x[0-9a-f]{64}$/i.test(input?.hash||''))throw Error('Enter the full transaction hash.');
 const review=input.review,expected=feeTransaction(review),i=feeIntent(review.intent),c=clientFor(options);
 if(await c.getChainId()!==99901)throw Error('Wrong fee receipt network.');
 let r;try{r=await c.getTransactionReceipt({hash:input.hash});}catch(e){if(e.name==='TransactionReceiptNotFoundError')return {state:'pending',hash:input.hash,message:'Waiting for Elysium. Do not resend.'};throw e;}
 const [tx,block,head,escrow,creator]=await Promise.all([c.getTransaction({hash:input.hash}),c.getBlock({blockNumber:r.blockNumber}),c.getBlockNumber(),c.readContract({address:contracts.factory,abi:links,functionName:'escrowOf',args:[review.poolId],blockNumber:r.blockNumber}),c.readContract({address:contracts.launchpad,abi:links,functionName:'poolCreator',args:[review.poolId],blockNumber:r.blockNumber})]);
 if(!same(escrow,expected.to)||!same(creator,escrow)||!same(tx.hash,input.hash)||!same(r.transactionHash,input.hash)||!same(tx.from,expected.from)||!same(r.from,expected.from)||!same(tx.to,expected.to)||!same(r.to,expected.to)||!same(tx.input,expected.data)||BigInt(tx.value)!==0n||Number(tx.chainId)!==99901)throw Error('Fee receipt differs from the reviewed action.');
 if(!same(tx.blockHash,r.blockHash)||!same(block.hash,r.blockHash)||head<r.blockNumber)throw Error('Fee receipt block changed. Check again.');
 const identity={hash:input.hash,inputHash:keccak256(expected.data),escrow,chainId:99901};
 if(r.status==='reverted')return {...identity,state:'reverted',message:'Fee transaction reverted. Network fees may apply.'};
 if(r.status!=='success')throw Error('Unrecognized fee receipt status.');
 const events=parseEventLogs({abi:feeAbi,logs:r.logs.filter(l=>same(l.address,escrow)&&!l.removed),strict:true});
 let paid=0n;
 if(i.action==='claim'){
 const withdrawals=events.filter(e=>e.eventName==='Withdrawn'&&same(e.args.account,i.account)&&same(e.args.to,i.account));paid=withdrawals.reduce((n,e)=>n+e.args.amount,0n);
 const transfers=parseEventLogs({abi:feeAbi,eventName:'Transfer',logs:r.logs.filter(l=>same(l.address,pairs[i.pair].address)&&!l.removed),strict:true});
 const transferred=transfers.filter(e=>same(e.args.from,escrow)&&same(e.args.to,i.account)).reduce((n,e)=>n+e.args.value,0n);
 if(paid<=0n||transferred!==paid) return {...identity,state:'unverified',message:'The payout is not verified. Resolve this transaction before another fee action.'};
 }else if(!events.some(e=>e.eventName==='Settled'))return {...identity,state:'unverified',message:'Settlement evidence is missing. Resolve this transaction before retrying.'};
 const confirmations=head-r.blockNumber+1n;
 return {...identity,state:confirmations>=2n?'confirmed':'confirming',amount:formatUnits(paid,pairs[i.pair].decimals),symbol:i.pair==='HYPE'?'WHYPE':i.pair,confirmations:String(confirmations),message:confirmations<2n?'Included on Elysium. Waiting for another block.':i.action==='claim'?'Creator fees paid to your wallet.':'Pool fees settled. Refresh to check your claimable share.'};
}
