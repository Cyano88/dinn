export const ELYSIUM_CHAIN_ID=99901;
const validAccount=value=>typeof value==='string'&&/^0x[0-9a-fA-F]{40}$/.test(value)&&!/^0x0{40}$/i.test(value);
export function walletReadiness(wallet,account){
 if(!wallet.account)return {kind:'optional',message:'Connect a wallet to check your deployer account, or continue preparing with a pasted address.'};
 if(wallet.chainId!==ELYSIUM_CHAIN_ID)return {kind:'wrong-chain',message:'Your wallet is on chain '+(wallet.chainId??'unknown')+'. Select Elysium (99901) in your wallet before continuing.'};
 if(account&&wallet.account.toLowerCase()!==account.toLowerCase())return {kind:'mismatch',message:'The connected wallet differs from your draft deployer. Edit the deployer setting to use this wallet, or reconnect the intended account.'};
 return {kind:'ready',message:'Wallet connected on Elysium. Connection does not authorize a transaction.'};
}
// Onboarding feedback must never grant transaction readiness.
export function workspaceWalletReadiness(wallet,account,status={}){
 if(!status.onboardingOnly)return walletReadiness(wallet,account);
 if(!wallet.account)return {kind:'optional',message:'Set up your embedded wallet from the account menu.'};
 if(wallet.chainId!==status.authChainId)return {kind:'wrong-chain',message:'Select Elysium Testnet ('+status.authChainId+') in your wallet for this workspace.'};
 if(account&&wallet.account.toLowerCase()!==account.toLowerCase())return {kind:'mismatch',message:'The connected wallet differs from your draft deployer. Edit the deployer setting to use this wallet, or reconnect the intended account.'};
 return {kind:'testnet',message:'Wallet connected on Elysium testnet. You can prepare a draft; token launches are disabled.'};
}
export function createWalletSession(provider,onChange){
 if(!provider||typeof provider.request!=='function')throw Error('Choose an installed Ethereum-compatible browser wallet.');
 let state={account:null,chainId:null},version=0,closed=false;
 const publish=next=>{state=next;onChange({...state});};
 const chainNumber=raw=>{if(typeof raw!=='string'||!/^0x[0-9a-f]+$/i.test(raw))throw Error('Wallet returned an invalid chain ID.');const n=Number(raw);if(!Number.isSafeInteger(n))throw Error('Wallet chain ID is too large.');return n;};
 const accountsChanged=accounts=>{version++;publish({...state,account:Array.isArray(accounts)&&validAccount(accounts[0])?accounts[0]:null});};
 const chainChanged=chain=>{version++;let chainId=null;try{chainId=chainNumber(chain);}catch{}publish({...state,chainId});};
 const disconnected=()=>{version++;publish({account:null,chainId:null});};
 provider.on?.('accountsChanged',accountsChanged);provider.on?.('chainChanged',chainChanged);provider.on?.('disconnect',disconnected);
 return {
  async connect({requestAccess=true}={}){
   if(requestAccess)await provider.request({method:'eth_requestAccounts'});
   if(closed)throw Error('Wallet session closed.');
   const token=++version;
   const [accounts,chain]=await Promise.all([provider.request({method:'eth_accounts'}),provider.request({method:'eth_chainId'})]);
   if(closed||token!==version)throw Error('Wallet changed during connection. Connect again to confirm the current account.');
   if(!Array.isArray(accounts)||!validAccount(accounts[0]))throw Error('No valid account was shared by your wallet.');
   publish({account:accounts[0],chainId:chainNumber(chain)});
   return {...state};
  },
  close(){closed=true;version++;provider.removeListener?.('accountsChanged',accountsChanged);provider.removeListener?.('chainChanged',chainChanged);provider.removeListener?.('disconnect',disconnected);state={account:null,chainId:null};},
  snapshot(){return {...state};},
  getProvider(){if(closed||!state.account)throw Error('Connect your wallet first.');return provider;}
 };
}
