import {openEmbeddedNetwork} from './embedded-network.mjs';

export function walletKey(wallet){
 return wallet ? [wallet.walletClientType,wallet.connectorType,wallet.address?.toLowerCase()].join(':') : '';
}
export function selectDeployer(wallets,preference){
 return preference ? wallets.find(wallet=>walletKey(wallet)===preference) : wallets.find(wallet=>wallet.walletClientType==='privy');
}
function withTimeout(promise,timeoutMs){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Wallet connection timed out. Retry connecting.')),timeoutMs);})]).finally(()=>clearTimeout(timer));}
// Listen before asynchronous checks so a change during validation also invalidates it.
export async function connectDeployer(wallet,chainId,onInvalidated,{timeoutMs=8000}={}){
 const provider=await withTimeout(openEmbeddedNetwork(wallet,chainId),timeoutMs);
 let valid=true;
 const invalidate=()=>{if(valid){valid=false;onInvalidated();}};
 const events=['accountsChanged','chainChanged','disconnect'];
 for(const event of events)provider.on?.(event,invalidate);
 const dispose=()=>{valid=false;for(const event of events)provider.removeListener?.(event,invalidate);};
 try{
  const [accounts,chain]=await withTimeout(Promise.all([provider.request({method:'eth_accounts'}),provider.request({method:'eth_chainId'})]),timeoutMs);
  if(!valid||accounts?.[0]?.toLowerCase()!==wallet.address.toLowerCase()||Number(chain)!==chainId)throw Error('Reconnect the selected wallet on the launch network.');
  return {provider,dispose,isValid:()=>valid};
 }catch(error){dispose();throw error;}
}
