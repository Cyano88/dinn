import {decodeEventLog,formatUnits,keccak256,parseAbi,zeroAddress} from 'viem';
import {getClient,snapshot,PONS_FACTORY} from './pons.mjs';
import {factoryAbi,factoryCodeHash} from './pons-fee-abi.mjs';
import {sourceVerification} from './token-inspection.mjs';
import {verifiedArtifact} from './token-controls.mjs';
import {address,hash,same,units,walletTransaction} from './robinhood-wallet-call.mjs';

const tokenAbi=parseAbi(['function symbol() view returns(string)','function decimals() view returns(uint8)','function totalSupply() view returns(uint256)','function balanceOf(address) view returns(uint256)','function launchFactory() view returns(address)','function curve() view returns(address)','function deployer() view returns(address)','function burn(uint256)','event Transfer(address indexed from,address indexed to,uint256 value)']);
const curveAbi=parseAbi(['function factory() view returns(address)','function token() view returns(address)','function pairToken() view returns(address)']);
const slots=['0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc','0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50'];
const safeText=(v,max=24)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
function validReview(review){
 if(!review||review.kind!=='burn'||review.chainId!==4663||review.burnAdapter!=='pons-v2-self-burn'||review.sourceProfile!=='pons-v2-fixed-supply'||!address(review.account)||!address(review.asset?.address)||!same(review.recipient,review.account)||!Number.isInteger(review.asset?.decimals)||review.asset.decimals<0||review.asset.decimals>36||!safeText(review.asset.symbol)||typeof review.amount!=='string'||!/^\d+(?:\.\d+)?$/.test(review.amount)||!/^\d+$/.test(review.amountRaw||'')||!/^\d+$/.test(review.supplyBeforeRaw||'')||!/^\d+$/.test(review.balanceBeforeRaw||'')||!/^\d+$/.test(review.blockNumber||'')||!hash(review.blockHash))throw Error('Invalid Pons burn review.');
 const amount=units(review.amount,review.asset.decimals);if(amount.toString()!==review.amountRaw||amount>BigInt(review.balanceBeforeRaw)||amount>BigInt(review.supplyBeforeRaw))throw Error('Burn amount differs from the checked wallet balance or supply.');
 return amount;
}
async function verifiedToken(token,c,b,{fetchImpl=fetch,signal}={}){
 const factoryCode=await c.getCode({address:PONS_FACTORY,blockNumber:b.number});if(!factoryCode||keccak256(factoryCode)!==factoryCodeHash)throw Error('Pons v2 deployment could not be verified.');
 const code=await c.getCode({address:token,blockNumber:b.number});if(!code||code==='0x')throw Error('No token contract exists at this address on Robinhood Chain.');
 if(/^0x363d3d373d3d3d363d73[0-9a-f]{40}5af43d82803e903d91602b57fd5bf3$/i.test(code))throw Error('Proxy tokens are not supported for burning.');
 const proxySlots=await Promise.all(slots.map(slot=>c.getStorageAt({address:token,slot,blockNumber:b.number})));if(proxySlots.some(value=>value&& !/^0x0{64}$/i.test(value)))throw Error('Proxy tokens are not supported for burning.');
 const source=await sourceVerification(4663,token,code,{fetchImpl,signal}),artifact=source?.[verifiedArtifact];
 if(source?.status!=='verified'||!artifact?.ponsProfile||!artifact.abi.some(f=>f?.type==='function'&&f.name==='burn'&&f.stateMutability==='nonpayable'&&f.inputs?.length===1&&f.inputs[0].type==='uint256'))throw Error('This token does not match the reviewed Pons v2 burnable source profile.');
 const read=(address,abi,functionName,args=[])=>c.readContract({address,abi,functionName,args,blockNumber:b.number});
 const launch=await read(PONS_FACTORY,factoryAbi,'getLaunchedToken',[token]);if(!launch.exists||!same(launch.token,token)||!address(launch.curve)||!address(launch.deployer))throw Error('This token is not registered in the supported Pons v2 deployment.');
 const [launchFactory,curve,deployer,curveIdentity]=await Promise.all([read(token,tokenAbi,'launchFactory'),read(token,tokenAbi,'curve'),read(token,tokenAbi,'deployer'),Promise.all(['factory','token','pairToken'].map(name=>read(launch.curve,curveAbi,name)))]);
 if(!same(launchFactory,PONS_FACTORY)||!same(curve,launch.curve)||!same(deployer,launch.deployer)||!same(curveIdentity[0],PONS_FACTORY)||!same(curveIdentity[1],token)||!same(curveIdentity[2],launch.pairToken))throw Error('The token and its registered Pons v2 curve do not match.');
 const [symbol,decimals,supply]=await Promise.all([read(token,tokenAbi,'symbol'),read(token,tokenAbi,'decimals'),read(token,tokenAbi,'totalSupply')]);
 if(!safeText(symbol)||!Number.isInteger(Number(decimals))||Number(decimals)<0||Number(decimals)>36||typeof supply!=='bigint')throw Error('The token identity or supply could not be verified.');
 return {symbol,decimals:Number(decimals),supply,launch};
}
function reviewTransaction(review){validReview(review);return walletTransaction(review);}

export async function preparePonsBurn(input,o={}){
 if(!address(input?.account))throw Error('Connect the wallet that holds the tokens.');if(!address(input?.address))throw Error('Provide one Pons v2 token address.');
 const c=getClient(o),b=await snapshot(c,o.now),token=input.address.toLowerCase(),facts=await verifiedToken(token,c,b,o),amount=units(input.amount,facts.decimals),balance=await c.readContract({address:token,abi:tokenAbi,functionName:'balanceOf',args:[input.account],blockNumber:b.number});
 if(amount>balance)throw Error('The connected wallet does not hold that many '+facts.symbol+'.');if(amount>facts.supply)throw Error('Burn amount exceeds the current token supply.');
 const review={kind:'burn',chainId:4663,burnAdapter:'pons-v2-self-burn',sourceProfile:'pons-v2-fixed-supply',account:input.account,recipient:input.account,asset:{address:token,symbol:facts.symbol,decimals:facts.decimals},amount:input.amount,amountRaw:amount.toString(),supplyBeforeRaw:facts.supply.toString(),balanceBeforeRaw:balance.toString(),blockNumber:b.number.toString(),blockHash:b.hash};
 const transaction=walletTransaction(review),request={account:input.account,to:transaction.to,data:transaction.data,value:0n};await c.call(request);
 const [gas,price,native]=await Promise.all([c.estimateGas(request),c.getGasPrice(),c.getBalance({address:input.account,blockNumber:b.number})]);const gasCost=gas*price*2n;if(native<gasCost)throw Error('The connected wallet needs ETH for network fees.');
 if((await c.getBlock({blockNumber:b.number})).hash!==b.hash)throw Error('The network snapshot changed. Check the burn again.');
 return {...review,transaction,simulated:true,expiresAt:Math.min(input.expiresAt||((o.now||Date.now)()+120000),(o.now||Date.now)()+120000),networkFee:formatUnits(gasCost,18),supplyBefore:formatUnits(facts.supply,facts.decimals)};
}

export async function validatePonsBurn(input,o={}){
 const review=input?.review;validReview(review);const expected=reviewTransaction(review),fresh=await preparePonsBurn({account:review.account,address:review.asset.address,amount:review.amount},o);
 if(Object.keys(review.transaction||{}).some(k=>!Object.hasOwn(expected,k))||Object.keys(expected).some(k=>!same(expected[k],review.transaction?.[k]))||!same(fresh.account,review.account)||!same(fresh.asset.address,review.asset.address)||fresh.asset.symbol!==review.asset.symbol||fresh.asset.decimals!==review.asset.decimals||fresh.amount!==review.amount||fresh.amountRaw!==review.amountRaw||!same(fresh.transaction.to,expected.to)||!same(fresh.transaction.data,expected.data))throw Error('Burn review changed. Ask Dinn to prepare it again.');
 return {valid:true};
}

export async function ponsBurnReceipt(input,o={}){
 const review=input?.review,amount=validReview(review);if(!hash(input?.hash))throw Error('Provide the burn transaction hash.');const expected=reviewTransaction(review),c=getClient(o),head=await snapshot(c,o.now);
 let tx,r;try{[tx,r]=await Promise.all([c.getTransaction({hash:input.hash}),c.getTransactionReceipt({hash:input.hash})]);}catch(e){if(['TransactionNotFoundError','TransactionReceiptNotFoundError'].includes(e.name))return {state:'pending',hash:input.hash};throw e;}
 if(!same(tx.from,review.account)||!same(tx.to,expected.to)||!same(tx.input,expected.data)||tx.value!==0n||tx.chainId!==undefined&&tx.chainId!==4663||!same(r.transactionHash,input.hash)||!same(tx.blockHash,r.blockHash))throw Error('Transaction does not match the reviewed Pons burn.');
 const [reviewBlock,receiptBlock]=await Promise.all([c.getBlock({blockNumber:BigInt(review.blockNumber)}),c.getBlock({blockNumber:r.blockNumber})]);if(reviewBlock.hash!==review.blockHash||receiptBlock.hash!==r.blockHash||r.blockNumber<BigInt(review.blockNumber))throw Error('The burn snapshot changed in a chain reorganization. Check the transaction again.');
 if(r.status!=='success')return {state:'reverted',hash:input.hash};
 const events=r.logs.filter(l=>!l.removed&&same(l.address,review.asset.address)).flatMap(l=>{try{const e=decodeEventLog({abi:tokenAbi,data:l.data,topics:l.topics});return e.eventName==='Transfer'&&same(e.args.from,review.account)&&same(e.args.to,zeroAddress)&&e.args.value===amount?[e]:[];}catch{return [];}});if(events.length!==1)throw Error('The exact token burn event was not found.');
 const [beforeFacts,tokenFacts,balanceBefore]=await Promise.all([verifiedToken(review.asset.address,c,reviewBlock,o),verifiedToken(review.asset.address,c,receiptBlock,o),c.readContract({address:review.asset.address,abi:tokenAbi,functionName:'balanceOf',args:[review.account],blockNumber:reviewBlock.number})]);const before=beforeFacts.supply,after=tokenFacts.supply;if(before.toString()!==review.supplyBeforeRaw||balanceBefore.toString()!==review.balanceBeforeRaw||beforeFacts.decimals!==review.asset.decimals||beforeFacts.symbol!==review.asset.symbol||after>before-amount)throw Error('The burn event was found, but the reviewed balance or total-supply decrease could not be verified.');
 return {state:head.number-r.blockNumber+1n>=2n?'verified':'confirming',hash:input.hash,chainId:4663,account:review.account,token:review.asset.address,symbol:review.asset.symbol,amount:review.amount,amountRaw:amount.toString(),supplyBefore:formatUnits(before,review.asset.decimals),supplyAfter:formatUnits(after,review.asset.decimals),supplyDecreaseAtLeast:review.amount,blockNumber:r.blockNumber.toString()};
}
