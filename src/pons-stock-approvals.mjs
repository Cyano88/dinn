import {createPublicClient,http} from 'viem';
import {pairAbi} from './pons-pairs.mjs';
import {snapshot,PONS_FACTORY,PONS_CHAIN_ID} from './pons.mjs';
import {serverRpcUrl} from './rpc-config.mjs';

export async function approvedStockPairs(assets){
 const client=createPublicClient({transport:http(serverRpcUrl(PONS_CHAIN_ID,process.env),{batch:{batchSize:8},retryCount:0,timeout:8000})});
 const block=await snapshot(client);
 const results=[];
 for(let i=0;i<assets.length;i+=16){
  results.push(...await Promise.allSettled(assets.slice(i,i+16).map(asset=>client.readContract({address:PONS_FACTORY,abi:pairAbi,functionName:'approvedPairTokens',args:[asset.address],blockNumber:block.number}))));
 }
 if((await client.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('Pons approval snapshot changed.');
 return results.map(r=>r.status==='fulfilled'?r.value:null);
}
