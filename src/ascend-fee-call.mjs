import {swapPool} from './swap-call.mjs';
﻿import {isAddress,zeroAddress,parseAbi,encodeFunctionData,toHex} from 'viem';
import {pairs} from './domain.mjs';
export const feeAbi=parseAbi(['function settle()','function claim(address account) returns(uint256)','function claimable(address account) view returns(uint256)','event Settled(uint8 phase,uint8 band,uint256 arrived,uint256 builder,uint256 recipient,uint256 held,uint256 support,uint256 protocol,uint256 buyback)','event Withdrawn(address indexed account,address indexed to,uint256 amount)','event Transfer(address indexed from,address indexed to,uint256 value)']);
export const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
export function feeIntent(i){
 if(!i||!['claim','settle'].includes(i.action)||!Object.hasOwn(pairs,i.pair)||![i.account,i.token].every(a=>isAddress(a||'',{strict:false})&&!same(a,zeroAddress)))throw Error('Choose a token, pair, wallet and fee action.');
 return {account:i.account,token:i.token,pair:i.pair,action:i.action,chainId:99901};
}
export function feeTransaction(review){
 const i=feeIntent(review?.intent);if(!same(review.poolId,swapPool(i).poolId))throw Error('Fee pool differs from the token and pair.');if(!isAddress(review.escrow||'',{strict:false})||same(review.escrow,zeroAddress))throw Error('Invalid creator escrow.');
 return {from:i.account,to:review.escrow,chainId:toHex(99901),value:'0x0',data:encodeFunctionData({abi:feeAbi,functionName:i.action,args:i.action==='claim'?[i.account]:[]})};
}
export function assertFeeReview(r,expected,now=Date.now()){
 const a=feeIntent(expected),b=feeIntent(r?.intent);if(a.action!==b.action||a.pair!==b.pair||!same(a.account,b.account)||!same(a.token,b.token))throw Error('Fee action changed. Review again.');
 if(!Number.isSafeInteger(r.expiresAt)||r.expiresAt<=now||r.expiresAt>now+90000)throw Error('Fee review expired. Check fees again.');
 if(!/^0x[0-9a-f]{64}$/i.test(r.poolId||'')||!/^\d+$/.test(r.amountRaw||'')||BigInt(r.amountRaw)<=0n)throw Error('No fees are available for this action.');
 for(const k of ['gas','gasPrice'])if(!/^0x[0-9a-f]+$/i.test(r[k]||'')||BigInt(r[k])<=0n)throw Error('Fee estimate is missing.');
 if(BigInt(r.gas)>32000000n)throw Error('Fee gas estimate is too large.');
 return {...feeTransaction(r),gas:r.gas,gasPrice:r.gasPrice};
}
