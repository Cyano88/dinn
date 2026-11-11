import {encodeFunctionData,zeroAddress} from 'viem';
import {escrowAbi,escrowAddress} from './pons-fee-abi.mjs';
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const address=v=>typeof v==='string'&&/^0x[0-9a-f]{40}$/i.test(v)&&!same(v,zeroAddress);
export function claimTransaction({account,asset,amountWei,escrow=escrowAddress}){
 if(!address(account)||!same(escrow,escrowAddress)||!/^0x[0-9a-f]{40}$/i.test(asset)||!/^\d{1,78}$/.test(amountWei)||BigInt(amountWei)<=0n)throw Error('Invalid fee claim.');
 return {from:account,to:escrowAddress,chainId:'0x1237',value:'0x0',data:encodeFunctionData({abi:escrowAbi,functionName:same(asset,zeroAddress)?'claim':'claimToken',args:same(asset,zeroAddress)?[BigInt(amountWei)]:[asset,BigInt(amountWei)]})};
}
