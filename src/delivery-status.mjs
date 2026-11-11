import {createPublicClient,http,parseAbi,formatEther} from 'viem';
import {validAddress} from './wallet-actions.mjs';
import {deliveryIntent,interpretDelivery,classifyWalletCode} from './delivery-policy.mjs';
const MONTRA='https://rpc.montramarkets.xyz',HYPER='https://rpc.hyperliquid.xyz/evm',INBOX='0xce59f8B65ad41C9DAE4c07A0571a39824bD92cff';
const abi=parseAbi(['function bridge() view returns (address)','function rollup() view returns (address)','function chainId() view returns (uint256)','function paused() view returns (bool)','function confirmPeriodBlocks() view returns (uint64)']);
const client=url=>createPublicClient({transport:http(url,{retryCount:0,timeout:12000})});
async function chain(c,id){if(await c.getChainId()!==id)throw Error('Connection returned the wrong network.');const b=await c.getBlock();if(!b.hash||Date.now()-Number(b.timestamp)*1000>120000)throw Error('Network state is stale.');return b;}
export async function walletRouteCheck(input,{elysium=client(MONTRA),hyper=client(HYPER),fetchImpl=fetch}={}){
 if(!validAddress(input?.account))throw Error('Connect a wallet before checking this route.');
 const [eb,hb]=await Promise.all([chain(elysium,99901),chain(hyper,999)]);
 const [ec,hc,eBalance,hBalance]=await Promise.all([elysium.getCode({address:input.account,blockNumber:eb.number}),hyper.getCode({address:input.account,blockNumber:hb.number}),elysium.getBalance({address:input.account,blockNumber:eb.number}),hyper.getBalance({address:input.account,blockNumber:hb.number})]);
 const read=(address,functionName)=>hyper.readContract({address,abi,functionName,blockNumber:hb.number});
 const bridge=await read(INBOX,'bridge'),rollup=await read(bridge,'rollup');
 const [rollupChain,paused,period]=await Promise.all(['chainId','paused','confirmPeriodBlocks'].map(n=>read(rollup,n)));
 if(Number(rollupChain)!==99901)throw Error('Inbox does not lead to Elysium mainnet.');
 let service={state:'unknown'};try{const r=await fetchImpl(MONTRA+'/health',{signal:AbortSignal.timeout(6000)});if(r.ok){const h=await r.json();if(h.chainId===99901)service={state:h.sends?.enabled&&!h.sends?.reason?'available':'unavailable',reason:typeof h.sends?.reason==='string'?h.sends.reason.slice(0,80):null};}}catch{}
 if((await hyper.getBlock({blockNumber:hb.number})).hash!==hb.hash||(await elysium.getBlock({blockNumber:eb.number})).hash!==eb.hash)throw Error('Network block changed. Check again.');
 const hyperKind=classifyWalletCode(hc),elysiumKind=classifyWalletCode(ec);
 return {account:input.account,checkedAt:new Date().toISOString(),elysium:{chainId:99901,block:String(eb.number),accountType:elysiumKind,balance:formatEther(eBalance)},hyperEvm:{chainId:999,block:String(hb.number),accountType:hyperKind,balance:formatEther(hBalance)},bridge:{inbox:INBOX,bridge,rollup,chainLinkVerified:true,paused,confirmPeriodBlocks:String(period),sameAddressDepositCompatible:hyperKind==='plain'&&!paused},submission:{accountCompatible:elysiumKind!=='contract',service,scope:'Montra only',walletSigningVerified:false,liveExecutionEnabled:false},message:hyperKind!=='plain'?'This HyperEVM address has code. Do not use the same-address deposit route.':paused?'The rollup reports that it is paused.':'No code was found at this address on HyperEVM. The inbox links to Elysium mainnet; deposits remain disabled in Dinn.',withdrawalNote:'Canonical withdrawals require a challenge period, described by Montra as about six days, then a claim on HyperEVM. No completed withdrawal was verified by this check.'};
}
export async function trackMontraDelivery(input,{elysium=client(MONTRA)}={}){
 if(!/^0x[0-9a-f]{64}$/i.test(input?.hash||''))throw Error('Invalid Elysium transaction hash.');const expected=deliveryIntent(input.expected);await chain(elysium,99901);
 let receipt;try{receipt=await elysium.getTransactionReceipt({hash:input.hash});}catch(e){if(e.name!=='TransactionReceiptNotFoundError')throw e;}
 if(receipt){const tx=await elysium.getTransaction({hash:input.hash});if(receipt.transactionHash.toLowerCase()!==input.hash.toLowerCase()||tx.hash.toLowerCase()!==input.hash.toLowerCase()||tx.from.toLowerCase()!==expected.from||tx.to?.toLowerCase()!==expected.to||(tx.input||'0x').toLowerCase()!==expected.data||tx.value!==expected.value||Number(tx.chainId)!==99901)throw Error('Receipt does not match the reviewed transaction.');
  if((await elysium.getBlock({blockNumber:receipt.blockNumber})).hash!==receipt.blockHash)throw Error('Receipt is not on the current canonical block.');
  const confirmations=Number(await elysium.getBlockNumber()-receipt.blockNumber+1n);return {state:receipt.status==='reverted'?'reverted':confirmations>=2?'confirmed':'confirming',receiptVerified:true,retryAllowed:false,confirmations,hash:input.hash,message:receipt.status==='reverted'?'Transaction reverted on Elysium.':confirmations>=2?'Transaction confirmed on Elysium.':'Transaction included; waiting for another block.',finality:'Elysium inclusion only; not bridge withdrawal finality or proof of swap output.'};
 }
 let status;try{status=await elysium.request({method:'montra_sendStatus',params:[input.hash]});}catch{return interpretDelivery(null);}return interpretDelivery(status);
}
