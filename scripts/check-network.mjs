import {createPublicClient,http,parseAbi} from 'viem';
import {embeddedAuthConfig} from '../src/auth-config.mjs';
import {contracts} from '../src/domain.mjs';
const auth=embeddedAuthConfig();
const report={checkedAt:new Date().toISOString(),expectedChainId:auth.chainId,endpoints:[],contracts:{},execution:{launch:process.env.ENABLE_LIVE_LAUNCH==='true',transfers:process.env.ENABLE_WALLET_TRANSFERS==='true',localSwapPreview:process.env.ENABLE_LOCAL_SWAP_PREVIEW==='true'}};
let failed=false,server;const verified=new Map();
for(const [label,url]of [['server',process.env.ELYSIUM_RPC_URL],['browser',auth.rpcUrl],['market',process.env.ELYSIUM_MARKET_RPC_URL]]){
 try{if(!url)throw Error();if(verified.has(url)){report.endpoints.push({...verified.get(url),label});continue;}const c=createPublicClient({transport:http(url,{timeout:12000,retryCount:0})});const [chainId,block]=await Promise.all([c.getChainId(),c.getBlock()]);const ageSeconds=Math.floor(Date.now()/1000)-Number(block.timestamp);const ok=chainId===99901&&auth.chainId===99901&&ageSeconds>=-30&&ageSeconds<=120&&!!block.hash;const checked={label,chainId,block:String(block.number),ageSeconds,ok};report.endpoints.push(checked);if(ok)verified.set(url,checked);if(!ok)failed=true;if(label==='server'&&ok)server=c;}catch{failed=true;report.endpoints.push({label,ok:false,error:'Connection could not be verified'});}
}
if(server){for(const [name,address]of Object.entries(contracts)){try{const code=await server.getCode({address});report.contracts[name]=!!code&&code!=='0x';if(!report.contracts[name])failed=true;}catch{report.contracts[name]=false;failed=true;}}try{const actual=await server.readContract({address:contracts.factory,abi:parseAbi(['function launchpad() view returns (address)']),functionName:'launchpad'});report.factoryLaunchpadMatches=actual.toLowerCase()===contracts.launchpad.toLowerCase();if(!report.factoryLaunchpadMatches)failed=true;}catch{report.factoryLaunchpadMatches=false;failed=true;}}
console.log(JSON.stringify(report,null,2));if(failed)process.exitCode=1;
