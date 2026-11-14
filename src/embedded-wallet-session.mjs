const inFlight=new Map();
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
export function accountEmbeddedWallet(user){
 const accounts=[...(user?.linkedAccounts||[]),...(user?.wallet?[user.wallet]:[])];
 return accounts.find(account=>account.walletClientType==='privy'&&(!account.chainType||account.chainType==='ethereum')&&account.walletIndex===0)||accounts.find(account=>account.walletClientType==='privy'&&(!account.chainType||account.chainType==='ethereum'))||null;
}
export function ensureEmbeddedWallet(options){
 const {userId}=options;
 if(inFlight.has(userId))return inFlight.get(userId);
 const task=restore(options).finally(()=>{if(inFlight.get(userId)===task)inFlight.delete(userId);});
 inFlight.set(userId,task);return task;
}
async function restore({userId,getUser,getWallets,refreshUser,createWallet,isCurrent,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),attempts=40}){
 const check=()=>{if(!isCurrent()||getUser()?.id!==userId)throw Error('Account changed while connecting Dinn wallet.');};
 const connected=account=>getWallets().find(wallet=>wallet.walletClientType==='privy'&&same(wallet.address,account?.address));
 check();let account=accountEmbeddedWallet(getUser()),wallet=connected(account);if(wallet)return wallet;
 const latest=await refreshUser();check();if(latest?.id!==userId)throw Error('Account changed while connecting Dinn wallet.');account=accountEmbeddedWallet(latest);
 if(!account){
  try{await createWallet();}catch(error){
   check();const raced=await refreshUser();check();if(raced?.id!==userId||!accountEmbeddedWallet(raced))throw error;
  }
  check();const provisioned=await refreshUser();check();if(provisioned?.id!==userId)throw Error('Account changed while connecting Dinn wallet.');account=accountEmbeddedWallet(provisioned);
 }
 if(!account?.address)throw Error('Your Dinn wallet is not available yet. Retry connecting.');
 for(let attempt=0;attempt<attempts;attempt++){check();wallet=connected(account);if(wallet)return wallet;await wait(500);}
 check();throw Error('Your existing Dinn wallet could not finish connecting. Retry connecting.');
}
