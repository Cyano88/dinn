import {readFileSync,writeFileSync} from 'node:fs';
import {createPublicClient,decodeAbiParameters,http,parseAbi,toEventSelector} from 'viem';
import {base} from 'viem/chains';

// Pipe Blockscout getLogs JSON for the Base factory, from genesis through the supplied block.
const block=BigInt(process.argv[2]);
const payload=JSON.parse(readFileSync(0,'utf8').replace(/^\uFEFF/,''));
const factory='0x052d4671f4ae15e6215fb7135d8c2e3e587b0920';
const topic=toEventSelector('MerkleCreated(address,address,string)');
if(payload.status!=='1'||!payload.result.length||payload.result.length>=1000)throw Error('Expected a complete, uncapped factory log page.');
const deployments=payload.result.filter(log=>log.topics[0]===topic).map(log=>{
 if(log.address.toLowerCase()!==factory||BigInt(log.blockNumber)>block)throw Error('Unexpected factory log');
 return {address:'0x'+log.topics[2].slice(-40),id:decodeAbiParameters([{type:'string'}],log.data)[0],created:Number(BigInt(log.blockNumber))};
});
const client=createPublicClient({chain:base,transport:http('https://mainnet.base.org')});
const abi=parseAbi(['function merkleContracts(string) view returns(address)','function token() view returns(address)']);
const results=await client.multicall({blockNumber:block,contracts:deployments.flatMap(d=>[{address:factory,abi,functionName:'merkleContracts',args:[d.id]},{address:d.address,abi,functionName:'token'}])});
const entries=deployments.map((d,i)=>{
 const [registered,asset]=results.slice(i*2,i*2+2);
 if(registered.result?.toLowerCase()!==d.address||!asset.result)throw Error('Could not verify factory or token for '+d.address);
 return {...d,token:asset.result.toLowerCase()};
});
writeFileSync(new URL('../src/base-magna-escrows.json',import.meta.url),JSON.stringify({chainId:8453,factory,throughBlock:Number(block),entries},null,1)+'\n');
console.log('Verified',entries.length,'escrows through Base block',String(block));
