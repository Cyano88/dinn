import {purchaseQuote,PONS_BUY_ROUTER,erc20Abi,approvalTransaction} from './pons-purchase.mjs';
import {formatEther,parseEther,zeroAddress,decodeEventLog,keccak256} from 'viem';
import {readPairAsset} from './pons-pairs.mjs';
import {getClient,snapshot,ponsReadiness} from './pons.mjs';
import {launchConfig,launchAbi,launchArgs,launchCall,launchTransaction,PONS_FACTORY,same,hashValid} from './pons-call.mjs';
export async function ponsReview(input,o={}){
 const c=launchConfig(input),client=getClient(o),ready=await ponsReadiness({account:c.account},{...o,client});
 if(!ready.accountCanLaunch)throw Error('Pons is not currently allowing this wallet to launch.');
 const config=ready.configs.find(v=>v.id===c.configId);if(!config)throw Error('This launch configuration is disabled or unavailable.');
 if(c.creatorTaxBps>Number(ready.maxCreatorTaxBps))throw Error('Creator tax exceeds the current Pons cap.');
 const b=await client.getBlock({blockNumber:BigInt(ready.blockNumber)});
 const pairAsset=await readPairAsset(client,c.pairToken,b.number);
 const expectedEconomics=await client.readContract({address:PONS_FACTORY,abi:launchAbi,functionName:'previewLaunchEconomics',args:[BigInt(c.configId),c.pairToken],blockNumber:b.number});
 if(!hashValid(expectedEconomics)||(await client.getBlock({blockNumber:b.number})).hash!==b.hash)throw Error('Economics changed during review. Refresh again.');
 const quote={chainId:4663,launchFeeWei:parseEther(ready.launchFee).toString(),launchFee:ready.launchFee,expectedEconomics,config:pairAsset.native?config:{...config,phantomQuote:pairAsset.phantomQuote,graduationThreshold:pairAsset.graduationThreshold},creatorTaxBps:c.creatorTaxBps,buybackEnabled:c.buybackEnabled,pair:pairAsset.symbol,pairToken:c.pairToken,pairAsset,blockNumber:ready.blockNumber,expiresAt:(o.now||Date.now)()+120000,broadcast:false};
 if(c.purchase){const code=await client.getCode({address:PONS_BUY_ROUTER,blockNumber:b.number});if(!code||code==='0x')throw Error('Pons purchase router is unavailable.');const forwarder=await client.readContract({address:PONS_FACTORY,abi:[{type:'function',name:'launchForwarder',inputs:[],outputs:[{type:'address'}],stateMutability:'view'}],functionName:'launchForwarder',blockNumber:b.number});if(!same(forwarder,PONS_BUY_ROUTER))throw Error('Pons purchase router is not enabled.');quote.purchase=purchaseQuote(c,quote);if(!pairAsset.native){const [balance,allowance]=await Promise.all(['balanceOf','allowance'].map(functionName=>client.readContract({address:c.pairToken,abi:erc20Abi,functionName,args:functionName==='balanceOf'?[c.account]:[c.account,PONS_BUY_ROUTER],blockNumber:b.number})));quote.purchase.balanceWei=String(balance);quote.purchase.allowanceWei=String(allowance);quote.purchase.approvalRequired=allowance<BigInt(quote.purchase.amountWei);}}
 if((await client.getBlock({blockNumber:b.number})).hash!==b.hash)throw Error('Purchase snapshot changed. Review again.');
 return quote;
}
export async function ponsSimulate(input,o={}){
 const c=launchConfig(input.configuration),q=input.quote,now=o.now||Date.now;
 if(!q||!Number.isFinite(q.expiresAt)||q.expiresAt<now()||q.expiresAt>now()+120000)throw Error('Review expired. Refresh the launch review.');
 const client=getClient(o),fresh=await ponsReview(c,{...o,client});
 if(!same(q.expectedEconomics,fresh.expectedEconomics)||q.launchFeeWei!==fresh.launchFeeWei)throw Error('Launch economics changed. Review the new terms before continuing.');
 const blockNumber=BigInt(fresh.blockNumber),originalBlock=await client.getBlock({blockNumber}),transaction=launchTransaction(c,fresh);
 if(fresh.purchase&&!fresh.pairAsset.native){if(BigInt(fresh.purchase.balanceWei)<BigInt(fresh.purchase.amountWei))throw Error('Insufficient pairing asset for the opening purchase.');if(fresh.purchase.approvalRequired)throw Error('Approve the pairing asset before checking this launch.');}
 const balance=await client.getBalance({address:c.account,blockNumber});
 if(balance<BigInt(transaction.value))throw Error('Insufficient ETH for the launch fee and any ETH purchase. Add ETH to the launch wallet, then check again.');
 const call=launchCall(c,fresh);const {result}=await client.simulateContract({...call,abi:launchAbi,account:c.account,blockNumber});
 if(result.length!==(c.purchase?3:2)||result.slice(0,2).some(v=>!/^0x[0-9a-f]{40}$/i.test(v)||same(v,zeroAddress)))throw Error('Simulation returned invalid launch addresses.');
 if(fresh.purchase&&result[2]<BigInt(fresh.purchase.minTokensOutWei))throw Error('Purchase simulation returned too few tokens.');
 const [gas,gasPrice]=await Promise.all([client.estimateGas({account:c.account,to:PONS_FACTORY,data:transaction.data,value:BigInt(transaction.value),blockNumber}),client.getGasPrice()]);
 const gasLimit=gas*120n/100n,estimatedGasWei=gasLimit*gasPrice;
 if(balance<BigInt(transaction.value)+estimatedGasWei)throw Error('Insufficient ETH for the launch, any ETH purchase, and estimated gas.');
 const b=await snapshot(client,now);if((await client.getBlock({blockNumber})).hash!==originalBlock.hash||b.number<blockNumber)throw Error('Network changed. Simulate again.');
 return {chainId:4663,simulated:true,quote:fresh,transaction,gas:gasLimit.toString(),estimatedGas:formatEther(estimatedGasWei),predictedToken:result[0],predictedCurve:result[1],expiresAt:now()+60000,broadcast:false};
}
export async function ponsReceipt(input,o={}){
 if(!hashValid(input.hash))throw Error('Enter a valid transaction hash.');
 const c=launchConfig(input.configuration),tx=launchTransaction(c,input.quote),client=getClient(o);await snapshot(client,o.now);
 let actual,receipt;try{[actual,receipt]=await Promise.all([client.getTransaction({hash:input.hash}),client.getTransactionReceipt({hash:input.hash})]);}catch(e){if(['TransactionNotFoundError','TransactionReceiptNotFoundError'].includes(e.name))return {state:'pending',hash:input.hash};throw e;}
 if(!same(actual.from,tx.from)||!same(actual.to,tx.to)||!same(actual.input,tx.data)||actual.value!==BigInt(tx.value))throw Error('Receipt does not match the reviewed Pons transaction.');
 if(!same(receipt.transactionHash,input.hash)||actual.chainId!==undefined&&actual.chainId!==4663||actual.blockHash&&!same(actual.blockHash,receipt.blockHash))throw Error('Receipt identity does not match.');
 const b=await client.getBlock({blockNumber:receipt.blockNumber});if(!same(b.hash,receipt.blockHash))throw Error('Receipt block changed. Check again.');
 const base={chainId:4663,hash:input.hash,inputHash:keccak256(tx.data)};
 if(receipt.status!=='success')return {...base,state:'reverted'};
 const logs=receipt.logs.filter(l=>!l.removed&&same(l.address,PONS_FACTORY)).flatMap(l=>{try{const d=decodeEventLog({abi:launchAbi,data:l.data,topics:l.topics});return d.eventName==='TokenLaunched'?[d.args]:[];}catch{return [];}});
 const matches=logs.filter(l=>same(l.deployer,c.account)&&same(l.pairToken,c.pairToken)&&l.launchConfigId===BigInt(c.configId));const e=matches[0];if(matches.length!==1)throw Error('Matching Pons launch event was not found.');
 if(c.purchase){const buy=purchaseQuote(c,input.quote);const transfers=receipt.logs.filter(l=>!l.removed&&same(l.address,e.token)).flatMap(l=>{try{const d=decodeEventLog({abi:erc20Abi,data:l.data,topics:l.topics});return d.eventName==='Transfer'&&same(d.args.from,e.curve)&&same(d.args.to,c.account)?[d.args.value]:[];}catch{return [];}});if(transfers.length!==1||transfers[0]<BigInt(buy.minTokensOutWei))throw Error('Opening purchase receipt could not be verified.');base.purchasedTokensWei=String(transfers[0]);}
 const [tokenCode,curveCode,head]=await Promise.all([client.getCode({address:e.token,blockNumber:b.number}),client.getCode({address:e.curve,blockNumber:b.number}),client.getBlockNumber()]);
 if(!tokenCode||tokenCode==='0x'||!curveCode||curveCode==='0x')throw Error('Launched contracts could not be verified.');
 if(!same((await client.getBlock({blockNumber:b.number})).hash,b.hash))throw Error('Receipt changed. Check again.');
 return {...base,state:head-b.number>=1n?'verified':'confirming',token:e.token,curve:e.curve,blockNumber:String(b.number),blockTimestamp:Number(b.timestamp)};
}

export async function ponsPurchaseApproval(input,o={}){
 const c=launchConfig(input.configuration),q=input.quote,client=getClient(o),now=o.now||Date.now;
 if(!q||!Number.isFinite(q.expiresAt)||q.expiresAt<now()||q.expiresAt>now()+120000)throw Error('Review expired. Refresh the launch review.');
 const fresh=await ponsReview(c,{...o,client});
 if(!fresh.purchase||fresh.pairAsset.native||!same(q.expectedEconomics,fresh.expectedEconomics)||q.launchFeeWei!==fresh.launchFeeWei)throw Error('Purchase terms changed. Review again.');
 if(BigInt(fresh.purchase.balanceWei)<BigInt(fresh.purchase.amountWei))throw Error('Insufficient pairing asset for the opening purchase.');
 if(!fresh.purchase.approvalRequired)return {required:false,quote:fresh};
 const amount=BigInt(fresh.purchase.allowanceWei)>0n?'0':fresh.purchase.amountWei;
 const transaction=approvalTransaction(c,amount),blockNumber=BigInt(fresh.blockNumber);
 const result=await client.simulateContract({address:c.pairToken,abi:erc20Abi,functionName:'approve',args:[PONS_BUY_ROUTER,BigInt(amount)],account:c.account,blockNumber});
 if(result.result===false)throw Error('Pairing asset rejected approval.');
 const [gas,gasPrice,balance]=await Promise.all([client.estimateGas({account:c.account,to:transaction.to,data:transaction.data,value:0n,blockNumber}),client.getGasPrice(),client.getBalance({address:c.account,blockNumber})]);
 const estimatedGasWei=gas*120n/100n*gasPrice;
 if(balance<estimatedGasWei+BigInt(fresh.launchFeeWei))throw Error('Insufficient ETH for approval and the launch fee.');
 return {required:true,amount,transaction,quote:fresh,simulated:true,estimatedGas:formatEther(estimatedGasWei),expiresAt:now()+60000};
}
export async function ponsApprovalReceipt(input,o={}){
 const c=launchConfig(input.configuration);if(!hashValid(input.hash)||!input.quote||!['0',purchaseQuote(c,input.quote)?.amountWei].includes(input.amount))throw Error('Invalid purchase approval receipt.');
 const expected=approvalTransaction(c,input.amount),client=getClient(o);await snapshot(client,o.now);
 let tx,r;try{[tx,r]=await Promise.all([client.getTransaction({hash:input.hash}),client.getTransactionReceipt({hash:input.hash})]);}catch(e){if(['TransactionNotFoundError','TransactionReceiptNotFoundError'].includes(e.name))return {state:'pending'};throw e;}
 if(!same(tx.from,expected.from)||!same(tx.to,expected.to)||!same(tx.input,expected.data)||tx.value!==0n||!same(r.transactionHash,input.hash)||!same(tx.blockHash,r.blockHash))throw Error('Approval receipt does not match.');
 if(!same((await client.getBlock({blockNumber:r.blockNumber})).hash,r.blockHash))throw Error('Approval block changed. Check again.');
 if(r.status!=='success')return {state:'reverted'};
 const head=await client.getBlockNumber();return {state:head-r.blockNumber>=1n?'verified':'confirming'};
}
