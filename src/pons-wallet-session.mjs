export const PONS_CHAIN='eip155:4663';
export const PONS_METHODS=['personal_sign','eth_signTypedData_v4','eth_sendTransaction','wallet_switchEthereumChain'];
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const address=v=>typeof v==='string'&&/^0x[0-9a-f]{40}$/i.test(v);
export function ponsOrigin(value){
 const url=new URL(value);
 if(!['https://ponsfamily.com','https://www.ponsfamily.com'].includes(url.origin)||url.username||url.password)throw Error('Only the official Pons website can connect here.');
 return url.origin;
}
export function verifiedPons(metadata,context){
 const origin=ponsOrigin(metadata?.url);
 const verified=context?.verified;
 if(verified?.isScam||verified?.validation!=='VALID'||ponsOrigin(verified.origin)!==origin)throw Error('The Pons website could not be verified. Open Pons directly and create a new connection link.');
 return origin;
}
export function pairingUri(value){
 if(typeof value!=='string'||value.length>2048)throw Error('Paste a WalletConnect connection link.');
 const uri=value.trim();const match=/^wc:([a-f0-9]{64})@2\?(.+)$/i.exec(uri);
 if(!match)throw Error('Paste the WalletConnect link copied from Pons.');
 const params=new URLSearchParams(match[2]);
 if(!/^[a-f0-9]{64}$/i.test(params.get('symKey')||'')||params.get('relay-protocol')!=='irn')throw Error('Invalid WalletConnect connection link.');
 return uri;
}
export function ponsRequest(event,session,account,now=Date.now()){
 if(!address(account)||!session||session.expiry*1000<=now)throw Error('This connection has expired. Connect Pons again.');
 verifiedPons(session.peer?.metadata,event.verifyContext);
 const {chainId,request}=event.params||{};
 if(chainId!==PONS_CHAIN)throw Error('Only Robinhood Chain is supported.');
 const ns=session.namespaces?.eip155;
 if(!ns?.accounts?.some(a=>same(a,PONS_CHAIN+':'+account))||!ns.methods?.includes(request?.method)||!PONS_METHODS.includes(request?.method))throw Error('This request is outside the approved connection.');
 if(request.expiryTimestamp&&request.expiryTimestamp*1000<=now)throw Error('This request has expired.');
 const params=structuredClone(request.params),method=request.method;
 if(!Array.isArray(params))throw Error('Invalid wallet request.');
 if(method==='wallet_switchEthereumChain'){
  if(params.length!==1||Number(params[0]?.chainId)!==4663)throw Error('Only Robinhood Chain is supported.');
 }else if(method==='personal_sign'){
  if(params.length!==2||!same(params[1],account)||typeof params[0]!=='string'||!/^0x(?:[a-f0-9]{2})*$/i.test(params[0])||params[0].length>32768)throw Error('Invalid message or wallet address.');
 }else if(method==='eth_signTypedData_v4'){
  if(params.length!==2||!same(params[0],account))throw Error('The requested signer is not this Dinn wallet.');
  const data=typeof params[1]==='string'?JSON.parse(params[1]):params[1];
  if(!data?.domain||Number(data.domain.chainId)!==4663||!data.types||!data.primaryType||JSON.stringify(data).length>65536)throw Error('Typed data must specify Robinhood Chain.');
 }else{
  const tx=params[0];
  if(params.length!==1||!tx||!same(tx.from,account)||!address(tx.to)||tx.chainId!==undefined&&Number(tx.chainId)!==4663)throw Error('Transaction wallet, recipient or network is invalid.');
  if(tx.value!==undefined&&!/^0x[0-9a-f]+$/i.test(tx.value))throw Error('Invalid transaction value.');
  if(tx.data!==undefined&&(!/^0x(?:[a-f0-9]{2})*$/i.test(tx.data)||tx.data.length>131072))throw Error('Invalid transaction data.');
  if(tx.authorizationList||tx.blobs||tx.blobVersionedHashes)throw Error('This transaction type is not supported.');
 }
 return {method,params};
}
export function describePonsRequest(request){
 if(request.method==='personal_sign'){
  const bytes=request.params[0].slice(2).match(/.{2}/g)||[];
  return new TextDecoder().decode(Uint8Array.from(bytes,b=>parseInt(b,16)));
 }
 return JSON.stringify(request.params,null,2);
}
