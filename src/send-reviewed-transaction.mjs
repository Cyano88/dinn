export async function sendReviewedTransaction({transaction,provider,sendTransaction,address,chainId,source='external'}){
 if(source==='embedded'){
  if(typeof sendTransaction!=='function')throw Error('Dinn wallet signing is not ready. Reconnect your Dinn wallet and review this action again.');
  if(typeof address!=='string'||typeof transaction?.from!=='string'||address.toLowerCase()!==transaction.from.toLowerCase())throw Error('The embedded wallet does not match the reviewed sender.');
  const result=await sendTransaction({
   from:transaction.from,
   to:transaction.to,
   data:transaction.data,
   value:BigInt(transaction.value||'0x0'),
   chainId:Number(chainId)
  },{address,uiOptions:{showWalletUIs:false}});
  return typeof result==='string'?result:result?.hash;
 }
 if(source!=='external')throw Error('The selected wallet type is unavailable. Reconnect and review this action again.');
 if(!provider||typeof provider.request!=='function')throw Error('The selected wallet is not ready.');
 return provider.request({method:'eth_sendTransaction',params:[transaction]});
}
