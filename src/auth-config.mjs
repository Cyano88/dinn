export function embeddedAuthConfig(env=process.env){
 const chainId=Number(env.DINN_AUTH_CHAIN_ID||env.ELYSIUM_AUTH_CHAIN_ID||4663);
 if(![4663,99801,99901].includes(chainId))throw Error('Workspace chain must be 4663, 99801 or 99901.');
 const testnet=chainId===99801;
 const appId=(env.PRIVY_APP_ID||'').trim(),rpc=(chainId===4663?(env.ROBINHOOD_PUBLIC_RPC_URL||'https://rpc.mainnet.chain.robinhood.com'):(env.ELYSIUM_PUBLIC_RPC_URL||'')).trim();let rpcUrl=null;
 if(rpc){try{const url=new URL(rpc);if(url.protocol!=='https:'||url.username||url.password||url.hash)throw Error();rpcUrl=url.href;}catch{throw Error('ELYSIUM_PUBLIC_RPC_URL must be a browser-safe HTTPS URL without embedded credentials.');}}
 if(appId&&!/^[A-Za-z0-9_-]{8,100}$/.test(appId))throw Error('PRIVY_APP_ID has an invalid format.');
 return {provider:'privy',enabled:!!appId&&!!rpcUrl,appId:appId||null,chainId,nativeSymbol:chainId===4663?'ETH':'HYPE',chainName:chainId===4663?'Robinhood Chain':testnet?'Elysium Testnet':'Elysium mainnet',testnet,rpcUrl,loginMethods:['twitter','google']};
}
export function contentSecurityPolicy(config){
 const common="default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
 if(!config.enabled)return common+"; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' https://api.montramarkets.xyz https://ipfs.filebase.io data:";
 return common+"; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' https://api.montramarkets.xyz https://ipfs.filebase.io data: blob:; font-src 'self'; frame-src https://auth.privy.io https://challenges.cloudflare.com; connect-src 'self' https://mainnet.base.org https://arb1.arbitrum.io https://mainnet.optimism.io https://rpc.hyperliquid.xyz https://auth.privy.io https://*.rpc.privy.systems https://explorer-api.walletconnect.com "+(config.rpcUrl?new URL(config.rpcUrl).origin:'')+"; worker-src 'self'";
}
