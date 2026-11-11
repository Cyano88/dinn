import {discoverHoldings} from './wallet-discovery.mjs';
import {pairs} from './domain.mjs';
import {nativeTransfersEnabled,assertDeliveryAvailable} from './execution-policy.mjs';
﻿import {createPublicClient,http,parseAbi,encodeFunctionData,decodeFunctionResult,decodeEventLog,formatUnits,parseUnits,isAddress,toHex} from 'viem';
const abi=parseAbi(['function balanceOf(address) view returns (uint256)','function decimals() view returns (uint8)','function symbol() view returns (string)','function transfer(address,uint256) returns (bool)','event Transfer(address indexed from,address indexed to,uint256 value)']);
export const validAddress=value=>typeof value==='string'&&isAddress(value,{strict:false})&&!/^0x0{40}$/i.test(value);
export function transferIntent(input){
 if(!input||!validAddress(input.account)||!validAddress(input.recipient))throw Error('Enter valid, nonzero sender and recipient addresses.');
 if(![99801,99901].includes(input.chainId))throw Error('Select Elysium in your wallet.');
 if(input.asset!=='native'&&!validAddress(input.asset))throw Error('Choose HYPE or a valid token contract.');
 if(typeof input.amount!=='string'||!/^\d+(\.\d+)?$/.test(input.amount)||input.amount.length>100)throw Error('Enter a positive decimal amount.');
 if(!Number.isInteger(input.decimals)||input.decimals<0||input.decimals>36||(input.asset==='native'&&input.decimals!==18))throw Error('Unsupported token decimals.');
 if((input.amount.split('.')[1]?.length||0)>input.decimals)throw Error('The amount has more decimal places than this token supports.');
 const units=parseUnits(input.amount,input.decimals);if(units<=0n||units>=2n**256n)throw Error('Enter a positive amount within the token limit.');
 const intent={account:input.account,recipient:input.recipient,chainId:input.chainId,asset:input.asset,amount:input.amount,decimals:input.decimals};
 const transaction={from:intent.account,to:intent.asset==='native'?intent.recipient:intent.asset,value:toHex(intent.asset==='native'?units:0n),data:intent.asset==='native'?'0x':encodeFunctionData({abi,functionName:'transfer',args:[intent.recipient,units]}),chainId:toHex(intent.chainId)};
 return {intent,units,transaction};
}
export function assertPreparedTransfer(prepared,expected,now=Date.now()){
 const parsed=transferIntent(expected),tx=prepared?.transaction;
 if(!tx||prepared.expiresAt<=now||prepared.expiresAt>now+65000)throw Error('Transfer review expired. Review again.');
 for(const key of ['from','to','value','data','chainId'])if(String(tx[key]).toLowerCase()!==String(parsed.transaction[key]).toLowerCase())throw Error('Transfer differs from the reviewed recipient or amount.');
 if(!/^0x[0-9a-f]+$/i.test(tx.gas||'')||!/^0x[0-9a-f]+$/i.test(tx.gasPrice||'')||BigInt(tx.gas)<=0n||BigInt(tx.gasPrice)<=0n)throw Error('Transfer fee estimate is invalid.');
 if(Object.keys(tx).some(k=>!['from','to','value','data','chainId','gas','gasPrice'].includes(k)))throw Error('Unexpected transaction field.');
 return {...tx};
}
async function clientFor(env,provided){
 const chainId=Number(env.ELYSIUM_AUTH_CHAIN_ID||99901);
 if(![99801,99901].includes(chainId)||(!env.ELYSIUM_RPC_URL&&!provided))throw Error('Elysium wallet reads are unavailable.');
 const client=provided||createPublicClient({transport:http(env.ELYSIUM_RPC_URL,{timeout:10000,retryCount:0})});
 if(await client.getChainId()!==chainId)throw Error('The wallet network does not match the server connection.');
 return {client,chainId};
}
const nativeInflight=new Map();
async function nativeSnapshot(input,{env=process.env,client:provided}={}){if(!validAddress(input?.account))throw Error('Use a valid wallet address.');const key=env.ELYSIUM_AUTH_CHAIN_ID+'|'+env.ELYSIUM_RPC_URL+'|'+input.account.toLowerCase();if(!provided&&nativeInflight.has(key))return nativeInflight.get(key);const work=(async()=>{const {client,chainId}=await clientFor(env,provided),blockNumber=await client.getBlockNumber({cacheTime:0});const native=await client.getBalance({address:input.account,blockNumber});return {client,account:input.account,chainId,blockNumber:blockNumber.toString(),checkedAt:new Date().toISOString(),assets:[{address:'native',symbol:'HYPE',decimals:18,raw:native.toString(),balance:formatUnits(native,18)}]};})();if(!provided){nativeInflight.set(key,work);work.finally(()=>{if(nativeInflight.get(key)===work)nativeInflight.delete(key);}).catch(()=>{});}return work;}
export async function walletNativeBalance(input,options={}){const {client,...result}=await nativeSnapshot(input,options);return {...result,assets:[...result.assets]};}
export async function walletBalances(input,{env=process.env,client:provided,fetchImpl=fetch}={}){
 if(!validAddress(input?.account)||!Array.isArray(input.tokens)||input.tokens.length>12||input.tokens.some(t=>!validAddress(t)))throw Error('Use a wallet address and at most 12 token contracts.');
 const page=input.page??1;if(!Number.isSafeInteger(page)||page<1||page>10000)throw Error('Invalid holdings page.');
 const initial=await nativeSnapshot(input,{env,client:provided}),{client,chainId}=initial,blockNumber=BigInt(initial.blockNumber);
 const assets=[...initial.assets];
 const discovery=chainId===99901&&env.ELYSIUM_DISCOVER_HOLDINGS==='true'?await discoverHoldings(input.account,{fetchImpl,page}):{tokens:[],state:'off'};
 const prices=new Map(discovery.tokens.map(t=>[t.address,t]));const images=new Map(discovery.tokens.map(t=>[t.address,t.imageUrl]));const unavailable=[];const names=new Map(discovery.tokens.map(t=>[t.address,t.name]));const manual=new Set((page===1?input.tokens:[]).map(t=>t.toLowerCase()));const base=page===1&&chainId===99901&&env.ELYSIUM_DISCOVER_HOLDINGS==='true'?Object.entries(pairs).map(([name,p])=>{names.set(p.address.toLowerCase(),name==='HYPE'?'Wrapped HYPE':name);return p.address.toLowerCase();}):[];
 const candidates=[...new Set([...manual,...base,...discovery.tokens.map(t=>t.address)])];
 for(let offset=0;offset<candidates.length;offset+=4){const batch=await Promise.all(candidates.slice(offset,offset+4).map(async address=>{
  try{const [raw,decimals,symbol]=await Promise.all(['balanceOf','decimals','symbol'].map(functionName=>client.readContract({address,abi,functionName,args:functionName==='balanceOf'?[input.account]:undefined,blockNumber})));if(!Number.isInteger(decimals)||decimals>36||typeof symbol!=='string'||symbol.length>32)throw Error('Unsupported metadata');if(raw===0n&&!manual.has(address))return null;return {address,priceUsd:prices.get(address)?.priceUsd,priceAt:prices.get(address)?.priceAt,imageUrl:images.get(address),symbol:symbol.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,''),name:names.get(address)||symbol,decimals,raw:raw.toString(),balance:formatUnits(raw,decimals),manual:manual.has(address)};
  }catch{unavailable.push(address);if(!manual.has(address)&&!discovery.tokens.some(t=>t.address===address))return null;return {address,name:names.get(address)||'Token',manual:manual.has(address),error:'Token balance or metadata could not be read.'};}
 }));assets.push(...batch.filter(Boolean));}

 return {account:input.account,chainId,blockNumber:blockNumber.toString(),checkedAt:new Date().toISOString(),discovery:discovery.state,page,nextPage:discovery.nextPage??null,checkedAddresses:candidates,unavailable,assets};
}
export async function prepareTransfer(input,{env=process.env,client:provided,now=Date.now,fetchImpl=fetch}={}){
 const {intent,units,transaction}=transferIntent(input),{client,chainId}=await clientFor(env,provided);
 if(chainId!==intent.chainId)throw Error('Switch your wallet to the connected Elysium network.');
 if(chainId===99901){if(!nativeTransfersEnabled(env))throw Error('Mainnet transfers are not enabled in this workspace.');if(intent.asset!=='native')throw Error('Only HYPE transfers are supported by this connection.');await assertDeliveryAvailable(env,fetchImpl);const code=await client.getCode({address:intent.account});if(code&&code!=='0x'&&!/^0xef0100[0-9a-f]{40}$/i.test(code))throw Error('This wallet type cannot use the transaction relay.');}
 if(intent.asset!=='native'){
  const [decimals,balance]=await Promise.all([client.readContract({address:intent.asset,abi,functionName:'decimals'}),client.readContract({address:intent.asset,abi,functionName:'balanceOf',args:[intent.account]})]);
  if(decimals!==intent.decimals)throw Error('Token decimals changed. Refresh your balances.');
  if(balance<units)throw Error('Insufficient token balance.');
 }
 const request={account:intent.account,to:transaction.to,data:transaction.data,value:BigInt(transaction.value)};
 const result=await client.call(request);
 if(intent.asset!=='native'&&result.data&&result.data!=='0x'&&decodeFunctionResult({abi,functionName:'transfer',data:result.data})!==true)throw Error('Token transfer simulation returned false.');
 const [estimate,gasPrice,native]=await Promise.all([client.estimateGas(request),client.getGasPrice(),client.getBalance({address:intent.account})]);
 const gas=(estimate*120n+99n)/100n,bufferedGasPrice=chainId===99901?gasPrice*2n:gasPrice,fee=gas*bufferedGasPrice;
 if(chainId===99901&&gas>100000n)throw Error('This recipient needs more gas than the supported HYPE transfer route.');
 if(native<BigInt(transaction.value)+fee)throw Error('Insufficient HYPE for the amount and network fee.');
 return {intent,transaction:{...transaction,gas:toHex(gas),gasPrice:toHex(bufferedGasPrice)},fee:formatUnits(fee,18),expiresAt:now()+60000,chainId};
}
export async function transferReceipt(input,{env=process.env,client:provided}={}){
 if(!/^0x[0-9a-f]{64}$/i.test(input?.hash||''))throw Error('Invalid transaction hash.');
 const {intent,units,transaction}=transferIntent(input.intent),{client,chainId}=await clientFor(env,provided);
 if(chainId!==intent.chainId)throw Error('Receipt network mismatch.');
 let receipt;try{receipt=await client.getTransactionReceipt({hash:input.hash});}catch(error){if(error.name==='TransactionReceiptNotFoundError')return {state:'pending',message:'Waiting for the transaction to be included.'};throw error;}
 const tx=await client.getTransaction({hash:input.hash});
 if(tx.from.toLowerCase()!==transaction.from.toLowerCase()||tx.to?.toLowerCase()!==transaction.to.toLowerCase()||tx.value!==BigInt(transaction.value)||tx.input.toLowerCase()!==transaction.data.toLowerCase())throw Error('Receipt does not match the reviewed transfer.');
 const block=await client.getBlock({blockNumber:receipt.blockNumber});if(block.hash!==receipt.blockHash)throw Error('Receipt block changed. Check again.');
 if(receipt.status==='reverted')return {state:'reverted',message:'The transfer reverted. Network fees may still apply.'};
 if(intent.asset!=='native'){
  const match=receipt.logs.some(log=>{if(log.address.toLowerCase()!==intent.asset.toLowerCase())return false;try{const {args}=decodeEventLog({abi,eventName:'Transfer',data:log.data,topics:log.topics});return args.from.toLowerCase()===intent.account.toLowerCase()&&args.to.toLowerCase()===intent.recipient.toLowerCase()&&args.value===units;}catch{return false;}});
  if(!match)return {state:'unverified',message:'Transaction succeeded, but the expected token transfer event was not found. Check the recipient balance before sending again.'};
 }
 const confirmations=Number(await client.getBlockNumber()-receipt.blockNumber+1n);
 return {state:confirmations>=2?'confirmed':'confirming',confirmations,message:confirmations>=2?'Transfer confirmed.':'Transfer included. Waiting for another confirmation.'};
}
