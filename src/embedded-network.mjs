// Network selection never signs, submits, funds, or creates another wallet.
export async function openEmbeddedNetwork(wallet,chainId){
 if(![4663,99801,99901].includes(chainId))throw Error('Unsupported workspace network.');
 let provider=await wallet.getEthereumProvider();
 if(Number(await provider.request({method:'eth_chainId'}))!==chainId){await wallet.switchChain(chainId);provider=await wallet.getEthereumProvider();}
 if(Number(await provider.request({method:'eth_chainId'}))!==chainId)throw Error('Wallet did not switch to the workspace network.');
 return provider;
}
