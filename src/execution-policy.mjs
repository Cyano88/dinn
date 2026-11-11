import {createPublicClient,http} from 'viem';
export const OFFICIAL_RPC='https://rpc.elysium.kinetiq.xyz';
export function rpcKind(value){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.hash)return null;
 if(u.origin===OFFICIAL_RPC&&['','/'].includes(u.pathname)&&!u.search)return 'direct';
 if(u.hostname==='elysium-mainnet.g.alchemy.com'&&/^\/v2\/[A-Za-z0-9_-]+$/.test(u.pathname)&&!u.search)return 'direct';
 if(u.origin==='https://rpc.montramarkets.xyz'&&['','/'].includes(u.pathname)&&!u.search)return 'montra';
 }catch{}return null;
}
export function montraExecutionConfigured(env=process.env){return env.ELYSIUM_PAUSED!=='true'&&Number(env.ELYSIUM_AUTH_CHAIN_ID)===99901&&['ELYSIUM_RPC_URL','ELYSIUM_PUBLIC_RPC_URL','ELYSIUM_MARKET_RPC_URL'].every(k=>rpcKind(env[k])==='montra');}
export function directExecutionConfigured(env=process.env){return Number(env.ELYSIUM_AUTH_CHAIN_ID)===99901&&['ELYSIUM_RPC_URL','ELYSIUM_PUBLIC_RPC_URL','ELYSIUM_MARKET_RPC_URL'].every(k=>rpcKind(env[k])==='direct');}
const configured=env=>montraExecutionConfigured(env)||directExecutionConfigured(env);
export const ascendLaunchEnabled=(env=process.env)=>directExecutionConfigured(env)&&env.ENABLE_LIVE_LAUNCH==='true';
export const ascendFeesEnabled=(env=process.env)=>directExecutionConfigured(env)&&env.ENABLE_ASCEND_FEES==='true';
export const nativeTransfersEnabled=(env=process.env)=>configured(env)&&env.ENABLE_WALLET_TRANSFERS==='true';
export const montraSwapsEnabled=(env=process.env)=>configured(env)&&env.ENABLE_MONTRA_SWAPS==='true';
export async function assertRelayAvailable(fetchImpl=fetch){
 let h;try{const r=await fetchImpl('https://rpc.montramarkets.xyz/health',{signal:AbortSignal.timeout(6000)});if(!r.ok)throw Error();h=await r.json();}catch{throw Error('Transaction delivery is unavailable. Try again later.');}
 if(h.chainId!==99901||h.sends?.enabled!==true||h.sends?.reason||h.sends?.paused)throw Error('Transaction delivery is paused. Try again later.');
}
export async function assertDeliveryAvailable(env=process.env,fetchImpl=fetch){
 if(montraExecutionConfigured(env))return assertRelayAvailable(fetchImpl);
 if(!directExecutionConfigured(env))throw Error('Transaction delivery is not configured.');
 const c=createPublicClient({transport:http(env.ELYSIUM_RPC_URL,{timeout:8000,retryCount:0})});
 const [id,b]=await Promise.all([c.getChainId(),c.getBlock()]);
 if(id!==99901||!b.hash||Math.abs(Date.now()-Number(b.timestamp)*1000)>120000)throw Error('Mainnet connection is stale or on the wrong network.');
}
