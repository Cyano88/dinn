import {parseAbi,parseAbiParameters,encodeAbiParameters,encodeFunctionData,keccak256,parseUnits,toHex,isAddress} from 'viem';
import {contracts,pairs} from './domain.mjs';
export const keyType='(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)';
export const tokenAbi=parseAbi(['function decimals() view returns (uint8)','function symbol() view returns (string)','function balanceOf(address) view returns (uint256)','function allowance(address,address) view returns (uint256)','function approve(address,uint256) returns (bool)','function deposit() payable']);
export const permitAbi=parseAbi(['function allowance(address,address,address) view returns (uint160 amount,uint48 expiration,uint48 nonce)','function approve(address token,address spender,uint160 amount,uint48 expiration)']);
export const routerAbi=parseAbi(['function execute(bytes commands,bytes[] inputs,uint256 deadline) payable']);
export const quoterAbi=parseAbi([`function quoteExactInputSingle((${keyType} poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)`]);
export const hookAbi=parseAbi(['event HookSwap(bytes32 indexed poolId,address indexed sender,int128 amount0,int128 amount1,uint128 hookLPfeeAmount0,uint128 hookLPfeeAmount1)']);
const address=x=>typeof x==='string'&&isAddress(x,{strict:false})&&!/^0x0{40}$/i.test(x);
export function swapIntent(input){
 if(!input||input.chainId!==99901||!address(input.account)||!address(input.token))throw Error('Swaps require an Elysium mainnet wallet and token address.');
 if(!['buy','sell'].includes(input.side)||!Object.hasOwn(pairs,input.pair))throw Error('Choose a supported trading pair and direction.');
 if(Object.values(pairs).some(p=>p.address.toLowerCase()===input.token.toLowerCase()))throw Error('Choose an Ascend launched token.');
 if(typeof input.amount!=='string'||!/^\d+(\.\d+)?$/.test(input.amount)||input.amount.length>80)throw Error('Enter a positive decimal amount.');
 if(!Number.isInteger(input.slippageBps)||input.slippageBps<10||input.slippageBps>300)throw Error('Slippage must be between 0.1% and 3%.');
 return {account:input.account,chainId:99901,token:input.token,side:input.side,pair:input.pair,amount:input.amount,slippageBps:input.slippageBps};
}
export function swapPool(intent){const quote=pairs[intent.pair].address;const poolKey={currency0:BigInt(intent.token)<BigInt(quote)?intent.token:quote,currency1:BigInt(intent.token)<BigInt(quote)?quote:intent.token,fee:0x800000,tickSpacing:200,hooks:contracts.launchpad};return {poolKey,poolId:keccak256(encodeAbiParameters(parseAbiParameters(keyType),[poolKey])),input:intent.side==='buy'?quote:intent.token,output:intent.side==='buy'?intent.token:quote};}
export function swapTransaction(review){
 const intent=swapIntent(review.intent),{poolKey,poolId,input,output}=swapPool(intent);
 if(review.poolId!==poolId)throw Error('Pool differs from the selected token and pair.');
 const decimals=intent.side==='buy'?pairs[intent.pair].decimals:review.tokenDecimals;
 if(!Number.isInteger(decimals)||decimals<0||decimals>36||(intent.amount.split('.')[1]?.length||0)>decimals)throw Error('Invalid token precision.');
 const amount=parseUnits(intent.amount,decimals);if(amount<=0n||amount>=2n**128n||amount!==BigInt(review.amountIn))throw Error('Invalid swap amount.');
 const out=BigInt(review.amountOut),minimum=out*BigInt(10000-intent.slippageBps)/10000n;
 if(out<=0n||minimum<=0n||minimum>=2n**128n||minimum!==BigInt(review.minOut))throw Error('Invalid minimum output.');
 if(!Number.isSafeInteger(review.deadline)||review.deadline<=0)throw Error('Invalid swap deadline.');
 let to,data,value=0n;
 switch(review.step){
  case 'wrap':value=BigInt(review.wrapAmount);if(intent.side!=='buy'||intent.pair!=='HYPE'||value<=0n||value>amount)throw Error('Invalid wrapping amount.');to=pairs.HYPE.address;data=encodeFunctionData({abi:tokenAbi,functionName:'deposit'});break;
  case 'reset':case 'approve':to=input;data=encodeFunctionData({abi:tokenAbi,functionName:'approve',args:[contracts.permit2,review.step==='reset'?0n:amount]});break;
  case 'permit':to=contracts.permit2;data=encodeFunctionData({abi:permitAbi,functionName:'approve',args:[input,contracts.router,amount,review.deadline]});break;
  case 'swap':{
   to=contracts.router;
   const swap=encodeAbiParameters(parseAbiParameters(`(${keyType} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)`),[{poolKey,zeroForOne:input.toLowerCase()===poolKey.currency0.toLowerCase(),amountIn:amount,amountOutMinimum:minimum,minHopPriceX36:0n,hookData:'0x'}]);
   const actions=encodeAbiParameters(parseAbiParameters('bytes,bytes[]'),['0x060c0f',[swap,encodeAbiParameters(parseAbiParameters('address,uint256'),[input,amount]),encodeAbiParameters(parseAbiParameters('address,uint256'),[output,minimum])]]);
   data=encodeFunctionData({abi:routerAbi,functionName:'execute',args:['0x10',[actions],BigInt(review.deadline)]});break;
  }
  default:throw Error('Unknown swap step.');
 }
 return {from:intent.account,to,data,value:toHex(value),chainId:toHex(99901)};
}
export function assertSwapReview(review,expected,now=Date.now()){
 const intent=swapIntent(expected);if(JSON.stringify(intent)!==JSON.stringify(swapIntent(review.intent)))throw Error('Swap differs from your review.');
 if(!Number.isSafeInteger(review.expiresAt)||review.expiresAt<=now||review.expiresAt>now+65000||review.deadline*1000<=now||review.deadline*1000>now+360000)throw Error('Quote expired. Get a fresh quote.');
 const tx=swapTransaction(review);for(const k of Object.keys(tx))if(String(tx[k]).toLowerCase()!==String(review.transaction?.[k]).toLowerCase())throw Error('Swap transaction differs from your review.');
 if(Object.keys(review.transaction).some(k=>!Object.hasOwn(tx,k)))throw Error('Unexpected transaction fields.');return tx;
}
