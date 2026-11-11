import {createPublicClient,http,parseAbi,formatUnits,isAddress,zeroAddress} from 'viem';
export const PONS_CHAIN_ID=4663;
export const PONS_RPC='https://rpc.mainnet.chain.robinhood.com';
export const PONS_FACTORY='0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e';
const abi=parseAbi(['struct LaunchConfig { uint256 supply; uint256 curveFeeBps; uint256 phantomQuote; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; bool enabled; }','function launchConfigCount() view returns(uint256)','function getLaunchConfig(uint256 id) view returns(LaunchConfig)','function launchFee() view returns(uint256)','function maxCreatorTaxBps() view returns(uint16)','function canLaunch(address) view returns(bool)']);
export function getClient(o){return o.client||createPublicClient({transport:http(process.env.ROBINHOOD_RPC_URL||PONS_RPC,{timeout:10000,retryCount:1,retryDelay:250})});}
export async function snapshot(c,now=Date.now){if(await c.getChainId()!==4663)throw Error('Wrong Robinhood network.');const b=await c.getBlock();if(!b.hash||Math.abs(now()-Number(b.timestamp)*1000)>120000)throw Error('Robinhood network data is stale.');return b;}
export async function ponsReadiness(input={},o={}){
 if(input.account!==undefined&&!isAddress(input.account,{strict:false}))throw Error('Invalid wallet address.');
 const c=getClient(o),b=await snapshot(c,o.now),blockNumber=b.number;
 const code=await c.getCode({address:PONS_FACTORY,blockNumber});if(!code||code==='0x')throw Error('Pons factory is unavailable on this network.');
 const read=(functionName,args)=>c.readContract({address:PONS_FACTORY,abi,functionName,args,blockNumber});
 const [count,fee,cap,allowed]=await Promise.all([read('launchConfigCount'),read('launchFee'),read('maxCreatorTaxBps'),input.account?read('canLaunch',[input.account]):null]);
 if(count>64n)throw Error('Pons config catalog requires pagination before it can be used.');
 const configs=await Promise.all(Array.from({length:Number(count)},async(_,id)=>{const v=await read('getLaunchConfig',[BigInt(id)]);return {id,...v};}));
 if((await c.getBlock({blockNumber})).hash!==b.hash)throw Error('Pons snapshot changed. Refresh to check again.');
 return JSON.parse(JSON.stringify({launchpad:'pons',chainId:4663,factory:PONS_FACTORY,blockNumber,checkedAt:new Date().toISOString(),launchFee:formatUnits(fee,18),launchFeeSymbol:'ETH',maxCreatorTaxBps:cap,accountCanLaunch:allowed,configs:configs.filter(c=>c.enabled),executionEnabled:false},(_,v)=>typeof v==='bigint'?v.toString():v));
}
export async function robinhoodBalance(input,o={}){
 if(!isAddress(input?.account||'',{strict:false})||input.account.toLowerCase()===zeroAddress)throw Error('Open your Dinn wallet first.');
 const c=getClient(o),b=await snapshot(c,o.now),balance=await c.getBalance({address:input.account,blockNumber:b.number});
 if((await c.getBlock({blockNumber:b.number})).hash!==b.hash)throw Error('Wallet snapshot changed. Refresh again.');
 return {chainId:4663,account:input.account,asset:'native',symbol:'ETH',balance:formatUnits(balance,18),blockNumber:String(b.number),checkedAt:new Date().toISOString(),executionEnabled:false};
}
export function ponsBrief(input){
 if(!input||Object.keys(input).some(k=>!['name','symbol','description','launchpad','chainId'].includes(k))||input.launchpad!=='pons'||input.chainId!==4663)throw Error('Use a Pons brief for Robinhood Chain.');
 const name=String(input.name||'').trim(),symbol=String(input.symbol||'').trim(),description=String(input.description||'').trim();
 if(!name||name.length>40||/[\x00-\x1f\x7f]/.test(name))throw Error('Enter a name of 1–40 characters.');if(!/^[A-Za-z0-9]{1,12}$/.test(symbol))throw Error('Use a ticker of 1–12 letters or numbers.');if(description.length>500)throw Error('Keep the description under 500 characters.');
 return {launchpad:'pons',chainId:4663,name,symbol,description,status:'brief',broadcast:false};
}
