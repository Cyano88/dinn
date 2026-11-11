import {cleanSocials} from './launch-metadata.js';
import {launchIntent,conversationTask} from './flow.js';
﻿export const briefFields=['name','symbol','description'];
export function cleanBrief(value={}){const b={};for(const f of briefFields){if(value[f]!==undefined){if(typeof value[f]!=='string')throw Error('Invalid '+f);const v=value[f].trim();if(f==='name'&&(!v||v.length>40||/[\x00-\x1f]/.test(v)))throw Error('Use a token name of 1-40 characters.');if(f==='symbol'&&!/^[A-Za-z0-9]{1,12}$/.test(v))throw Error('Use a ticker of 1-12 letters or numbers.');if(f==='description'&&v.length>500)throw Error('Keep the description under 500 characters.');b[f]=v;}}return b;}
export function nextField(b){return briefFields.find(f=>b[f]===undefined||f!=='description'&&!b[f])||null;}
export const questions={name:'What is your token called?',symbol:'What ticker should it use?',description:'How would you describe the project? You can say skip for now.'};
export function briefTurn(text,{brief={},awaiting=null}={}){
 const t=text.trim();if(['clear-chat','reset-draft'].includes(workspaceCommand(t)))return null;let patch={},start=workspaceCommand(t)==='start-launch';const intent=launchIntent(t);if(intent){start=true;if(intent.name)patch.name=intent.name;}const task=conversationTask(t);if(task?.kind==='edit'&&briefFields.includes(task.key)){patch[task.key]=task.value;start=true;}
 if(/^(cancel|pause|stop)( setup)?[.!]?$/i.test(t))return {brief,awaiting:null,message:'Setup paused. Your saved details are kept. Say resume setup to continue.'};
 if(/\b(?:ascend|elysium|montra)\b/i.test(t))return null;
 if(/^(?:resume(?: setup)?|(?:let'?s |i want to |help me )?(?:create|launch|prepare|start|make)(?: a| my| the)? (?:new )?(?:token|coin|brief)(?: on pons)?)[.!]?$/i.test(t))start=true;
 const pair=t.match(/^(?:call it |name(?: is|:)? )(.{1,40}?)\s*[,;]\s*(?:ticker|symbol)(?: is|:)?\s*\$?([a-z0-9]{1,12})[.!]?$/i);
 if(pair){patch={name:pair[1].trim(),symbol:pair[2]};start=true;}
 const edit=t.match(/^(?:(?:change|set|update)(?: the| my)? )?(name|ticker|symbol|description)(?: to| is|:)\s+(.+)$/is);
 if(edit){patch[edit[1].toLowerCase()==='ticker'?'symbol':edit[1].toLowerCase()]=edit[2];start=true;}
 // Questions and requests for help remain conversations, never saved as field values.
 if(!start&&awaiting&&!/[?]$/.test(t)&&! /^(?:hi|hello|hey|thanks|thank you)[!. ]*$/i.test(t)&&! /^(what|how|why|can|could|should|explain|suggest|help|write|tell|is |are |do |does )/i.test(t)){const raw=awaiting==='name'?t.replace(/^(?:call it|name it|(?:token )?name is)\s+/i,''):awaiting==='symbol'?t.replace(/^(?:ticker|symbol)(?: is)?\s+/i,'').replace(/^\$/,''):t;patch[awaiting]=awaiting==='description'&&/^skip[.!]?$/i.test(t)?'':raw;start=true;}
 if(!start)return null;
 const updated=cleanBrief({...brief,...patch}),next=nextField(updated);
 return {brief:updated,awaiting:next,message:(Object.keys(patch).length?'Saved. ':'')+(next?questions[next]:'Your Pons brief is ready. Open launch review to choose the economics and simulate. Nothing has been deployed.'),ready:!next};
}
export function cleanPonsSettings(v={}){
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['pairToken','configId','creatorTaxBps','buybackEnabled','creatorFeeRecipient','socials'].includes(k)))throw Error('Invalid Pons settings context.');
 const r={};if(v.socials!==undefined)r.socials=cleanSocials(v.socials);if(v.pairToken!==undefined){if(!/^0x[a-f0-9]{40}$/i.test(v.pairToken))throw Error('Invalid pairing asset context.');r.pairToken=v.pairToken;}if(v.configId!==undefined){if(!Number.isSafeInteger(v.configId)||v.configId<0)throw Error('Invalid config context.');r.configId=v.configId;}if(v.creatorTaxBps!==undefined){if(!Number.isInteger(v.creatorTaxBps)||v.creatorTaxBps<0||v.creatorTaxBps>10000)throw Error('Invalid tax context.');r.creatorTaxBps=v.creatorTaxBps;}if(v.buybackEnabled!==undefined){if(typeof v.buybackEnabled!=='boolean')throw Error('Invalid buyback context.');r.buybackEnabled=v.buybackEnabled;}if(v.creatorFeeRecipient!==undefined){if(!/^0x[a-f0-9]{40}$/i.test(v.creatorFeeRecipient))throw Error('Invalid fee recipient context.');r.creatorFeeRecipient=v.creatorFeeRecipient;}return r;
}

export function workspaceCommand(text){
 const t=String(text).trim().replace(/[.!?]+$/,'').replace(/^(?:please\s+)?(?:(?:can|could) you\s+)?/i,'');
 if(/^(?:clear|reset|delete|new)(?:\s+(?:(?:the|this|my|current)\s+)?(?:chat(?: session)?|conversation))$/i.test(t)||/^clear$/i.test(t))return 'clear-chat';
 if(/^(?:clear|reset|discard|delete)(?:\s+(?:my|the|current))?\s+(?:draft|brief|token setup|token details|setup)$/i.test(t))return 'reset-draft';
 if(/^(?:(?:i (?:want|would like) to|let(?:.s| us)|help me)\s+)?(?:launch|create|deploy|start)(?:\s+(?:a new|a|my|the|new))?(?:\s+(?:token|coin|launch))?(?:\s+on pons)?$/i.test(t))return 'start-launch';
 return null;
}
