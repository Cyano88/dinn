import {usdTotal} from './purchase-usd.js';
import {launchLinkSteps,parseLaunchLink} from './launch-link-chat.js';
import {mountLogoCreator} from './logo-creator.js';

import {cleanSocials,socialFields,socialLabels} from './launch-metadata.js';

import {mountLaunchActivity} from './launch-activity.js';

import {renderInspection} from './token-report.js';

import {appendChatState,restoreChatState} from './chat-state.js';

import {dexCheckoutFor} from './dex-profile.js';

import {renderAssistantText} from './chat-format.js';

import {mountDexService} from './dex-service.js';

import {pairCandidates} from './pons-assets.js';

import {cleanBrief,cleanPonsSettings,nextField,workspaceCommand} from './pons-flow.js';

import {receiveChat} from './chat.js';

const $=id=>document.getElementById(id);

const metadataIds=socialFields.map(k=>'launch-'+k);

function currentSocials(){return cleanSocials(Object.fromEntries(socialFields.map(k=>[k,$('launch-'+k).value])));}

let launchPair=null,setupActive=false,requestedSupply=null;

let account=null,user=null,history=[],chatResults=[],controller=null,epoch=0,brief={},awaiting=null,provider=null,setupBusy=false,selectedToken=null;

for(const a of pairCandidates){const o=document.createElement('option');o.value=a.symbol;o.label=a.name+' - '+a.address;$('pair-candidates').append(o);}

function pairAddress(value){if(/^(eth|native eth)$/i.test(value))return '0x'+'0'.repeat(40);const matches=pairCandidates.filter(a=>a.symbol.toLowerCase()===value.toLowerCase());if(matches.length===1)return matches[0].address;if(/^0x[0-9a-f]{40}$/i.test(value))return value;throw Error('Choose ETH, a catalog ticker, or paste the Robinhood pairing-token address.');}

const dexService=mountDexService({getUser:()=>user,getBrief:()=>({...brief,logo:$('launch-logo').value}),getToken:()=>selectedToken,api});

const key=kind=>'dinn.multi.'+kind+'.v1:'+user;

function read(kind){try{return localStorage.getItem(key(kind));}catch{return null;}}

function save(kind,value){localStorage.setItem(key(kind),JSON.stringify(value));}

async function api(path,data,signal){const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data),signal});const v=await r.json();if(!r.ok)throw Error(v.error||'Could not complete the request.');return v;}

function view(name){for(const n of ['assistant','launchpads','drafts','wallet'])$(n+'-view').hidden=n!==name;document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===name);if(b.dataset.view===name)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});$('view-name').textContent=name[0].toUpperCase()+name.slice(1);}

function scrollChat(){requestAnimationFrame(()=>$('chat-thread').scrollTop=$('chat-thread').scrollHeight);}

function syncBrief(){invalidateLaunch();for(const f of ['name','symbol','description'])$('brief-'+f).value=brief[f]||'';renderTokenSummary();}

function message(role,text){const el=document.createElement('div');el.className='message '+role;const label=document.createElement('small');label.textContent=role==='user'?'You':'Dinn';const body=document.createElement('div');body.className='message-body';if(role==='assistant')renderAssistantText(body,text);else body.textContent=text;el.append(label,body);$('messages').append(el);$('welcome').hidden=true;scrollChat();return body;}

function restore(){const restored=restoreChatState(read('chat'));history=restored.messages;chatResults=restored.results;$('messages').replaceChildren();history.forEach((m,i)=>{const body=message(m.role,m.content);if(chatResults[i])renderToolResult(body,{message:m.content,...chatResults[i]});});try{const saved=JSON.parse(read('pons-brief'));brief=saved?.launchpad==='pons'&&saved.chainId===4663?cleanBrief(Object.fromEntries(['name','symbol','description'].filter(f=>saved[f]!==undefined).map(f=>[f,saved[f]]))):{};}catch{brief={};}try{const setup=JSON.parse(read('setup'));awaiting=setup?.awaiting||null;setupActive=setup?.active===true;requestedSupply=typeof setup?.requestedSupply==='string'&&/^[1-9]\d{0,23}$/.test(setup.requestedSupply)?setup.requestedSupply:null;}catch{awaiting=null;setupActive=false;requestedSupply=null;}syncBrief();}

function keepBrief(){save('pons-brief',{...brief,launchpad:'pons',chainId:4663});save('setup',{awaiting,active:setupActive,requestedSupply});syncBrief();}

document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view));

$('start-brief').onclick=$('pons-draft').onclick=()=>{view('assistant');$('prompt').value='create a token';$('chat').requestSubmit();};

$('chat-review').onclick=()=>{closeTokenPanel();$('review-launch').click();};

$('prompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('chat').requestSubmit();}});

let launchConversationStep=null,launchLinkIndex=0;

const conversationStages={profile:'launch-profile-dialog',links:'launch-links-step',purchase:'launch-purchase-dialog',preparing:'launch-preparing-dialog'};

const launchConversation=document.createElement('section');launchConversation.id='launch-conversation';launchConversation.hidden=true;launchConversation.setAttribute('aria-label','Launch setup with Dinn');

const speaker=document.createElement('small');speaker.textContent='Dinn';launchConversation.append(speaker);

for(const id of Object.values(conversationStages))launchConversation.append($(id));$('chat-thread').append(launchConversation);$('launch-profile-dialog').append($('close-launch-profile'));$('launch-purchase-dialog').append($('close-launch-purchase'));

function showLaunchStage(step,persist=true){

 launchConversationStep=step;launchConversation.hidden=!step;

 for(const [name,id] of Object.entries(conversationStages))$(id).hidden=name!==step;

 $('choices').hidden=!!step;

 if(user&&persist)save('launch-conversation',{step:step==='preparing'?'purchase':step,name:brief.name,symbol:brief.symbol,linkIndex:launchLinkIndex});

 if(step){view('assistant');closeTokenPanel();$('welcome').hidden=true;requestAnimationFrame(()=>launchConversation.scrollIntoView({block:'start'}));}

}

function pauseLaunchConversation(){showLaunchStage(null);logoCreator.reset();renderSetupChoices();}

function restoreLaunchConversation(){let saved;try{saved=JSON.parse(read('launch-conversation'));}catch{}if(!saved||saved.name!==brief.name||saved.symbol!==brief.symbol)return;if(saved.step==='profile')void openLaunchProfile();else if(saved.step==='links')openLaunchLinks(Number.isInteger(saved.linkIndex)?saved.linkIndex:0);else if(saved.step==='purchase')openLaunchPurchase();}

function recordSetupReply(text,reply){const state=appendChatState(history,chatResults,text,reply,{});history=state.messages;chatResults=state.results;save('chat',state);message('user',text);message('assistant',reply);}

function handleLaunchReply(text){

 if(!launchConversationStep)return false;

 if(launchBusy){$('feedback').textContent='Dinn is preparing this step. Please wait.';return true;}

 if(/^(pause|pause setup|cancel)$/i.test(text)){pauseLaunchConversation();return true;}

 if(launchConversationStep==='profile'){

  if(/^(skip|skip logo|no logo)$/i.test(text)){$('skip-launch-logo').click();return true;}

  if(/^(use (this|the) logo|accept( logo)?)$/i.test(text)){logoCreator.accept();return true;}

  if(/^(continue|next)$/i.test(text)){$('continue-launch-profile').click();return true;}

  if(/^https:\/\/\S+$|^ipfs:\/\/\S+$/i.test(text)){$('launch-logo').value=text;$('launch-logo').dispatchEvent(new Event('input',{bubbles:true}));$('continue-launch-profile').click();return true;}

  const style=text.match(/^(?:create|generate)(?: (?:a |the )?logo)?(?: with|:)?\s*(.*)$/i);if(style){logoCreator.create(style[1]);return true;}

 }

 if(launchConversationStep==='links'){
  const parsed=parseLaunchLink(text,launchLinkSteps[launchLinkIndex].field);
  if(parsed){applyLinkReply(parsed,text);return true;}
  $('launch-links-error').textContent='Paste the requested link, say keep to retain it, or skip. You can pause setup to ask another question.';return true;
 }
 if(launchConversationStep==='purchase'){

  if(/^(skip|skip purchase|no purchase)$/i.test(text)){$('skip-launch-purchase').click();return true;}

  const value=text.match(/^(?:(?:buy|spend)\s+)?(\d+(?:\.\d+)?)(?:\s+([a-z0-9]+))?$/i);if(value){const pair=pairCandidates.find(a=>a.address.toLowerCase()===pairAddress($('launch-pair').value).toLowerCase())?.symbol||'ETH';if(value[2]&&value[2].toUpperCase()!==pair.toUpperCase()){$('purchase-error').textContent='Enter the amount to spend in '+pair+'.';return true;}$('purchase-amount').value=value[1];$('continue-launch-purchase').click();return true;}

 }

 // General questions retain the normal agent path; resume via the setup choices.

 pauseLaunchConversation();return false;

}

function clearConversation(){

 try{save('chat',{messages:[]});}catch{ $('feedback').textContent='Browser storage is unavailable. Chat could not be cleared permanently.';return false;}

 showLaunchStage(null);logoCreator.reset();epoch++;launchBusy=false;controller?.abort();controller=null;setupBusy=false;setupActive=false;history=[];chatResults=[];awaiting=null;launchStep=null;selectedToken=null;launchPair=null;

 try{save('setup',{awaiting:null,requestedSupply});saveSettings();}catch{}

 $('send').disabled=false;$('stop-response').hidden=true;$('messages').replaceChildren();$('welcome').hidden=false;$('prompt').value='';renderSetupChoices();view('assistant');$('feedback').textContent='Chat cleared. Your token details are kept.';return true;

}

$('new').onclick=clearConversation;

$('stop-response').onclick=()=>controller?.abort();

$('chat').onsubmit=async e=>{e.preventDefault();if(!user)return;const text=$('prompt').value.trim();if(!text)return;const command=workspaceCommand(text);if(command==='clear-chat'){clearConversation();return;}if(command==='reset-draft'){$('reset-draft-dialog').showModal();return;}if(handleLaunchReply(text)){$('prompt').value='';return;}if(controller||setupBusy)return;const generation=epoch,draftRevision=launchRevision;controller=new AbortController();const request=controller;$('prompt').value='';$('send').disabled=true;$('stop-response').hidden=false;$('feedback').textContent='';message('user',text);const reply=message('assistant','');reply.textContent='Thinking';reply.classList.add('thinking');reply.setAttribute('aria-label','Dinn is thinking');for(let i=0;i<3;i++){const dot=document.createElement('span');dot.className='thinking-dot';dot.textContent='.';dot.setAttribute('aria-hidden','true');reply.append(dot);}let received=false;try{const {getAccessToken}=await import('/auth/entry.js');const accessToken=await getAccessToken();const r=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json',...(accessToken?{authorization:'Bearer '+accessToken}:{})},body:JSON.stringify({message:text,history,ponsBrief:brief,ponsSettings:currentSettings(),ponsSetup:{requestedSupply,active:setupActive||!!awaiting||!!launchStep,field:awaiting||({'launch-pair':'pairToken','launch-config':'configId','launch-tax':'creatorTaxBps','launch-buyback':'buybackEnabled','launch-recipient':'creatorFeeRecipient'})[launchStep]||null,logo:$('launch-logo').value},...(account?{walletAccount:account}:{}),...(selectedToken?{tokenAddress:selectedToken}:{})}),signal:request.signal});const result=await receiveChat(r,delta=>{if(epoch===generation){if(!received){reply.textContent='';reply.classList.remove('thinking');reply.removeAttribute('aria-label');received=true;}reply.textContent+=delta;scrollChat();}});if(epoch!==generation)return;if(result.launchDraft){try{if(launchRevision!==draftRevision)throw Error('Your draft changed while Dinn was responding. Please retry against the updated draft.');applyLaunchDraft(result.launchDraft);}catch(error){received=false;reply.textContent='';throw error;}}const state=appendChatState(history,chatResults,text,result.message,result);history=state.messages;chatResults=state.results;save('chat',state);renderToolResult(reply,result);}catch(err){if(epoch===generation){const failure=err.name==='AbortError'?'Response stopped. Your message is ready to retry.':err.message;reply.classList.remove('thinking');reply.removeAttribute('aria-label');reply.textContent=(received&&reply.textContent.trim()?reply.textContent+'\n\n':'')+'Could not finish: '+failure;reply.setAttribute('role','status');$('prompt').value=text;$('feedback').textContent='Your message is ready to retry.';}}finally{if(controller===request){controller=null;$('send').disabled=false;$('stop-response').hidden=true;}}};

$('brief-form').onsubmit=async e=>{e.preventDefault();const generation=epoch;if(!user)return;try{const b=await api('/api/pons/brief',{launchpad:'pons',chainId:4663,...Object.fromEntries(['name','symbol','description'].map(f=>[f,$('brief-'+f).value]))});if(epoch!==generation)return;brief=cleanBrief({name:b.name,symbol:b.symbol,description:b.description});awaiting=null;keepBrief();$('brief-status').textContent='Brief saved in this browser. Not deployed.';}catch(err){if(epoch===generation)$('brief-status').textContent=err.message;}};

async function check(button,status,path,data,render){const generation=epoch;button.disabled=true;status.textContent='Checking - ';try{const r=await api(path,data);if(generation===epoch)render(r);}catch(err){if(generation===epoch)status.textContent=err.message;}finally{button.disabled=false;}}

$('check-pons').onclick=()=>check($('check-pons'),$('pons-status'),'/api/pons/readiness',account?{account}:{},r=>{$('pons-status').textContent=`Verified chain ${r.chainId}  -  block ${r.blockNumber}. ${r.configs.length} enabled configs. Factory launch fee: ${r.launchFee} ETH. ${r.accountCanLaunch===false?'This wallet does not currently have launch permission. ':''}Dinn execution remains in development.`;});

$('refresh-balance').onclick=()=>check($('refresh-balance'),$('wallet-status'),'/api/robinhood/balance',{account},r=>{$('wallet-balance').textContent=r.balance+' ETH';$('wallet-status').textContent='Verified on Robinhood Chain at block '+r.blockNumber+'.';});

$('copy-address').onclick=async()=>{try{if(!account)throw Error('Open your wallet first.');await navigator.clipboard.writeText(account);$('wallet-status').textContent='Address copied.';}catch(err){$('wallet-status').textContent=err.message;}};

window.addEventListener('launchflow:auth',e=>{const d=e.detail;const nextUser=d.authenticated?(d.userId||d.address):null;if(nextUser===user&&d.state==='connected'&&d.address===account&&d.provider===provider)return;showLaunchStage(null,false);if($('pons-review-dialog').open)$('pons-review-dialog').close();epoch++;launchBusy=false;logoCreator.reset();controller?.abort();launchActivity.stop();selectedToken=null;account=d.address||null;provider=d.provider||null;invalidateLaunch();user=d.authenticated?(d.userId||account):null;const loading=d.state==='loading';$('session-loading').hidden=!loading;$('auth-gate').hidden=loading||!!user;$('workspace').hidden=loading||!user;$('workspace').inert=loading||!user;history=[];$('messages').replaceChildren();for(const id of ['feedback','brief-status','pons-status','wallet-status'])$(id).textContent='';$('wallet-address').textContent=account||'Your wallet is getting ready.';$('wallet-balance').textContent=' -  ETH';if(user){restore();restoreLaunch();restoreSettings();if(account){let prior;try{prior=JSON.parse(read('last-deployer'));}catch{}const recipient=$('launch-recipient');if(prior&&recipient.value.toLowerCase()===prior.toLowerCase()){recipient.value=account;saveSettings();}save('last-deployer',account);}renderTokenSummary();renderSetupChoices();restoreLaunchConversation();}else {brief={};awaiting=null;syncBrief();}if(!user)for(const f of ['name','symbol','description'])$('brief-'+f).value='';});

﻿let reviewed=null,prepared=null,launchBusy=false,launchRevision=0;

const localLogoMessage='This logo is saved on this PC, but needs a public link before launch. Download the PNG under More options and add its hosted URL, keep your existing logo, or choose Skip logo.';
function hasLocalLogo(){let logo;try{logo=JSON.parse(read('logo-local-choice'));}catch{}return !!logo?.id&&logo.name===brief.name&&logo.symbol===brief.symbol;}
let profileEpoch=null;

async function openLaunchProfile(){

 if(launchBusy||controller||setupBusy)return;const generation=epoch;launchBusy=true;

 if($('pons-review-dialog').open)$('pons-review-dialog').close();

 profileEpoch=epoch;$('launch-profile-error').textContent='';$('continue-launch-profile').textContent='Continue';

 $('launch-preparing-dialog').querySelector('[role="status"]').textContent='Dinn is getting your logo ready';showLaunchStage('preparing');

 try{await logoCreator.open();if(generation===epoch){showLaunchStage('profile');if(hasLocalLogo())$('launch-profile-error').textContent=localLogoMessage;}}finally{if(generation===epoch)launchBusy=false;}

}

const profileFields=$('launch-profile-fields');

let profileNode=document.querySelector('label[for="launch-logo"]');

while(profileNode){const next=profileNode.nextSibling,done=profileNode.id==='launch-socials';profileFields.append(profileNode);if(done)break;profileNode=next;}

const externalLogo=document.createElement('details');externalLogo.className='profile-secondary';const externalTitle=document.createElement('summary');externalTitle.textContent='Use a logo URL';externalLogo.append(externalTitle);for(const child of [...profileFields.children])if(child.id!=='launch-socials')externalLogo.append(child);profileFields.prepend(externalLogo);

$('launch-links-fields').append($('launch-socials'));$('launch-socials').open=false;$('launch-socials').querySelector('summary').textContent='Add or edit links';

const logoCreator=mountLogoCreator({host:profileFields,getContext:()=>({user,name:brief.name||'',symbol:brief.symbol||'',description:brief.description||''}),onAccept:result=>{

 if(result.url){let original;try{original=JSON.parse(read('logo-original'));}catch{}if(original?.name!==brief.name||original?.symbol!==brief.symbol)save('logo-original',{name:brief.name,symbol:brief.symbol,url:$('launch-logo').value});$('launch-logo').value=result.url;$('launch-logo').dispatchEvent(new Event('input',{bubbles:true}));save('logo-local-choice',null);}else save('logo-local-choice',{name:brief.name,symbol:brief.symbol,id:result.id});

},onDiscard:()=>{let original;try{original=JSON.parse(read('logo-original'));}catch{}if(original?.name===brief.name&&original?.symbol===brief.symbol){$('launch-logo').value=original.url;$('launch-logo').dispatchEvent(new Event('input',{bubbles:true}));}save('logo-original',null);save('logo-local-choice',null);}});

$('launch-logo').addEventListener('input',()=>{if(hasLocalLogo()){try{const url=new URL($('launch-logo').value.trim());if(!['https:','ipfs:'].includes(url.protocol)||url.username||url.password)return;save('logo-local-choice',null);$('launch-profile-error').textContent='';}catch{}}});
profileFields.addEventListener('input',()=>{$('continue-launch-profile').textContent='Continue';});

$('close-launch-profile').onclick=pauseLaunchConversation;

$('review-launch').onclick=openLaunchProfile;

$('edit-launch-profile').onclick=openLaunchProfile;

$('continue-launch-profile').onclick=async()=>{

 if(profileEpoch!==epoch)return;

 try{if(hasLocalLogo())throw Error(localLogoMessage);if(logoCreator.hasUnselected())throw Error('Choose Use this logo, or discard the preview before continuing.');currentSocials();const logo=$('launch-logo').value.trim();if(logo){const url=new URL(logo);if(!['https:','ipfs:'].includes(url.protocol)||url.username||url.password)throw Error('Use a public HTTPS or IPFS logo URL.');}saveSettings();}

 catch(error){$('launch-profile-error').textContent=error.message;return;}

 recordSetupReply('Continue with this logo setup.','Logo setup saved.');openLaunchLinks();

};

function openLaunchLinks(index=0){if(launchBusy)return;launchLinkIndex=Math.max(0,Math.min(launchLinkSteps.length-1,Number.isInteger(index)?index:0));renderLinkQuestion();}
function renderLinkQuestion(){
 const step=launchLinkSteps[launchLinkIndex],current=$('launch-'+step.field).value;
 $('launch-links-error').textContent='';$('launch-links-prompt').textContent=step.prompt;
 $('launch-link-current').textContent=current?'Current '+step.label+' link: '+current:'';
 $('continue-launch-links').textContent=current?'Keep this link':'Next';$('continue-launch-links').hidden=!current;
 $('skip-launch-links').textContent='Skip '+step.label;showLaunchStage('links');
}
function applyLinkReply(parsed,text){
 const step=launchLinkSteps[launchLinkIndex];
 if(parsed.action==='error'){$('launch-links-error').textContent=parsed.message;return;}
 if(parsed.action==='skip-all'){for(const id of metadataIds)$(id).value='';invalidateLaunch();saveSettings();recordSetupReply(text,'Continuing without project links.');openLaunchPurchase();return;}
 if(parsed.action==='keep'&&!$('launch-'+step.field).value){$('launch-links-error').textContent='No '+step.label+' link is saved yet. Paste one or say skip.';return;}
 const field=parsed.field||step.field,previous=$('launch-'+field).value;
 try{if(parsed.action==='set')$('launch-'+field).value=parsed.url;else if(parsed.action==='skip')$('launch-'+field).value='';currentSocials();$('launch-'+field).dispatchEvent(new Event('input',{bubbles:true}));}
 catch(e){$('launch-'+field).value=previous;$('launch-links-error').textContent=e.message;return;}
 recordSetupReply(text,parsed.action==='skip'?'Skipped '+step.label+'.':(launchLinkSteps.find(s=>s.field===field)?.label||field)+' link saved.');
 if(field!==step.field){renderLinkQuestion();return;}
 if(++launchLinkIndex<launchLinkSteps.length)renderLinkQuestion();else openLaunchPurchase();
}
$('back-launch-logo').onclick=()=>void openLaunchProfile();
$('skip-launch-logo').onclick=()=>{if(logoCreator.isPending()){$('launch-profile-error').textContent='Check the saved logo request before skipping, or pause setup and return later.';return;}logoCreator.discard();$('launch-logo').value='';$('launch-logo').dispatchEvent(new Event('input',{bubbles:true}));recordSetupReply('Skip logo.','Continuing without a logo.');openLaunchLinks();};
$('continue-launch-links').onclick=()=>{const field=launchLinkSteps[launchLinkIndex].field,value=$('launch-'+field).value;const parsed=value?parseLaunchLink(value,field):{action:'keep',field};applyLinkReply(parsed,'Keep my '+launchLinkSteps[launchLinkIndex].label+' link.');};
$('skip-launch-links').onclick=()=>applyLinkReply({action:'skip',field:launchLinkSteps[launchLinkIndex].field},'Skip '+launchLinkSteps[launchLinkIndex].label+'.');
$('skip-all-launch-links').onclick=()=>applyLinkReply({action:'skip-all'},'Skip all links.');
$('launch-links-fields').addEventListener('input',()=>{if(launchConversationStep==='links'){const step=launchLinkSteps[launchLinkIndex];$('continue-launch-links').hidden=!$('launch-'+step.field).value;$('continue-launch-links').textContent='Save '+step.label+' link';}});
function savedPurchase(){try{const v=JSON.parse(read('opening-purchase'));return v?.name===brief.name&&v?.symbol===brief.symbol&&v?.pair===$('launch-pair').value?v:null;}catch{return null;}}

let purchaseUsd=null,usdLoading=false,usdRequest=0;
function showPurchaseUsd(){
 const address=pairAddress($('launch-pair').value).toLowerCase();
 const valid=purchaseUsd?.available&&purchaseUsd.pairToken===address&&purchaseUsd.expiresAt>Date.now();
 const amount=$('purchase-amount').value.trim();let text=usdLoading&&!valid?'Checking USD value…':'USD estimate unavailable';
 if(valid){try{text=amount?'Approximately '+usdTotal(amount,purchaseUsd.unitPriceUsd):'1 '+purchaseUsd.symbol+' ≈ '+usdTotal('1',purchaseUsd.unitPriceUsd);}catch{text='Enter a valid amount to see its USD estimate.';}}
 $('purchase-usd-estimate').textContent=text;
 $('purchase-usd-source').textContent=valid?'Reference estimate · '+purchaseUsd.source+' · '+new Date(purchaseUsd.asOf).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})+'. Excludes launch fee and gas.':(usdLoading?'':'Purchase remains denominated in the pairing asset.');
 const source=$('review-usd-source');if(source)source.textContent=valid?'Reference: '+purchaseUsd.source+' at '+new Date(purchaseUsd.asOf).toLocaleTimeString()+'. Excludes launch fee and gas.':'USD reference unavailable. Launch fee and gas are separate.';
 const row=$('review-purchase-usd');if(row&&reviewed?.configuration.purchase){try{row.textContent=valid&&reviewed.configuration.pairToken.toLowerCase()===address?'≈ '+usdTotal(reviewed.configuration.purchase.amount,purchaseUsd.unitPriceUsd):'Unavailable';}catch{row.textContent='Unavailable';}}
}
async function refreshPurchaseUsd(){
 const address=pairAddress($('launch-pair').value).toLowerCase(),run=++usdRequest,generation=epoch;usdLoading=true;showPurchaseUsd();
 try{const result=await api('/api/pons/purchase-usd',{pairToken:address},AbortSignal.timeout(16000));if(run!==usdRequest||generation!==epoch||pairAddress($('launch-pair').value).toLowerCase()!==address)return;purchaseUsd=result;}
 catch{if(run===usdRequest&&generation===epoch)purchaseUsd=null;}
 finally{if(run===usdRequest&&generation===epoch){usdLoading=false;showPurchaseUsd();}}
}
$('purchase-amount').addEventListener('input',showPurchaseUsd);
setInterval(()=>{if(user&&(launchConversationStep==='purchase'||$('pons-review-dialog').open&&reviewed?.configuration.purchase))void refreshPurchaseUsd();},30000);
function openLaunchPurchase(){

 if(launchBusy)return;if(hasLocalLogo()){void openLaunchProfile();return;}if($('pons-review-dialog').open)$('pons-review-dialog').close();

 const saved=savedPurchase(),asset=pairCandidates.find(a=>a.address?.toLowerCase()===pairAddress($('launch-pair').value).toLowerCase())?.symbol||($('launch-pair').value==='ETH'?'ETH':'pairing asset');

 $('purchase-amount').value=saved?.amount||'';$('purchase-slippage').value=saved?String(saved.slippageBps/100):'1';$('purchase-error').textContent='';$('purchase-amount-label').textContent='Amount to spend in '+asset;$('purchase-asset-note').textContent='Tokens go to your connected wallet. Launch fee and gas are paid in ETH.';showLaunchStage('purchase');void refreshPurchaseUsd();

}

$('close-launch-purchase').onclick=()=>openLaunchLinks();

$('edit-launch-purchase').onclick=openLaunchPurchase;

for(const id of ['purchase-amount','purchase-slippage'])$(id).addEventListener('input',()=>{$('purchase-error').textContent='';});

$('skip-launch-purchase').onclick=()=>{save('opening-purchase',null);recordSetupReply('Skip opening purchase.','I’ll prepare your launch review without a purchase.');void openLaunchReview();};

$('continue-launch-purchase').onclick=()=>{const amount=$('purchase-amount').value.trim(),bps=Number($('purchase-slippage').value)*100;if(!/^\d{1,40}(\.\d{1,36})?$/.test(amount)||!/[1-9]/.test(amount)||!Number.isInteger(bps)||bps<1||bps>500){$('purchase-error').textContent='Enter a positive amount, or skip. Slippage must be between 0.01% and 5%.';return;}save('opening-purchase',{name:brief.name,symbol:brief.symbol,pair:$('launch-pair').value,amount,slippageBps:bps});recordSetupReply('Opening purchase: '+amount+' in the pairing asset.','I’ll check the current terms and include this purchase in your review.');void openLaunchReview();};

function approvalKey(){return 'dinn.pons.approval.v1:4663:'+account?.toLowerCase();}

function approvalRecord(){try{return JSON.parse(localStorage.getItem(approvalKey()));}catch{return null;}}

function updateApprovalUI(){const buy=reviewed?.quote.purchase,old=approvalRecord(),pending=old&&!['verified','reverted','rejected'].includes(old.phase);$('approve-purchase').hidden=!buy?.approvalRequired&&!pending;$('approve-purchase').textContent=pending?'Check saved approval':'Approve '+(reviewed?.quote.pair||'purchase asset');$('approval-recovery-label').hidden=!pending||!!old.hash;$('simulate-launch').disabled=!!buy?.approvalRequired||!!pending;}

$('approve-purchase').onclick=async()=>{

 if(launchBusy||!reviewed)return;const generation=epoch,revision=launchRevision,key=approvalKey();launchBusy=true;$('approve-purchase').disabled=true;

 try{const old=approvalRecord();if(old&&!['verified','reverted','rejected'].includes(old.phase)){const hash=old.hash||$('approval-recovery-hash').value.trim();if(!/^0x[0-9a-f]{64}$/i.test(hash))throw Error('Check your wallet activity and enter the approval transaction hash. Do not submit another approval while the result is unknown.');const r=await api('/api/pons/approval-receipt',{...old,hash});if(generation!==epoch)return;if(['verified','reverted'].includes(r.state)){localStorage.setItem(key,JSON.stringify({...old,hash,phase:r.state}));$('simulation-status').textContent=r.state==='verified'?'Approval confirmed. Refreshing your launch terms…':'Approval reverted. You can retry.';if(r.state==='verified'){launchBusy=false;await openLaunchReview();}}else $('simulation-status').textContent='Approval is '+r.state+'. Check again after confirmation.';

 }else{const p=await api('/api/pons/approval',reviewed);if(generation!==epoch||revision!==launchRevision)return;if(!p.required){launchBusy=false;await openLaunchReview();return;}if(!provider)throw Error('Your selected launch wallet is not ready.');const {requestPonsApproval}=await import('/pons/entry.js');$('simulation-status').textContent=p.amount==='0'?'Reset the existing allowance in your wallet, then approve the exact purchase amount.':'Approve only the opening purchase amount in your wallet.';const r=await requestPonsApproval({prepared:p,configuration:reviewed.configuration,provider,storage:localStorage,key,isCurrent:()=>epoch===generation&&launchRevision===revision,withLock:navigator.locks?fn=>navigator.locks.request(launchKey(),fn):null});if(generation!==epoch)return;$('simulation-status').textContent=r.phase==='rejected'?'Approval declined.':r.hash?'Approval submitted. Check its confirmation before continuing.':'Approval result is uncertain. Check wallet activity before retrying.';if(r.storageWarning)$('simulation-status').textContent+=' Save this hash: '+(r.hash||'unavailable');}

 }catch(e){if(generation===epoch)$('simulation-status').textContent=e.message;}finally{launchBusy=false;$('approve-purchase').disabled=false;if(generation===epoch)updateApprovalUI();}

};

function renderLaunchReview(c,q){

 const root=$('launch-summary');root.replaceChildren();

 const node=(tag,text,cls)=>{const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;};

 root.append(node('h2',c.name+' ('+c.symbol+')'),node('p','Pons · Robinhood Chain','review-network'));

 if(c.description)root.append(node('p',c.description,'review-description'));

 const facts=document.createElement('dl');facts.className='review-facts';

 const row=(label,value)=>{facts.append(node('dt',label),node('dd',value));};

 row('Trading pair',q.pair);row('Token supply',new Intl.NumberFormat('en').format(Number(q.config.supply)/1e18));

 row('Trading fee',(Number(q.config.curveFeeBps)/100+c.creatorTaxBps/100)+'% total');

 row('Fee breakdown',Number(q.config.curveFeeBps)/100+'% base + '+c.creatorTaxBps/100+'% creator tax');

 if(q.purchase){row('Opening purchase',q.purchase.amount+' '+q.pair);row('Approx. USD value','Checking…');facts.lastElementChild.id='review-purchase-usd';row('Estimated tokens',new Intl.NumberFormat('en',{maximumFractionDigits:4}).format(Number(q.purchase.tokensOut))+' '+c.symbol);row('Minimum tokens',new Intl.NumberFormat('en',{maximumFractionDigits:4}).format(Number(q.purchase.minTokensOut))+' '+c.symbol);row('Slippage',q.purchase.slippageBps/100+'%');}else row('Opening purchase','None');

 row('Launch wallet',c.account);row('Creator buybacks',c.buybackEnabled?'Enabled':'Disabled');row('Launch cost',q.launchFee+' ETH + network fee');

 root.append(facts);if(q.purchase){const usdNote=node('p','USD is a reference estimate for the opening purchase only; launch fees and gas are separate.','review-note');usdNote.id='review-usd-source';root.append(usdNote);void refreshPurchaseUsd();}

 const profile=document.createElement('section');profile.className='review-profile';profile.append(node('h3','Logo & links'));

 if(c.logo)profile.append(node('p','Logo URL: '+c.logo));

 const links=socialFields.filter(k=>c.socials[k]);for(const k of links)profile.append(node('p',socialLabels[k]+': '+c.socials[k]));

 if(!c.logo&&!links.length)profile.append(node('p','You are continuing without a logo or social links.'));

 root.append(profile);

 const details=document.createElement('details');details.className='review-details';details.append(node('summary','Launch details'));

 const target=q.pairAsset.native?Number(q.config.graduationThreshold)/1e18:q.pairAsset.graduationTarget;

 for(const text of ['Graduation target: '+target+' '+q.pair+' in quote reserves; not market cap.','Creator fee recipient: '+c.creatorFeeRecipient,'Pair contract: '+q.pairToken,c.purchase?'Opening purchase goes to '+c.account+'. No extra opening-tax exemptions.':'No initial purchase. No extra opening-tax exemptions.'])details.append(node('p',text));

 root.append(details,node('p','Logo and links are included at launch and cannot be edited through this token contract afterward.','review-note'));

}

function invalidateLaunch(){launchRevision++;reviewed=null;prepared=null;$('launch-review').hidden=true;$('approve-launch').hidden=true;if($('pons-review-dialog').open)$('pons-review-dialog').close();}

function launchKey(){return 'dinn.pons.pending.v1:4663:'+account?.toLowerCase();}

$('chat-thread').append($('launch-recovery'));$('launch-recovery').classList.add('chat-launch-recovery');
const launchActivity=mountLaunchActivity({getAccount:()=>account,getEpoch:()=>epoch,getRecord:()=>{try{return JSON.parse(localStorage.getItem(launchKey()));}catch{return null;}},setRecord:r=>localStorage.setItem(launchKey(),JSON.stringify(r)),api,onResearch:address=>{selectedToken=address;view('assistant');submitChoice('check token '+address);},onDex:address=>{selectedToken=address;view('assistant');submitChoice('Prepare DEX Screener profile for '+address);}});

function restoreLaunch(){launchActivity.restore();}



for(const f of ['brief-name','brief-symbol','brief-description','launch-tax','launch-buyback','launch-config','launch-pair','launch-recipient','launch-logo',...metadataIds])$(f).addEventListener('input',()=>{invalidateLaunch();saveSettings();renderTokenSummary();});

$('load-configs').onclick=()=>check($('load-configs'),$('launch-feedback'),'/api/pons/readiness',account?{account}:{},r=>{invalidateLaunch();$('launch-config').replaceChildren(new Option('Choose a configuration',''));for(const c of r.configs)$('launch-config').add(new Option(`Config ${c.id} - ${Number(c.supply)/1e18} tokens - ${Number(c.curveFeeBps)/100}% base fee`,c.id));$('launch-tax').max=Number(r.maxCreatorTaxBps)/100;$('launch-feedback').textContent=`Launch fee ${r.launchFee} ETH, plus gas. Creator tax cap ${Number(r.maxCreatorTaxBps)/100}%. ${r.accountCanLaunch===false?'This wallet cannot currently launch on Pons.':''}`;});

function configuration(){if(hasLocalLogo())throw Error(localLogoMessage);if(!account)throw Error('Connect your launch wallet first.');if($('launch-pair').value===''||$('launch-config').value===''||$('launch-tax').value===''||$('launch-buyback').value==='')throw Error('Choose a configuration, creator tax and buyback setting.');const tax=Number($('launch-tax').value)*100;if(Math.abs(tax-Math.round(tax))>0.000001)throw Error('Use at most two decimal places for the tax.');const buy=savedPurchase();return {...(buy?{purchase:{amount:buy.amount,slippageBps:buy.slippageBps}}:{}),launchpad:'pons',chainId:4663,name:$('brief-name').value.trim(),symbol:$('brief-symbol').value.trim(),description:$('brief-description').value.trim(),logo:$('launch-logo').value.trim(),socials:currentSocials(),account,creatorFeeRecipient:$('launch-recipient').value.trim(),creatorTaxBps:Math.round(tax),buybackEnabled:$('launch-buyback').value==='true',pairToken:pairAddress($('launch-pair').value),configId:Number($('launch-config').value),salt:'0x'+Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('')};}



async function openLaunchReview(){if(launchBusy)return;if(hasLocalLogo()){await openLaunchProfile();return;}invalidateLaunch();const generation=epoch,revision=launchRevision;launchBusy=true;$('review-launch').disabled=true;$('launch-feedback').textContent='';$('launch-preparing-dialog').querySelector('[role="status"]').textContent='Dinn is preparing your launch';showLaunchStage('preparing');try{const c=configuration();const q=await api('/api/pons/review',c);if(generation!==epoch||revision!==launchRevision)return;reviewed={configuration:c,quote:q};renderLaunchReview(c,q);updateApprovalUI();$('launch-review').hidden=false;$('simulation-status').textContent=q.purchase?.approvalRequired?'Next: approve '+q.pair+' for your opening purchase, then check the launch. The approval does not launch your token.':'Next: choose Check launch. If it passes, Dinn will ask you to approve the launch in your wallet.';$('launch-feedback').textContent='';showLaunchStage(null);$('pons-review-dialog').showModal();}catch(e){if(epoch===generation){launchBusy=false;openLaunchPurchase();$('purchase-error').textContent=e.message;}}finally{launchBusy=false;$('review-launch').disabled=false;}};

$('simulate-launch').onclick=async()=>{if(!reviewed||launchBusy)return;const generation=epoch,revision=launchRevision;launchBusy=true;$('simulate-launch').disabled=true;$('approve-launch').hidden=true;$('simulation-status').textContent='Checking your launch and estimating network fees...';try{const p=await api('/api/pons/simulate',reviewed);if(generation!==epoch||revision!==launchRevision)return;prepared=p;$('simulation-status').textContent=`Launch check passed. Estimated network fee: ${p.estimatedGas} ETH (changes with network fees). You can now continue to your wallet. This check is valid for 60 seconds.`;$('approve-launch').hidden=false;}catch(e){if(epoch===generation)$('simulation-status').textContent=e.message;}finally{launchBusy=false;$('simulate-launch').disabled=false;}};

$('approve-launch').onclick=async()=>{if(!prepared||!reviewed||launchBusy)return;const generation=epoch,revision=launchRevision,frozen=reviewed,original=prepared,pendingKey=launchKey();launchBusy=true;$('approve-launch').disabled=true;try{if(!provider)throw Error('Your selected launch wallet is not ready.');const fresh=await api('/api/pons/simulate',frozen);if(generation!==epoch||revision!==launchRevision)return;if(fresh.transaction.data!==original.transaction.data||fresh.transaction.value!==original.transaction.value)throw Error('Launch terms changed. Review again.');const {requestPonsLaunch}=await import('/pons/entry.js');const record=await requestPonsLaunch({prepared:fresh,configuration:frozen.configuration,provider,storage:localStorage,key:pendingKey,isCurrent:()=>epoch===generation&&launchRevision===revision,withLock:navigator.locks?fn=>navigator.locks.request(pendingKey,fn):null});if(epoch===generation){restoreLaunch();if(record.hash){$('pons-review-dialog').close();view('assistant');$('launch-recovery').scrollIntoView({block:'start'});}$('simulation-status').textContent=record.phase==='rejected'?'Wallet request declined.':record.hash?'Submitted: '+record.hash+'. Verify its receipt below.':'Wallet result is uncertain. Check wallet activity before trying again.';if(record.storageWarning)$('simulation-status').textContent+=' Recovery storage failed. Copy the hash now.';prepared=null;$('approve-launch').hidden=true;}}catch(e){if(epoch===generation)$('simulation-status').textContent=e.message;}finally{launchBusy=false;$('approve-launch').disabled=false;}};





﻿let launchStep=null,launchOptions=null,setupOptionsRequest=null,setupOptionsError="";

const economicFields=[['launch-pair','Pairing asset'],['launch-config','Launch configuration'],['launch-tax','Creator tax'],['launch-buyback','Creator buyback'],['launch-recipient','Fee recipient']];

function currentSettings(){const s={};try{s.socials=currentSocials();}catch{}if($('launch-pair').value){try{s.pairToken=pairAddress($('launch-pair').value);}catch{}}if($('launch-config').value!=='')s.configId=Number($('launch-config').value);if($('launch-tax').value!=='')s.creatorTaxBps=Math.round(Number($('launch-tax').value)*100);if($('launch-buyback').value!=='')s.buybackEnabled=$('launch-buyback').value==='true';if($('launch-recipient').value)s.creatorFeeRecipient=$('launch-recipient').value;return s;}

function saveSettings(){if(user)save('pons-settings',{values:Object.fromEntries([...economicFields.map(v=>v[0]),'launch-logo',...metadataIds].map(k=>[k,$(k).value])),launchStep});}

function restoreSettings(){let saved;try{saved=JSON.parse(read('pons-settings'));}catch{}for(const k of [...economicFields.map(v=>v[0]),'launch-logo',...metadataIds]){const v=typeof saved?.values?.[k]==='string'?saved.values[k]:'';if(k==='launch-config'&&v&&!Array.from($(k).options).some(o=>o.value===v))$(k).add(new Option('Config '+v+' (recheck at review)',v));$(k).value=v;}launchStep=economicFields.some(([k])=>k===saved?.launchStep)?saved.launchStep:null;launchOptions=null;}

function closeTokenPanel(){if(innerWidth>900){$('summary-panel').hidden=true;$('assistant-view').classList.remove('has-draft');}$('assistant-view').classList.remove('summary-open');$('summary-toggle').setAttribute('aria-expanded','false');$('summary-backdrop').hidden=true;}

function renderTokenSummary(){const has=Object.keys(brief).length>0||!!awaiting;$('summary-panel').hidden=!has;$('summary-toggle').hidden=!has;$('assistant-view').classList.toggle('has-draft',has);$('token-name').textContent=brief.name||'Untitled token';$('token-avatar').textContent=brief.symbol?.slice(0,2)||'-';$('token-meta').textContent=(brief.symbol?'$'+brief.symbol+' · ':'')+'Pons / Robinhood Chain';const rows=[['brief-name','Token name',brief.name],['brief-symbol','Ticker',brief.symbol],['brief-description','Description',brief.description],...economicFields.map(([id,label])=>[id,label,$(id).value||undefined])];const count=rows.filter(r=>r[2]!==undefined).length;$('progress').value=count;$('progress-label').textContent=count+' of 8 settings';$('summary').replaceChildren();for(const [id,label,value] of rows){const row=document.createElement('div');row.className='summary-row';const name=document.createElement('span');name.textContent=label;const button=document.createElement('button');button.textContent=value===undefined?'Not set':id==='launch-pair'?(pairCandidates.find(a=>a.address.toLowerCase()===value?.toLowerCase())?.symbol||value):id==='launch-tax'?value+'%':id==='launch-buyback'?(value==='true'?'Enabled':'Disabled'):value||'None';button.title=button.textContent;button.setAttribute('aria-label','Edit '+label);button.onclick=()=>{view('assistant');closeTokenPanel();if(id.startsWith('brief-')){awaiting=id.slice(6);launchStep=null;setupActive=true;submitChoice('I want to change '+({name:'name',symbol:'ticker',description:'description'})[awaiting]);}else{awaiting=null;launchStep=id;askEconomic();}$('prompt').focus();};row.append(name,button);$('summary').append(row);}$('chat-review').disabled=count!==8;$('summary-note').textContent=count===8?'Next: add optional logo and links, then review.':'Complete your settings in chat to review.';}

function choice(label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;$('choices').append(b);}

function submitChoice(text){$('prompt').value=text;$('chat').requestSubmit();}

async function refreshSetupOptions(){

 const requestKey=epoch+':'+launchStep;if(setupOptionsRequest===requestKey)return;

 setupOptionsRequest=requestKey;setupOptionsError='';const generation=epoch,step=launchStep;

 try{const options=await api('/api/pons/readiness',account?{account}:{});if(epoch!==generation||launchStep!==step)return;launchOptions=options;}

 catch(error){if(epoch!==generation||launchStep!==step)return;setupOptionsError=error.message;}

 finally{if(epoch===generation&&launchStep===step)renderSetupChoices();}

}

function renderSetupChoices(){$('choices').hidden=!!launchConversationStep;$('choices').replaceChildren();$('setup-context').hidden=!awaiting&&!launchStep;if(awaiting){$('setup-context').textContent='Next: '+({name:'Token name',symbol:'Ticker',description:'Description'})[awaiting];if(awaiting==='description')choice('Skip for now',()=>submitChoice('skip'));choice('Pause setup',()=>submitChoice('pause setup'));}else if(launchStep){$('setup-context').textContent='Next: '+economicFields.find(([k])=>k===launchStep)?.[1];if(launchStep==='launch-pair'){for(const symbol of ['ETH','USDG','NVDA','TSLA','AAPL'])if(symbol==='ETH'||pairCandidates.some(a=>a.symbol===symbol))choice(symbol,()=>submitChoice(symbol));}if(launchStep==='launch-config'){for(const c of launchOptions?.configs||[])choice(new Intl.NumberFormat('en',{notation:'compact'}).format(Number(c.supply)/1e18)+' tokens · '+Number(c.curveFeeBps)/100+'% base fee',()=>submitChoice(String(c.id)));}if(launchStep==='launch-tax'&&launchOptions)for(const fee of ['0%','1%','2%'])if(Number(fee.slice(0,-1))*100<=Number(launchOptions?.maxCreatorTaxBps||10000))choice(fee,()=>submitChoice(fee));if(launchStep==='launch-buyback'){choice('Enable',()=>submitChoice('enable'));choice('Disable',()=>submitChoice('disable'));}if(launchStep==='launch-recipient'&&account)choice('Use connected wallet',()=>submitChoice('Use connected wallet'));if(['launch-config','launch-tax'].includes(launchStep)&&!launchOptions){const requestKey=epoch+':'+launchStep;if(setupOptionsRequest!==requestKey){void refreshSetupOptions();}if(setupOptionsError){$('setup-context').textContent='Could not reload current launch options. '+setupOptionsError;choice('Retry launch options',()=>{setupOptionsRequest=null;setupOptionsError='';renderSetupChoices();});}else $('setup-context').textContent='Checking current Pons launch options…';}else if(launchStep==='launch-config'&&launchOptions){$('setup-context').textContent=launchOptions.configs.length?'Pons currently supports the supplies shown below. Custom supply is unavailable; creator tax is chosen separately.':'Pons has no enabled launch configurations at this check.';}choice('Pause setup',()=>submitChoice('pause setup'));}else if(!nextField(brief)&&economicFields.every(([k])=>$(k).value!=='')){choice('Add logo & links',openLaunchProfile);choice('Continue to review',openLaunchProfile);}}

function askEconomic(){submitChoice('I want to change '+(economicFields.find(([k])=>k===launchStep)?.[1]||'my launch settings'));}

$('summary-toggle').onclick=()=>{if(innerWidth>900){const visible=$('summary-panel').hidden;$('summary-panel').hidden=!visible;$('assistant-view').classList.toggle('has-draft',visible);return;}const open=!$('assistant-view').classList.contains('summary-open');$('assistant-view').classList.toggle('summary-open',open);$('summary-backdrop').hidden=!open;$('summary-toggle').setAttribute('aria-expanded',String(open));};$('summary-close').onclick=$('summary-backdrop').onclick=closeTokenPanel;

$('welcome-launchpads').onclick=()=>view('launchpads');$('summary-profile').textContent='Logo & social links';$('summary-profile').onclick=$('attach-details').onclick=openLaunchProfile;$('new-launch').textContent='Continue setup';$('new-launch').onclick=()=>{view('assistant');closeTokenPanel();submitChoice('resume setup');};$('close-review').onclick=()=>$('pons-review-dialog').close();



$('cancel-reset-draft').onclick=()=>$('reset-draft-dialog').close();

$('confirm-reset-draft').onclick=()=>{try{requestedSupply=null;save('opening-purchase',null);save('logo-local-choice',null);save('logo-original',null);save('pons-brief',{launchpad:'pons',chainId:4663});save('pons-settings',{values:{},launchStep:null});for(const id of [...economicFields.map(v=>v[0]),'launch-logo',...metadataIds])$(id).value='';launchStep=null;if(!clearConversation())return;brief={};awaiting=null;restoreSettings();syncBrief();$('brief-status').textContent='';$('reset-draft-dialog').close();$('feedback').textContent='Token setup and chat cleared. Saved transaction records are kept.';}catch{$('reset-feedback').textContent='Browser storage is unavailable. Reset could not finish.';}};

function applyLaunchDraft(d){

 if(d.requestedSupply!=null&&(typeof d.requestedSupply!=='string'||! /^[1-9]\d{0,23}$/.test(d.requestedSupply)))throw Error('Invalid requested supply.');

 const nextBrief=cleanBrief(d.brief),settings=cleanPonsSettings(d.settings);if(typeof d.active!=='boolean'||typeof d.logo!=='string'||d.logo.length>500)throw Error('Invalid draft result.');

 const fieldMap={pairToken:'launch-pair',configId:'launch-config',creatorTaxBps:'launch-tax',buybackEnabled:'launch-buyback',creatorFeeRecipient:'launch-recipient'};

 const nextAwaiting=['name','symbol','description'].includes(d.nextField)?d.nextField:null,nextStep=fieldMap[d.nextField]||null;

 if(d.nextField!==null&&!nextAwaiting&&!nextStep)throw Error('Invalid next draft field.');

 const values=Object.fromEntries([...economicFields.map(v=>v[0]),'launch-logo',...metadataIds].map(id=>[id,'']));values['launch-logo']=d.logo;

 for(const [f,id]of Object.entries(fieldMap))if(settings[f]!==undefined)values[id]=f==='pairToken'&&/^0x0{40}$/i.test(settings[f])?'ETH':f==='creatorTaxBps'?String(settings[f]/100):String(settings[f]);

 for(const f of socialFields)values['launch-'+f]=settings.socials?.[f]||'';

 const kinds=['pons-brief','pons-settings','setup'],old=kinds.map(read);try{save('pons-brief',{...nextBrief,launchpad:'pons',chainId:4663});save('pons-settings',{values,launchStep:nextStep});save('setup',{awaiting:nextAwaiting,active:d.active,requestedSupply:d.requestedSupply||null});}catch(error){kinds.forEach((k,i)=>{try{if(old[i]===null)localStorage.removeItem(key(k));else localStorage.setItem(key(k),old[i]);}catch{}});throw Error('Browser storage could not save the validated draft. Please retry.');}

 requestedSupply=d.requestedSupply||null;brief=nextBrief;awaiting=nextAwaiting;setupActive=d.active;restoreSettings();launchOptions=d.options||launchOptions;launchPair=d.pair||launchPair;syncBrief();renderSetupChoices();

}

function renderToolResult(body,result){

 renderAssistantText(body,result.message);

 if(result.tokenAddress&&/^0x[0-9a-f]{40}$/i.test(result.tokenAddress))selectedToken=result.tokenAddress;

 const actions={new_setup:()=>submitChoice('Start a new token'),resume_setup:()=>submitChoice('resume setup'),launch:()=>{view('assistant');submitChoice('resume setup');},review:()=>{if($('chat-review').disabled){view('assistant');submitChoice('resume setup');}else $('chat-review').click();},wallet:()=>view('wallet'),dex:a=>dexService.open({address:/^0x[0-9a-f]{40}$/i.test(a?.address||'')?a.address:undefined,preparation:a?.preparation}),launchpads:()=>view('launchpads')};

 if(result.toolsUsed?.some(n=>n!=='open_dex_profile'&&n!=='inspect_token'&&n!=='manage_launch_draft'&&n!=='request_guidance')){const note=document.createElement('small');note.className='tool-evidence';note.textContent='Checked with Dinn: '+result.toolsUsed.filter(n=>typeof n==='string'&&n!=='open_dex_profile').join(', ').replaceAll('_',' ');body.append(document.createElement('br'),note);}

 for(const a of result.actions||[]){if(!actions[a.id])continue;const b=document.createElement('button');b.type='button';b.className='tool-action subtle';b.textContent=a.id==='dex'&&a.preparation?.profile?.name?'Review '+String(a.preparation.profile.name).slice(0,80)+' profile':({new_setup:'Start new token',resume_setup:'Resume saved token',launch:'Start or resume launch',review:'Review launch',wallet:'Open wallet',dex:'Prepare DEX Screener profile',launchpads:'View launchpads'})[a.id];b.onclick=()=>actions[a.id](a);body.append(b);if(a.id==='dex'&&a.address){try{const link=document.createElement('a');link.className='tool-action subtle';link.href=dexCheckoutFor(a.address);link.target='_blank';link.rel='noopener noreferrer';link.textContent='Continue on DEX Screener';body.append(link);}catch{}}}

 if(result.inspection)renderInspection(body,result.inspection,{restored:!!result.restored,onRecheck:address=>submitChoice('check token '+address),onHolders:address=>submitChoice('Research top holders, their ETH balances and other token holdings for '+address)});if(result.inspection)body.scrollIntoView({block:'start',behavior:'instant'});else scrollChat();

}

function renderToolDirectory(capabilities){const host=$('tool-directory');host.replaceChildren();for(const [id,c]of Object.entries(capabilities||{})){const card=document.createElement('article');card.className='pad-card';const h=document.createElement('h3');h.textContent=c.title;const status=document.createElement('span');status.className='badge';status.textContent=c.status;const p=document.createElement('p');p.textContent=c.description;card.append(status,h,p);if(['launch','inspect','balance','transaction','options','dex'].includes(id)){const b=document.createElement('button');b.className='subtle';b.textContent='Ask Dinn';b.onclick=()=>{view('assistant');const prompts={launch:'I want to launch',inspect:'check a token',balance:'check my balance',transaction:'How do I check a transaction?',dex:'Prepare DEX Screener profile',options:'show launch options'};submitChoice(prompts[id]);};card.append(b);}host.append(card);}}

try{const [config,status]=await Promise.all([fetch('/api/auth/config').then(r=>r.json()),fetch('/api/status').then(r=>r.json())]);renderToolDirectory(status.capabilities);if(status.legalLinks){$('terms-link').href=status.legalLinks.terms;$('privacy-link').href=status.legalLinks.privacy;}const {mountEmbeddedAuth}=await import('/auth/entry.js');mountEmbeddedAuth($('embedded-auth'),config,$('account-controls'));}catch{$('session-loading').hidden=true;$('auth-gate').hidden=false;$('embedded-auth').textContent='Sign-in could not load. Refresh to try again.';}

