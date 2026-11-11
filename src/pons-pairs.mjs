import {parseAbi,zeroAddress,formatUnits} from 'viem';
import {PONS_FACTORY} from './pons.mjs';
export const pairAbi=parseAbi(['function approvedPairTokens(address) view returns(bool)','function pairTokenEconomics(address) view returns(uint256 phantomQuote,uint256 graduationThreshold,uint8 decimals)']);
const tokenAbi=parseAbi(['function symbol() view returns(string)','function decimals() view returns(uint8)']);
export async function readPairAsset(client,address,blockNumber){
 if(address.toLowerCase()===zeroAddress)return {address:zeroAddress,symbol:'ETH',decimals:18,native:true};
 const read=(functionName)=>client.readContract({address:PONS_FACTORY,abi:pairAbi,functionName,args:[address],blockNumber});
 const [approved,economics,code]=await Promise.all([read('approvedPairTokens'),read('pairTokenEconomics'),client.getCode({address,blockNumber})]);
 if(approved!==true)throw Error('Pons has not enabled this asset for new launches. Choose ETH or another approved pairing asset.');
 const [phantomQuote,graduationThreshold,decimals]=economics;
 if(!code||code==='0x'||phantomQuote<=0n||graduationThreshold<=0n||!Number.isInteger(decimals)||decimals<0||decimals>255)throw Error('Pairing asset economics are unavailable.');
 const actualDecimals=await client.readContract({address,abi:tokenAbi,functionName:'decimals',blockNumber});
 if(actualDecimals!==decimals)throw Error('Pairing asset decimals differ from Pons economics.');
 let symbol='ERC-20';try{const v=await client.readContract({address,abi:tokenAbi,functionName:'symbol',blockNumber});if(typeof v==='string'&&/^[a-zA-Z0-9 ._-]{1,32}$/.test(v))symbol=v;}catch{}
 return {address,symbol,decimals,native:false,phantomQuote:String(phantomQuote),graduationThreshold:String(graduationThreshold),graduationTarget:formatUnits(graduationThreshold,decimals)};
}

export async function ponsPair(input,o={}){
 if(!input||Object.keys(input).some(k=>k!=='pairToken')||typeof input.pairToken!=='string'||!/^0x[0-9a-f]{40}$/i.test(input.pairToken))throw Error('Choose ETH or a Robinhood pairing-token address.');
 const {getClient,snapshot}=await import('./pons.mjs');const client=getClient(o),block=await snapshot(client,o.now);const asset=await readPairAsset(client,input.pairToken,block.number);
 if((await client.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('Pairing snapshot changed. Try again.');
 return {...asset,chainId:4663,blockNumber:String(block.number),checkedAt:new Date().toISOString(),launchFeeAsset:'ETH',initialPurchase:true};
}
