import {mountPortfolio} from './portfolio.js';
import {mountProfile,restoreProfile,validateProfile} from './profile.js';
import {inspectionRequest,tokenAddressPattern} from './inspection.js';
import {appendExchange,restoreConversation,receiveChat} from './chat.js';
import {mountLaunches} from './launches.js';
import {createWalletSession,walletReadiness,workspaceWalletReadiness} from './wallet.js';
import {fields,parseField,missingField,restoreDraft,displayValue,setupReply,launchIntent,conversationTask} from './flow.js';
const $=s=>document.querySelector(s);
let storageKey='launchflow.draft.v2';
let conversation=[],chatRequest=null,selectedToken=null,inspectionChainId=null;
const conversationKey=()=>currentUserId?'dinn.conversation.v1:'+currentUserId:null;
function saveConversation(){const key=conversationKey();if(!key)return;try{sessionStorage.setItem(key,JSON.stringify({messages:conversation,tokenAddress:selectedToken,inspectionChainId}));}catch{$('#feedback').textContent='Conversation memory is unavailable after refresh in this browser.';}}
function cancelChat(){if(chatRequest){chatRequest.controller.abort();chatRequest.bubble.remove();chatRequest=null;$('#stop-response').hidden=true;$('#send').hidden=false;$('#messages').setAttribute('aria-busy','false');setBusy(false);}}
let wallet={account:null,chainId:null},walletSession=null,walletConnecting=false,walletSource=null,authEpoch=0,authState='loading',signedIn=false,currentUserId=null;
let launches,portfolio;
let profile=validateProfile();
const profileKey=()=>currentUserId?'dinn.profile.v1:'+currentUserId:null;
const profileEditor=mountProfile({getDraft:()=>draft,getProfile:()=>profile,onSave:next=>{if(!signedIn)throw Error('Sign in to save your profile.');try{sessionStorage.setItem(profileKey(),JSON.stringify(next));}catch{throw Error('Your browser could not save the profile. Try a smaller image.');}profile=next;invalidate();renderSummary();$('#feedback').textContent='Token profile saved.';}});
$('#summary-profile').onclick=()=>{if(signedIn&&!busy)profileEditor.open();};
$('#attach-logo').onclick=()=>{if(signedIn&&!busy)$('#chat-logo-file').click();};
$('#chat-logo-file').onchange=e=>{if(signedIn&&!busy&&e.target.files[0])profileEditor.attach(e.target.files[0]);e.target.value='';};
function renderNetworkOptions(){
 const networks=(status.inspectionNetworks||[]).filter(n=>n.available&&[99801,99901].includes(n.chainId));
 const previous=inspectionChainId;
 if(!networks.some(n=>n.chainId===inspectionChainId))inspectionChainId=networks[0]?.chainId||null;
 if(previous!==inspectionChainId)selectedToken=null;
}
const summaryMedia=matchMedia('(max-width:900px)');
let summaryExpanded=false;
function syncSummary(){
 const available=view==='chat'&&(active||Object.keys(draft).length>0);
 const open=available&&summaryExpanded;
 $('#summary-panel').hidden=!open;
 $('#chat-view').classList.toggle('has-draft',open&&!summaryMedia.matches);
 $('#chat-view').classList.toggle('summary-open',open&&summaryMedia.matches);
 $('#summary-toggle').hidden=!available;
 $('#summary-toggle').setAttribute('aria-expanded',String(open));
 $('#summary-backdrop').hidden=!(open&&summaryMedia.matches);
 $('.conversation').inert=open&&summaryMedia.matches;
}
summaryMedia.addEventListener('change',()=>{summaryExpanded=false;syncSummary();});
let submission=null,receiptChecking=false,receiptNotice='';
let draft={},active=false,editing=null,status={},busy=false,revision=0,view='chat';

function node(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
function button(text,fn,className='subtle'){const el=node('button',className,text);el.type='button';el.onclick=fn;return el;}
async function api(path,body){const r=await fetch(path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed. Please try again.');return data;}
function save(){try{sessionStorage.setItem(storageKey,JSON.stringify({version:1,draft}));}catch{$('#feedback').textContent='Your browser could not save this draft. Keep this tab open.';}}
function showView(name){
 view=name;if(signedIn&&currentUserId){try{sessionStorage.setItem('dinn.view.v1:'+currentUserId,name);}catch{}}for(const key of ['chat','services','launches','portfolio']){document.querySelector('#'+key+'-view').hidden=key!==name;const tab=document.querySelector('#'+key+'-tab');tab.classList.toggle('active',key===name);if(key===name)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');}
 $('#view-name').textContent=name==='chat'?'Assistant':name==='services'?'Agent access':name==='portfolio'?'Wallet':'Launches';$('#summary-toggle').hidden=name!=='chat'||!(active||Object.keys(draft).length);syncSummary();launches?.refreshDraft();if(submission)renderPending(submission.pending());
}
function message(text,role='assistant'){
 const el=node('div','message '+role);el.append(node('small','',role==='user'?'You':'Dinn'),node('div','message-body',text));$('#messages').append(el);$('#welcome').hidden=true;
 requestAnimationFrame(()=>{const log=$('#chat-scroll');log.scrollTop=log.scrollHeight;});return el;
}

function activity(label){
 const bubble=message(label);bubble.classList.add('message-pending');
 const body=bubble.querySelector('.message-body');body.replaceChildren();
 const dots=node('span','typing-dots');dots.setAttribute('aria-hidden','true');
 for(let i=0;i<3;i++)dots.append(node('i'));
 body.append(dots,node('span','activity-label',label));
 return bubble;
}
function renderInspection(bubble,report){
 const card=node('details','inspection-card');card.append(node('summary','','View onchain evidence'));
 if(report.cache?.hit)card.append(node('p','inspection-footnote','Recent cached check. Original block and timestamp retained.'));
 card.append(node('p','inspection-network',report.network+' / chain '+report.chainId+' / block '+report.blockNumber));
 card.append(node('p','inspection-address',report.address));
 for(const check of report.checks){
  const row=node('section','inspection-check');
  const heading=node('div','inspection-check-heading');heading.append(node('strong','',check.label),node('span','inspection-status',check.status==='verified'?'Source matched':check.status==='observed'?'Observed':check.status==='attention'?'Review needed':check.status==='not-found'?'Not found':'Unknown'));
  row.append(heading,node('p','',check.detail));
  if(check.evidence?.length)row.append(node('small','','Evidence: '+check.evidence.join(' / ')));
  if(check.sourceUrl?.startsWith('https://repo.sourcify.dev/')){const link=node('a','','View source record');link.href=check.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';row.append(link);}
  card.append(row);
 }
 card.append(node('p','inspection-footnote','Snapshot: '+report.checkedAt+' / '+report.blockHash));bubble.append(card);
}
function focusComposer(){ $('#prompt').focus({preventScroll:true}); }
function setBusy(value){busy=value;$('#send').disabled=value;$('#prompt').disabled=value;document.querySelectorAll('#choices button').forEach(b=>b.disabled=value);renderSummary();}
function invalidate(){cancelChat();revision++;document.querySelectorAll('.review-card').forEach(el=>el.remove());$('#draft-status').textContent='DRAFT';}
function renderSummary(){
 launches?.refreshDraft();
 renderWallet();
 const hasDraft=active||Object.keys(draft).length>0;syncSummary();$('#setup-context').hidden=!active;$('#sidebar-draft').hidden=!hasDraft;$('#draft-nav-name').textContent=draft.name||'Untitled token';
 $('#token-name').textContent=draft.name||'Untitled token';
 $('#token-avatar').textContent=draft.symbol?.slice(0,2)||'—';
 if(profile.image){const img=node('img');img.src=profile.image;img.alt='Token logo';$('#token-avatar').replaceChildren(img);}
 $('#summary-profile').textContent=Object.values(profile).some(Boolean)?'Edit logo and socials':'Add logo and socials';$('#profile-saved-note').hidden=!Object.values(profile).some(Boolean);
 $('#token-meta').textContent=(draft.symbol?'$'+draft.symbol+' · ':'')+'Ascend / Elysium';
 const completed=fields.filter(f=>draft[f.key]!==undefined).length;
 $('#draft-nav-progress').textContent=completed+' of 7 settings';$('#progress').value=completed;$('#progress-label').textContent=completed+' of 7 settings';
 $('#summary').replaceChildren();
 for(const f of fields){const row=node('div','summary-row');row.append(node('span','',f.label));const value=displayValue(f.key,draft[f.key]);const b=button(value,()=>{if(busy)return;active=true;editing=f.key;showView('chat');closeSummary();invalidate();ask();focusComposer();},draft[f.key]===undefined?'unset':'');b.title=value;b.setAttribute('aria-label','Edit '+f.label+': '+value);b.disabled=busy;row.append(b);$('#summary').append(row);}
 $('#review-button').disabled=completed!==7||busy;
 $('#summary-note').textContent=completed===7?'All settings collected. Review before simulation.':'Complete your settings in chat to review.';
}
function setupChoices(){
 $('#choices').replaceChildren();
 const f=editing?fields.find(f=>f.key===editing):missingField(draft);
 $('#setup-context').hidden=!active||!f;
 if(!active||!f)return;
 $('#setup-context').textContent='Next: '+f.label;
 if((f.key==='account'||f.key==='recipient')&&wallet.account)$('#choices').append(button('Use connected wallet',()=>send(wallet.account,true)));
 for(const value of f.choices||[])$('#choices').append(button(value,()=>send(value,true)));
 $('#choices').append(button('Pause setup',()=>{active=false;editing=null;closeSummary();setupChoices();$('#prompt').placeholder='Ask Dinn...';message('Setup paused. Your draft is saved in this tab. Resume whenever you are ready.');$('#choices').append(button('Continue setup',startLaunch));}));
}
function ask(){
 const f=editing?fields.find(f=>f.key===editing):missingField(draft);
 if(!f){active=false;setupChoices();$('#prompt').placeholder='Ask Dinn...';message('Your token settings are ready. Review them when you are ready to launch.');$('#choices').append(button('Review launch',review));return;}
 active=true;$('#prompt').placeholder='Ask Dinn...';message((editing?'Let us update '+f.label.toLowerCase()+'. ':'')+f.question+'\n'+f.hint);setupChoices();
}
function startLaunch(){if(busy||!signedIn)return;summaryExpanded=!summaryMedia.matches;showView('chat');active=true;editing=null;message(Object.keys(draft).length?'Let’s continue your token setup.':'Let’s build your launch on Ascend. I’ll ask for a few settings, then show you a review.');ask();renderSummary();focusComposer();}
async function send(text,explicit=false){
 text=text.trim();if(!text||busy||!signedIn)return;
 message(text,'user');$('#prompt').value='';$('#feedback').textContent='';
 if(/^(?:show (?:me )?)?(?:my )?(?:wallet|portfolio|balances|holdings)[?.!]*$/i.test(text)){showView('portfolio');portfolio?.refresh();return;}
 if(/^(?:send|transfer)\b/i.test(text)){const match=text.match(/^(?:send|transfer)\s+(\d+(?:\.\d+)?)\s+(HYPE|0x[0-9a-f]{40})\s+to\s+(0x[0-9a-f]{40})$/i);portfolio?.openSend(match?{amount:match[1],asset:match[2].toUpperCase()==='HYPE'?'native':match[2],recipient:match[3]}:{});return;}
 if(/^(?:swap|buy|sell|trade)\b/i.test(text)||/^0x[0-9a-f]{40}$/i.test(text)){const token=text.match(/0x[0-9a-f]{40}/i)?.[0];portfolio?.openSwap({token,side:/^sell\b/i.test(text)?'sell':'buy'});return;}
 const task=!explicit?conversationTask(text):null;
 if(task){
  if(task.kind==='discard'){requestDiscard();return;}
  if(task.kind==='new-chat'){newChat();return;}
  let answer='';
  try{
   if(task.kind==='logo'){profileEditor.open();answer='Choose an image for your token. You can crop it before saving.';}
   else if(task.kind==='missing'){const remaining=fields.filter(f=>draft[f.key]===undefined);answer=remaining.length?'Still needed: '+remaining.map(f=>f.label.toLowerCase()).join(', ')+'.':'All launch settings are ready. You can review them before approving anything.';}
   else if(task.kind==='clarify'){answer='Tell me one setting and its new value, for example: change the ticker to GOK. You can also add a website, X account, Telegram or description.';}
   else{
    if(task.profile){const next=validateProfile({...profile,[task.key]:task.value});try{sessionStorage.setItem(profileKey(),JSON.stringify(next));}catch{throw Error('Your browser could not save this change. Try again.');}profile=next;}
    else{const value=parseField(task.key,task.value,draft);draft={...draft,[task.key]:value};save();if(editing===task.key)editing=null;}
    invalidate();renderSummary();
    const label=fields.find(f=>f.key===task.key)?.label||({twitter:'X account',telegram:'Telegram',website:'Website',description:'Description'})[task.key];
    answer=label+' updated'+(task.profile?'.':': '+displayValue(task.key,draft[task.key])+'.');
   }
  }catch(error){answer=error.message;}
  message(answer);conversation=appendExchange(conversation,text,answer);saveConversation();
  if(active){setupChoices();if(task.kind==='edit'&&!task.profile)ask();}else if(task.kind==='missing'){$('#choices').replaceChildren(button(missingField(draft)?'Continue setup':'Review launch',missingField(draft)?startLaunch:review));}
  return;
 }
 const intent=!explicit?launchIntent(text):null;
 if(intent){
  if(intent.name&&draft.name&&intent.name.toLowerCase()!==draft.name.toLowerCase()){
   active=false;editing=null;setupChoices();
   message('Your token is named '+draft.name+'. Use '+intent.name+' as the token name, or keep the saved name? Your other settings will stay unchanged.');
   $('#choices').append(button('Use '+intent.name,()=>{draft.name=intent.name;invalidate();save();startLaunch();}),button('Keep '+draft.name,startLaunch));return;
  }
  if(intent.name&&!draft.name){draft.name=intent.name;invalidate();save();}
  startLaunch();return;
 }
 if(/^(resume|continue)( launch| setup)?$/i.test(text)){startLaunch();return;}
 if(active&&!inspectionRequest(text,selectedToken,{setupField:editing||missingField(draft)?.key,explicit})){
  if(/^(pause|cancel|stop)$/i.test(text)){active=false;editing=null;closeSummary();setupChoices();$('#choices').replaceChildren(button('Continue setup',startLaunch));message('Setup paused. Your settings are still saved.');return;}
  const f=editing?fields.find(f=>f.key===editing):missingField(draft);
  if(f){
   const reply=setupReply(f.key,text,draft,explicit);
   if(reply.kind==='value'){draft[f.key]=reply.value;editing=null;invalidate();save();renderSummary();ask();return;}
   if(reply.kind==='invalid'){message(reply.message+' You can also ask me about this setting.');focusComposer();return;}
  }
 }
 if(/^review( launch)?$/i.test(text)&&!missingField(draft)){await review();return;}
 const inspection=inspectionRequest(text,selectedToken,{setupField:active?(editing||missingField(draft)?.key):undefined});
 if(inspection&&!inspection.needsAddress&&!inspectionChainId){message('Elysium inspection is temporarily unavailable. Please try again later.');return;}
 if(!active)closeSummary();setBusy(true);const token=revision,owner=currentUserId;
 const checkingToken=inspectionRequest(text,selectedToken,{setupField:active?(editing||missingField(draft)?.key):undefined});
 const pending=activity(checkingToken?'Checking onchain data':status.aiConfigured?'Dinn is preparing a response':'Checking supported actions');
 const request={controller:new AbortController(),bubble:pending};chatRequest=request;
 $('#stop-response').hidden=false;$('#send').hidden=true;$('#messages').setAttribute('aria-busy','true');
 let answer='';
 const stillCurrent=()=>chatRequest===request&&token===revision&&signedIn&&currentUserId===owner;
 try{
  const response=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:text,history:conversation,draft,inspectionChainId:inspectionChainId||undefined,tokenAddress:selectedToken||undefined,awaitingField:active?(editing||missingField(draft)?.key):undefined}),signal:AbortSignal.any([request.controller.signal,AbortSignal.timeout(60000)])});
  const result=await receiveChat(response,delta=>{
   if(!stillCurrent())return;
   const log=$('#chat-scroll'),follow=log.scrollHeight-log.scrollTop-log.clientHeight<100;
   answer+=delta;pending.classList.remove('message-pending');pending.querySelector('.message-body').textContent=answer;
   if(follow)log.scrollTop=log.scrollHeight;
  });
  if(!stillCurrent())return;
  if(result.tokenAddress&&tokenAddressPattern.test(result.tokenAddress))selectedToken=result.tokenAddress;
  conversation=appendExchange(conversation,text,result.message);saveConversation();
  if(result.inspection)renderInspection(pending,result.inspection);
  if(active)setupChoices();else $('#choices').replaceChildren();for(const action of active?[]:result.actions){$('#choices').append(button(action.id==='launch'?'Start launch':action.title,()=>action.id==='launch'?startLaunch():openService(action.id)));}
 }catch(e){
  if(stillCurrent()){
   pending.classList.remove('message-pending');
   const notice=request.controller.signal.aborted?'Response stopped.':e.name==='TimeoutError'?'Dinn took too long to respond. Please try again.':e.message;
   if(answer){pending.querySelector('.message-body').textContent=answer;pending.append(node('p','response-notice',notice+' This partial reply was not saved to memory.'));}
   else pending.querySelector('.message-body').textContent=notice;
  }
 }finally{
  if(chatRequest===request){chatRequest=null;$('#stop-response').hidden=true;$('#send').hidden=false;$('#messages').setAttribute('aria-busy','false');setBusy(false);if(active)setupChoices();if(signedIn)focusComposer();}
 }

}
async function review(){
 if(busy||!signedIn||missingField(draft))return;
 showView('chat');closeSummary();active=false;editing=null;$('#choices').replaceChildren();setBusy(true);
 const token=revision,payload={...draft},pending=activity('Checking your launch settings');
 try{
  await api('/api/launch/validate',payload);if(token!==revision)return;
  document.querySelectorAll('.review-card').forEach(el=>el.remove());
  $('#draft-status').textContent='REVIEW';
  const card=node('section','review-card');card.append(node('h3','','Review your launch'),node('p','','Check every setting below. This prepares a fixed-supply launch with no initial token purchase.'));
  if(Object.values(profile).some(Boolean)){const preview=node('section','profile-review');if(profile.image){const img=node('img');img.src=profile.image;img.alt='Token logo';preview.append(img);}const content=node('div');content.append(node('p','',profile.description||'Token profile'),node('small','','Saved in this tab; not published to Ascend.'));for(const key of ['website','twitter','telegram'])if(profile[key]){const link=node('a','',key==='twitter'?'X':key==='telegram'?'Telegram':'Website');link.href=profile[key];link.target='_blank';link.rel='noopener noreferrer';content.append(link);}preview.append(content);card.append(preview);}
  for(const f of fields){const row=node('div','summary-row');row.append(node('span','',f.label),button(displayValue(f.key,payload[f.key]),()=>{if(busy)return;editing=f.key;invalidate();ask();focusComposer();},''));card.append(row);}
  const readiness=workspaceWalletReadiness(wallet,payload.account,status);card.append(node('p','wallet-check',readiness.message));
  card.append(node('p','','Supply: 1 billion · Launch liquidity: permanently locked · Builder fee: 0%'));
  const simulation=button(status.rpcConfigured?'Simulate launch →':'Simulation unavailable',async()=>{
   if(busy||token!==revision)return;const readiness=walletReadiness(wallet,payload.account);if(['wrong-chain','mismatch'].includes(readiness.kind)){message(readiness.message);return;}setBusy(true);simulation.disabled=true;
   try{const result=await api('/api/launch/simulate',payload);if(token!==revision)return;
    card.querySelector('.simulation-result')?.remove();
    const resultBox=node('div','simulation-result');
    resultBox.append(node('p','','Simulation passed at block '+result.blockNumber+'. Nothing has been deployed. Review wallet approval below.'));
    const details=node('details');details.append(node('summary','','View simulation details'));details.append(node('pre','',JSON.stringify(result,null,2)));resultBox.append(details);addWalletApproval(resultBox,result,payload,token);card.append(resultBox);
    $('#draft-status').textContent='SIMULATED';
   }catch(e){message('Simulation could not complete: '+e.message);}finally{setBusy(false);simulation.disabled=!status.rpcConfigured;}
  },'primary');
  simulation.disabled=!status.rpcConfigured||['wrong-chain','mismatch'].includes(readiness.kind);card.append(simulation);
  card.append(node('p','',status.rpcConfigured?'Simulation checks the transaction without signing or sending it.':status.onboardingOnly?'Testnet onboarding is enabled. Launch simulation is unavailable until the testnet contracts are verified.':'An Elysium RPC connection is needed to simulate. Your reviewed draft is ready; no transaction has been sent.'));
  card.append(button('Download launch settings',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=node('a');a.href=url;a.download='dinn-launch.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));
  $('#messages').append(card);$('#welcome').hidden=true;card.scrollIntoView({block:'nearest'});
 }catch(e){if(token===revision&&signedIn)message(e.message);}finally{pending.remove();setBusy(false);}
}
const serviceInfo={
 launch:['↗','Launch a token','Prepare your name, pair, fees and launch settings in a guided conversation.'],
 buy:['⇄','Buy tokens','Plan a purchase with a fresh quote and a clear minimum received.'],
 sell:['↙','Sell tokens','Prepare a sale with explicit amounts and slippage settings.'],
 lock:['◈','Lock holdings','Define how much to lock, who receives it, and when it unlocks.'],
 burn:['◎','Remove from circulation','Understand token removal and verify what it changes onchain.'],
 claim:['◇','Claim creator fees','See where creator fees go and prepare a claim.'],
 fund:['⇢','Fund a launch','Explore funding requirements before starting a launch.'],
 dex:['▦','DEX services','Plan your listing, profile or promotion with the right provider.']
};
function openService(id){
 if(['buy','sell'].includes(id)){portfolio?.openSwap();return;}
 if(busy)return;showView('chat');active=false;editing=null;closeSummary();$('#choices').replaceChildren();if(id==='launch'){startLaunch();return;}
 const info=serviceInfo[id];message('Explore '+info[1].toLowerCase(),'user');
 message(info[2]+'\n\n'+(status.capabilities?.[id]?.description||'This service is in development.')+'\n\nThis service cannot execute transactions in this preview.');
 $('#choices').append(button('Prepare a token launch',startLaunch),button('View launches',()=>showView('launches')));
 $('#prompt').placeholder='Ask about your next move…';focusComposer();
}
$('#stop-response').onclick=()=>chatRequest?.controller.abort();
$('#chat').onsubmit=e=>{e.preventDefault();send($('#prompt').value);};
$('#prompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('#chat').requestSubmit();}};
$('#chat-tab').onclick=()=>showView('chat');$('#services-tab').onclick=()=>showView('services');
$('#review-button').onclick=review;
function closeSummary(){summaryExpanded=false;syncSummary();}
$('#summary-toggle').onclick=()=>{summaryExpanded=!summaryExpanded;syncSummary();if(summaryExpanded)$('#summary-close').focus();};
$('#summary-backdrop').onclick=()=>{closeSummary();$('#summary-toggle').focus();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&summaryExpanded){closeSummary();$('#summary-toggle').focus();}});
$('#summary-close').onclick=()=>{closeSummary();$('#summary-toggle').focus();};
$('#resume-draft').onclick=()=>{showView('chat');startLaunch();};
$('#welcome-inspect').onclick=()=>{selectedToken=null;saveConversation();send('Check a token');};
function newChat(){
 if(busy&&!chatRequest)return;
 invalidate();profileEditor.close();conversation=[];selectedToken=null;saveConversation();
 active=false;editing=null;closeSummary();$('#messages').replaceChildren();$('#choices').replaceChildren();
 $('#welcome').hidden=false;$('#prompt').value='';$('#prompt').placeholder='Ask Dinn\u2026';
 $('#feedback').textContent='';
 renderSummary();showView('chat');focusComposer();
}
function newLaunch(){
 if(busy)return;profile=validateProfile();try{if(profileKey())sessionStorage.removeItem(profileKey());}catch{}
 draft={};save();newChat();
}
let resetAction='launch';
function configureResetDialog(discard){
 resetAction=discard?'discard':'launch';
 $('#new-dialog-title').textContent=discard?'Discard token setup?':'Start a new launch?';
 $('#new-dialog-copy').textContent=discard?'This clears your token settings, profile and this conversation. Submitted transactions stay in Launches.':'Your current draft, token profile and conversation will be replaced. Submitted transactions will stay in Launches.';
 $('#cancel-new').textContent=discard?'Keep setup':'Keep current draft';
 $('#confirm-new').textContent=discard?'Discard setup':'Start new launch';
 $('#new-dialog').showModal();
}
function requestDiscard(){
 if(Object.keys(draft).length||Object.values(profile).some(Boolean)||active)configureResetDialog(true);
 else message('There is no token setup to discard. Use New chat to clear the conversation.');
}
function requestNewLaunch(){
 if(busy)return;
 if(Object.keys(draft).length||Object.values(profile).some(Boolean))configureResetDialog(false);
 else{newLaunch();startLaunch();}
}
$('#new').onclick=newChat;
$('#new-launch').onclick=requestNewLaunch;
$('#cancel-new').onclick=()=>$('#new-dialog').close();
$('#confirm-new').onclick=()=>{const discard=resetAction==='discard';$('#new-dialog').close();newLaunch();if(discard){message('Token setup cleared. What would you like to do next?');focusComposer();}else startLaunch();};
$('#agent-endpoint').textContent=location.origin+'/.well-known/launchflow.json';

document.querySelectorAll('[data-start]').forEach(b=>b.onclick=startLaunch);
document.querySelectorAll('[data-service]').forEach(b=>b.onclick=()=>openService(b.dataset.service));
$('#copy-agent-prompt').onclick=async()=>{const prompt='Read '+location.origin+'/agent-guide.md and '+location.origin+'/.well-known/launchflow.json. Help me prepare an Ascend token launch. Ask for missing settings, show me the exact configuration, and stop before signing or paying. This is a local preview; no marketplace listing is live.';try{await navigator.clipboard.writeText(prompt);$('#agent-copy-status').textContent='Copied. Paste into your terminal agent.';}catch{$('#agent-copy-status').textContent=prompt;}};

function renderWallet(){
 const readiness=workspaceWalletReadiness(wallet,draft.account,status);
 $('#wallet-readiness').textContent=walletConnecting?'Opening your wallet…':!wallet.account?'Set up your embedded wallet from the account menu.':readiness.kind==='ready'?'Wallet ready on Elysium.':readiness.message;
 $('#wallet-readiness').dataset.state=readiness.kind;
}

function onWalletChange(next){
 const changed=wallet.account!==next.account||wallet.chainId!==next.chainId;
 wallet=next;if(changed)launches?.accountChanged();portfolio?.changed();if(changed&&signedIn&&wallet.account&&wallet.chainId===status.authChainId)portfolio?.refresh();
 if(changed&&!portfolio?.fundingBusy()){invalidate();renderSummary();const readiness=workspaceWalletReadiness(wallet,draft.account,status);if(['wrong-chain','mismatch'].includes(readiness.kind))message(readiness.message);if(active)ask();}
}
renderSummary();

try{status=await api('/api/status');if(status.legalLinks){$('#terms-link').href=status.legalLinks.terms;$('#privacy-link').href=status.legalLinks.privacy;$('#signin-legal').hidden=false;}document.querySelector('.preview').textContent=status.onboardingOnly?'Testnet onboarding':(status.broadcastEnabled||status.walletTransfersEnabled||status.swapsEnabled)?'Wallet approval required':'Live sending disabled';$('#model').textContent=status.aiConfigured?'Dinn assistant':'Guided launch assistant';renderNetworkOptions();}catch{$('#model').textContent='Server unavailable';message('The server is unavailable. Your draft can still be edited; review requires a connection.');}



function setWorkspaceAccess(allowed,userId){
 $('#session-loading').hidden=true;
 const wasSignedIn=signedIn;signedIn=allowed;
 $('#workspace').hidden=!allowed;$('#workspace').inert=!allowed;$('#auth-gate').hidden=allowed;
 if(!allowed){profileEditor.close();profile=validateProfile();inspectionChainId=null;renderNetworkOptions();conversation=[];selectedToken=null;$('#messages').replaceChildren();currentUserId=null;invalidate();active=false;editing=null;closeSummary();$('#choices').replaceChildren();if($('#new-dialog').open)$('#new-dialog').close();closeSummary();}
 if(allowed&&userId!==currentUserId){
  profileEditor.close();currentUserId=userId;profile=validateProfile();try{profile=restoreProfile(sessionStorage.getItem(profileKey()));}catch{}inspectionChainId=null;storageKey='launchflow.draft.v2:'+userId;draft={};try{draft=restoreDraft(sessionStorage.getItem(storageKey));}catch{}
  invalidate();$('#messages').replaceChildren();$('#choices').replaceChildren();$('#prompt').value='';active=false;editing=null;
  conversation=[];selectedToken=null;try{const raw=sessionStorage.getItem(conversationKey());conversation=restoreConversation(raw);const saved=JSON.parse(raw);inspectionChainId=saved?.inspectionChainId||null;renderNetworkOptions();if(inspectionChainId===saved?.inspectionChainId&&inspectionChainId&&tokenAddressPattern.test(saved?.tokenAddress))selectedToken=saved.tokenAddress;}catch{}
  renderNetworkOptions();
  $('#welcome').hidden=conversation.length>0;
  for(const entry of conversation)message(entry.content,entry.role);
  
  launches?.setOwner(userId);let savedView='chat';try{const saved=sessionStorage.getItem('dinn.view.v1:'+userId);if(['chat','services','launches','portfolio'].includes(saved))savedView=saved;}catch{}showView(savedView);renderSummary();
 }
 portfolio?.changed();if(allowed&&view==='portfolio')portfolio?.refresh();
 if(allowed&&!wasSignedIn)$('#view-name').focus({preventScroll:true});
 if(!allowed&&wasSignedIn)$('#signin-title').focus({preventScroll:true});
}
window.addEventListener('launchflow:auth',async event=>{
 const detail=event.detail||{};
 if(detail.state==='loading'&&!detail.authenticated){authState='loading';$('#session-loading').hidden=false;$('#auth-gate').hidden=true;$('#workspace').hidden=true;$('#workspace').inert=true;return;}
 if(authInitTimer){clearTimeout(authInitTimer);authInitTimer=null;}
 if(detail.state==='loading'&&detail.authenticated&&detail.userId===currentUserId&&wallet.account)return;
 const preserveWallet=detail.state==='connected'&&detail.userId===currentUserId&&detail.address?.toLowerCase()===wallet.account?.toLowerCase();
 const epoch=++authEpoch;authState=detail.state;
 setWorkspaceAccess(detail.authenticated===true&&typeof detail.userId==='string',detail.userId);
 walletSession?.close();walletSession=null;walletSource=null;walletConnecting=false;if(!preserveWallet)onWalletChange({account:null,chainId:null});
 if(detail.state==='connected'&&signedIn){
  walletSource='embedded';walletConnecting=true;renderWallet();
  try{const session=createWalletSession(detail.provider,next=>{if(epoch===authEpoch)onWalletChange(next);});walletSession=session;await session.connect({requestAccess:false});if(epoch!==authEpoch){session.close();return;}}
  catch{if(epoch===authEpoch){walletSession?.close();walletSession=null;walletSource=null;onWalletChange({account:null,chainId:null});message('Your wallet could not be opened. Sign out and try again.');}}
  finally{if(epoch===authEpoch){walletConnecting=false;renderWallet();if(submission){trackSubmission(submission.pending());renderPending(submission.pending());}}}
 }else renderWallet();
});
let unmountAuth,authInitGeneration=0,authInitTimer=null;
async function initEmbeddedAuth(){
 const generation=++authInitGeneration;
 if(authInitTimer)clearTimeout(authInitTimer);
 const host=$('#embedded-auth');
 authState='loading';
 authInitTimer=setTimeout(()=>{
  if(generation!==authInitGeneration||authState!=='loading')return;
  authInitGeneration++;authInitTimer=null;authState='error';
  unmountAuth?.();unmountAuth=null;setWorkspaceAccess(false);
  host.replaceChildren(node('p','auth-error','Sign-in could not finish loading. Reload or try again.'),button('Retry sign-in',initEmbeddedAuth));
 },15000);
 try{
  const config=await api('/api/auth/config');
  if(generation!==authInitGeneration)return;
  if(!config.enabled){
   clearTimeout(authInitTimer);authInitTimer=null;
   authState='unavailable';setWorkspaceAccess(false);host.replaceChildren();const choices=node('div','signin-actions');
   for(const [provider,label]of [['x','Continue with X'],['google','Continue with Google']]){const b=button('',()=>{},'social-login');const icon=node('img','social-symbol');icon.src='/brand/'+provider+'.svg';icon.alt='';icon.width=20;icon.height=20;b.append(icon,document.createTextNode(label));b.disabled=true;b.title='Sign-in is not configured';choices.append(b);}
   host.append(choices);return;
  }
  const {mountEmbeddedAuth}=await import('/auth/entry.js');
  if(generation!==authInitGeneration)return;
  unmountAuth?.();unmountAuth=mountEmbeddedAuth(host,config,$('#account-controls'));
 }catch{
  if(generation!==authInitGeneration)return;
  clearTimeout(authInitTimer);authInitTimer=null;authState='error';setWorkspaceAccess(false);
  host.replaceChildren(node('p','auth-error','Sign-in could not load. Please try again.'),button('Retry sign-in',initEmbeddedAuth));
 }
}
initEmbeddedAuth();


launches=mountLaunches({api,getProvider:()=>{if(!walletSession)throw Error("Open your Dinn wallet first.");return walletSession.getProvider();},getAccount:()=>signedIn?wallet.account:null,getDraft:()=>draft,isRpcConfigured:()=>!!status.rpcConfigured,onVerified:handleVerifiedReceipt,onStart:startLaunch});
$('#launches-tab').onclick=()=>showView('launches');


function trackSubmission(record){
 if(record?.hash&&signedIn&&wallet.account&&record.configuration.account.toLowerCase()===wallet.account.toLowerCase())launches?.add({hash:record.hash,configuration:record.configuration,expectedData:record.transaction.data});
}
function handleVerifiedReceipt(record,result){
 if(!submission)return;
 const pending=submission.pending();
 if(pending?.hash?.toLowerCase()===record.hash.toLowerCase())submission.acknowledge(result);
}
function renderPending(record){
 const host=$('#pending-launch');host.replaceChildren();host.hidden=!record||!signedIn||!wallet.account||record.configuration.account.toLowerCase()!==wallet.account.toLowerCase();
 if(!record)return;
 const titles={'awaiting-wallet':'Check your wallet to approve or decline',unknown:'Wallet result unknown — check activity',submitted:'Transaction submitted — not yet verified',confirming:'Launch found — waiting for confirmations',verified:'Launch verified at the last check',reverted:'Transaction reverted',rejected:'Wallet request declined'};
 host.append(node('h3','',titles[record.phase]||'Launch status'),node('p','',record.configuration.name+' · '+record.configuration.account));
 if(record.hash)host.append(node('p','transaction-hash',record.hash));
 if(record.message)host.append(node('p','',record.message));
 if(record.recoveryWarning)host.append(node('p','recovery-warning',record.recoveryWarning));
 if(receiptNotice&&receiptNotice!==record.message)host.append(node('p','',receiptNotice));
 if(record.hash){
  const check=button(receiptChecking?'Checking receipt…':'Check receipt',verifyPending);
  check.disabled=receiptChecking||!status.rpcConfigured||record.phase==='awaiting-wallet';host.append(check);
  if(view!=='launches')host.append(button('View launches',()=>{trackSubmission(record);showView('launches');}));
 }else if(record.phase==='unknown'){
  host.append(node('p','','Find the transaction in your wallet activity. Paste its hash below. The original calldata must match before this request can be resolved.'));
  const form=node('form','recover-launch'),label=node('label','','Transaction hash from wallet activity'),input=node('input');
  input.required=true;input.maxLength=66;input.placeholder='0x…';input.setAttribute('aria-label','Recover transaction hash');label.append(input);
  const recover=node('button','subtle','Recover and verify');recover.type='submit';form.append(label,recover);
  form.onsubmit=async event=>{event.preventDefault();try{const next=submission.attachHash(input.value.trim());trackSubmission(next);await verifyPending();}catch(error){receiptNotice=error.message;renderPending(submission.pending());}};
  host.append(form);
 }
}
async function verifyPending(){
 if(!submission||receiptChecking)return;
 const pending=submission.pending();if(!pending?.hash||!signedIn||!wallet.account||pending.configuration.account.toLowerCase()!==wallet.account.toLowerCase())return;
 const userAtCheck=currentUserId;
 receiptChecking=true;receiptNotice='';renderPending(pending);
 try{
  trackSubmission(pending);
  const result=await api('/api/launch/receipt',{hash:pending.hash,configuration:pending.configuration,expectedData:pending.transaction.data});
  if(!signedIn||currentUserId!==userAtCheck)return;
  receiptNotice=result.message;
  launches.observe(pending,result);
  if(['verified','reverted','confirming'].includes(result.state))submission.acknowledge(result);
 }catch(error){if(signedIn&&currentUserId===userAtCheck)receiptNotice='Receipt check could not complete: '+error.message;}
 finally{receiptChecking=false;renderPending(submission.pending());}
}
function addWalletApproval(box,prepared,payload,revisionAtReview){
 const enabled=status.broadcastEnabled===true;
 const approve=button(enabled?'Approve launch in wallet':'Live launch disabled',async()=>{
  if(busy||!signedIn||revisionAtReview!==revision||!submission)return;
  const session=walletSession;
  if(!session){message('Connect the deployer wallet, then review and simulate again.');return;}
  setBusy(true);approve.disabled=true;receiptNotice='';
  try{
   const latest=await api('/api/status');
   await api('/api/launch/preflight',{prepared,configuration:payload});
   const result=await submission.submit({
    enabled:latest.broadcastEnabled===true,prepared,configuration:payload,provider:session.getProvider(),
    isCurrent:()=>signedIn&&revisionAtReview===revision&&walletSession===session
   });
   trackSubmission(result);
   if(result.hash){showView('launches');await verifyPending();}
  }catch(error){message(error.message);}
  finally{setBusy(false);approve.disabled=true;approve.textContent='Simulate again before another approval';}
 },'primary');
 approve.disabled=!enabled||!submission||!walletSession||walletReadiness(wallet,payload.account).kind!=='ready';
 box.append(node('p','',enabled?'This launches a token on Elysium and spends HYPE on network gas. Your wallet shows the fee and asks for approval. No initial token purchase is included.':'Wallet approval is implemented but live sending is disabled in this preview.'),approve);
 const remaining=prepared.expiresAt-Date.now();
 setTimeout(()=>{approve.disabled=true;approve.textContent='Simulation expired — simulate again';},Math.max(0,Math.min(remaining,90000)));
}
async function initSubmission(){
 try{
  const {createLaunchSubmitter}=await import('/execution/entry.js');
  const withLock=navigator.locks?task=>navigator.locks.request('launchflow-submit',{mode:'exclusive',ifAvailable:true},lock=>{if(!lock)throw Error('Another tab has a wallet request in progress.');return task();}):undefined;
  submission=createLaunchSubmitter({storage:localStorage,withLock,onState:renderPending});
  const pending=submission.pending();renderPending(pending);trackSubmission(pending);
 }catch{
  submission=null;const host=$('#pending-launch');host.hidden=false;host.replaceChildren(node('p','','Launch approval is unavailable. Rebuild the app or check saved transaction recovery data before trying to submit.'));
 }
}
await initSubmission();

function mountComposerSuggestions(){
 const input=$('#prompt'),hint=$('#prompt-suggestion'),wrapper=input.parentElement;
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 const prompts=['Ask Dinn\u2026','Create a token on Elysium\u2026','Add a logo and socials\u2026','Check token supply and contract details\u2026','Explore contract risk indicators\u2026'];
 let timer,index=0,letters=prompts[0].length,phase='hold';
 function hide(){hint.hidden=true;wrapper.classList.remove('is-suggesting');}
 function eligible(){return signedIn&&view==='chat'&&!active&&!busy&&!document.hidden&&!motion.matches&&!input.value&&document.activeElement!==input&&!document.querySelector('dialog[open]')&&!$('#workspace').inert;}
 function reset(){clearTimeout(timer);hide();index=0;letters=prompts[0].length;phase='hold';timer=setTimeout(tick,500);}
 function tick(){
  if(!eligible()){hide();timer=setTimeout(tick,500);return;}
  const style=getComputedStyle(input);for(const property of ['font','lineHeight','padding'])hint.style[property]=style[property];
  hint.hidden=false;wrapper.classList.add('is-suggesting');hint.textContent=prompts[index].slice(0,letters);
  let delay=45;
  if(phase==='hold'){phase='erase';delay=2400;}
  else if(phase==='erase'){if(letters>0){letters--;delay=22;}else{index=(index+1)%prompts.length;phase='type';delay=200;}}
  else if(letters<prompts[index].length){letters++;}else{phase='hold';delay=100;}
  timer=setTimeout(tick,delay);
 }
 for(const event of ['focus','blur','input','compositionstart'])input.addEventListener(event,reset);
 motion.addEventListener('change',reset);document.addEventListener('visibilitychange',reset);
 reset();
}
mountComposerSuggestions();
portfolio=mountPortfolio({api,getContext:()=>({signedIn,authState,walletConnecting,userId:currentUserId,wallet,status,getProvider:()=>{if(!walletSession)throw Error('Open your wallet first.');return walletSession.getProvider();}}),showWallet:()=>showView('portfolio')});
$('#portfolio-tab').onclick=()=>{showView('portfolio');portfolio.refresh();};
portfolio.changed();if(signedIn&&wallet.account&&wallet.chainId===status.authChainId)portfolio.refresh();
