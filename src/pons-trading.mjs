import {decodeEventLog,parseAbi,parseAbiItem,formatUnits} from 'viem';
import {PONS_FACTORY,PONS_RPC} from './pons.mjs';
import {assets,ZERO,same,address,hash,units,erc20,walletTransaction} from './robinhood-wallet-call.mjs';
import {walletClient,walletSnapshot,walletAsset} from './robinhood-wallet.mjs';
import {prepareRobinhoodRoute} from './robinhood-routes.mjs';

const factoryAbi=parseAbi(['struct LaunchedToken { address token; address curve; address deployer; address creatorFeeRecipient; address pairToken; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; uint16 creatorTaxBps; bool buybackEnabled; uint8 phase; uint256 sweptQuote; uint256 sweptTokens; uint256 sweptAt; bool exists; }','function getLaunchedToken(address token) view returns(LaunchedToken)']);
const curveAbi=parseAbi(['function getReserves() view returns(uint256 quoteReserve,uint256 tokenReserve)','function sellableTokens() view returns(uint256)','function readyToGraduate() view returns(bool)','function feeBps() view returns(uint256)','function creatorTaxBps() view returns(uint256)','function currentSnipeTaxBps(address recipient) view returns(uint256)','function pairToken() view returns(address)','event CurveBuy(address indexed buyer,address indexed recipient,uint256 quoteIn,uint256 tokensOut,uint256 fee,uint256 tax)','event CurveSell(address indexed seller,address indexed recipient,uint256 tokensIn,uint256 quoteOut,uint256 fee,uint256 tax)']);
const approvalEvent=parseAbiItem('event Approval(address indexed owner,address indexed spender,uint256 value)');
const BPS=10_000n;
const ceilDiv=(a,b)=>(a+b-1n)/b;
function amountOut(input,reserveIn,reserveOut){if(input<=0n||reserveIn<=0n||reserveOut<=0n)throw Error('Pons returned empty trade reserves.');return input*reserveOut/(reserveIn+input);}
function amountIn(output,reserveIn,reserveOut){if(output<=0n||output>=reserveOut)throw Error('Pons returned an invalid curve fill.');return output*reserveIn/(reserveOut-output)+1n;}
export function quotePonsBuy({quoteIn,quoteReserve,tokenReserve,sellableTokens,feeBps,creatorTaxBps,snipeTaxBps}){
 let snipe=snipeTaxBps;if(snipe>0n){const maximum=BPS-feeBps-creatorTaxBps-100n;if(maximum<=0n)throw Error('Pons fee settings leave no room for an opening buy.');if(snipe>maximum)snipe=maximum;}
 const fee=quoteIn*feeBps/BPS,tax=quoteIn*creatorTaxBps/BPS,snipeFee=quoteIn*snipe/BPS;let tokensOut=amountOut(quoteIn-fee-tax-snipeFee,quoteReserve,tokenReserve),spent=quoteIn;
 if(tokensOut>sellableTokens){tokensOut=sellableTokens;const net=amountIn(sellableTokens,quoteReserve,tokenReserve),gross=ceilDiv(net*BPS,BPS-feeBps-creatorTaxBps-snipe);spent=gross<quoteIn?gross:quoteIn;}
 if(tokensOut<=0n)throw Error('No tokens remain available on the bonding curve.');return {tokensOut,spent,refund:quoteIn-spent,fee,tax,snipeFee,snipeBps:snipe};
}
export function quotePonsSell({tokensIn,quoteReserve,tokenReserve,feeBps,creatorTaxBps}){
 const gross=amountOut(tokensIn,tokenReserve,quoteReserve),fee=gross*feeBps/BPS,tax=gross*creatorTaxBps/BPS,quoteOut=gross-fee-tax;
 if(quoteOut<=0n)throw Error('The expected sale proceeds are zero after fees.');return {quoteOut,gross,fee,tax};
}
function tradeClient(o={}){return o.client||walletClient(4663,o);}
function cleanLaunch(value,token){if(!value?.exists||!same(value.token,token)||!address(value.curve)||!/^0x[0-9a-f]{40}$/i.test(value.pairToken||''))throw Error('This address is not a registered Pons v2 token on Robinhood Chain.');return value;}
async function launchAt(token,account,o={}){
 if(!address(token)||!address(account))throw Error('Send one Pons token address and connect the wallet that will trade.');
 const c=tradeClient(o),block=await walletSnapshot(c,4663,o.now),factoryCode=await c.getCode({address:PONS_FACTORY,blockNumber:block.number});if(!factoryCode||factoryCode==='0x')throw Error('The Pons v2 factory could not be verified on Robinhood Chain.');
 const launch=cleanLaunch(await c.readContract({address:PONS_FACTORY,abi:factoryAbi,functionName:'getLaunchedToken',args:[token],blockNumber:block.number}),token);
 if(await c.getCode({address:launch.curve,blockNumber:block.number})==='0x')throw Error('The registered Pons curve has no deployed code.');
 const pair=await walletAsset(c,4663,launch.pairToken,block);return {c,block,launch,pair};
}
export async function ponsTradePair(input,o={}){const {c,block,launch,pair}=await launchAt(input?.token,input?.account,o);const token=await walletAsset(c,4663,launch.token,block);return {token:{address:token.address,symbol:token.symbol,decimals:token.decimals},pair:{address:pair.address,symbol:pair.symbol,decimals:pair.decimals},phase:Number(launch.phase),blockNumber:String(block.number)};}
async function gasAndBalance({c,block,account,review,amountRaw,nativeValue=0n}){
 const tx=walletTransaction(review),request={account,to:tx.to,value:BigInt(tx.value),data:tx.data,blockNumber:block.number};
 await c.call(request);
 const [gas,gasPrice,nativeBalance]=await Promise.all([c.estimateGas(request),c.getGasPrice(),c.getBalance({address:account,blockNumber:block.number})]);
 const networkFee=gas*gasPrice*2n;if(nativeBalance<nativeValue+networkFee)throw Error('Not enough ETH for this trade and its network fee.');
 if(!same(review.asset.address,ZERO)){const balance=await c.readContract({address:review.asset.address,abi:erc20,functionName:'balanceOf',args:[account],blockNumber:block.number});if(balance<amountRaw)throw Error('Not enough '+review.asset.symbol+' in this wallet for this trade.');}
 return {transaction:tx,networkFee:formatUnits(networkFee,18)};
}
async function allowanceReview({c,block,account,tokenAddress,curve,asset,amount,amountRaw,tokenSymbol,side,o}){
 const review={kind:'pons-approval',tradeAdapter:'pons-v2',tradeSide:side,chainId:4663,account,recipient:account,curve,spender:curve,tokenAddress,curveToken:tokenAddress,pairToken:asset.address,asset,amount,amountRaw:String(amountRaw),blockNumber:String(block.number),blockHash:block.hash,slippageBps:100,expiresAt:(o.now||Date.now)()+120000};
 const costs=await gasAndBalance({c,block,account,review,amountRaw});return {...review,...costs,simulated:true,approvalFor:tokenSymbol};
}
export async function preparePonsTrade(input,o={}){
 const {kind,account,token:tokenAddress,amount}=input||{};if(!['buy','sell'].includes(kind)||!address(account)||!address(tokenAddress))throw Error('Choose buy or sell, a Pons token address, and an amount.');
 const {c,block,launch,pair}=await launchAt(tokenAddress,account,o),token=await walletAsset(c,4663,launch.token,block),phase=Number(launch.phase);
 if(phase===1)throw Error('This Pons launch is between its curve and pool. Check again shortly; no trade was prepared.');
 if(phase===3)throw Error('This Pons token is in a recovery phase. Dinn cannot trade it.');
 const asset=kind==='buy'?pair:token,outputAsset=kind==='buy'?token:pair,amountRaw=units(amount,asset.decimals);
 if(phase===2){
  const route=await prepareRobinhoodRoute({kind:'swap',account,chainId:4663,asset:asset.address,outputAsset:outputAsset.address,amount},{...o});
  return {...route,ponsTradeKind:kind,tokenAddress:token.address,tokenSymbol:token.symbol,venue:'graduated-pool'};
 }
 const [reserves,sellable,readyToGraduate,feeBps,creatorTaxBps,snipeTaxBps]=await Promise.all([
  c.readContract({address:launch.curve,abi:curveAbi,functionName:'getReserves',blockNumber:block.number}),
  c.readContract({address:launch.curve,abi:curveAbi,functionName:'sellableTokens',blockNumber:block.number}),
  c.readContract({address:launch.curve,abi:curveAbi,functionName:'readyToGraduate',blockNumber:block.number}),
  c.readContract({address:launch.curve,abi:curveAbi,functionName:'feeBps',blockNumber:block.number}),
  c.readContract({address:launch.curve,abi:curveAbi,functionName:'creatorTaxBps',blockNumber:block.number}),
  kind==='buy'?c.readContract({address:launch.curve,abi:curveAbi,functionName:'currentSnipeTaxBps',args:[account],blockNumber:block.number}):Promise.resolve(0n)
 ]);
 if(kind==='buy'&&sellable<=0n)throw Error('This Pons curve has no tokens left to buy. Its pool is not ready yet.');
 if(kind==='sell'&&readyToGraduate)throw Error('Pons has closed sells on this curve while it prepares the pool. Try again after graduation.');
 if(feeBps+creatorTaxBps>=BPS)throw Error('Pons trade fees are outside the supported range. No trade was prepared.');
 const quote=kind==='buy'?quotePonsBuy({quoteIn:amountRaw,quoteReserve:reserves[0],tokenReserve:reserves[1],sellableTokens:sellable,feeBps,creatorTaxBps,snipeTaxBps}):quotePonsSell({tokensIn:amountRaw,quoteReserve:reserves[0],tokenReserve:reserves[1],feeBps,creatorTaxBps});
 const quotedOutput=kind==='buy'?quote.tokensOut:quote.quoteOut,slippageBps=100,minimumOutputRaw=quotedOutput*(BPS-BigInt(slippageBps))/BPS;if(minimumOutputRaw<=0n)throw Error('The minimum receive amount rounds to zero. Use a larger amount.');
 if(!same(asset.address,ZERO)){
  const [balance,allowance]=await Promise.all([c.readContract({address:asset.address,abi:erc20,functionName:'balanceOf',args:[account],blockNumber:block.number}),c.readContract({address:asset.address,abi:parseAbi(['function allowance(address owner,address spender) view returns(uint256)']),functionName:'allowance',args:[account,launch.curve],blockNumber:block.number})]);
  if(balance<amountRaw)throw Error('Not enough '+asset.symbol+' in this wallet for this trade.');
  if(allowance<amountRaw){const approval=await allowanceReview({c,block,account,tokenAddress:token.address,curve:launch.curve,asset,amount,amountRaw,tokenSymbol:token.symbol,side:kind,o});if((await c.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('Pons state changed while preparing the approval. Check again.');return approval;}
 }
 const review={kind:kind==='buy'?'pons-buy':'pons-sell',tradeAdapter:'pons-v2',tradeSide:kind,chainId:4663,account,recipient:account,curve:launch.curve,tokenAddress:token.address,curveToken:token.address,pairToken:pair.address,nativeQuote:same(pair.address,ZERO),asset,outputAsset,amount,amountRaw:String(amountRaw),outputAmountRaw:String(quotedOutput),outputAmount:formatUnits(quotedOutput,outputAsset.decimals),minimumOutputRaw:String(minimumOutputRaw),minimumOutput:formatUnits(minimumOutputRaw,outputAsset.decimals),slippageBps,baseFeeBps:String(feeBps),creatorTaxBps:String(creatorTaxBps),openingTaxBps:String(kind==='buy'?quote.snipeBps:0n),feeAmount:formatUnits(quote.fee,kind==='buy'?asset.decimals:outputAsset.decimals),creatorTaxAmount:formatUnits(quote.tax,kind==='buy'?asset.decimals:outputAsset.decimals),refundAmount:kind==='buy'?formatUnits(quote.refund,asset.decimals):'0',blockNumber:String(block.number),blockHash:block.hash,venue:'bonding-curve',expiresAt:(o.now||Date.now)()+120000};
 const costs=await gasAndBalance({c,block,account,review,amountRaw,nativeValue:kind==='buy'&&same(asset.address,ZERO)?amountRaw:0n});if((await c.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('Pons state changed while preparing this quote. Check again.');return {...review,...costs,simulated:true};
}
export async function ponsTradeReceipt(input,o={}){
 const review=input?.review,txHash=input?.hash;if(!hash(txHash))throw Error('Provide a full Robinhood Chain transaction hash.');const expected=walletTransaction(review),c=tradeClient(o),block=await walletSnapshot(c,4663,o.now);let tx,receipt;
 try{[tx,receipt]=await Promise.all([c.getTransaction({hash:txHash}),c.getTransactionReceipt({hash:txHash})]);}catch(error){if(['TransactionNotFoundError','TransactionReceiptNotFoundError'].includes(error.name))return {state:'pending',hash:txHash,chainId:4663};throw error;}
 if(!same(tx.from,review.account)||!same(tx.to,expected.to)||!same(tx.input,expected.data)||tx.value!==BigInt(expected.value)||!same(receipt.transactionHash,txHash)||!same(tx.blockHash,receipt.blockHash)||(await c.getBlock({blockNumber:receipt.blockNumber})).hash!==receipt.blockHash)throw Error('Transaction does not match the reviewed Pons action.');
 if(receipt.status!=='success')return {state:'reverted',hash:txHash,chainId:4663};
 let result;
 if(review.kind==='pons-approval'){
  const match=receipt.logs.some(log=>{try{const event=decodeEventLog({abi:[approvalEvent],data:log.data,topics:log.topics});return !log.removed&&same(log.address,review.asset.address)&&event.eventName==='Approval'&&same(event.args.owner,review.account)&&same(event.args.spender,review.curve)&&event.args.value===BigInt(review.amountRaw);}catch{return false;}});
  if(!match)throw Error('The expected exact Pons trade approval was not found in the receipt.');result={state:'verified',kind:review.kind,hash:txHash,asset:review.asset.symbol,amount:review.amount,chainId:4663};
 }else{
  const eventName=review.tradeSide==='buy'?'CurveBuy':'CurveSell',abi=curveAbi.find(item=>item.type==='event'&&item.name===eventName);let matched;
  for(const log of receipt.logs){try{if(log.removed||!same(log.address,review.curve))continue;const event=decodeEventLog({abi:[abi],data:log.data,topics:log.topics});const a=event.args;if(review.tradeSide==='buy'&&event.eventName==='CurveBuy'&&same(a.buyer,review.account)&&same(a.recipient,review.account)&&a.quoteIn<=BigInt(review.amountRaw)&&a.tokensOut>=BigInt(review.minimumOutputRaw))matched=a;if(review.tradeSide==='sell'&&event.eventName==='CurveSell'&&same(a.seller,review.account)&&same(a.recipient,review.account)&&a.tokensIn===BigInt(review.amountRaw)&&a.quoteOut>=BigInt(review.minimumOutputRaw))matched=a;}catch{}}
  if(!matched)throw Error('The Pons trade receipt did not show the reviewed token amount and minimum receive.');const received=review.tradeSide==='buy'?matched.tokensOut:matched.quoteOut;result={state:'verified',kind:review.kind,side:review.tradeSide,hash:txHash,token:review.tokenAddress,symbol:review.tradeSide==='buy'?review.outputAsset.symbol:review.asset.symbol,amount:formatUnits(received,review.tradeSide==='buy'?review.outputAsset.decimals:review.asset.decimals),inputAmount:review.amount,chainId:4663,blockNumber:String(receipt.blockNumber)};
 }
 return {...result,state:block.number-receipt.blockNumber+1n>=2n?'verified':'confirming'};
}
