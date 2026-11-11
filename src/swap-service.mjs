import {createPublicClient,http,parseAbi,parseUnits,formatUnits,parseEventLogs} from 'viem';
import {contracts,pairs} from './domain.mjs';
import {swapIntent,swapPool,swapTransaction,tokenAbi,permitAbi,quoterAbi,hookAbi} from './swap-call.mjs';
const reads=parseAbi(['function poolLaunchedAt(bytes32) view returns (uint40)','function currentFee(bytes32) view returns (uint24)']);
export function swapPreviewEnabled(env=process.env){try{const u=new URL(env.ELYSIUM_RPC_URL);return env.ENABLE_LOCAL_SWAP_PREVIEW==='true'&&Number(env.ELYSIUM_AUTH_CHAIN_ID)===99901&&u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname);}catch{return false;}}
async function connection(env,provided){
 if(!swapPreviewEnabled(env))throw Error('Swaps are not live yet. This connection supports token checks and wallet transfers.');
 const client=provided||createPublicClient({transport:http(env.ELYSIUM_RPC_URL,{retryCount:0,timeout:20000})});
 if(await client.getChainId()!==99901)throw Error('Swap network mismatch.');
 const info=await client.request({method:'anvil_nodeInfo'});if(!info.forkConfig?.forkBlockNumber)throw Error('A local Elysium fork is required.');return client;
}
export async function quoteSwap(input,{env=process.env,client:provided,now=Date.now}={}){
 const client=await connection(env,provided),intent=swapIntent(input),pool=swapPool(intent),blockNumber=await client.getBlockNumber();
 const read=(address,abi,functionName,args=[])=>client.readContract({address,abi,functionName,args,blockNumber});
 const launched=await read(contracts.launchpad,reads,'poolLaunchedAt',[pool.poolId]);if(!launched)throw Error('No Ascend pool exists for this token and pair.');
 const [tokenDecimals,symbol,feePips]=await Promise.all([read(intent.token,tokenAbi,'decimals'),read(intent.token,tokenAbi,'symbol'),read(contracts.launchpad,reads,'currentFee',[pool.poolId])]);
 if(!Number.isInteger(tokenDecimals)||tokenDecimals>36||typeof symbol!=='string'||symbol.length>32)throw Error('Token metadata is unsupported.');
 const decimals=intent.side==='buy'?pairs[intent.pair].decimals:tokenDecimals;
 if((intent.amount.split('.')[1]?.length||0)>decimals)throw Error('Too many decimal places for this asset.');
 const amount=parseUnits(intent.amount,decimals);if(amount<=0n||amount>=2n**128n)throw Error('Enter a positive supported amount.');
 const {result:[amountOut]}=await client.simulateContract({account:intent.account,address:contracts.quoter,abi:quoterAbi,functionName:'quoteExactInputSingle',args:[{poolKey:pool.poolKey,zeroForOne:pool.input.toLowerCase()===pool.poolKey.currency0.toLowerCase(),exactAmount:amount,hookData:'0x'}],blockNumber});
 const minOut=amountOut*BigInt(10000-intent.slippageBps)/10000n;if(minOut<=0n)throw Error('No usable quote for this amount.');
 const deadline=Math.floor(now()/1000)+300;
 const [balance,allowance,permit]=await Promise.all([read(pool.input,tokenAbi,'balanceOf',[intent.account]),read(pool.input,tokenAbi,'allowance',[intent.account,contracts.permit2]),read(contracts.permit2,permitAbi,'allowance',[intent.account,pool.input,contracts.router])]);
 let step='swap',wrapAmount=0n;
 if(balance<amount){if(intent.side!=='buy'||intent.pair!=='HYPE')throw Error('Insufficient input token balance.');step='wrap';wrapAmount=amount-balance;}
 else if(allowance<amount)step=allowance>0n?'reset':'approve';
 else if(permit[0]<amount||Number(permit[1])<Math.floor(now()/1000)+90)step='permit';
 const outputDecimals=intent.side==='buy'?tokenDecimals:pairs[intent.pair].decimals;
 const pairSymbol=intent.pair==='HYPE'?'WHYPE':intent.pair;
 const review={intent,step,wrapAmount:wrapAmount.toString(),poolId:pool.poolId,tokenDecimals,amountIn:amount.toString(),amountOut:amountOut.toString(),minOut:minOut.toString(),inputSymbol:intent.side==='buy'?pairSymbol:symbol,outputSymbol:intent.side==='buy'?symbol:pairSymbol,expectedOutput:formatUnits(amountOut,outputDecimals),minimumOutput:formatUnits(minOut,outputDecimals),feePips,deadline,expiresAt:now()+60000,blockNumber:blockNumber.toString()};
 review.transaction=swapTransaction(review);
 const tx=review.transaction,request={account:tx.from,to:tx.to,data:tx.data,value:BigInt(tx.value)};
 const simulation=await client.call(request);
 if(['reset','approve'].includes(step)&&simulation.data&&simulation.data!=='0x'&&BigInt(simulation.data)!==1n)throw Error('Token approval returned false.');
 const [gas,gasPrice,native]=await Promise.all([client.estimateGas(request),client.getGasPrice(),client.getBalance({address:intent.account})]);
 const estimatedFee=gas*gasPrice*120n/100n;if(native<estimatedFee+BigInt(tx.value))throw Error('Insufficient HYPE for this step and network fees.');
 review.estimatedFee= formatUnits(estimatedFee,18);return review;
}
export async function swapReceipt(input,{env=process.env,client:provided}={}){
 const client=await connection(env,provided);if(!/^0x[0-9a-f]{64}$/i.test(input?.hash||''))throw Error('Enter a valid transaction hash.');
 const expected=swapTransaction(input.review);
 let receipt;try{receipt=await client.getTransactionReceipt({hash:input.hash});}catch(e){if(e.name==='TransactionReceiptNotFoundError')return {state:'pending'};throw e;}
 const tx=await client.getTransaction({hash:input.hash});
 if(tx.from.toLowerCase()!==expected.from.toLowerCase()||tx.to?.toLowerCase()!==expected.to.toLowerCase()||tx.input.toLowerCase()!==expected.data.toLowerCase()||tx.value!==BigInt(expected.value))throw Error('Transaction does not match this swap step.');
 if((await client.getBlock({blockNumber:receipt.blockNumber})).hash!==receipt.blockHash)throw Error('Receipt block changed. Check again.');
 if(receipt.status==='reverted')return {state:'reverted'};
 if(input.review.step==='swap'){
  const events=parseEventLogs({abi:hookAbi,logs:receipt.logs.filter(l=>l.address.toLowerCase()===contracts.launchpad.toLowerCase())});
  if(!events.some(e=>e.args.poolId===input.review.poolId))return {state:'unverified'};
 }
 const confirmations=Number(await client.getBlockNumber()-receipt.blockNumber+1n);return {state:confirmations>=2?'confirmed':'confirming',confirmations};
}
