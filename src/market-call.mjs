import {encodeFunctionData,parseAbi,parseUnits,keccak256,encodeAbiParameters,parseAbiParameters,zeroAddress,toHex,isAddress} from 'viem';
import routerAbi from './abis/montra-trading.json' with {type:'json'};
export const MONTRA_ROUTER='0xc6E9a8E1a99023B67067B8A3605403b8d7B3A157';
export const MONTRA_HOOK='0x6b1216A40B65c83e9c9e18a562C446697B8cf8EC';
export const approvalAbi=parseAbi(['function approve(address,uint256) returns (bool)','function allowance(address,address) view returns (uint256)']);
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
export function marketIntent(i){
 if(!i||i.chainId!==99901||![i.account,i.token].every(a=>isAddress(a||'',{strict:false})&&!same(a,zeroAddress))||!['buy','sell'].includes(i.side)||typeof i.amount!=='string'||!/^\d+(\.\d+)?$/.test(i.amount)||i.amount.length>80||!Number.isInteger(i.slippageBps)||i.slippageBps<10||i.slippageBps>300||!/^Montra:0x[0-9a-f]{64}$/i.test(i.route||''))throw Error('Choose a supported Montra pool and a positive amount.');
 return {chainId:99901,account:i.account,token:i.token,side:i.side,amount:i.amount,slippageBps:i.slippageBps,route:i.route};
}
export function marketTransaction(r){
 const i=marketIntent(r.intent),k=r.poolKey;if(!same(r.router,MONTRA_ROUTER)||!k||!same(k.currency0,zeroAddress)||!same(k.currency1,i.token)||!same(k.hooks,MONTRA_HOOK)||!Number.isInteger(k.fee)||k.fee<0||k.fee>16777215||!Number.isInteger(k.tickSpacing)||k.tickSpacing<=0||k.tickSpacing>32767)throw Error('Unsupported swap contract or pool.');
 const poolId=keccak256(encodeAbiParameters(parseAbiParameters('(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)'),[k]));if(i.route!=='Montra:'+poolId)throw Error('Swap pool changed.');
 if(!Number.isInteger(r.tokenDecimals)||r.tokenDecimals<0||r.tokenDecimals>36)throw Error('Invalid token decimals.');const decimals=i.side==='buy'?18:r.tokenDecimals;if((i.amount.split('.')[1]?.length||0)>decimals)throw Error('Amount precision changed.');
 const amount=parseUnits(i.amount,decimals);if(amount<=0n||amount>=2n**128n||amount!==BigInt(r.amountIn))throw Error('Swap amount changed.');const out=BigInt(r.expectedOut),min=BigInt(r.minimumOut);if(out<=0n||out>=2n**128n||min<=0n||min!==out*BigInt(10000-i.slippageBps)/10000n)throw Error('Invalid minimum received.');
 if(!Number.isSafeInteger(r.deadline)||!['reset','approve','swap'].includes(r.step))throw Error('Invalid swap review.');
 const data=r.step==='swap'?encodeFunctionData({abi:routerAbi,functionName:'swapExactIn',args:[{key:k,zeroForOne:i.side==='buy',amountIn:amount,minAmountOut:min,recipient:i.account,deadline:BigInt(r.deadline)}]}):encodeFunctionData({abi:approvalAbi,functionName:'approve',args:[r.router,r.step==='reset'?0n:amount]});
 if(r.step!=='swap'&&i.side!=='sell')throw Error('Unexpected approval.');
 return {from:i.account,to:r.step==='swap'?r.router:i.token,chainId:toHex(99901),value:toHex(r.step==='swap'&&i.side==='buy'?amount:0n),data};
}
export function assertMarketReview(r,expected,now=Date.now()){
 const i=marketIntent(expected);for(const k of Object.keys(i))if(String(i[k]).toLowerCase()!==String(r.intent?.[k]).toLowerCase())throw Error('Trade changed. Review again.');
 if(!Number.isFinite(r.expiresAt)||r.expiresAt<=now||r.expiresAt>now+65000||r.deadline*1000<=now||r.deadline*1000>now+330000)throw Error('Swap review expired.');
 const tx=marketTransaction(r);for(const key of ['gas','gasPrice'])if(!/^0x[0-9a-f]+$/i.test(r[key]||'')||BigInt(r[key])<=0n)throw Error('Invalid network fee.');if(BigInt(r.gas)>32000000n)throw Error('Gas limit is too high.');return {...tx,gas:r.gas,gasPrice:r.gasPrice};
}
