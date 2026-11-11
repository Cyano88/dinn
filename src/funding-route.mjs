import {createPublicClient,http,parseAbi,formatEther,isAddress} from 'viem';
export const HYPEREVM_RPC='https://rpc.hyperliquid.xyz/evm';
export const ELYSIUM_INBOX='0xce59f8B65ad41C9DAE4c07A0571a39824bD92cff';
const BRIDGE='0x503D572157113fAaaD4DbeD2647Bb10b949216B6',ROLLUP='0x508C173dFe5F737B3493195Bf785d71fA76fD217';
const abi=parseAbi(['function bridge() view returns(address)','function rollup() view returns(address)','function chainId() view returns(uint256)','function paused() view returns(bool)']);
const same=(a,b)=>a.toLowerCase()===b.toLowerCase();
export async function fundingRoute(input,{client,now=Date.now}={}){
 if(!isAddress(input?.account||'',{strict:false})||/^0x0{40}$/i.test(input.account))throw Error('Connect your Dinn wallet first.');
 const c=client||createPublicClient({transport:http(HYPEREVM_RPC,{timeout:10000,retryCount:1}),cacheTime:0});
 if(await c.getChainId()!==999)throw Error('Funding source network mismatch.');
 const block=await c.getBlock();const age=Math.floor(now()/1000)-Number(block.timestamp);if(age>120||age< -30)throw Error('Funding network data is stale. Try again shortly.');
 const read=(address,functionName)=>c.readContract({address,abi,functionName,blockNumber:block.number});
 const [bridge,paused,code,balance]=await Promise.all([read(ELYSIUM_INBOX,'bridge'),read(ELYSIUM_INBOX,'paused'),c.getCode({address:input.account,blockNumber:block.number}),c.getBalance({address:input.account,blockNumber:block.number})]);
 if(!same(bridge,BRIDGE))throw Error('Bridge identity could not be verified.');const rollup=await read(bridge,'rollup');if(!same(rollup,ROLLUP)||await read(rollup,'chainId')!==99901n)throw Error('Bridge destination could not be verified.');
 if((await c.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('Funding network changed. Check again.');
 const plain=!code||code==='0x';return {account:input.account,sourceChainId:999,destinationChainId:99901,inbox:ELYSIUM_INBOX,balance:formatEther(balance),balanceRaw:String(balance),compatible:plain,paused,state:!plain?'incompatible':paused?'paused':balance===0n?'needs-funds':'ready',checkedAt:new Date(now()).toISOString(),blockNumber:String(block.number),blockHash:block.hash,executionEnabled:false};
}

export async function fundingBalance(input,{client,now=Date.now}={}){if(!isAddress(input?.account||'',{strict:false})||/^0x0{40}$/i.test(input.account))throw Error('Connect your Dinn wallet first.');const c=client||createPublicClient({transport:http(HYPEREVM_RPC,{timeout:8000,retryCount:0}),cacheTime:0});const [chain,block]=await Promise.all([c.getChainId(),c.getBlock()]);if(chain!==999)throw Error('Funding source network mismatch.');const age=Math.floor(now()/1000)-Number(block.timestamp);if(age>120||age< -30)throw Error('Funding balance data is stale.');const balance=await c.getBalance({address:input.account,blockNumber:block.number});return {account:input.account,sourceChainId:999,balance:formatEther(balance),balanceRaw:String(balance),blockNumber:String(block.number)};}
