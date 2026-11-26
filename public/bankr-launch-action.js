const txHash=value=>/^0x[0-9a-f]{64}$/i.test(value||'');
export const bankrRecordKey=address=>'dinn.multi.bankr-launch.v1:'+address.toLowerCase();

export async function submitBankrLaunch({review,storage,provider,sendEmbedded,current}){
 const {execution:tx,launcher}=review,key=bankrRecordKey(launcher);
 if(!current()||!provider||Date.now()>=tx.expiry)throw Error('Refresh the Base launch review before approving.');
 const saved=JSON.parse(storage.getItem(key)||'null');
 if(saved&&!['verified','reverted'].includes(saved.state))throw Error('Check the previous Base launch before sending another.');
 if(saved?.state==='verified'&&saved.token===review.predictedToken)throw Error('This token was already launched.');
 await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x2105'}]});
 const accounts=await provider.request({method:'eth_accounts'});
 if(!current()||accounts[0]?.toLowerCase()!==launcher.toLowerCase()||BigInt(await provider.request({method:'eth_chainId'}))!==8453n)throw Error('Choose the reviewed wallet on Base.');
 const request={from:launcher,to:tx.to,data:tx.data,value:'0x0',gas:tx.gas};
 await provider.request({method:'eth_call',params:[request,'latest']});
 if(!current()||Date.now()>=tx.expiry)throw Error('Review the launch again.');
 const record={state:'awaiting-wallet',token:review.predictedToken,poolId:review.poolId,launcher,quote:review.quote,callHash:tx.callHash};
 await storage.setItem(key,JSON.stringify(record));
 if(!current()||Date.now()>=tx.expiry){await storage.removeItem(key);throw Error('Refresh the launch review.');}
 let sent;
 try{sent=sendEmbedded?await sendEmbedded({...request,chainId:8453,value:0n,gas:BigInt(tx.gas)},{address:launcher,uiOptions:{showWalletUIs:true}}):await provider.request({method:'eth_sendTransaction',params:[{...request,chainId:'0x2105'}]});}
 catch(error){if(Number(error.code)===4001||error.code==='ACTION_REJECTED'){await storage.removeItem(key);throw Error('Wallet approval declined.');}throw Error('Check Base wallet activity before retrying.');}
 const hash=typeof sent==='string'?sent:sent?.hash;
 if(!txHash(hash))throw Error('Check Base wallet activity for the launch transaction ID.');
 record.hash=hash;record.state='submitted';
 try{await storage.setItem(key,JSON.stringify(record));}catch{throw Error('Save this Base transaction ID and check its status: '+hash);}
 return record;
}

export async function refreshBankrLaunch({record,storage,check}){
 if(!txHash(record.hash))throw Error('Paste the Base transaction ID after “check Base launch” to recover the receipt.');
 const {hash,token,poolId,launcher,quote,callHash}=record;
 const result=await check({hash,token,poolId,launcher,quote,callHash});
 if(!['pending','verified','reverted'].includes(result.state))throw Error('Unexpected launch receipt.');
 if(result.state==='verified'&&(result.token?.toLowerCase()!==token.toLowerCase()||result.hash!==hash))throw Error('Launch receipt mismatch.');
 await storage.setItem(bankrRecordKey(launcher),JSON.stringify({...record,state:result.state}));
 const link='[View Base transaction](https://basescan.org/tx/'+hash+')';
 return result.state==='verified'?'✓ Token launched on Base with Dinn, powered by Bankr. Token address: '+token+'. '+link:result.state==='reverted'?'The Base launch reverted. '+link:'Base launch submitted. Say “check Base launch” for confirmation. '+link;
}
