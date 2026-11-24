import {blockscoutRead} from './blockscout.mjs';
﻿import {formatUnits,decodeEventLog} from 'viem';
import {networks,assets,ZERO,address,same,hash,units,erc20,walletTransaction} from './robinhood-wallet-call.mjs';
import {walletClient,walletSnapshot,walletAsset,readJson,prepareWalletCall,walletSourceReceipt} from './robinhood-wallet.mjs';
import {researchBaseStockPairedToken} from './base-stock-paired-research.mjs';
import {BASE_V4_QUOTER,baseV4QuoterAbi,baseV4PoolId} from './base-stock-v4.mjs';
const uint=v=>typeof v==='string'&&/^\d+$/.test(v);
export function validateRobinhoodRoute(raw,i,now=Date.now()){
 const destinationChainId=i.destinationChainId||4663;
 const d=raw?.details,step=raw?.steps?.[0],order=raw?.protocol?.v2?.orderData,inc=d?.currencyIn,out=d?.currencyOut,pay=order?.output?.payments,source=order?.inputs?.[0];
 if(!hash(raw?.requestId)||raw.steps.length!==1||step.id!=='deposit'||!same(step.requestId,raw.requestId)||!address(step.depositAddress))throw Error('Unsupported Relay execution route.');
 if(!same(d.recipient,i.account)||inc?.currency?.chainId!==i.chainId||!same(inc.currency.address,i.asset.address)||inc.currency.decimals!==i.asset.decimals||inc.amount!==String(units(i.amount,i.asset.decimals))||out?.currency?.chainId!==destinationChainId||!same(out.currency.address,i.outputAsset.address)||out.currency.decimals!==i.outputAsset.decimals||!uint(out.amount)||!uint(out.minimumAmount)||BigInt(out.minimumAmount)<=0n||BigInt(out.minimumAmount)>BigInt(out.amount)||BigInt(out.minimumAmount)<BigInt(out.amount)*99n/100n)throw Error('Route does not match the requested assets or minimum receive.');
 if(order.inputs.length!==1||source.payment?.chainId!==networks[i.chainId].slug||!same(source.payment.currency,i.asset.address)||source.payment.amount!==inc.amount||!source.refunds?.length||source.refunds.some(r=>!same(r.recipient,i.account)||![networks[i.chainId].slug,networks[destinationChainId].slug].includes(r.chainId))||order.output.chainId!==networks[destinationChainId].slug||!Array.isArray(pay)||pay.length!==1||!same(pay[0].recipient,i.account)||!same(pay[0].currency,i.outputAsset.address)||pay[0].minimumAmount!==out.minimumAmount||pay[0].expectedAmount!==out.amount||order.output.calls?.length!==0||!Number.isSafeInteger(order.output.deadline)||order.output.deadline*1000<=now)throw Error('Route payment or refund destination did not match.');
 const impact=Number(d.totalImpact?.percent);if(d.totalImpact?.percent==null||String(d.totalImpact.percent).trim()===''||!Number.isFinite(impact))throw Error('Route impact unavailable.');const userReviewedSwap=i.kind==='swap'&&destinationChainId===i.chainId&&[8453,4663].includes(i.chainId);
 if(!userReviewedSwap&&Math.abs(impact)>3){
  const error=Error('Route impact exceeds 3%. Try another amount or asset.');
  error.routeComparison={impactPercent:impact,output:formatUnits(BigInt(out.amount),i.outputAsset.decimals),minimum:formatUnits(BigInt(out.minimumAmount),i.outputAsset.decimals)};
  throw error;
 }
 const fee=raw.fees?.relayer;if(!uint(fee?.amount)||fee.currency?.chainId!==i.chainId||!same(fee.currency.address,i.asset.address))throw Error('Route fee could not be verified.');
 return {...i,recipient:i.account,destinationChainId,requestId:raw.requestId,depositAddress:step.depositAddress,expectedAmount:formatUnits(BigInt(out.amount),i.outputAsset.decimals),minimumAmount:formatUnits(BigInt(out.minimumAmount),i.outputAsset.decimals),minimumRaw:out.minimumAmount,fee:formatUnits(BigInt(fee.amount),i.asset.decimals),impactPercent:Math.abs(impact),expiresAt:Math.min(now+120000,order.output.deadline*1000),createdAt:now,provider:'Relay'};
}
export async function robinhoodRouteQuote(input,o={}){
 const {account,chainId,amount,asset:token,outputAsset=ZERO}=input||{},accountOptionalForBaseQuote=input?.kind==='swap'&&chainId===8453;if((!address(account)&&!accountOptionalForBaseQuote)||!networks[chainId]||!/^0x[0-9a-f]{40}$/i.test(token||'')||!/^0x[0-9a-f]{40}$/i.test(outputAsset))throw Error('Choose a source network, asset and destination asset.');
 const kind=input.kind==='swap'||chainId===4663?'swap':'bridge',destinationChainId=kind==='swap'?chainId:4663;if(input.kind&&!['swap','bridge'].includes(input.kind))throw Error('Unsupported route action.');if(kind==='swap'&&same(token,outputAsset))throw Error('Choose different swap assets.');
 const isBaseCore=a=>assets[8453].some(x=>same(x.address,a)),sourceCore=chainId===4663||isBaseCore(token),outputCore=chainId===4663||isBaseCore(outputAsset);let baseStockPair=null,baseStockPoolKey=null;
 if(chainId!==4663&&kind!=='swap'&&(!sourceCore||!outputCore))throw Error('Bridge only supports ETH, USDC or USDT on Base or Arbitrum.');
 if(chainId!==4663&&kind==='swap'&&(!sourceCore||!outputCore)){
  if(chainId!==8453||sourceCore||outputCore)throw Error('Base token swaps require a Dinn-verified Bankr stock-paired token and its exact stock pair.');
  let report=null,candidate=null;
  for(const [possibleToken,possiblePair] of [[token,outputAsset],[outputAsset,token]]){
   const result=o.baseResearchResult&&same(o.baseResearchResult.address,possibleToken)?o.baseResearchResult:await (o.baseResearch||researchBaseStockPairedToken)({address:possibleToken},{env:o.env||process.env,fetchImpl:o.fetcher||fetch,holderSnapshotEnabled:false});
   if(same(result?.address,possibleToken)&&result?.classification==='verified-bankr-stock-paired-token'&&result?.verification?.status==='verified'&&result?.market?.matchesBankrPool===true&&/^0x[0-9a-f]{64}$/i.test(result?.launch?.poolId||'')&&same(result?.stock?.address,result?.launch?.pairedStock?.address)&&same(result.launch.pairedStock.address,possiblePair)){report=result;candidate=possibleToken;break;}
  }
  if(!report)throw Error('I could not verify this exact Bankr token and stock pair. Research it again before trading.');
  if(!report.launch?.poolKey||!hash(report.verification?.blockHash)||!same(baseV4PoolId(report.launch.poolKey),report.launch.poolId)||report.verification?.computedPoolId!==report.launch.poolId)throw Error('The Bankr pool key could not be verified from its launch receipt. No quote was prepared.');
  const paired=report.launch.pairedStock.address;
  baseStockPair={tokenAddress:candidate,stockAddress:paired,bankrPoolId:report.launch.poolId,checkedAt:report.checkedAt,checkedAtHash:report.verification.blockHash,classification:report.classification};baseStockPoolKey=report.launch.poolKey;
 }
 const c=walletClient(chainId,o),b=await walletSnapshot(c,chainId,o.now),asset=await walletAsset(c,chainId,token,b),dest=walletClient(destinationChainId,o.destination?{client:o.destination}:chainId===destinationChainId?{client:c}:{}),db=await walletSnapshot(dest,destinationChainId,o.now),out=await walletAsset(dest,destinationChainId,outputAsset,db);
 const i={kind,destinationChainId,chainId,account,amount,asset,outputAsset:out,...(baseStockPair?{baseStockPair,baseStockPoolKey}:{})};
 if(baseStockPair)return quoteBaseStockPool(i,c,b,o);
 if(!address(account))throw Error('A connected wallet is needed for this route quote.');
 const raw=await readJson('https://api.relay.link/quote/v2',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({user:account,recipient:account,originChainId:chainId,destinationChainId,originCurrency:asset.address,destinationCurrency:out.address,amount:String(units(amount,asset.decimals)),tradeType:'EXACT_INPUT',useDepositAddress:true,strict:true,refundTo:account,recoveryAddress:account,slippageTolerance:'100'})},o.fetcher).catch(error=>{if([400,404,422].includes(error.status))throw Error('No executable route is available for this pair and amount. Try another pair or amount.');throw error;});return validateRobinhoodRoute(raw,i,(o.now||Date.now)());
}
async function quoteBaseStockPool(i,c,b,o={}){
 const now=(o.now||Date.now)(),key=i.baseStockPoolKey,proof=i.baseStockPair;
 if(!key||!same(baseV4PoolId(key),proof.bankrPoolId)||!same(key.currency0,i.asset.address)&&!same(key.currency1,i.asset.address)||!same(key.currency0,i.outputAsset.address)&&!same(key.currency1,i.outputAsset.address))throw Error('The verified Bankr pool does not match these two tokens.');
 const amount=units(i.amount,i.asset.decimals);if(amount>=2n**128n)throw Error('Amount is outside the supported range for this pool.');
 const blockNumber=b.number,quote=await c.simulateContract({address:BASE_V4_QUOTER,abi:baseV4QuoterAbi,functionName:'quoteExactInputSingle',args:[{poolKey:key,zeroForOne:same(i.asset.address,key.currency0),exactAmount:amount,hookData:'0x'}],blockNumber});
 const outputRaw=quote.result[0],minimum=outputRaw*9900n/10000n;if(outputRaw<=0n||minimum<=0n||outputRaw>=2n**128n)throw Error('No usable Base pool quote is available for this amount.');
 return {...i,provider:'Uniswap V4 pool reference',poolKey:key,poolId:proof.bankrPoolId,amountRaw:amount.toString(),amountOutRaw:outputRaw.toString(),minimumRaw:minimum.toString(),minimumAmount:formatUnits(minimum,i.outputAsset.decimals),expectedAmount:formatUnits(outputRaw,i.outputAsset.decimals),minimumOutput:formatUnits(minimum,i.outputAsset.decimals),impactPercent:null,slippageBps:100,quoteBlockNumber:String(blockNumber),quoteExpiresAt:now+60000,quoterGas:quote.result[1].toString(),fee:null,executionEnabled:false,executionNote:'Bankr must verify location eligibility and provide the executable trade quote.'};
}
export async function prepareRobinhoodRoute(input,o={}){const review=await robinhoodRouteQuote(input,o);if(review.baseStockPair)throw Error('Dinn can show a read-only pool reference quote for this Base stock pair, but Bankr must perform its location check and provide the executable trade.');return prepareWalletCall(review,o);}
async function payoutProof(txHash,q,o,chainId=q.destinationChainId||4663){const c=walletClient(chainId,chainId===(q.destinationChainId||4663)?(o.destination?{client:o.destination}:chainId===q.chainId?o:{}):o),b=await walletSnapshot(c,chainId,o.now),r=await c.getTransactionReceipt({hash:txHash});if(!same(r.transactionHash,txHash)||r.status!=='success'||(await c.getBlock({blockNumber:r.blockNumber})).hash!==r.blockHash||b.number-r.blockNumber+1n<2n)return false;let amount=0n;
 if(!same(q.outputAsset.address,ZERO)){for(const l of r.logs)try{const e=decodeEventLog({abi:erc20,data:l.data,topics:l.topics});if(!l.removed&&same(l.address,q.outputAsset.address)&&e.eventName==='Transfer'&&same(e.args.to,q.account))amount+=e.args.value;}catch{}}
 else{const tx=await c.getTransaction({hash:txHash});if(same(tx.to,q.account))amount+=tx.value;if(amount>=BigInt(q.minimumRaw))return true;const directAmount=amount;try{const trace=await c.request({method:'debug_traceTransaction',params:[txHash,{tracer:'callTracer'}]});const walk=(t,root=false)=>{if(t.error)return;if(!root&&['CALL','SELFDESTRUCT'].includes(t.type)&&same(t.to,q.account)&&/^0x[0-9a-f]+$/i.test(t.value||''))amount+=BigInt(t.value);for(const child of t.calls||[])walk(child);};walk(trace,true);}catch{amount=directAmount;try{const traces=await (o.traceRead||blockscoutRead)('transactions/'+txHash+'/internal-transactions',{chainId,fetchImpl:o.fetcher||fetch});if(!Array.isArray(traces.items)||traces.next_page_params)return false;for(const t of traces.items)if(t.success===true&&t.type==='call'&&same(t.to?.hash,q.account)&&uint(t.value))amount+=BigInt(t.value);}catch{return false;}}}
 return amount>=BigInt(q.minimumRaw);
}
async function relayDepositProof(txHash,q,o){
 const c=walletClient(q.chainId,o),b=await walletSnapshot(c,q.chainId,o.now),r=await c.getTransactionReceipt({hash:txHash});
 if(!same(r.transactionHash,txHash)||r.status!=='success'||(await c.getBlock({blockNumber:r.blockNumber})).hash!==r.blockHash||b.number-r.blockNumber+1n<2n)return false;
 const amount=units(q.amount,q.asset.decimals);
 if(same(q.asset.address,ZERO)){const tx=await c.getTransaction({hash:txHash});return same(tx.from,q.depositAddress)&&tx.value>=amount;}
 return r.logs.some(log=>{try{const event=decodeEventLog({abi:erc20,data:log.data,topics:log.topics});return !log.removed&&same(log.address,q.asset.address)&&event.eventName==='Transfer'&&same(event.args.from,q.depositAddress)&&event.args.value>=amount;}catch{return false;}});
}
export async function robinhoodRouteStatus(input,o={}){
 const q=input?.review;walletTransaction(q);if(!hash(input.hash)||!hash(q.requestId)||!uint(q.minimumRaw)||BigInt(q.minimumRaw)<=0n)throw Error('Invalid saved route.');
 const source=await walletSourceReceipt(input,o);if(source.state!=='verified')return {...source,stage:'source'};
 let requestId=q.requestId,s=await readJson('https://api.relay.link/intents/status/v3?requestId='+requestId,{},o.fetcher);
 if(s.status==='waiting'){try{const data=await readJson('https://api.relay.link/requests/v3?depositAddress='+q.depositAddress+'&limit=10',{},o.fetcher);const match=data.requests?.find(r=>same(r.depositAddress?.address,q.depositAddress)&&same(r.depositAddress?.depositTxHash,input.hash)&&same(r.recipient,q.account));if(hash(match?.id)){requestId=match.id;s=await readJson('https://api.relay.link/intents/status/v3?requestId='+requestId,{},o.fetcher);}}catch{}}
 const reportedInputs=(s.inTxHashes||[]).filter(hash).slice(0,5);let matchedInput=reportedInputs.some(h=>same(h,input.hash));
 if(!matchedInput&&s.originChainId===q.chainId)for(const h of reportedInputs)try{if(await relayDepositProof(h,q,o)){matchedInput=true;break;}}catch{}
 if(s.originChainId!==q.chainId||s.status!=='refund'&&s.destinationChainId!==q.destinationChainId||!matchedInput)return {state:'pending',stage:'route',message:'Source payment verified; waiting for the matching route.',hash:input.hash};
 const txHashes=[...new Set((s.txHashes||[]).filter(hash))].slice(0,5);
 if(s.status==='success'){for(const h of txHashes)try{if(await payoutProof(h,q,o))return {state:'verified',stage:'destination',hash:input.hash,destinationHash:h,requestId};}catch{}return {state:'confirming',stage:'destination',hash:input.hash,message:'Relay reports delivery. Destination payout verification is still pending.',destinationHash:txHashes[0]};}
 if(s.status==='refund'){for(const h of txHashes)for(const [chainId,asset] of [[q.chainId,q.asset],[q.destinationChainId,q.outputAsset]])try{if(await payoutProof(h,{...q,outputAsset:asset,minimumRaw:'1'},o,chainId))return {state:'refunded',hash:input.hash,destinationHash:h,refundChainId:chainId,requestId,message:'Refund confirmed. Network and provider fees may have been deducted.'};}catch{}return {state:'refund-reported',hash:input.hash,message:'Relay reports a refund. Payout verification is pending; do not send again.',requestId};}
 return {state:'pending',stage:'route',hash:input.hash,requestId,message:s.refundFailReason?'Route needs recovery. Check Relay recovery; do not send again.':'Source payment confirmed. Waiting for destination delivery.',needsRecovery:!!s.refundFailReason};
}
