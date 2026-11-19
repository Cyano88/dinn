const rpcNetworks={
 4663:{envKey:'ROBINHOOD_RPC_URL',fallback:'https://rpc.mainnet.chain.robinhood.com'},
 8453:{envKey:'BASE_RPC_URL',fallback:'https://mainnet.base.org'},
 42161:{envKey:'ARBITRUM_RPC_URL',fallback:'https://arb1.arbitrum.io/rpc'}
};

function validRpcUrl(value,env){
 try{
  const url=new URL(value),production=env.NODE_ENV==='production'||!!env.RENDER;
  if(url.username||url.password||!['https:','http:'].includes(url.protocol)||url.protocol==='http:'&&(production||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)))return null;
  return url.href;
 }catch{return null;}
}
// RPC URLs configured here are for server-side reads. Never pass these values to browser code.
export function serverRpcUrl(chainId,env=process.env){
 const config=rpcNetworks[Number(chainId)];
 if(!config)throw new Error('No server RPC is configured for this network.');
 const configured=typeof env?.[config.envKey]==='string'?env[config.envKey].trim():'';
 const selected=configured||config.fallback;
 const result=validRpcUrl(selected,env||{});
 if(!result)throw new Error('The configured server RPC URL is invalid.');
 return result;
}
