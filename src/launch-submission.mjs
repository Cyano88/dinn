import {assertNoOtherPending} from './pending-actions.mjs';
﻿import {keccak256} from 'viem';
import {validatePreparedLaunch,assertLaunchCall,sameHex} from './launch-call.mjs';
export const PENDING_KEY='launchflow.pending.v1';
const hashValid=value=>typeof value==='string'&&/^0x[0-9a-fA-F]{64}$/.test(value);
const unresolved=record=>record&&['awaiting-wallet','unknown','submitted','confirming'].includes(record.phase);
const clone=value=>JSON.parse(JSON.stringify(value));
export function createLaunchSubmitter({storage,withLock,onState=()=>{},now=()=>Date.now()}){
 let record=null,inFlight=false;
 function notify(){try{onState(record?clone(record):null);}catch{/* UI failure must not change transaction state. */}}
 function read(){
  const raw=storage.getItem(PENDING_KEY);
  if(!raw)return null;
  let item;try{item=JSON.parse(raw);}catch{throw Error('Saved launch tracking is unreadable. Resolve it before submitting another launch.');}
  if(item?.version!==1||!['awaiting-wallet','unknown','submitted','confirming','verified','reverted','rejected'].includes(item.phase))throw Error('Saved launch tracking is invalid. Do not resubmit blindly.');
  assertLaunchCall(item.transaction,item.configuration);
  if(item.hash!==null&&!hashValid(item.hash))throw Error('Saved transaction hash is invalid.');
  return item;
 }
 function write(next,required=false){
  record=clone(next);
  try{storage.setItem(PENDING_KEY,JSON.stringify(record));}
  catch{if(required){record=null;throw Error('Cannot save transaction recovery data. No transaction request was made.');}record.recoveryWarning='Recovery could not be saved. Copy the transaction hash and keep this page open.';}
  notify();return clone(record);
 }
 function pending(){
  if(inFlight&&record)return clone(record);
  const saved=read();
  if(record?.recoveryWarning)return clone(record);
  record=saved;
  if(record?.phase==='awaiting-wallet')record={...record,phase:'unknown'};
  return record?clone(record):null;
 }
 return {
  pending,
  async submit({prepared,configuration,provider,enabled,isCurrent=()=>true}){
   if(enabled!==true)throw Error('Live launch sending is disabled.');
   if(inFlight)throw Error('A wallet request is already in progress.');
   if(typeof withLock!=='function')throw Error('This browser cannot safely lock transaction submission.');
   inFlight=true;
   try{return await withLock(async()=>{
    const existing=read();if(unresolved(existing)||unresolved(record))throw Error('Resolve the previous launch before requesting another transaction.');
    assertNoOtherPending(storage,{account:configuration.account,chainId:99901},'launchflow.pending.v1');
    const frozenPrepared=clone(prepared),frozenConfig=clone(configuration);
    let tx=validatePreparedLaunch(frozenPrepared,frozenConfig,now());
    if(!isCurrent())throw Error('Wallet or draft changed. Review and simulate again.');
    const [accounts,chain]=await Promise.all([provider.request({method:'eth_accounts'}),provider.request({method:'eth_chainId'})]);
    if(!Array.isArray(accounts)||!sameHex(accounts[0],tx.from)||Number(chain)!==99901)throw Error('Wallet account or network changed. Review again.');
    tx=validatePreparedLaunch(frozenPrepared,frozenConfig,now());
    if(!isCurrent())throw Error('Wallet or draft changed. Review and simulate again.');
    const attempt={version:1,phase:'awaiting-wallet',hash:null,configuration:frozenConfig,transaction:tx,createdAt:now()};
    write(attempt,true);
    try{
     const hash=await provider.request({method:'eth_sendTransaction',params:[tx]});
     if(!hashValid(hash))return write({...attempt,phase:'unknown',message:'The wallet returned no usable transaction hash. Check wallet activity before continuing.'});
     return write({...attempt,phase:'submitted',hash,message:'Submitted to the wallet network. Receipt verification is still required.'});
    }catch(error){
     if(error?.code===4001)return write({...attempt,phase:'rejected',message:'You declined the wallet request. No retry was sent.'});
     return write({...attempt,phase:'unknown',message:'The wallet request ended without a reliable result. Check wallet activity; do not launch again yet.'});
    }
   });}finally{inFlight=false;}
  },
  attachHash(hash){
   if(inFlight)throw Error('Wait for the active wallet request to finish.');
   const current=pending();if(!current||!['unknown','submitted','confirming'].includes(current.phase))throw Error('There is no unresolved launch to recover.');
   if(!hashValid(hash))throw Error('Enter the full transaction hash from your wallet activity.');
   if(current.hash&&!sameHex(current.hash,hash))throw Error('A different hash is already recorded. Check the recorded transaction first.');
   return write({...current,hash,phase:'submitted',message:'Hash recorded. The exact original transaction must still be verified.'});
  },
  acknowledge(result){
   if(inFlight)throw Error('Wallet request is still in progress.');
   const current=pending();
   if(!current||result?.chainId!==99901||!sameHex(current.hash,result?.hash)||!sameHex(keccak256(current.transaction.data),result?.inputHash))throw Error('Receipt does not match this exact wallet request.');
   if(!['verified','reverted','confirming','pending'].includes(result.state))throw Error('Unexpected receipt state.');
   return write({...current,phase:result.state==='pending'?'submitted':result.state,message:result.message});
  }
 };
}
