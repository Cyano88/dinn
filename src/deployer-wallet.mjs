import {openEmbeddedNetwork} from './embedded-network.mjs';

export function walletKey(wallet){
 return wallet ? [wallet.walletClientType,wallet.connectorType,wallet.address?.toLowerCase()].join(':') : '';
}
export function selectDeployer(wallets,preference){
 return preference ? wallets.find(wallet=>walletKey(wallet)===preference) : wallets.find(wallet=>wallet.walletClientType==='privy');
}
// Listen before asynchronous checks so a change during validation also invalidates it.
export async function connectDeployer(wallet,chainId,onInvalidated){
 const provider=await openEmbeddedNetwork(wallet,chainId);
 let valid=true;
 const invalidate=()=>{if(valid){valid=false;onInvalidated();}};
 const events=['accountsChanged','chainChanged','disconnect'];
 for(const event of events)provider.on?.(event,invalidate);
 const dispose=()=>{valid=false;for(const event of events)provider.removeListener?.(event,invalidate);};
 try{
  const accounts=await provider.request({method:'eth_accounts'});
  const chain=await provider.request({method:'eth_chainId'});
  if(!valid||accounts?.[0]?.toLowerCase()!==wallet.address.toLowerCase()||Number(chain)!==chainId)throw Error('Reconnect the selected wallet on the launch network.');
  return {provider,dispose,isValid:()=>valid};
 }catch(error){dispose();throw error;}
}
