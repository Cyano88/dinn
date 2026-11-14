export {mountRobinhoodWallet,submitRobinhoodWallet} from './robinhood-wallet.js';
export {mountPonsClaims,requestPonsClaim} from './pons-claims.js';
import {sendReviewedTransaction} from '../src/send-reviewed-transaction.mjs';
﻿import {assertPrepared,same,hashValid} from '../src/pons-call.mjs';
export async function requestPonsLaunch({prepared,configuration,provider,sendTransaction,address,source='external',storage,key,isCurrent,withLock}){
 if(typeof withLock!=='function')throw Error('This browser cannot lock launch submissions.');
 return withLock(async()=>{
 const walletAction=JSON.parse(storage.getItem('dinn.robinhood.wallet.v1:'+configuration.account.toLowerCase())||'null');if(walletAction&&!['verified','refunded','reverted','rejected'].includes(walletAction.state))throw Error('Resolve your saved wallet transfer, bridge or swap first.');
 const old=storage.getItem(key);if(old&&!['verified','reverted','rejected'].includes(JSON.parse(old).phase))throw Error('Resolve the saved launch before submitting another.');
 const approval=storage.getItem('dinn.pons.approval.v1:4663:'+configuration.account.toLowerCase());if(approval&&!['verified','reverted','rejected'].includes(JSON.parse(approval).phase))throw Error('Resolve the saved purchase approval before launching.');
 const tx=assertPrepared(prepared,configuration);
 const [accounts,chain]=await Promise.all([provider.request({method:'eth_accounts'}),provider.request({method:'eth_chainId'})]);
 if(!same(accounts?.[0],configuration.account)||Number(chain)!==4663||!isCurrent())throw Error('Wallet or draft changed. Review again.');
 assertPrepared(prepared,configuration);
 const record={phase:'awaiting-wallet',hash:null,configuration,quote:prepared.quote,transaction:tx};
 storage.setItem(key,JSON.stringify(record));
 try{const hash=await sendReviewedTransaction({transaction:tx,provider,sendTransaction,address,chainId:4663,source});record.hash=hashValid(hash)?hash:null;record.phase=record.hash?'submitted':'unknown';}catch(e){record.error=e.message;record.phase=e.code===4001||e.code==='ACTION_REJECTED'?'rejected':'unknown';}
 try{storage.setItem(key,JSON.stringify(record));}catch{record.storageWarning=true;}return record;
 });
}

export async function requestPonsApproval({prepared,configuration,provider,sendTransaction,address,source='external',storage,key,isCurrent,withLock}){
 if(typeof withLock!=='function')throw Error('This browser cannot lock approval submissions.');
 return withLock(async()=>{
 const walletAction=JSON.parse(storage.getItem('dinn.robinhood.wallet.v1:'+configuration.account.toLowerCase())||'null');if(walletAction&&!['verified','refunded','reverted','rejected'].includes(walletAction.state))throw Error('Resolve your saved wallet transfer, bridge or swap first.');
 const old=storage.getItem(key);if(old&&!['verified','reverted','rejected'].includes(JSON.parse(old).phase))throw Error('Check the saved approval before submitting another.');
 const launch=storage.getItem('dinn.pons.pending.v1:4663:'+configuration.account.toLowerCase());if(launch&&!['verified','reverted','rejected'].includes(JSON.parse(launch).phase))throw Error('Resolve the saved launch before approving another purchase.');
 const {approvalTransaction,purchaseQuote}=await import('../src/pons-purchase.mjs');
 const amount=purchaseQuote(configuration,prepared.quote)?.amountWei;
 if(!prepared.simulated||!prepared.required||!Number.isFinite(prepared.expiresAt)||!['0',amount].includes(prepared.amount)||prepared.expiresAt<Date.now()||prepared.expiresAt>Date.now()+120000)throw Error('Approval expired or changed. Review again.');
 const tx=approvalTransaction(configuration,prepared.amount);for(const k of Object.keys(tx))if(!same(tx[k],prepared.transaction?.[k]))throw Error('Approval differs from reviewed purchase.');
 const [accounts,chain]=await Promise.all([provider.request({method:'eth_accounts'}),provider.request({method:'eth_chainId'})]);
 if(!same(accounts?.[0],configuration.account)||Number(chain)!==4663||!isCurrent()||prepared.expiresAt<Date.now())throw Error('Wallet or draft changed. Review again.');
 const record={phase:'awaiting-wallet',hash:null,configuration,quote:prepared.quote,amount:prepared.amount};storage.setItem(key,JSON.stringify(record));
 try{const hash=await sendReviewedTransaction({transaction:tx,provider,sendTransaction,address,chainId:4663,source});record.hash=hashValid(hash)?hash:null;record.phase=record.hash?'submitted':'unknown';}catch(e){record.error=e.message;record.phase=e.code===4001||e.code==='ACTION_REJECTED'?'rejected':'unknown';}
 try{storage.setItem(key,JSON.stringify(record));}catch{record.storageWarning=true;}return record;
 });
}
