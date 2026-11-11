import {mountCreatorFees} from './creator-fees.js';
import {fields,missingField,displayValue,restoreDraft} from './flow.js';
const BASE_KEY='launchflow.tracked.v2';
export function restoreTracked(raw){
 try{const data=JSON.parse(raw);if(!Array.isArray(data))return [];
 return data.slice(0,20).flatMap(item=>{
  if(!item||!/^0x[0-9a-fA-F]{64}$/.test(item.hash||''))return [];
  const configuration=restoreDraft(JSON.stringify({version:1,draft:item.configuration}));
  if(item.expectedData!==undefined&&(!/^0x(?:[0-9a-fA-F]{2})+$/.test(item.expectedData)||item.expectedData.length>8192))return [];
  return missingField(configuration)?[]:[{hash:item.hash,configuration,...(item.expectedData?{expectedData:item.expectedData}:{})}];
 });}catch{return [];}
}
export function mountLaunches({api,getDraft,isRpcConfigured,onVerified=()=>{},onStart=()=>{},getAccount=()=>null,getProvider=()=>null}){
 const $=s=>document.querySelector(s);
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const fees=mountCreatorFees({api,getAccount,getProvider});
 const observations=new Map();
 let KEY=null,tracked=[],ownerVersion=0;
 const save=()=>{if(!KEY)return;try{sessionStorage.setItem(KEY,JSON.stringify(tracked));}catch{$('#tracking-feedback').textContent='This browser could not save tracking history. Keep the transaction hash.';}};
 function renderReceipt(out,result){out.replaceChildren(el('p','',result.message));
     if(['verified','confirming'].includes(result.state)){
      for(const [label,value]of [['Token address',result.token],['Creator escrow',result.escrow],['Fee recipient',result.recipient],['Block',result.blockNumber],['Confirmations',result.confirmations]]){const row=el('div','receipt-row');row.append(el('span','',label),el('code','',value));out.append(row);}
      out.append(el('p','summary-note','Verified against Ascend contract events and this draft. Confirmation count is a snapshot; use Verify receipt to check again.'));
     }
 }
 function render(){
  const list=$('#tracked-launches');list.replaceChildren();
  if(!tracked.length){const empty=el('div','empty-launches');empty.append(el('h3','','No launches yet'),el('p','','Launches submitted through Dinn appear here automatically.'));const start=el('button','primary','Create a token');start.onclick=onStart;empty.append(start);list.append(empty);return;}
  for(const record of tracked){
   const card=el('article','tracked-card'),heading=el('h3','',record.configuration.name+' · $'+record.configuration.symbol),state=el('span','draft-badge','NOT VERIFIED'),hash=el('p','transaction-hash',record.hash),out=el('div','receipt-output');
   const observed=observations.get(record.hash.toLowerCase());if(observed){state.textContent=observed.state.toUpperCase();renderReceipt(out,observed);}
   const check=el('button','subtle','Verify receipt');check.disabled=!isRpcConfigured();
   check.onclick=async()=>{const ownerAtCheck=ownerVersion;check.disabled=true;state.textContent='CHECKING';out.replaceChildren();
    try{const result=await api('/api/launch/receipt',record);if(ownerAtCheck!==ownerVersion)return;observations.set(record.hash.toLowerCase(),result);state.textContent=result.state.toUpperCase();if(['verified','reverted','confirming'].includes(result.state))onVerified(record,result);
     renderReceipt(out,result);
    }catch(error){state.textContent='UNVERIFIED';out.append(el('p','',error.message));}finally{check.disabled=!isRpcConfigured();}
   };
   const details=el('details','tracked-settings');details.append(el('summary','','Expected launch settings'));
   for(const field of fields){const row=el('div','receipt-row');row.append(el('span','',field.label),el('code','',displayValue(field.key,record.configuration[field.key])));details.append(row);}
   card.append(heading,state,hash,details,check,out);list.append(card);
  }
 }
 function refreshDraft(){
  const draft=getDraft(),complete=!missingField(draft);
  const recoveryAvailable=complete&&isRpcConfigured();
  $('#tracking-details').hidden=!recoveryAvailable;
  if(!recoveryAvailable)$('#tracking-details').open=false;
  $('#tracking-draft').textContent=complete?'Recovering a launch for '+draft.name+'.':'Complete your token settings first.';
  $('#track-launch').disabled=!complete;
  $('#tracking-rpc').textContent='Use this only if a submitted launch is missing. Recovery checks the receipt; it does not send another transaction.';
 }
 $('#track-form').onsubmit=event=>{
  event.preventDefault();const configuration={...getDraft()},hash=$('#transaction-hash').value.trim();
  if(missingField(configuration)){$('#tracking-feedback').textContent='Finish the launch configuration in Chat first.';return;}
  if(!/^0x[0-9a-fA-F]{64}$/.test(hash)){$('#tracking-feedback').textContent='Enter a full transaction hash: 0x followed by 64 hexadecimal characters.';return;}
  if(tracked.some(r=>r.hash.toLowerCase()===hash.toLowerCase())){$('#tracking-feedback').textContent='This transaction is already tracked. Its original expected settings are preserved.';return;}
  tracked=[{hash,configuration},...tracked].slice(0,20);save();render();$('#transaction-hash').value='';$('#tracking-feedback').textContent='Saved for verification. No launch success has been assumed.';
 };
 function add(record){const normalized=restoreTracked(JSON.stringify([record]))[0];if(!normalized)throw Error('Invalid submitted launch record.');if(!tracked.some(r=>r.hash.toLowerCase()===normalized.hash.toLowerCase())){tracked=[normalized,...tracked].slice(0,20);save();render();}return normalized;}
 render();refreshDraft();return {refreshDraft,add,accountChanged:()=>fees.reset(),setOwner(id){ownerVersion++;fees.reset();$('#transaction-hash').value='';$('#tracking-feedback').textContent='';KEY=BASE_KEY+':'+id;observations.clear();tracked=[];try{tracked=restoreTracked(sessionStorage.getItem(KEY));}catch{}render();refreshDraft();},observe(record,result){if(record.hash.toLowerCase()!==result.hash.toLowerCase())throw Error('Receipt hash mismatch.');observations.set(record.hash.toLowerCase(),result);render();}};
}
