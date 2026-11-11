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
  const saved=savedChatResult(stored?.results?.[i]);if(saved)return saved;
  // Recover old text-only DEX replies from an explicit address in that conversation.
  if(priorAddress&&/DEX Screener/i.test(m.content)&&/prepared|profile|checkout/i.test(m.content))return savedChatResult({actions:[{id:'dex',address:priorAddress}]});
  return null;
 });return {messages,results};
}
