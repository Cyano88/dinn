import {createPublicClient,http,formatUnits} from 'viem';
import {validatePreparedLaunch} from './launch-call.mjs';
import {ascendLaunchEnabled} from './execution-policy.mjs';
export async function launchPreflight(input,{env=process.env,client,now=Date.now}={}){
 if(!ascendLaunchEnabled(env))throw Error('Ascend launches are not enabled on this connection.');
 const tx=validatePreparedLaunch(input?.prepared,input?.configuration,now());
 const c=client||createPublicClient({transport:http(env.ELYSIUM_RPC_URL,{timeout:12000,retryCount:0})});
 if(await c.getChainId()!==99901)throw Error('Wrong launch network.');
 const b=await c.getBlock();if(!b.hash||Math.abs(now()-Number(b.timestamp)*1000)>120000)throw Error('Launch connection is stale.');
 const request={account:tx.from,to:tx.to,data:tx.data,value:0n};await c.call(request);
 const [gas,price,balance]=await Promise.all([c.estimateGas(request),c.getGasPrice(),c.getBalance({address:tx.from})]);
 const fee=((gas*120n+99n)/100n)*(price*2n);
 if(balance<fee)throw Error('Insufficient HYPE for launch network fees. Add funds to your Dinn wallet first.');
 validatePreparedLaunch(input.prepared,input.configuration,now());return {ready:true,estimatedMaxNetworkFee:formatUnits(fee,18),symbol:'HYPE',broadcast:false};
}
