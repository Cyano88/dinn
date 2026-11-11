import {claimTransaction} from './pons-claim-call.mjs';
import {parseAbi,formatUnits,zeroAddress,keccak256,encodeAbiParameters,encodeFunctionData,decodeEventLog,toHex} from 'viem';
import {getClient,snapshot,PONS_FACTORY} from './pons.mjs';
import {factoryAbi,escrowAbi,factoryCodeHash,escrowCodeHash,escrowAddress} from './pons-fee-abi.mjs';
import {purchaseUsdReference} from './purchase-usd.mjs';
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const address=v=>typeof v==='string'&&/^0x[0-9a-f]{40}$/i.test(v)&&!same(v,zeroAddress);
const clean=v=>String(v).replace(/[\x00-\x1f\x7f]/g,'').slice(0,80);
const tokenAbi=parseAbi(['function name() view returns(string)','function symbol() view returns(string)','function decimals() view returns(uint8)','function totalSupply() view returns(uint256)']);
const curveAbi=parseAbi(['function factory() view returns(address)','function token() view returns(address)','function pairToken() view returns(address)','function getReserves() view returns(uint256,uint256)','function realQuoteReserve() view returns(uint256)','function sellableTokens() view returns(uint256)','function readyToGraduate() view returns(bool)','function quoteFeeBalance() view returns(uint256)','function creatorTaxBalance() view returns(uint256)']);
const hookAbi=parseAbi(['function pendingFees(bytes32,address) view returns(uint256)','function pendingCreatorTax(bytes32,address) view returns(uint256)']);
export function creatorShare(fee,tax,policy,buyback){const protocol=fee*BigInt(policy.protocolFeeShareBps)/10000n,after=fee-protocol;return after-(buyback?after*BigInt(policy.buybackBurnBps)/10000n:0n)+tax;}
export function curveMetrics({quoteReserve,tokenReserve,raised,threshold,supply,decimals,pairDecimals}){
 if(tokenReserve<=0n||threshold<=0n||decimals>36||pairDecimals>36)throw Error('Invalid curve pricing state.');
 return {priceQuote:formatUnits(quoteReserve*10n**BigInt(decimals)*10n**18n/(tokenReserve*10n**BigInt(pairDecimals)),18),fdvQuote:formatUnits(quoteReserve*supply/tokenReserve,pairDecimals),progressPercent:Math.min(100,Number(raised*10000n/threshold)/100),raised:formatUnits(raised,pairDecimals),threshold:formatUnits(threshold,pairDecimals)};
}
export async function feeContext(input,o={}){
 if(!address(input?.address)||input.account!==undefined&&!address(input.account))throw Error('Provide a token address and a valid wallet address.');
 const c=getClient(o),b=await snapshot(c,o.now),blockNumber=b.number;
 const read=(to,abi,functionName,args=[])=>c.readContract({address:to,abi,functionName,args,blockNumber});
 const code=await c.getCode({address:PONS_FACTORY,blockNumber});if(!code||keccak256(code)!==factoryCodeHash)throw Error('Pons deployment could not be verified.');
 const launch=await read(PONS_FACTORY,factoryAbi,'getLaunchedToken',[input.address]);
 if(!launch.exists||!same(launch.token,input.address)||!address(launch.curve))throw Error('This token is not registered in the supported Pons v2 deployment. Older deployments need a separate adapter.');
 const [identity,escrow,hook,policy,name,symbol,decimals,supply,pairSymbol,pairDecimals]=await Promise.all([
 Promise.all(['factory','token','pairToken'].map(fn=>read(launch.curve,curveAbi,fn))),read(PONS_FACTORY,factoryAbi,'feeEscrow'),read(PONS_FACTORY,factoryAbi,'memeHook'),read(PONS_FACTORY,factoryAbi,'getLaunchFeePolicy',[input.address]),
 ...['name','symbol','decimals','totalSupply'].map(fn=>read(input.address,tokenAbi,fn)),
 same(launch.pairToken,zeroAddress)?'ETH':read(launch.pairToken,tokenAbi,'symbol'),same(launch.pairToken,zeroAddress)?18:read(launch.pairToken,tokenAbi,'decimals')]);
 if(!same(identity[0],PONS_FACTORY)||!same(identity[1],input.address)||!same(identity[2],launch.pairToken)||!same(escrow,escrowAddress)||decimals>36||pairDecimals>36)throw Error('Token, curve or escrow binding did not match.');
 if(keccak256(await c.getCode({address:escrow,blockNumber}))!==escrowCodeHash)throw Error('Pons fee escrow runtime changed.');
 if(![0,1,2,3].includes(Number(launch.phase))||Number(policy.protocolFeeShareBps)>10000||Number(policy.buybackBurnBps)>10000)throw Error('Unsupported Pons fee state.');
 return {c,b,read,launch,escrow,hook,policy,name:clean(name),symbol:clean(symbol),decimals,supply,pairSymbol:clean(pairSymbol),pairDecimals,account:input.account||launch.creatorFeeRecipient};
}
async function marketReference(address,fetcher=fetch){try{const r=await fetcher('https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/'+address,{signal:AbortSignal.timeout(8000),redirect:'error'});if(!r.ok)throw Error();const raw=await r.text();if(raw.length>150000)throw Error();const a=JSON.parse(raw)?.data?.attributes;if(!same(a?.address,address))throw Error();const amount=v=>typeof v==='string'&&/^\d+(\.\d+)?$/.test(v)&&Number.isFinite(Number(v))?v:null;return {marketCapUsd:amount(a.market_cap_usd),priceUsd:amount(a.price_usd),fdvUsd:amount(a.fdv_usd),source:'GeckoTerminal reported',checkedAt:new Date().toISOString()};}catch{return {marketCapUsd:null,priceUsd:null,fdvUsd:null,source:'Unavailable'};}}
export async function ponsTokenState(input,o={}){
 const x=await feeContext(input,o),{c,b,read,launch,escrow,hook,policy,account}=x;
 const claimable=await read(escrow,escrowAbi,same(launch.pairToken,zeroAddress)?'balanceOf':'balanceOfToken',same(launch.pairToken,zeroAddress)?[account]:[account,launch.pairToken]);
 let curve=null,unswept=null,feeReadError=false;
 if(Number(launch.phase)===0){const [reserves,raised,sellable,ready]=await Promise.all(['getReserves','realQuoteReserve','sellableTokens','readyToGraduate'].map(fn=>read(launch.curve,curveAbi,fn)));curve={...curveMetrics({quoteReserve:reserves[0],tokenReserve:reserves[1],raised,threshold:launch.graduationThreshold,supply:x.supply,decimals:x.decimals,pairDecimals:x.pairDecimals}),readyToGraduate:ready,sellable:formatUnits(sellable,x.decimals)};}
 try{
 if(Number(launch.phase)===0){const [fee,tax]=await Promise.all(['quoteFeeBalance','creatorTaxBalance'].map(fn=>read(launch.curve,curveAbi,fn)));unswept={quote:formatUnits(creatorShare(fee,tax,policy,launch.buybackEnabled),x.pairDecimals),launchTokens:'0',estimate:true};}
 else if(Number(launch.phase)===2){const currencies=[input.address,launch.pairToken].sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase()));const poolId=keccak256(encodeAbiParameters([{type:'address'},{type:'address'},{type:'uint24'},{type:'int24'},{type:'address'}],[...currencies,launch.poolFee,launch.tickSpacing,hook]));const [q,t]=await Promise.all([launch.pairToken,input.address].map(async asset=>{const [fee,tax]=await Promise.all(['pendingFees','pendingCreatorTax'].map(fn=>read(hook,hookAbi,fn,[poolId,asset])));return creatorShare(fee,tax,policy,launch.buybackEnabled);}));unswept={quote:formatUnits(q,x.pairDecimals),launchTokens:formatUnits(t,x.decimals),estimate:true};}
 }catch{feeReadError=true;}
 const [market,usd]=await Promise.all([(o.market||marketReference)(input.address,o.fetcher),(o.usd||purchaseUsdReference)({pairToken:launch.pairToken})]);
 if((await c.getBlock({blockNumber:b.number})).hash!==b.hash)throw Error('The chain snapshot changed. Check again.');
 return {address:input.address,name:x.name,symbol:x.symbol,chainId:4663,phase:Number(launch.phase),status:['On bonding curve','Curve complete; pool pending','Graduated; Uniswap v4 pool','Recovery path'][Number(launch.phase)],curve,market,quoteUsd:usd,feeRecipient:launch.creatorFeeRecipient,viewerAccount:account,pair:{address:launch.pairToken,symbol:x.pairSymbol,decimals:x.pairDecimals},escrow,claimable:formatUnits(claimable,x.pairDecimals),claimableWei:String(claimable),claimScope:'Entire wallet balance for this asset in this Pons escrow; may include several launches.',unswept,feeReadError,unsweptRecipient:launch.creatorFeeRecipient,blockNumber:String(b.number),checkedAt:new Date(Number(b.timestamp)*1000).toISOString(),lifetimeEarnings:null};
}
export function tokenStateMessage(s,focus='overview'){
 const lines=[`${s.name} (${s.symbol}) - ${s.status}`];
 if(focus!=='fees'){
  if(s.curve)lines.push(`Bonding progress: ${s.curve.progressPercent}% (${s.curve.raised} / ${s.curve.threshold} ${s.pair.symbol}).${s.curve.readyToGraduate?' Ready to graduate.':''}`,`Spot price: ${s.curve.priceQuote} ${s.pair.symbol}. Fully diluted value: ${s.curve.fdvQuote} ${s.pair.symbol}.`);
  else if(s.market.priceUsd)lines.push(`Reported price: $${s.market.priceUsd}.${s.market.fdvUsd?' Fully diluted value: $'+s.market.fdvUsd+'.':''}`);
  lines.push(s.market.marketCapUsd?`Reported circulating market cap: $${s.market.marketCapUsd} (${s.market.source}).`:'Circulating market cap is unavailable.');
 }
 if(focus!=='market'){
  lines.push(`Ready to claim: ${s.claimable} ${s.pair.symbol}. This is the wallet's total for this asset across this Pons escrow.`);
  if(s.unswept)lines.push(`Awaiting distribution: approximately ${s.unswept.quote} ${s.pair.symbol}${s.unswept.launchTokens!=='0'?' plus '+s.unswept.launchTokens+' '+s.symbol+' awaiting conversion':''}. These fees are not claimable yet.${!same(s.viewerAccount,s.unsweptRecipient)?' They belong to the current creator fee recipient, a different wallet.':''}`);
  else lines.push('Fees awaiting distribution could not be determined.');
  lines.push('Lifetime earnings are not available.');
 }
 return lines.join('\n\n');
}
export async function preparePonsClaim(input,o={}){
 if(!address(input?.account))throw Error('Connect the wallet that owns the claimable fees.');
 const s=await ponsTokenState(input,o);if(BigInt(s.claimableWei)<=0n)throw Error('This wallet has no claimable balance for this asset. Pending distribution is separate.');
 const claim={address:input.address,account:input.account,asset:s.pair.address,amountWei:s.claimableWei,escrow:s.escrow},tx=claimTransaction(claim),c=getClient(o);
 await c.call({account:input.account,to:tx.to,data:tx.data,value:0n});const [gas,gasPrice,balance]=await Promise.all([c.estimateGas({account:input.account,to:tx.to,data:tx.data,value:0n}),c.getGasPrice(),c.getBalance({address:input.account})]);const gasLimit=gas*120n/100n,cost=gasLimit*gasPrice;if(balance<cost)throw Error('The claiming wallet needs ETH for gas.');
 return {claim,transaction:tx,amount:s.claimable,symbol:s.pair.symbol,scope:s.claimScope,estimatedGas:formatUnits(cost,18),expiresAt:(o.now||Date.now)()+60000,simulated:true};
}
export async function ponsClaimReceipt(input,o={}){
 if(!/^0x[0-9a-f]{64}$/i.test(input.hash||''))throw Error('Provide the claim transaction hash.');
 const claim=input.claim,expected=claimTransaction(claim),x=await feeContext({address:claim.address,account:claim.account},o);if(!same(x.launch.pairToken,claim.asset))throw Error('Claim asset does not match this launch.');
 let tx,r;try{[tx,r]=await Promise.all([x.c.getTransaction({hash:input.hash}),x.c.getTransactionReceipt({hash:input.hash})]);}catch(e){if(['TransactionNotFoundError','TransactionReceiptNotFoundError'].includes(e.name))return {state:'pending',hash:input.hash};throw e;}
 return verifyPonsClaimReceipt({claim,hash:input.hash,tx,receipt:r,canonicalHash:(await x.c.getBlock({blockNumber:r.blockNumber})).hash,head:x.b.number});
}
export function verifyPonsClaimReceipt({claim,hash,tx,receipt:r,canonicalHash,head}){
 const expected=claimTransaction(claim);
 if(!same(tx.from,claim.account)||!same(tx.to,expected.to)||!same(tx.input,expected.data)||tx.value!==0n||tx.chainId!==undefined&&tx.chainId!==4663||!same(r.transactionHash,hash)||!same(tx.blockHash,r.blockHash)||canonicalHash!==r.blockHash)throw Error('Receipt does not match this claim.');
 if(r.status!=='success')return {state:'reverted',hash};
 const matches=r.logs.filter(l=>!l.removed&&same(l.address,escrowAddress)).flatMap(l=>{try{const e=decodeEventLog({abi:escrowAbi,data:l.data,topics:l.topics});return same(e.args.recipient,claim.account)&&e.args.amount===BigInt(claim.amountWei)&&(same(claim.asset,zeroAddress)?e.eventName==='Claimed':e.eventName==='ClaimedToken'&&same(e.args.token,claim.asset))?[e]:[];}catch{return [];}});
 if(matches.length!==1)throw Error('The expected payout event was not found.');
 return {state:head-r.blockNumber+1n>=2n?'verified':'confirming',hash,recipient:claim.account,asset:claim.asset,amountWei:claim.amountWei};
}

