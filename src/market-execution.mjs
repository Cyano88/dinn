import {tradingCapability} from './trading-venues.mjs';
﻿import {parseUnits,formatUnits,parseAbi,parseEventLogs,toHex} from 'viem';
import {marketQuote,snapshot,poolsFor} from './market-quotes.mjs';
import {marketIntent,marketTransaction,assertMarketReview,MONTRA_ROUTER,approvalAbi} from './market-call.mjs';
import {montraSwapsEnabled,assertDeliveryAvailable} from './execution-policy.mjs';
import routerAbi from './abis/montra-trading.json' with {type:'json'};
const erc=parseAbi(['function decimals() view returns(uint8)','function balanceOf(address) view returns(uint256)']);
export async function prepareMarketTrade(input,options={}){
 const env=options.env||process.env;if(!montraSwapsEnabled(env))throw Error('Live swaps are not enabled.');const i=marketIntent(input);await assertDeliveryAvailable(env,options.fetchImpl);
 const q=await marketQuote(i,options),s=await snapshot(options),p=(await poolsFor(i.token,s)).find(p=>i.route===p.venue+':'+p.poolId);
 if(!tradingCapability(p,env).canExecute)throw Error('This pool needs a different trading connection.');
 const tokenDecimals=await s.read(i.token,erc,'decimals');const amountIn=parseUnits(i.amount,i.side==='buy'?18:tokenDecimals),expectedOut=parseUnits(q.expectedOutput,i.side==='buy'?tokenDecimals:18),minimumOut=parseUnits(q.minimumOutput,i.side==='buy'?tokenDecimals:18);
 const native=await s.c.getBalance({address:i.account,blockNumber:s.block.number});let step='swap';
 const code=await s.c.getCode({address:i.account,blockNumber:s.block.number});if(code&&code!=='0x'&&!/^0xef0100[0-9a-f]{40}$/i.test(code))throw Error('This wallet type cannot use the transaction relay.');
 if(i.side==='sell'){if(await s.read(i.token,erc,'balanceOf',[i.account])<amountIn)throw Error('Insufficient token balance.');const allowance=await s.read(i.token,approvalAbi,'allowance',[i.account,p.router]);if(allowance<amountIn)step=allowance>0n?'reset':'approve';}
 const now=(options.now||Date.now)();const review={intent:i,poolKey:p.key,router:p.router,tokenDecimals,amountIn:String(amountIn),expectedOut:String(expectedOut),minimumOut:String(minimumOut),deadline:Math.floor(now/1000)+180,expiresAt:now+60000,step};
 const tx=marketTransaction(review),request={account:i.account,to:tx.to,data:tx.data,value:BigInt(tx.value)};const simulation=await s.c.call(request);if(step!=='swap'&&simulation.data&&simulation.data!=='0x'&&BigInt(simulation.data)!==1n)throw Error('Token approval simulation failed.');
 const [estimate,gasPrice]=await Promise.all([s.c.estimateGas(request),s.c.getGasPrice()]);review.gas=toHex((estimate*120n+99n)/100n);review.gasPrice=toHex(gasPrice*2n);const fee=BigInt(review.gas)*BigInt(review.gasPrice);if(native<BigInt(tx.value)+fee)throw Error('Insufficient HYPE for this action and network fees.');assertMarketReview(review,i,now);await s.finish();return {review,quote:q,fee:formatUnits(fee,18),delivery:env.ELYSIUM_PUBLIC_RPC_URL.includes('rpc.montramarkets.xyz')?'Montra relay':'Elysium mainnet',executionEnabled:true};
}
export async function marketTradeReceipt(input,options={}){
 if(!/^0x[0-9a-f]{64}$/i.test(input?.hash||''))throw Error('Invalid transaction hash.');const expected=marketTransaction(input.review),s=await snapshot(options),c=s.c;let r;try{r=await c.getTransactionReceipt({hash:input.hash});}catch(e){if(e.name==='TransactionReceiptNotFoundError')return {state:'pending',message:'Waiting for Elysium confirmation. Do not resend.'};throw e;}
 const tx=await c.getTransaction({hash:input.hash});if(tx.from.toLowerCase()!==expected.from.toLowerCase()||tx.to?.toLowerCase()!==expected.to.toLowerCase()||tx.input.toLowerCase()!==expected.data.toLowerCase()||tx.value!==BigInt(expected.value)||Number(tx.chainId)!==99901)throw Error('Receipt differs from the reviewed swap.');if((await c.getBlock({blockNumber:r.blockNumber})).hash!==r.blockHash)throw Error('Receipt block changed.');if(r.status==='reverted')return {state:'reverted',message:'Transaction reverted. Network fees may apply.'};
 if(input.review.step==='swap'){const events=parseEventLogs({abi:routerAbi,eventName:'Swapped',logs:r.logs.filter(l=>l.address.toLowerCase()===MONTRA_ROUTER.toLowerCase())});const i=input.review.intent;if(!events.some(e=>e.args.poolId===i.route.slice(7)&&e.args.sender.toLowerCase()===i.account.toLowerCase()&&e.args.recipient.toLowerCase()===i.account.toLowerCase()&&e.args.zeroForOne===(i.side==='buy')&&e.args.amountIn===BigInt(input.review.amountIn)&&e.args.amountOut>=BigInt(input.review.minimumOut)))return {state:'unverified',message:'Swap output is not verified. Resolve this transaction before trading again.'};}
 const confirmations=Number(await c.getBlockNumber()-r.blockNumber+1n);return {state:confirmations>=2?'confirmed':'confirming',message:confirmations>=2?(input.review.step==='swap'?'Swap confirmed.':'Approval confirmed. Get a fresh swap review.'):'Included on Elysium. Waiting for another block.'};
}
