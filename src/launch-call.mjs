import {parseAbi,decodeFunctionData,zeroAddress} from 'viem';
import {CHAIN_ID,contracts,pairs,validateLaunch} from './domain.mjs';
export const launchAbi=parseAbi(['function launchChecked((string name,string symbol,address quote,uint256 devBuyQuote,uint256 minDevOut,bytes32 salt,address creator,uint24 fee,uint24 builderFee) p,(address recipient,address dev,address builder,bool cto) r,address expectedRuleSet,int24 expectedStartTick) returns (address token,bytes32 poolId,address escrow)']);
export const sameHex=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
export function assertLaunchCall(transaction,configuration){
 const v=validateLaunch(configuration);
 if(!transaction||!sameHex(transaction.from,v.account)||!sameHex(transaction.to,contracts.factory))throw Error('Transaction sender or destination differs from the reviewed launch.');
 if(Number(transaction.chainId)!==CHAIN_ID||BigInt(transaction.value)!==0n)throw Error('Launch requires Elysium and zero native value.');
 const decoded=decodeFunctionData({abi:launchAbi,data:transaction.data});
 if(decoded.functionName!=='launchChecked')throw Error('Unsupported launch method.');
 const [p,r,ruleSet]=decoded.args;
 if(p.name!==v.name||p.symbol!==v.symbol||!sameHex(p.quote,pairs[v.pair].address)||Number(p.fee)!==v.feePips||Number(p.builderFee)!==0||p.devBuyQuote!==0n||p.minDevOut!==0n||!sameHex(p.creator,zeroAddress)||!sameHex(r.dev,v.account)||!sameHex(r.recipient,v.recipient)||!sameHex(r.builder,zeroAddress)||r.cto!==v.cto||sameHex(ruleSet,zeroAddress))throw Error('Transaction calldata differs from the reviewed launch.');
 return v;
}
export function validatePreparedLaunch(prepared,configuration,now=Date.now()){
 if(prepared?.mode!=='simulation'||prepared.broadcast!==false||prepared.chainId!==CHAIN_ID)throw Error('A successful Elysium simulation is required.');
 if(!Number.isSafeInteger(prepared.expiresAt)||prepared.expiresAt<=now||prepared.expiresAt>now+90000)throw Error('The simulation expired or has an invalid expiry. Simulate again.');
 const tx=prepared.transaction;
 if(!tx||Object.keys(tx).some(k=>!['from','to','data','chainId','value'].includes(k)))throw Error('Unexpected transaction fields.');
 const normalized=assertLaunchCall(tx,configuration);
 for(const key of ['name','symbol','pair','feePips','cto','supply','devBuy','builderFee'])if(prepared.configuration?.[key]!==normalized[key])throw Error('Simulation configuration differs from this draft.');
 for(const key of ['account','recipient'])if(!sameHex(prepared.configuration?.[key],normalized[key]))throw Error('Simulation wallet differs from this draft.');
 return {from:normalized.account,to:contracts.factory,data:tx.data,chainId:'0x1863d',value:'0x0'};
}
