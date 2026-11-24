import {cleanInspection} from './token-report.js';
﻿import {appendExchange,restoreConversation} from './chat.js';
import {cleanDexProfile,dexCheckoutFor} from './dex-profile.js';
export function savedChatResult(result){
 const actions=[];
 for(const action of Array.isArray(result?.actions)?result.actions:[]){
  if(['new_setup','resume_setup'].includes(action.id)){actions.push({id:action.id});continue;}
  if(action.id==='claim'&&/^0x[0-9a-f]{40}$/i.test(action.address||'')){actions.push({id:'claim',address:action.address});continue;}
  if(action.id!=='dex')continue;
  try{dexCheckoutFor(action.address);}catch{continue;}
  const safe={id:'dex',address:action.address};
  try{const profile=cleanDexProfile(action.preparation.profile);if(profile.address.toLowerCase()===action.address.toLowerCase())safe.preparation={profile,inference:action.preparation.inference==='generated'?'generated':'unavailable',sources:Array.isArray(action.preparation.sources)?action.preparation.sources.filter(s=>['GeckoTerminal reported profile','Contract-reported project metadata'].includes(s?.label)).map(s=>({label:s.label})):[],restored:true};}catch{}
  actions.push(safe);
 }
 let inspection;try{inspection=cleanInspection(result?.inspection);}catch{}return actions.length||inspection?{actions,...(inspection?{inspection,tokenAddress:inspection.address,restored:true}:{})}:null;
}
export function appendChatState(history,results,user,assistant,result){
 const messages=appendExchange(history,user,assistant),all=[...history.map((_,i)=>results[i]||null),null,savedChatResult(result)];
 return {messages,results:all.slice(-messages.length)};
}
export function restoreChatState(raw){
 const messages=restoreConversation(raw);let stored;try{stored=JSON.parse(raw);}catch{}
 let priorAddress;const results=messages.map((m,i)=>{
  if(m.role==='user'){const addresses=m.content.match(/0x[0-9a-f]{40}(?![0-9a-f])/gi)||[];if(addresses.length)priorAddress=addresses.length===1&&(/dex/i.test(m.content)||/^0x[0-9a-f]{40}$/i.test(m.content.trim()))?addresses[0]:undefined;return null;}
  // Approval actions are deliberately not restored. Expire both generations of the swap prompt.
  const quotePrompt=m.content.indexOf('Approve this quote or decline?');
  if(quotePrompt>=0&&/^Approve this quote or decline\?(?:\s+Do you accept these exact terms\?[^\n]*)?$/.test(m.content.slice(quotePrompt))){
   m.content=m.content.slice(0,quotePrompt)+'This quote has expired. Ask for a new quote to swap.';
  }
  const saved=savedChatResult(stored?.results?.[i]);if(saved)return saved;
  // Recover old text-only DEX replies from an explicit address in that conversation.
  if(priorAddress&&/DEX Screener/i.test(m.content)&&/prepared|profile|checkout/i.test(m.content))return savedChatResult({actions:[{id:'dex',address:priorAddress}]});
  return null;
 });return {messages,results};
}

const explorers={8453:'https://basescan.org',4663:'https://robinhoodchain.blockscout.com'};
const networks={8453:'Base',4663:'Robinhood Chain'};
const hash=value=>/^0x[0-9a-f]{64}$/i.test(value||'');
export function isSwapStatusQuestion(text){
 return /^(?:check(?: the| my)?(?: status of)?|show(?: me)?(?: my| the)?|what(?: is|'s)(?: the)? status of(?: my| the)?|did(?: my| the)?)?\s*(?:(?:my|the|last|latest)\s+)*swap(?:\s+(?:status|receipt|go through|complete|finish))?[.!?]?$/i.test(text.trim())&&!/^swap[.!?]?$/i.test(text.trim());
}
export function savedSwap(storage,account){
 if(!/^0x[0-9a-f]{40}$/i.test(account||''))return null;
 try{const r=JSON.parse(storage.getItem('dinn.robinhood.wallet.v1:'+account.toLowerCase()));return r?.review?.kind==='swap'&&r.review.account?.toLowerCase()===account.toLowerCase()&&explorers[r.review.chainId]&&r.review.chainId===r.review.destinationChainId&&hash(r.hash)?r:null;}catch{return null;}
}
export function swapReceipt(record,result){
 const q=record.review,network=networks[q.chainId],link=(label,h)=>'['+label+']('+explorers[q.chainId]+'/tx/'+h+')';
 const source=link('Source transaction',record.hash);
 if(result&&result.hash?.toLowerCase()!==record.hash.toLowerCase())throw Error('Swap receipt hash mismatch');
 if(result?.state==='verified'&&result.stage==='destination'&&hash(result.destinationHash))return {done:true,text:'\u2713 Swap completed on '+network+'. '+source+' \u00b7 '+link('Destination transaction',result.destinationHash)};
 if(result?.state==='refunded'&&hash(result.destinationHash)&&result.refundChainId===q.chainId)return {done:true,text:'Swap refunded on '+network+'. '+source+' \u00b7 '+link('Refund transaction',result.destinationHash)};
 if(result?.state==='reverted')return {done:true,text:'The swap transaction failed on '+network+'. '+source};
 if(result?.needsRecovery||result?.state==='refund-reported')return {done:true,text:'This swap needs a status check with Relay. '+source+' ? [Open Relay recovery](https://relay.link/withdraw)'};
 return {done:false,text:'Swap sent on '+network+'. Waiting for confirmation. '+source};
}
