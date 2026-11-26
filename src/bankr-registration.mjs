import {createLaunchClient,bankrLaunchpadRegistryAbi as abi,BANKR_V4_LAUNCH_ADDRESSES} from '@bankr/launch-sdk';
import {createPublicClient,http,isAddress,parseEther,formatEther} from 'viem';
import {base} from 'viem/chains';
import {publicActionsL2} from 'viem/op-stack';
import {serverRpcUrl} from './rpc-config.mjs';

export async function registrationReview(address,env){
 const operator=env.DINN_BANKR_BASE_OPERATOR;
 const payee=env.DINN_BANKR_BASE_FEE_RECIPIENT;
 if(!isAddress(operator||'')||!isAddress(payee||'')||operator.toLowerCase()!==address?.toLowerCase())throw Error('Choose the configured Dinn operator wallet.');
 const rpcUrl=serverRpcUrl(8453,env),sdk=createLaunchClient({chain:'base',rpcUrl});
 const c=createPublicClient({chain:base,transport:http(rpcUrl)}).extend(publicActionsL2());
 const registry=BANKR_V4_LAUNCH_ADDRESSES.base.launchpadRegistry,blockNumber=await c.getBlockNumber();
 const read=(functionName,args=[])=>c.readContract({address:registry,abi,functionName,args,blockNumber});
 const count=await read('launchpadCount');
 for(let i=1n;i<=count;i++){
  const row=await read('getLaunchpad',[i]);
  if(row.operator.toLowerCase()===operator.toLowerCase())return {registered:true,id:String(i)};
 }
 const status=await sdk.status();if(!status.deployed||status.gated||status.paused||status.fork)throw Error('Registration unavailable.');
 const tx=await sdk.contracts().launchpads.register({operator,payees:[{address:payee,shareBps:1000}]});
 if(tx.chainId!==8453||tx.to.toLowerCase()!==registry.toLowerCase()||tx.value!==parseEther('0.01'))throw Error('Registry or bond changed.');
 const req={account:operator,to:registry,value:tx.value,data:tx.data};
 await c.call(req);const gas=await c.estimateGas(req),fee=await c.estimateFeesPerGas(),l1=await c.estimateL1Fee({...req,gas});
 const total=tx.value+gas*fee.maxFeePerGas+l1;
 if(total>parseEther('0.01002')||total>await c.getBalance({address:operator}))throw Error('Review the registration cost again.');
 return {registered:false,payee,total:formatEther(total),transaction:{chainId:8453,from:operator,to:registry,data:tx.data,value:'0x'+tx.value.toString(16)}};
}
