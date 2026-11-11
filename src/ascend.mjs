import {createPublicClient,http,parseAbi,encodeFunctionData,zeroAddress,toHex} from 'viem';
import {randomBytes} from 'node:crypto';
import {CHAIN_ID,contracts,pairs,validateLaunch} from './domain.mjs';
const abi = parseAbi([
 'function ruleSet() view returns (address)',
 'function paused() view returns (bool)',
 'function launchpad() view returns (address)',
 'function quoteConfig(address quote) view returns ((bool allowed, int24 startTick, uint128 maxClip))',
 'function launchChecked((string name,string symbol,address quote,uint256 devBuyQuote,uint256 minDevOut,bytes32 salt,address creator,uint24 fee,uint24 builderFee) p,(address recipient,address dev,address builder,bool cto) r,address expectedRuleSet,int24 expectedStartTick) returns (address token,bytes32 poolId,address escrow)'
]);
export async function simulateLaunch(input, rpc, providedClient) {
 const v = validateLaunch(input);
 if (!rpc&&!providedClient) throw new Error('ELYSIUM_RPC_URL is not configured. No transaction has been prepared.');
 const client = providedClient||createPublicClient({transport:http(rpc,{timeout:12000,retryCount:0})});
 if (await client.getChainId() !== CHAIN_ID) throw new Error('RPC chain mismatch. Expected Elysium 99901.');
 const block=await client.getBlock();if(!block.hash||block.number===null||Math.abs(Date.now()-Number(block.timestamp)*1000)>120000)throw Error('Ascend chain snapshot is stale. Try again.');const blockNumber=block.number;
 const codes = await Promise.all([contracts.factory,contracts.launchpad].map(address=>client.getCode({address,blockNumber})));
 if (codes.some(code=>!code || code==='0x')) throw new Error('Documented contracts have no code on this RPC.');
 const [actualPad,ruleSet,paused,quote] = await Promise.all([
 client.readContract({address:contracts.factory,abi,functionName:'launchpad',blockNumber}),
 client.readContract({address:contracts.factory,abi,functionName:'ruleSet',blockNumber}),
 client.readContract({address:contracts.launchpad,abi,functionName:'paused',blockNumber}),
 client.readContract({address:contracts.launchpad,abi,functionName:'quoteConfig',args:[pairs[v.pair].address],blockNumber})]);
 if(actualPad.toLowerCase()!==contracts.launchpad.toLowerCase()) throw new Error('Factory launchpad differs from the documented deployment.');
 const rulesCode=await client.getCode({address:ruleSet,blockNumber});if(ruleSet===zeroAddress||!rulesCode||rulesCode==='0x')throw Error('Ascend fee rules are unavailable.');
 if(paused || !quote.allowed) throw new Error('Launches or this quote asset are currently disabled.');
 const p={name:v.name,symbol:v.symbol,quote:pairs[v.pair].address,devBuyQuote:0n,minDevOut:0n,salt:toHex(randomBytes(32)),creator:zeroAddress,fee:v.feePips,builderFee:0};
 const route={recipient:v.recipient,dev:v.account,builder:zeroAddress,cto:v.cto};
 const args=[p,route,ruleSet,quote.startTick];
 const {result}=await client.simulateContract({account:v.account,address:contracts.factory,abi,functionName:'launchChecked',args,blockNumber});
 if((await client.getBlock({blockNumber})).hash!==block.hash)throw Error('Ascend snapshot changed. Review again.');
 return {mode:'simulation',broadcast:false,chainId:CHAIN_ID,blockNumber:blockNumber.toString(),blockHash:block.hash,ruleSet,quoteAsset:pairs[v.pair].address,expiresAt:Date.now()+60000,configuration:v,predicted:{token:result[0],poolId:result[1],escrow:result[2]},transaction:{from:v.account,to:contracts.factory,value:'0x0',chainId:toHex(CHAIN_ID),data:encodeFunctionData({abi,functionName:'launchChecked',args})}};
}
