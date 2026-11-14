import {hasLaunchProgress,launchReturnChoice} from './launch-resume.js';
import {createDraftSync} from './draft-sync.js';
import {usdTotal} from './purchase-usd.js';
import {launchLinkSteps,parseLaunchLink} from './launch-link-chat.js';
import {mountLogoCreator} from './logo-creator.js';

import {cleanSocials,socialFields,socialLabels} from './launch-metadata.js';

import {mountLaunchActivity} from './launch-activity.js';
import {mountDinnLaunches} from './dinn-launches.js';

import {renderInspection} from './token-report.js';

import {appendChatState,restoreChatState} from './chat-state.js';

import {dexCheckoutFor,profileText} from './dex-profile.js';

import {renderAssistantText} from './chat-format.js';


import {pairCandidates} from './pons-assets.js';

import {cleanBrief,cleanPonsSettings,workspaceCommand} from './pons-flow.js';

import {receiveChat} from './chat.js';

const $=id=>document.getElementById(id);
$('drafts-view').append($('summary-panel'));

const metadataIds=socialFields.map(k=>'launch-'+k);

function currentSocials(){return cleanSocials(Object.fromEntries(socialFields.map(k=>[k,$('launch-'+k).value])));}

let launchPair=null,setupActive=false,requestedSupply=null;

let walletUI=null,launchesView=null,walletNetworkBusy=false,claimBusy=false,claimApprovalBusy=false,claimRecoveryKey=null,chatPendingApproval=null,chatApprovalBusy=false;
async function openFeeClaim(address){
 if(!/^0x[0-9a-f]{40}$/i.test(address||''))return;view('assistant');const owner=account,run=epoch;
 if(!owner||!provider||!['embedded','external'].includes(walletSource)){say('Connect the wallet that owns these Pons fees, then ask me to check the claim again.');return;}
 if(claimBusy){say('A fee claim check is already running.');return;}claimBusy=true;
 let recordKey='dinn.pons.claim.v1:4663:'+owner.toLowerCase(),record;
 try{record=JSON.parse(localStorage.getItem(recordKey)||'null');}catch{claimBusy=false;say('Saved claim history cannot be read. Check wallet activity before continuing.');return;}
 const link=(body,hash)=>{if(!/^0x[0-9a-f]{64}$/i.test(hash||''))return;const a=document.createElement('a');a.href='https://robinhoodchain.blockscout.com/tx/'+hash;a.target='_blank';a.rel='noopener noreferrer';a.textContent='View transaction';body.append(a);};
 const poll=async(hash,claim,attempt=0)=>{if(epoch!==run||account!==owner)return;try{const result=await api('/api/pons/fees/receipt',{hash,claim});if(epoch!==run||account!==owner)return;if(!['pending','confirming','verified','reverted'].includes(result.state)||result.hash?.toLowerCase()!==hash.toLowerCase()||result.state==='verified'&&(result.recipient?.toLowerCase()!==claim.account.toLowerCase()||result.asset?.toLowerCase()!==claim.asset.toLowerCase()||result.amountWei!==claim.amountWei))throw Error('Receipt did not match the reviewed fee claim.');record={...record,phase:result.state};localStorage.setItem(recordKey,JSON.stringify(record));if(result.state==='verified'){const body=say('✓ Fee claim confirmed. The payout went to '+result.recipient+'.');body.parentElement.classList.add('operation-success');link(body,hash);return;}if(result.state==='reverted'){const body=say('The fee claim failed. No fees were collected.');link(body,hash);return;}if(attempt<12){setTimeout(()=>void poll(hash,claim,attempt+1),5000);return;}const body=say('Your fee claim is still processing. Say “check fee claim” to check again.');link(body,hash);}catch(error){const body=say('I could not verify the fee claim yet: '+error.message+' No new transaction was sent.');link(body,hash);}};
 try{
  if(record&&!['verified','reverted','rejected'].includes(record.phase)){if(record.hash){say('Checking your previous fee claim…');void poll(record.hash,record.claim);return;}claimRecoveryKey=recordKey;say('I could not confirm whether the previous fee claim went through. Paste its transaction ID here so I can check before you try again.');return;}
  say('Dinn is checking your claimable Pons fees…');const preparedReview=await api('/api/pons/fees/prepare',{address,account:owner});if(epoch!==run||account!==owner)return;
  const review=say('Claim review: '+preparedReview.amount+' '+preparedReview.symbol+' to '+owner+'. Estimated network fee: '+preparedReview.estimatedGas+' ETH. Would you like me to claim these fees now? Reply “yes” or “approve” to send, or “cancel” to stop. Nothing has been sent.');
  chatPendingApproval={label:'fee claim',run:async body=>{if(claimApprovalBusy)return;claimApprovalBusy=true;let rechecking;try{rechecking=appendChatActionNote(body,'Rechecking the claim amount before sending…',{pending:true});const fresh=await api('/api/pons/fees/prepare',{address,account:owner});if(epoch!==run||account!==owner)return;if(JSON.stringify(fresh.claim)!==JSON.stringify(preparedReview.claim))throw Error('The claimable amount changed. Ask me to refresh the review.');const {requestPonsClaim}=await import('/pons/entry.js');record=await requestPonsClaim({prepared:fresh,provider,sendTransaction:walletSource==='embedded'?walletSendTransaction:null,address:owner,source:walletSource||'unavailable',storage:localStorage,key:recordKey,isCurrent:()=>epoch===run&&account===owner,withLock:navigator.locks?fn=>navigator.locks.request('dinn-wallet:'+owner.toLowerCase(),fn):null});if(epoch!==run)return;if(record.phase==='rejected'){appendChatActionNote(body,'Fee claim was declined. Nothing was sent.');return;}if(record.phase==='unknown'&&record.error)throw Error(record.error);if(record.hash){appendChatActionNote(body,'Fee claim submitted. Waiting for confirmation…',{pending:true});link(body,record.hash);void poll(record.hash,record.claim);}else appendChatActionNote(body,'Wallet result is uncertain. Check wallet activity before trying again.');if(record.storageWarning)appendChatActionNote(body,'Recovery storage failed. Save the transaction hash: '+(record.hash||'unavailable'));}catch(error){if(epoch===run)appendChatActionNote(body,'Fee claim could not be submitted: '+error.message);}finally{rechecking?.classList.remove('chat-action-pending');claimApprovalBusy=false;}}};
 }catch(error){if(epoch===run)say('I could not prepare the fee claim: '+error.message+' No transaction was sent.');}
 finally{claimBusy=false;}
}
let account=null,user=null,history=[],chatResults=[],controller=null,epoch=0,brief={},awaiting=null,provider=null,walletSource=null,walletSendTransaction=null,setupBusy=false,selectedToken=null,authBootTimer=null,authBootTimedOut=false,authBootResolved=false;

for(const a of pairCandidates){const o=document.createElement('option');o.value=a.symbol;o.label=a.name+' - '+a.address;$('pair-candidates').append(o);}

function pairAddress(value){if(/^(eth|native eth)$/i.test(value))return '0x'+'0'.repeat(40);const matches=pairCandidates.filter(a=>a.symbol.toLowerCase()===value.toLowerCase());if(matches.length===1)return matches[0].address;if(/^0x[0-9a-f]{40}$/i.test(value))return value;throw Error('Choose ETH, a catalog ticker, or paste the Robinhood pairing-token address.');}

const key=kind=>'dinn.multi.'+kind+'.v1:'+user;

function read(kind){try{return localStorage.getItem(key(kind));}catch{return null;}}

function save(kind,value){localStorage.setItem(key(kind),JSON.stringify(value));draftSync.changed(kind);}

const syncHost=document.createElement('div');syncHost.className='draft-sync';syncHost.hidden=true;
const syncText=document.createElement('span');syncText.setAttribute('role','status');
const accountDraftButton=document.createElement('button'),localDraftButton=document.createElement('button'),syncRetry=document.createElement('button');
accountDraftButton.textContent='Use account draft';localDraftButton.textContent='Keep this draft';syncRetry.textContent='Retry sync';
for(const button of [accountDraftButton,localDraftButton,syncRetry]){button.type='button';button.className='subtle';}
syncHost.append(syncText,accountDraftButton,localDraftButton,syncRetry);$('draft-sync-controls').append(syncHost);
const draftSync=createDraftSync({storage:localStorage,request:async(action,data,id)=>{
 if(user!==id)throw Error('Account changed.');const {getAccessToken}=await import('/auth/entry.js');const token=await getAccessToken();if(user!==id)throw Error('Account changed.');if(!token)throw Error('Sign in again to sync your draft.');
 const response=await fetch('/api/drafts/'+action,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(data),signal:AbortSignal.timeout(20000)});const result=await response.json();if(!response.ok){const error=Error(result.error||'Could not sync your draft.');error.status=response.status;throw error;}return result;
},onStatus:({state,message})=>{syncHost.hidden=!['error','conflict'].includes(state);syncText.textContent=message;accountDraftButton.hidden=localDraftButton.hidden=state!=='conflict';syncRetry.hidden=state!=='error';},onApply:id=>{
 if(id!==user)return;epoch++;controller?.abort();launchBusy=false;setupBusy=false;logoCreator.reset();invalidateLaunch();showLaunchStage(null,false);restore();restoreSettings();renderTokenSummary();renderSetupChoices();
}});
accountDraftButton.onclick=()=>void draftSync.useAccount();localDraftButton.onclick=()=>void draftSync.keepLocal();syncRetry.onclick=()=>void draftSync.refresh();
window.addEventListener('focus',()=>void draftSync.refresh());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')void draftSync.flush();});

async function api(path,data,signal){const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data),signal});const v=await r.json();if(!r.ok)throw Error(v.error||'Could not complete the request.');return v;}

function view(name){for(const n of ['assistant','launches','tools','agent-access','drafts','wallet'])$(n+'-view').hidden=n!==name;document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===name);if(b.dataset.view===name)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});$('view-name').textContent=name==='tools'?'Dinn tools':name==='agent-access'?'Agent access':name[0].toUpperCase()+name.slice(1);if(name==='wallet')void walletUI?.refresh();if(name==='launches'){launchesView?.activate();void registerSavedLaunch();}else launchesView?.deactivate();}

function scrollChat(){requestAnimationFrame(()=>$('chat-thread').scrollTop=$('chat-thread').scrollHeight);}

function syncBrief(){invalidateLaunch();for(const f of ['name','symbol','description'])$('brief-'+f).value=brief[f]||'';renderTokenSummary();}

function message(role,text){const el=document.createElement('div');el.className='message '+role;const label=document.createElement('small');label.textContent=role==='user'?'You':'Dinn';const body=document.createElement('div');body.className='message-body';if(role==='assistant')renderAssistantText(body,text);else body.textContent=text;el.append(label,body);$('messages').append(el);$('welcome').hidden=true;scrollChat();return body;}

function restore(){const restored=restoreChatState(read('chat'));chatPendingApproval=null;chatResults=restored.results;history=restored.messages.map((m,i)=>m.role==='assistant'&&/reply\s+[“"]approve[”"]/i.test(m.content)&&!chatResults[i]?.actions?.some(action=>action.id==='wallet_approve')?{...m,content:m.content.replace(/If these details are correct, reply\s+[“"]approve[”"].*$/im,'This approval review expired when the chat was refreshed. Ask Dinn to check the current terms again before proceeding.').replace(/If these terms are right, reply\s+[“"]approve[”"].*$/im,'This launch check expired when the chat was refreshed. Ask Dinn to check the current terms again before proceeding.')}:m);$('messages').replaceChildren();history.forEach((m,i)=>{const body=message(m.role,m.content);if(chatResults[i])renderToolResult(body,{message:m.content,...chatResults[i]});});try{const saved=JSON.parse(read('pons-brief'));brief=saved?.launchpad==='pons'&&saved.chainId===4663?cleanBrief(Object.fromEntries(['name','symbol','description'].filter(f=>saved[f]!==undefined).map(f=>[f,saved[f]]))):{};}catch{brief={};}try{const setup=JSON.parse(read('setup'));awaiting=setup?.awaiting||null;setupActive=setup?.active===true;requestedSupply=typeof setup?.requestedSupply==='string'&&/^[1-9]\d{0,23}$/.test(setup.requestedSupply)?setup.requestedSupply:null;}catch{awaiting=null;setupActive=false;requestedSupply=null;}syncBrief();}

function keepBrief(){save('pons-brief',{...brief,launchpad:'pons',chainId:4663});save('setup',{awaiting,active:setupActive,requestedSupply});syncBrief();}

document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view));

$('start-brief').onclick=()=>{view('assistant');$('prompt').value='create a token';$('chat').requestSubmit();};

$('chat-review').onclick=()=>{$('review-launch').click();};

const promptExamples=['Launch a token on Pons','Research a token or contract','Check my wallet balances','Swap or bridge assets','Check and claim Pons fees'];
const prompt=$('prompt'),suggestion=$('prompt-suggestion'),composer=prompt.closest('.composer-input'),reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');let exampleIndex=0;
function showPromptExample(){const show=!prompt.value.trim();suggestion.hidden=!show;composer.classList.toggle('is-suggesting',show);if(show)suggestion.textContent=promptExamples[exampleIndex];}
prompt.addEventListener('input',showPromptExample);$('chat').addEventListener('submit',()=>setTimeout(showPromptExample,0));showPromptExample();setInterval(()=>{if(prompt.value.trim()||document.hidden||reducedMotion.matches)return;suggestion.classList.add('is-changing');setTimeout(()=>{exampleIndex=(exampleIndex+1)%promptExamples.length;showPromptExample();suggestion.classList.remove('is-changing');},180);},4000);

$('prompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('chat').requestSubmit();}});

let launchReturnPending=false;
let launchConversationStep=null,launchLinkIndex=0,confirmedLaunchWallet=null,resetDraftPending=false;

const conversationStages={profile:'launch-profile-dialog',links:'launch-links-step',wallet:'launch-wallet-step',purchase:'launch-purchase-dialog',preparing:'launch-preparing-dialog',review:'pons-review-dialog'};

// Keep legacy controls mounted for their validated handlers, but never surface their panels in chat.
$('chat-thread').dataset.conversationalActions='true';for(const id of Object.values(conversationStages))$(id).hidden=true;

function say(text){if(!text)return null;return message('assistant',text);}
function sayLaunch(text){return say(text);}

function showLaunchStage(step,persist=true){

 const changed=launchConversationStep!==step;launchConversationStep=step;
 for(const id of Object.values(conversationStages))$(id).hidden=true;

 $('choices').hidden=true;$('setup-context').hidden=true;

 if(user&&persist)save('launch-conversation',{step:step==='preparing'?'purchase':step,name:brief.name,symbol:brief.symbol,linkIndex:launchLinkIndex});

  if(step){view('assistant');$('welcome').hidden=true;if(changed){const prompts={profile:'Before launch, you can add a logo. Send a public HTTPS or IPFS logo URL, say “create a logo” with an optional style, or say “skip logo”. You can also ask me to use the current logo.',links:launchLinkSteps[launchLinkIndex]?.prompt||'Send a project link or say skip.',wallet:'Which wallet should pay the launch costs and receive any buy at launch? Say “Dinn wallet” or “external wallet”. You can also change the connected wallet from the account menu.',purchase:'Would you like to buy tokens as part of the launch? Enter an amount in '+(pairCandidates.find(a=>a.address?.toLowerCase()===pairAddress($('launch-pair').value).toLowerCase())?.symbol||$('launch-pair').value)+', or say “skip purchase”. I’ll show a USD reference when available; launch fee and gas are paid in ETH.',preparing:'Dinn is checking the current launch terms…'};if(step==='review')return;const body=say(prompts[step]);if(step==='preparing'&&body){body.classList.add('chat-action-pending');body.setAttribute('aria-busy','true');}}}

}

function pauseLaunchConversation(){showLaunchStage(null,false);logoCreator.reset();renderSetupChoices();}

function restoreLaunchConversation(onResume=()=>{}){let saved;try{saved=JSON.parse(read('launch-conversation'));}catch{}if(!saved||saved.name!==brief.name||saved.symbol!==brief.symbol||!['profile','links','wallet','purchase','review'].includes(saved.step))return false;onResume();if(saved.step==='profile')void openLaunchProfile();else if(saved.step==='links')openLaunchLinks(Number.isInteger(saved.linkIndex)?saved.linkIndex:0);else if(saved.step==='wallet')openLaunchWallet();else if(saved.step==='purchase')openLaunchPurchase();else if(saved.step==='review')void openLaunchReview();return true;}

function recordSetupReply(text,reply){const state=appendChatState(history,chatResults,text,reply,{});history=state.messages;chatResults=state.results;save('chat',state);message('user',text);return message('assistant',reply);}

function handleLaunchReply(text){
 const trimmed=text.trim(),explicitLaunchReply=/^(?:set|change|update|add|use|skip|continue|next|resume|pause|cancel)\b/i.test(trimmed),question=/^(?:what|why|how|explain|suggest|recommend|should|is|are|does|do)\b/i.test(trimmed)||/\?$/.test(trimmed)&&!explicitLaunchReply;
 if(question||/\b(?:balance|balances|portfolio|wallet assets|bridge|swap|send tokens|send|transfer)\b/i.test(trimmed))return false;

 if(claimRecoveryKey){if(/^(?:cancel|stop|never mind|nevermind)$/i.test(text)){claimRecoveryKey=null;recordSetupReply(text,'Okay. The saved claim stays unresolved, and no new transaction will be sent.');return true;}const hash=text.trim();if(!/^0x[0-9a-f]{64}$/i.test(hash)){say('Paste the full 0x transaction hash to check the saved fee claim, or say “cancel”.');return true;}try{const record=JSON.parse(localStorage.getItem(claimRecoveryKey)||'null');if(!record?.claim)throw Error('Saved claim review is unavailable.');record.hash=hash;record.phase='submitted';localStorage.setItem(claimRecoveryKey,JSON.stringify(record));claimRecoveryKey=null;recordSetupReply(text,'Thanks. Dinn is checking that fee claim confirmation; it will not submit another transaction.');void openFeeClaim(record.claim.address);}catch(error){claimRecoveryKey=null;say('Could not recover the saved fee claim: '+error.message);}return true;}

 if(!launchConversationStep)return false;

 if(launchBusy){$('feedback').textContent='Dinn is preparing this step. Please wait.';return true;}

 if(/^(pause|pause setup|cancel)$/i.test(text)){pauseLaunchConversation();say('Launch setup paused. Your saved draft is still here.');return true;}

 if(launchConversationStep==='wallet'){if(/^(?:use )?(?:dinn|dinn wallet|embedded wallet)$/i.test(text)){$('use-dinn-wallet')?.click();return true;}if(/^(?:connect |use )?(?:external|external wallet)$/i.test(text)){$('connect-launch-wallet')?.click();return true;}say('Say “Dinn wallet” to use your Dinn wallet, or “external wallet” to connect one. The wallet you choose pays the launch cost and receives any buy at launch.');return true;}
 if(launchConversationStep==='profile'){

  if(/^(skip|skip logo|no logo)$/i.test(text)){$('skip-launch-logo').click();return true;}

 if(/^(use (this|the) logo|accept( logo)?)$/i.test(text)){if(logoCreator.hasUnselected())logoCreator.accept();else if($('launch-logo').value.trim())$('continue-launch-profile').click();else if(hasLocalLogo())say(localLogoMessage);else say('There is no selected logo yet. Send a public logo URL, create a preview, or say “skip logo”.');return true;}

  if(/^(continue|next)$/i.test(text)){$('continue-launch-profile').click();return true;}

  if(/^https:\/\/\S+$|^ipfs:\/\/\S+$/i.test(text)){$('launch-logo').value=text;$('launch-logo').dispatchEvent(new Event('input',{bubbles:true}));$('continue-launch-profile').click();return true;}

  const style=text.match(/^(?:create|generate)(?: (?:a |the )?logo)?(?: with|:)?\s*(.*)$/i);if(style){logoCreator.create(style[1]);return true;}

 }

 if(launchConversationStep==='links'){
  const parsed=parseLaunchLink(text,launchLinkSteps[launchLinkIndex].field);
  if(parsed){applyLinkReply(parsed,text);return true;}
  say('Please send '+launchLinkSteps[launchLinkIndex].label+' as a valid link, say “keep” to retain the saved link, or say “skip”.');return true;
 }
 if(launchConversationStep==='purchase'){

  if(/^(skip|skip purchase|no purchase)$/i.test(text)){$('skip-launch-purchase').click();return true;}

  const value=text.match(/^(?:(?:buy|spend)\s+)?(\d+(?:\.\d+)?)(?:\s+([a-z0-9]+))?$/i);if(value){const pair=pairCandidates.find(a=>a.address.toLowerCase()===pairAddress($('launch-pair').value).toLowerCase())?.symbol||'ETH';if(value[2]&&value[2].toUpperCase()!==pair.toUpperCase()){say('Enter the amount in '+pair+', or say “skip purchase”.');return true;}$('purchase-amount').value=value[1];$('continue-launch-purchase').click();return true;}

 }

 if(launchConversationStep==='review'){
  if(/^(?:check|simulate|check launch|simulate launch)$/i.test(text)){if(reviewed){$('simulate-launch').click();return true;}say('The launch review expired. Ask me to review the launch again.');return true;}
  if(/^(?:approve purchase|approve (?:the )?purchase|approve (?:nvda|eth|usdc|usdt))$/i.test(text)){if(reviewed?.quote.purchase?.approvalRequired){recordSetupReply(text,'Your launch buy needs permission to spend the exact token amount. Reply “yes” to approve that amount; this will not launch the token.');$('approve-purchase').click();return true;}say('No separate token permission is needed for this launch buy. Say “check launch” to continue.');return true;}
  if(/^(?:yes|yes launch it|go ahead|approve|approve launch|launch it|continue to wallet)$/i.test(text)){if(prepared){recordSetupReply(text,'Dinn is rechecking the launch terms, then submitting the reviewed transaction.');$('approve-launch').click();return true;}if(reviewed){recordSetupReply(text,'First say “check launch” so I can review the latest launch details and estimate network fees.');return true;}}
  if(/^(?:edit|edit logo|edit links|change logo|change links)$/i.test(text)){void openLaunchProfile();return true;}
  if(/^(?:change wallet|edit wallet)$/i.test(text)){openLaunchWallet();return true;}
  if(/^(?:edit purchase|change purchase)$/i.test(text)){openLaunchPurchase();return true;}
 }

 // General questions retain the normal agent path; resume via the setup choices.

 pauseLaunchConversation();return false;

}

function clearConversation(){

 try{save('chat',{messages:[]});}catch{ $('feedback').textContent='Browser storage is unavailable. Chat could not be cleared permanently.';return false;}

 showLaunchStage(null,false);logoCreator.reset();walletUI?.reset();resetDraftPending=false;launchReturnPending=false;chatPendingApproval=null;epoch++;launchBusy=false;controller?.abort();controller=null;setupBusy=false;setupActive=false;history=[];chatResults=[];awaiting=null;launchStep=null;selectedToken=null;launchPair=null;

 try{save('setup',{awaiting:null,requestedSupply});saveSettings();}catch{}

 $('send').disabled=false;$('stop-response').hidden=true;$('messages').replaceChildren();$('welcome').hidden=false;$('prompt').value='';renderSetupChoices();view('assistant');$('feedback').textContent='Chat cleared. Your token details are kept.';return true;

}

$('new').onclick=clearConversation;

function conversationalLaunchStatus(text){if(!/^(?:check|status)(?: the)? (?:(?:saved )?launch status|saved launch)[.!]?$/i.test(text))return false;const record=(()=>{try{return JSON.parse(localStorage.getItem(launchKey()));}catch{return null;}})();if(!record){say('There is no saved launch transaction to check.');return true;}recordSetupReply(text,'Dinn is checking the saved launch confirmation.');void launchActivity.refresh(true);return true;}

$('stop-response').onclick=()=>controller?.abort();

function forgetWalletApproval(action){
 const index=chatResults.findLastIndex(result=>result?.actions?.some(item=>item.id==='wallet_approve'&&JSON.stringify(item.review)===JSON.stringify(action.review)));
 if(index>=0){chatResults[index]={...chatResults[index],actions:chatResults[index].actions.filter(item=>item.id!=='wallet_approve')};try{save('chat',{messages:history,results:chatResults});}catch{}}
}
function handlePendingChatApproval(text){
 if(!chatPendingApproval)return false;
 if(/^(?:cancel|stop|never mind|nevermind|keep setup)[.!]?$/i.test(text.trim())){const pending=chatPendingApproval;chatPendingApproval=null;pending.cancel?.();if(pending.action)forgetWalletApproval(pending.action);recordSetupReply(text,'Canceled. No transaction was sent.');return true;}
 if(!/^(?:yes|yes do it|go ahead|approve|approve this|approve action|approve transaction|confirm|confirm this|continue)[.!]?$/i.test(text.trim()))return false;
 const pending=chatPendingApproval;chatPendingApproval=null;if(pending.action)forgetWalletApproval(pending.action);const body=recordSetupReply(text,walletSource==='embedded'?'Dinn is submitting the reviewed '+pending.label+' from your Dinn wallet now.':'Your external wallet will open for your confirmation of the reviewed '+pending.label+'.');chatApprovalBusy=true;void Promise.resolve(pending.run(body)).catch(error=>appendChatActionNote(body,'Could not continue the wallet action: '+error.message)).finally(()=>{chatApprovalBusy=false;});return true;
}

function startFreshTokenSetup(){
 epoch++;controller?.abort();controller=null;showLaunchStage(null,false);logoCreator.reset();invalidateLaunch();requestedSupply=null;brief={};awaiting=null;launchStep=null;setupActive=false;confirmedLaunchWallet=null;selectedToken=null;
 for(const id of [...economicFields.map(value=>value[0]),'launch-logo',...metadataIds])$(id).value='';
 for(const kind of ['opening-purchase','logo-local-choice','logo-original','launch-conversation'])save(kind,null);
 saveSettings();keepBrief();renderTokenSummary();
}
function savedSetupWasLaunched(){try{const record=JSON.parse(localStorage.getItem(launchKey())||'null');return record?.phase==='verified'&&record.result?.state==='verified'&&record.configuration?.name===brief.name&&record.configuration?.symbol===brief.symbol;}catch{return false;}}
$('chat').onsubmit=async e=>{
 e.preventDefault();if(!user)return;const text=$('prompt').value.trim();if(!text)return;if(chatApprovalBusy||claimBusy){say('Dinn is still checking or processing the current wallet action. Please wait before starting another one.');$('prompt').value='';return;}
 let requestText=text;const command=workspaceCommand(text);
 const launchEntry=command==='start-launch'||/^(?:resume(?: setup| launch)?|continue (?:my |the |saved )?(?:token launch|launch|setup))[.!]?$/i.test(text);
 if(launchReturnPending){const choice=launchReturnChoice(text);launchReturnPending=false;if(choice==='cancel'){recordSetupReply(text,'Your launch progress is saved. Come back whenever you are ready.');$('prompt').value='';return;}if(choice==='continue'){if(restoreLaunchConversation(()=>recordSetupReply(text,'Continuing your saved launch setup.'))){$('prompt').value='';return;}requestText='resume setup';}else if(choice==='new'){startFreshTokenSetup();requestText='create a token';}}
 else if(launchEntry&&hasLaunchProgress(brief,currentSettings())){if(controller||setupBusy||launchBusy){$('feedback').textContent='Please wait for the current action to finish.';return;}if(savedSetupWasLaunched()){startFreshTokenSetup();requestText='create a token';}else{launchReturnPending=true;showLaunchStage(null,false);const label=brief.name?(brief.name+(brief.symbol?' ('+brief.symbol+')':'')):'your saved token';recordSetupReply(text,'You have a launch in progress for '+label+'. Would you like to continue with it or start a new token? Starting a new token replaces this unfinished setup.');$('prompt').value='';return;}}
 if(command==='clear-chat'){clearConversation();return;}
 if(command==='reset-draft'){
  resetDraftPending=true;recordSetupReply(text,'This clears the token setup and conversation but keeps saved transaction records. Reply “confirm reset” to continue, or “keep setup” to cancel.');$('prompt').value='';return;
 }
 if(resetDraftPending){
  if(/^(?:confirm|confirm reset|reset it|yes)[.!]?$/i.test(text)){resetDraftPending=false;recordSetupReply(text,'Resetting token setup.');$('confirm-reset-draft').click();$('prompt').value='';return;}
  if(/^(?:keep|keep setup|cancel|no)[.!]?$/i.test(text)){resetDraftPending=false;recordSetupReply(text,'Okay. Your token setup is unchanged.');$('prompt').value='';return;}
  say('Reply “confirm reset” to clear setup, or “keep setup” to cancel.');$('prompt').value='';return;
 }
 if(conversationalLaunchStatus(text)){$('prompt').value='';return;}
 if(requestText===text&&handleLaunchReply(text)){$('prompt').value='';return;}
 if(handlePendingChatApproval(text)){$('prompt').value='';return;}
 if(chatPendingApproval&&!/^(?:what|why|how|explain|can you explain)\b/i.test(text)){const pending=chatPendingApproval;chatPendingApproval=null;if(pending.action)forgetWalletApproval(pending.action);say('I cleared the earlier approval review before handling this request. Ask me to check the current terms again before proceeding.');}
 if(controller||setupBusy)return;
 const generation=epoch,draftRevision=launchRevision;controller=new AbortController();const request=controller;let advanceLaunchProfile=false;$('prompt').value='';$('send').disabled=true;$('stop-response').hidden=false;$('feedback').textContent='';message('user',text);const reply=message('assistant','');reply.textContent='Thinking';reply.classList.add('thinking');reply.setAttribute('aria-label','Dinn is thinking');for(let i=0;i<3;i++){const dot=document.createElement('span');dot.className='thinking-dot';dot.textContent='.';dot.setAttribute('aria-hidden','true');reply.append(dot);}let received=false;
 try{
  const {getAccessToken}=await import('/auth/entry.js');const accessToken=await getAccessToken();
  const r=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json',...(accessToken?{authorization:'Bearer '+accessToken}:{})},body:JSON.stringify({message:requestText,history,ponsBrief:brief,ponsSettings:currentSettings(),ponsSetup:{requestedSupply,active:setupActive||!!awaiting||!!launchStep,field:awaiting||({'launch-pair':'pairToken','launch-config':'configId','launch-tax':'creatorTaxBps','launch-buyback':'buybackEnabled','launch-recipient':'creatorFeeRecipient'})[launchStep]||null,logo:$('launch-logo').value},...(account?{walletAccount:account}:{}),...(selectedToken?{tokenAddress:selectedToken}:{})}),signal:request.signal});
  const result=await receiveChat(r,delta=>{if(epoch===generation){if(!received){reply.replaceChildren();reply.classList.remove('thinking');reply.removeAttribute('aria-label');received=true;}reply.append(document.createTextNode(delta));scrollChat();}});
  if(epoch!==generation)return;
  if(result.launchDraft){try{if(launchRevision!==draftRevision)throw Error('Your token details changed while Dinn was responding. Retry against the current details.');applyLaunchDraft(result.launchDraft);}catch(error){received=false;reply.replaceChildren();throw error;}}
  const walletAction=result.actions?.find(action=>action.id==='wallet_approve');if(walletAction)result.message+='\n\nWould you like me to continue with these exact terms? Reply “yes” or “approve” to send, or “cancel” to stop. Nothing has been sent yet.';
  const state=appendChatState(history,chatResults,text,result.message,result);history=state.messages;chatResults=state.results;save('chat',state);renderToolResult(reply,result);advanceLaunchProfile=!launchConversationStep&&($('chat-review').disabled===false&&(result.actions||[]).some(action=>action.id==='review')||!!(result.launchDraft?.active&&result.launchDraft.nextField===null));
 }catch(err){if(epoch===generation){const failure=err.name==='AbortError'?'Response stopped. Your message is ready to retry.':err.message;reply.classList.remove('thinking');reply.removeAttribute('aria-label');reply.textContent=(received&&reply.textContent.trim()?reply.textContent+'\n\n':'')+'Could not finish: '+failure;reply.setAttribute('role','status');$('prompt').value=text;$('feedback').textContent='Your message is ready to retry.';}}
 finally{if(controller===request){controller=null;$('send').disabled=false;$('stop-response').hidden=true;if(advanceLaunchProfile)void openLaunchProfile();}}
};


$('brief-form').onsubmit=async e=>{e.preventDefault();const generation=epoch;if(!user)return;try{const b=await api('/api/pons/brief',{launchpad:'pons',chainId:4663,...Object.fromEntries(['name','symbol','description'].map(f=>[f,$('brief-'+f).value]))});if(epoch!==generation)return;brief=cleanBrief({name:b.name,symbol:b.symbol,description:b.description});awaiting=null;keepBrief();$('brief-status').textContent='Brief saved in this browser. Not deployed.';}catch(err){if(epoch===generation)$('brief-status').textContent=err.message;}};

async function check(button,status,path,data,render){const generation=epoch;button.disabled=true;status.textContent='Checking…';status.classList.add('status-shimmer');status.setAttribute('aria-busy','true');try{const r=await api(path,data);if(generation===epoch)render(r);}catch(err){if(generation===epoch)status.textContent=err.message;}finally{status.classList.remove('status-shimmer');status.removeAttribute('aria-busy');button.disabled=false;}}



$('copy-address').onclick=async()=>{try{if(!account)throw Error('Choose Dinn wallet or connect an external wallet from the menu above.');await navigator.clipboard.writeText(account);$('wallet-status').textContent='Address copied.';}catch(err){$('wallet-status').textContent=err.message;}};$('wallet-use-dinn').onclick=()=>window.dispatchEvent(new CustomEvent('dinn:use-dinn-wallet'));

function clearAuthBootTimer(){if(authBootTimer)clearTimeout(authBootTimer);authBootTimer=null;authBootTimedOut=false;$('auth-timeout-notice')?.remove();}
function startAuthBootTimer(){if(authBootResolved||authBootTimer||authBootTimedOut)return;authBootTimer=setTimeout(()=>{authBootTimer=null;if(authBootTimedOut||authBootResolved)return;authBootTimedOut=true;$('session-loading').hidden=true;$('auth-gate').hidden=false;$('workspace').hidden=true;$('workspace').inert=true;const card=document.querySelector('.signin-card');if(card&&!$('auth-timeout-notice')){const note=document.createElement('div');note.id='auth-timeout-notice';const message=document.createElement('p');message.className='auth-error';message.textContent='Sign-in is taking longer than expected. Reload to retry.';const retry=document.createElement('button');retry.className='social-login';retry.type='button';retry.textContent='Retry sign-in';retry.onclick=()=>location.reload();note.append(message,retry);card.append(note);}},25000);}
window.addEventListener('launchflow:auth',e=>{const d=e.detail;if(d.state==='loading'){if(authBootResolved||authBootTimedOut)return;startAuthBootTimer();}else{clearAuthBootTimer();authBootResolved=true;}const nextUser=d.authenticated?(d.userId||d.address):null;
// Wallet/provider refreshes are not account changes: preserve the current chat and stage.
if(user&&((nextUser===user)||d.state==='loading'&&!nextUser)){
 if(d.state==='loading')return;
 if(d.state==='wallet-changing'){const nextAddress=d.address||null;if(account!==nextAddress||provider){epoch++;controller?.abort();chatPendingApproval=null;launchBusy=false;confirmedLaunchWallet=null;invalidateLaunch();launchActivity.stop();account=nextAddress;}provider=null;walletSource=d.source||null;walletSendTransaction=null;$('wallet-address').textContent=account||'';$('wallet-use-dinn').hidden=true;walletUI?.changed('',true);if(!account)walletUI?.switching();else if(!$('wallet-view').hidden)void walletUI?.refresh();return;}if(walletNetworkBusy&&d.state==='wallet-needed')return;
 if(d.state==='connected'&&d.address===account){provider=d.provider||provider;walletSource=d.source||walletSource;walletSendTransaction=d.sendTransaction||null;$('wallet-status').textContent='';$('wallet-use-dinn').hidden=true;walletUI?.changed('',false);if(!$('wallet-view').hidden)void walletUI?.refresh();return;}
 if(d.state==='connected'||d.state==='wallet-needed'){
  epoch++;controller?.abort();chatPendingApproval=null;launchBusy=false;confirmedLaunchWallet=null;invalidateLaunch();launchActivity.stop();account=d.address||null;provider=d.provider||null;walletSource=d.source||null;walletSendTransaction=d.sendTransaction||null;
  $('wallet-address').textContent=account||'';$('wallet-balance').textContent=' - ETH';$('wallet-status').textContent=d.walletStatus||'';$('wallet-use-dinn').hidden=!d.canUseEmbedded;walletUI?.changed(d.state==='wallet-needed'?d.walletStatus:'',false);if(account&&!$('wallet-view').hidden)void walletUI?.refresh();return;
 }
}
if(nextUser===user&&d.state==='connected'&&d.address===account&&d.provider===provider)return;showLaunchStage(null,false);if(!$('pons-review-dialog').hidden)showLaunchStage(null);epoch++;launchBusy=false;logoCreator.reset();controller?.abort();launchActivity.stop();selectedToken=null;confirmedLaunchWallet=null;account=d.address||null;provider=d.provider||null;walletSource=d.source||null;walletSendTransaction=d.sendTransaction||null;invalidateLaunch();launchReturnPending=false;user=d.authenticated?(d.userId||account):null;const loading=d.state==='loading';$('session-loading').hidden=!loading;$('auth-gate').hidden=loading||!!user;$('workspace').hidden=loading||!user;$('workspace').inert=loading||!user;history=[];$('messages').replaceChildren();for(const id of ['feedback','brief-status','wallet-status'])$(id).textContent='';$('wallet-address').textContent=account||'';$('wallet-balance').textContent=' -  ETH';$('wallet-status').textContent=d.walletStatus||'';$('wallet-use-dinn').hidden=!d.canUseEmbedded;if(user){restore();restoreLaunch();restoreSettings();if(account){let prior;try{prior=JSON.parse(read('last-deployer'));}catch{}const recipient=$('launch-recipient');if(prior&&recipient.value.toLowerCase()===prior.toLowerCase()){recipient.value=account;saveSettings();}save('last-deployer',account);}renderTokenSummary();renderSetupChoices();}else {brief={};awaiting=null;syncBrief();}if(!user)for(const f of ['name','symbol','description'])$('brief-'+f).value='';draftSync.start(user);walletUI?.changed(d.state==='wallet-needed'?d.walletStatus:'',d.state==='wallet-changing');if(d.state==='wallet-changing'&&!account)walletUI?.switching();else if(d.state==='wallet-changing'&&account&&!$('wallet-view').hidden)void walletUI?.refresh();});

﻿let reviewed=null,prepared=null,launchBusy=false,launchRevision=0;

const localLogoMessage='This logo is saved on this PC, but needs a public link before launch. Download the PNG under More options and add its hosted URL, keep your existing logo, or choose Skip logo.';
function hasLocalLogo(){let logo;try{logo=JSON.parse(read('logo-local-choice'));}catch{}return !!logo?.id&&logo.name===brief.name&&logo.symbol===brief.symbol;}
let profileEpoch=null;

async function openLaunchProfile(){

 if(launchBusy||controller||setupBusy)return;const generation=epoch;launchBusy=true;

 if(!$('pons-review-dialog').hidden)showLaunchStage(null);

 profileEpoch=epoch;$('launch-profile-error').textContent='';$('continue-launch-profile').textContent='Continue';

 say('Dinn is checking whether logo preview is available for this account…');

 try{await logoCreator.open();if(generation===epoch){showLaunchStage('profile');if(hasLocalLogo())$('launch-profile-error').textContent=localLogoMessage;}}finally{if(generation===epoch)launchBusy=false;}

}

const profileFields=$('launch-profile-fields');

let profileNode=document.querySelector('label[for="launch-logo"]');

while(profileNode){const next=profileNode.nextSibling,done=profileNode.id==='launch-socials';profileFields.append(profileNode);if(done)break;profileNode=next;}

const externalLogo=document.createElement('details');externalLogo.className='profile-secondary';const externalTitle=document.createElement('summary');externalTitle.textContent='Use a logo URL';externalLogo.append(externalTitle);for(const child of [...profileFields.children])if(child.id!=='launch-socials')externalLogo.append(child);profileFields.prepend(externalLogo);

$('launch-links-fields').append($('launch-socials'));$('launch-socials').open=false;$('launch-socials').querySelector('summary').textContent='Add or edit links';

let lastLogoEvent='';
const logoCreator=mountLogoCreator({host:profileFields,getContext:()=>({user,name:brief.name||'',symbol:brief.symbol||'',description:brief.description||''}),onPreview:result=>{if(!result.preview)return;const body=say('Logo preview ready. Review it below. Say “use this logo”, “create another logo” with a style, or “skip logo”.');const img=document.createElement('img');img.src=result.preview;img.alt='Generated token logo preview';img.width=192;img.height=192;img.className='chat-logo-preview';body?.append(img);},onStatus:text=>{if(!text||text===lastLogoEvent)return;lastLogoEvent=text;if(/Creating your preview|No logo has been replaced|unavailable for this account|saved on this PC|needs a public|Logo selected|request is saved/i.test(text))say(text==='Creating your preview…'?'Dinn is creating your logo preview…':text);},onAccept:result=>{

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

 catch(error){say(error.message);return;}

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
 if(parsed.action==='error'){say(parsed.message);return;}
 if(parsed.action==='skip-all'){for(const id of metadataIds)$(id).value='';invalidateLaunch();saveSettings();recordSetupReply(text,'Continuing without project links.');openLaunchPurchase();return;}
 if(parsed.action==='keep'&&!$('launch-'+step.field).value){say('No '+step.label+' link is saved yet. Paste one or say “skip”.');return;}
 const field=parsed.field||step.field,previous=$('launch-'+field).value;
 try{if(parsed.action==='set')$('launch-'+field).value=parsed.url;else if(parsed.action==='skip')$('launch-'+field).value='';currentSocials();$('launch-'+field).dispatchEvent(new Event('input',{bubbles:true}));}
 catch(e){$('launch-'+field).value=previous;say(e.message);return;}
 recordSetupReply(text,parsed.action==='skip'?'Skipped '+step.label+'.':(launchLinkSteps.find(s=>s.field===field)?.label||field)+' link saved.');
 if(field!==step.field){renderLinkQuestion();return;}
 if(++launchLinkIndex<launchLinkSteps.length)renderLinkQuestion();else openLaunchPurchase();
}
$('back-launch-logo').onclick=()=>void openLaunchProfile();
$('skip-launch-logo').onclick=()=>{if(logoCreator.isPending()){say('The logo request is still running. Ask me to check it before skipping.');return;}logoCreator.discard();$('launch-logo').value='';$('launch-logo').dispatchEvent(new Event('input',{bubbles:true}));recordSetupReply('Skip logo.','Continuing without a logo.');openLaunchLinks();};
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
 $('purchase-usd-estimate').textContent=text;$('purchase-usd-estimate').classList.toggle('shimmer',usdLoading&&!valid);if(usdLoading&&!valid)$('purchase-usd-estimate').setAttribute('aria-busy','true');else $('purchase-usd-estimate').removeAttribute('aria-busy');
 $('purchase-usd-source').textContent=valid?'Reference estimate · '+purchaseUsd.source+' · '+new Date(purchaseUsd.asOf).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})+'. Excludes launch fee and gas.':(usdLoading?'':'Amount is in the selected trading pair.');
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
setInterval(()=>{if(user&&(launchConversationStep==='purchase'||!$('pons-review-dialog').hidden&&reviewed?.configuration.purchase))void refreshPurchaseUsd();},30000);
function openLaunchWallet(){if(launchBusy)return;invalidateLaunch();$('launch-wallet-error').textContent='';showLaunchStage('wallet');}
$('back-wallet-links').onclick=()=>openLaunchLinks();
$('edit-launch-wallet').onclick=openLaunchWallet;
window.addEventListener('dinn:launch-wallet-selected',event=>{const choice=event.detail;if(launchConversationStep!=='wallet'||choice.userId!==user||choice.address?.toLowerCase()!==account?.toLowerCase()||!provider)return;confirmedLaunchWallet=account.toLowerCase();recordSetupReply('Use '+choice.label+'.','Your launch wallet is '+account+'. Next, choose an optional buy at launch.');openLaunchPurchase();});
function openLaunchPurchase(){

 if(launchBusy)return;if(hasLocalLogo()){void openLaunchProfile();return;}if(!account||confirmedLaunchWallet!==account.toLowerCase()){openLaunchWallet();return;}if(!$('pons-review-dialog').hidden)showLaunchStage(null);

 const saved=savedPurchase(),asset=pairCandidates.find(a=>a.address?.toLowerCase()===pairAddress($('launch-pair').value).toLowerCase())?.symbol||($('launch-pair').value==='ETH'?'ETH':'selected trading pair');

 $('purchase-amount').value=saved?.amount||'';$('purchase-slippage').value=saved?String(saved.slippageBps/100):'1';$('purchase-error').textContent='';$('purchase-amount-label').textContent='Amount to spend in '+asset;$('purchase-asset-note').textContent='Tokens go to your connected wallet. Launch fee and gas are paid in ETH.';showLaunchStage('purchase');void refreshPurchaseUsd();

}

$('close-launch-purchase').onclick=openLaunchWallet;

$('edit-launch-purchase').onclick=openLaunchPurchase;

for(const id of ['purchase-amount','purchase-slippage'])$(id).addEventListener('input',()=>{$('purchase-error').textContent='';});

$('skip-launch-purchase').onclick=()=>{save('opening-purchase',null);recordSetupReply('Skip buy at launch.','I’ll prepare your launch review without a purchase.');void openLaunchReview();};

$('continue-launch-purchase').onclick=()=>{const amount=$('purchase-amount').value.trim(),bps=Number($('purchase-slippage').value)*100;if(!/^\d{1,40}(\.\d{1,36})?$/.test(amount)||!/[1-9]/.test(amount)||!Number.isInteger(bps)||bps<1||bps>500){$('purchase-error').textContent='Enter a positive amount, or skip. Price change limit must be between 0.01% and 5%.';return;}save('opening-purchase',{name:brief.name,symbol:brief.symbol,pair:$('launch-pair').value,amount,slippageBps:bps});const pair=pairCandidates.find(a=>a.address?.toLowerCase()===pairAddress($('launch-pair').value).toLowerCase())?.symbol||$('launch-pair').value;recordSetupReply('Launch purchase: '+amount+' '+pair+'.','I’ll check the current terms and include this purchase in your review.');void openLaunchReview();};

function approvalKey(){return 'dinn.pons.approval.v1:4663:'+account?.toLowerCase();}

function approvalRecord(){try{return JSON.parse(localStorage.getItem(approvalKey()));}catch{return null;}}

function updateApprovalUI(){const buy=reviewed?.quote.purchase,old=approvalRecord(),pending=old&&!['verified','reverted','rejected'].includes(old.phase);$('approve-purchase').hidden=true;$('approve-purchase').textContent=pending?'Check saved approval':'Approve '+(reviewed?.quote.pair||'purchase asset');$('approval-recovery-label').hidden=!pending||!!old.hash;$('simulate-launch').disabled=!!buy?.approvalRequired||!!pending;}

$('approve-purchase').onclick=async()=>{

 if(launchBusy||!reviewed)return;const generation=epoch,revision=launchRevision,key=approvalKey();launchBusy=true;$('approve-purchase').disabled=true;

 try{const old=approvalRecord();if(old&&!['verified','reverted','rejected'].includes(old.phase)){const hash=old.hash||$('approval-recovery-hash').value.trim();if(!/^0x[0-9a-f]{64}$/i.test(hash))throw Error('Check your wallet activity and enter the approval transaction hash. Do not submit another approval while the result is unknown.');const r=await api('/api/pons/approval-receipt',{...old,hash});if(generation!==epoch)return;if(['verified','reverted'].includes(r.state)){localStorage.setItem(key,JSON.stringify({...old,hash,phase:r.state}));$('simulation-status').textContent=r.state==='verified'?'Approval confirmed. Refreshing your launch terms…':'Approval failed. You can try again.';say($('simulation-status').textContent);if(r.state==='verified'){launchBusy=false;await openLaunchReview();}}else {$('simulation-status').textContent='Token approval is still being checked. Check again shortly.';say($('simulation-status').textContent);}

 }else{const p=await api('/api/pons/approval',reviewed);if(generation!==epoch||revision!==launchRevision)return;if(!p.required){launchBusy=false;await openLaunchReview();return;}if(!provider||!['embedded','external'].includes(walletSource)||walletSource==='embedded'&&!walletSendTransaction)throw Error('Your selected launch wallet is not ready. Reconnect it, then review the launch again.');const {requestPonsApproval}=await import('/pons/entry.js');const approvalAction=p.amount==='0'?'clear the old token permission':'approve only the launch buy amount';$('simulation-status').textContent=walletSource==='embedded'?'Dinn is submitting to '+approvalAction+'.':'Your external wallet will ask you to confirm '+approvalAction+'.';say($('simulation-status').textContent);const r=await requestPonsApproval({prepared:p,configuration:reviewed.configuration,provider,sendTransaction:walletSource==='embedded'?walletSendTransaction:null,address:account,source:walletSource||'unavailable',storage:localStorage,key,isCurrent:()=>epoch===generation&&launchRevision===revision,withLock:navigator.locks?fn=>navigator.locks.request('dinn-wallet:'+account.toLowerCase(),fn):null});if(generation!==epoch)return;$('simulation-status').textContent=r.phase==='rejected'?'Approval declined.':r.hash?'Approval sent. Wait for network confirmation before continuing.':'Approval result is uncertain. Check wallet activity before retrying.';if(r.storageWarning)$('simulation-status').textContent+=' Save this hash: '+(r.hash||'unavailable');say($('simulation-status').textContent);}

 }catch(e){if(generation===epoch){$('simulation-status').textContent=e.message;say(e.message);}}finally{launchBusy=false;$('approve-purchase').disabled=false;if(generation===epoch)updateApprovalUI();}

};

function renderLaunchReview(c,q){
 const lines=['Review your launch',c.name+' ('+c.symbol+') · Pons on Robinhood Chain'];
 if(c.description)lines.push(c.description);
 lines.push('Trading pair: '+q.pair,'Token supply: '+new Intl.NumberFormat('en').format(Number(q.config.supply)/1e18),'Total trading fee: '+(Number(q.config.curveFeeBps)/100+c.creatorTaxBps/100)+'% ('+Number(q.config.curveFeeBps)/100+'% base fee + '+c.creatorTaxBps/100+'% extra creator fee)');
 if(q.purchase){lines.push('Buy at launch: '+q.purchase.amount+' '+q.pair,'Estimated tokens: '+new Intl.NumberFormat('en',{maximumFractionDigits:4}).format(Number(q.purchase.tokensOut))+' '+c.symbol,'Minimum tokens you may receive: '+new Intl.NumberFormat('en',{maximumFractionDigits:4}).format(Number(q.purchase.minTokensOut))+' '+c.symbol,'Price protection: cancel if price moves more than '+q.purchase.slippageBps/100+'%');const address=pairAddress(c.pairToken).toLowerCase();if(purchaseUsd?.available&&purchaseUsd.pairToken===address&&purchaseUsd.expiresAt>Date.now())try{lines.push('Reference value: approximately $'+usdTotal(q.purchase.amount,purchaseUsd.unitPriceUsd)+' USD. Excludes launch fee and gas.');}catch{lines.push('USD reference unavailable.');}else lines.push('USD reference unavailable. Launch fee and gas are separate.');}else lines.push('Buy at launch: none');
 lines.push('Launch wallet: '+c.account,'Creator buybacks: '+(c.buybackEnabled?'enabled':'disabled'),'Launch cost: '+q.launchFee+' ETH plus network fee');
 const target=q.pairAsset.native?Number(q.config.graduationThreshold)/1e18:q.pairAsset.graduationTarget;
 lines.push('Moves to a pool when trading adds '+target+' '+q.pair+' to the launch reserve. This is a reserve target, not a market-cap goal.','Fee recipient wallet: '+c.creatorFeeRecipient,'Trading pair address: '+q.pairToken,'Logo: '+(c.logo||'none'),'Links: '+(socialFields.filter(k=>c.socials[k]).map(k=>socialLabels[k]+': '+c.socials[k]).join(' · ')||'none'),'Logo and links are fixed when the token launches and cannot be changed later.','No transaction has been sent.','Say “check launch” to check these details and estimate network fees.');
 sayLaunch(lines.join('\n'));
}

function invalidateLaunch(){launchRevision++;reviewed=null;prepared=null;$('launch-review').hidden=true;$('approve-launch').hidden=true;if(launchConversationStep==='review')showLaunchStage(null);}

function launchKey(){return 'dinn.pons.pending.v1:4663:'+account?.toLowerCase();}

const launchRegistrationInFlight=new Set(),registeredLaunchHashes=new Set();
async function persistDinnLaunch(record){if(!user||!record?.hash||record.phase!=='verified'||record.result?.state!=='verified'||registeredLaunchHashes.has(record.hash.toLowerCase())||launchRegistrationInFlight.has(record.hash.toLowerCase()))return;const owner=user,generation=epoch,hash=record.hash.toLowerCase();launchRegistrationInFlight.add(hash);try{const {getAccessToken}=await import('/auth/entry.js'),token=await getAccessToken();if(!token||owner!==user||generation!==epoch)return;const response=await fetch('/api/dinn/launches/register',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({hash:record.hash,configuration:record.configuration,quote:record.quote}),signal:AbortSignal.timeout(30000)}),result=await response.json();if(!response.ok)throw Error(result.error||'Account launch history could not be saved.');if(owner!==user||generation!==epoch)return;registeredLaunchHashes.add(hash);launchesView?.recorded();}catch(error){if(owner===user&&generation===epoch)launchesView?.notice('Launch is verified on Robinhood Chain, but Dinn could not sync it to your account: '+error.message);}finally{launchRegistrationInFlight.delete(hash);}}
function registerSavedLaunch(){let record;try{record=JSON.parse(localStorage.getItem(launchKey())||'null');}catch{}return persistDinnLaunch(record);}

$('drafts-view').append($('launch-recovery'));$('launch-recovery').classList.add('chat-launch-recovery');
let lastLaunchStatus='';const launchActivity=mountLaunchActivity({onPonsWallet:()=>{view('wallet');$('pons-wallet-panel').hidden=false;$('pons-wallet-panel').scrollIntoView({block:'nearest'});},getAccount:()=>account,getEpoch:()=>epoch,getRecord:()=>{try{return JSON.parse(localStorage.getItem(launchKey()));}catch{return null;}},setRecord:r=>localStorage.setItem(launchKey(),JSON.stringify(r)),api,onResearch:address=>{selectedToken=address;view('assistant');submitChoice('check token '+address);},onDex:address=>{selectedToken=address;view('assistant');submitChoice('Prepare DEX Screener profile for '+address);},onStatus:({result,token,account:owner,hash,error})=>{if(error){const key='error:'+hash;if(key!==lastLaunchStatus){lastLaunchStatus=key;say('Launch status check incomplete: '+error+'. Say “check saved launch” to retry.');}return;}if(!result)return;const key=result.state+':'+hash;if(key===lastLaunchStatus)return;lastLaunchStatus=key;if(result.state==='verified'&&token){void registerSavedLaunch();const body=say('✓ Token launched and verified on Robinhood Chain. Token: '+token+'.');body.parentElement.classList.add('operation-success');const pons=document.createElement('a');pons.href='https://ponsfamily.com/launchpad/'+token;pons.target='_blank';pons.rel='noopener noreferrer';pons.textContent='Open on Pons';const explorer=document.createElement('a');explorer.href='https://robinhoodchain.blockscout.com/token/'+token;explorer.target='_blank';explorer.rel='noopener noreferrer';explorer.textContent='View token';body.append(pons,document.createTextNode(' · '),explorer);}else if(result.state==='reverted')say('The launch failed. No token was confirmed on Robinhood Chain.');else if(result.state==='pending'||result.state==='confirming')say('Launch transaction '+result.state+'. Dinn will continue checking the saved transaction.');}});

function restoreLaunch(){launchActivity.restore();}



for(const f of ['brief-name','brief-symbol','brief-description','launch-tax','launch-buyback','launch-config','launch-pair','launch-recipient','launch-logo',...metadataIds])$(f).addEventListener('input',()=>{invalidateLaunch();saveSettings();renderTokenSummary();});

$('load-configs').onclick=()=>check($('load-configs'),$('launch-feedback'),'/api/pons/readiness',account?{account}:{},r=>{invalidateLaunch();$('launch-config').replaceChildren(new Option('Choose a configuration',''));for(const c of r.configs)$('launch-config').add(new Option(`Config ${c.id} - ${Number(c.supply)/1e18} tokens - ${Number(c.curveFeeBps)/100}% base fee`,c.id));$('launch-tax').max=Number(r.maxCreatorTaxBps)/100;$('launch-feedback').textContent=`Launch fee ${r.launchFee} ETH, plus gas. Creator tax cap ${Number(r.maxCreatorTaxBps)/100}%. ${r.accountCanLaunch===false?'This wallet cannot currently launch on Pons.':''}`;});

function configuration(){if(hasLocalLogo())throw Error(localLogoMessage);if(!account)throw Error('Your account is signed in, but a launch wallet is not connected. Choose Dinn wallet or reconnect your external wallet.');if($('launch-pair').value===''||$('launch-config').value===''||$('launch-tax').value===''||$('launch-buyback').value==='')throw Error('Choose a launch setup, extra trading fee and buyback setting.');const tax=Number($('launch-tax').value)*100;if(Math.abs(tax-Math.round(tax))>0.000001)throw Error('Use at most two decimal places for the extra fee.');const buy=savedPurchase();return {...(buy?{purchase:{amount:buy.amount,slippageBps:buy.slippageBps}}:{}),launchpad:'pons',chainId:4663,name:$('brief-name').value.trim(),symbol:$('brief-symbol').value.trim(),description:$('brief-description').value.trim(),logo:$('launch-logo').value.trim(),socials:currentSocials(),account,creatorFeeRecipient:$('launch-recipient').value.trim(),creatorTaxBps:Math.round(tax),buybackEnabled:$('launch-buyback').value==='true',pairToken:pairAddress($('launch-pair').value),configId:Number($('launch-config').value),salt:'0x'+Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('')};}



async function openLaunchReview(){if(launchBusy)return;if(!account||confirmedLaunchWallet!==account.toLowerCase()){openLaunchWallet();return;}if(hasLocalLogo()){await openLaunchProfile();return;}invalidateLaunch();const generation=epoch,revision=launchRevision;launchBusy=true;$('review-launch').disabled=true;$('launch-feedback').textContent='';showLaunchStage('preparing');try{const c=configuration();const q=await api('/api/pons/review',c);if(generation!==epoch||revision!==launchRevision)return;reviewed={configuration:c,quote:q};renderLaunchReview(c,q);updateApprovalUI();$('launch-review').hidden=false;if(q.purchase?.approvalRequired)say('Your launch buy needs permission to spend the pair token first. Say “approve purchase” to review the exact amount. This permission does not launch your token.');$('launch-feedback').textContent='';showLaunchStage('review');}catch(e){if(epoch===generation){showLaunchStage(null);say('I could not prepare the launch review: '+e.message+' No transaction was sent. Edit the token details in Drafts, then ask me to review the launch again.');}}finally{launchBusy=false;$('review-launch').disabled=false;}};

$('simulate-launch').onclick=async()=>{if(!reviewed||launchBusy)return;const generation=epoch,revision=launchRevision;launchBusy=true;$('simulate-launch').disabled=true;$('approve-launch').hidden=true;const checking=say('Dinn is checking the launch and estimating network fees…');checking?.classList.add('chat-action-pending');checking?.setAttribute('aria-busy','true');try{const p=await api('/api/pons/simulate',reviewed);if(generation!==epoch||revision!==launchRevision)return;prepared=p;const body=say('✓ Launch check passed. Estimated network fee: '+p.estimatedGas+' ETH; the amount may change with network fees. This check is valid for 60 seconds. Would you like me to launch with these terms? Reply “yes” or “approve” to send. '+(walletSource==='embedded'?'Dinn will submit from your Dinn wallet.':'Your external wallet will ask you to confirm.')); body.parentElement.classList.add('operation-success');}catch(e){if(epoch===generation)say('Launch check could not complete: '+e.message+' No transaction was sent.');}finally{checking?.classList.remove('chat-action-pending');checking?.removeAttribute('aria-busy');launchBusy=false;$('simulate-launch').disabled=false;}};

$('approve-launch').onclick=async()=>{if(!prepared||!reviewed||launchBusy)return;const generation=epoch,revision=launchRevision,frozen=reviewed,original=prepared,pendingKey=launchKey();launchBusy=true;$('approve-launch').disabled=true;try{if(!provider||!['embedded','external'].includes(walletSource)||walletSource==='embedded'&&!walletSendTransaction)throw Error('Your selected launch wallet is not ready. Reconnect it, then review the launch again.');const fresh=await api('/api/pons/simulate',frozen);if(generation!==epoch||revision!==launchRevision)return;if(fresh.transaction.data!==original.transaction.data||fresh.transaction.value!==original.transaction.value)throw Error('Launch terms changed. Review again.');const {requestPonsLaunch}=await import('/pons/entry.js');const record=await requestPonsLaunch({prepared:fresh,configuration:frozen.configuration,provider,sendTransaction:walletSource==='embedded'?walletSendTransaction:null,address:frozen.configuration.account,source:walletSource||'unavailable',storage:localStorage,key:pendingKey,isCurrent:()=>epoch===generation&&launchRevision===revision,withLock:navigator.locks?fn=>navigator.locks.request('dinn-wallet:'+frozen.configuration.account.toLowerCase(),fn):null});if(epoch===generation){restoreLaunch();showLaunchStage(null);$('simulation-status').textContent=record.phase==='rejected'?'Wallet request declined.':record.hash?'Launch sent. Dinn is checking network confirmation.':'Wallet result is uncertain. Check wallet activity before trying again.';say($('simulation-status').textContent);if(record.hash){const body=say('Launch sent. Dinn is checking network confirmation.');const link=document.createElement('a');link.href='https://robinhoodchain.blockscout.com/tx/'+record.hash;link.target='_blank';link.rel='noopener noreferrer';link.textContent='View transaction';body.append(link);}if(record.storageWarning)say('Recovery storage failed. Save the transaction hash: '+(record.hash||'unavailable'));prepared=null;$('approve-launch').hidden=true;}}catch(e){if(epoch===generation){$('simulation-status').textContent=e.message;say(e.message);}}finally{launchBusy=false;$('approve-launch').disabled=false;}};





﻿let launchStep=null;

const economicFields=[['launch-pair','Trading pair'],['launch-config','Launch setup'],['launch-tax','Extra trading fee'],['launch-buyback','Buybacks'],['launch-recipient','Fee recipient']];

function currentSettings(){const s={};try{s.socials=currentSocials();}catch{}if($('launch-pair').value){try{s.pairToken=pairAddress($('launch-pair').value);}catch{}}if($('launch-config').value!=='')s.configId=Number($('launch-config').value);if($('launch-tax').value!=='')s.creatorTaxBps=Math.round(Number($('launch-tax').value)*100);if($('launch-buyback').value!=='')s.buybackEnabled=$('launch-buyback').value==='true';if($('launch-recipient').value)s.creatorFeeRecipient=$('launch-recipient').value;return s;}

function saveSettings(){if(user)save('pons-settings',{values:Object.fromEntries([...economicFields.map(v=>v[0]),'launch-logo',...metadataIds].map(k=>[k,$(k).value])),launchStep});}

function restoreSettings(){let saved;try{saved=JSON.parse(read('pons-settings'));}catch{}for(const k of [...economicFields.map(v=>v[0]),'launch-logo',...metadataIds]){const v=typeof saved?.values?.[k]==='string'?saved.values[k]:'';if(k==='launch-config'&&v&&!Array.from($(k).options).some(o=>o.value===v))$(k).add(new Option('Config '+v+' (recheck at review)',v));$(k).value=v;}launchStep=economicFields.some(([k])=>k===saved?.launchStep)?saved.launchStep:null;}



function renderTokenSummary(){const has=Object.keys(brief).length>0||!!awaiting;$('summary-panel').hidden=!has;$('token-name').textContent=brief.name||'Untitled token';$('token-avatar').textContent=brief.symbol?.slice(0,2)||'-';$('token-meta').textContent=brief.symbol?'$'+brief.symbol:'';const rows=[['brief-name','Token name',brief.name],['brief-symbol','Ticker',brief.symbol],['brief-description','Description',brief.description],...economicFields.map(([id,label])=>[id,label,$(id).value||undefined])];const count=rows.filter(r=>r[2]!==undefined).length;$('progress').value=count;$('progress-label').textContent=count+' of 8 settings';$('summary').replaceChildren();for(const [id,label,value] of rows){const row=document.createElement('div');row.className='summary-row';const name=document.createElement('span');name.textContent=label;const button=document.createElement('button');button.textContent=value===undefined?'Not set':id==='launch-pair'?(pairCandidates.find(a=>a.address.toLowerCase()===value?.toLowerCase())?.symbol||value):id==='launch-tax'?value+'%':id==='launch-buyback'?(value==='true'?'Enabled':'Disabled'):value||'None';button.title=button.textContent;button.setAttribute('aria-label','Edit '+label);button.onclick=()=>{view('assistant');if(id.startsWith('brief-')){awaiting=id.slice(6);launchStep=null;setupActive=true;submitChoice('I want to change '+({name:'name',symbol:'ticker',description:'description'})[awaiting]);}else{awaiting=null;launchStep=id;askEconomic();}$('prompt').focus();};row.append(name,button);$('summary').append(row);}$('chat-review').disabled=count!==8;$('summary-note').textContent=count===8?'Next: add optional logo and links, then review.':'Complete your settings in chat to review.';}

function submitChoice(text){$('prompt').value=text;$('chat').requestSubmit();}
function renderSetupChoices(){$('choices').replaceChildren();$('choices').hidden=true;$('setup-context').textContent='';$('setup-context').hidden=true;}
function askEconomic(){submitChoice('I want to change '+(economicFields.find(([k])=>k===launchStep)?.[1]||'my launch settings'));}
$('welcome-launchpads').onclick=()=>view('launches');$('summary-profile').textContent='Logo & social links';$('summary-profile').onclick=$('attach-details').onclick=openLaunchProfile;$('new-launch').textContent='Continue setup';$('new-launch').onclick=()=>{view('assistant');submitChoice('resume setup');};$('close-review').onclick=()=>showLaunchStage(null);



$('cancel-reset-draft').onclick=()=>$('reset-draft-dialog').hidden=true;
$('delete-draft').onclick=()=>{$('reset-draft-dialog').hidden=false;$('reset-draft-dialog').scrollIntoView({block:'nearest'});};

$('confirm-reset-draft').onclick=()=>{try{requestedSupply=null;save('opening-purchase',null);save('logo-local-choice',null);save('logo-original',null);save('pons-brief',{launchpad:'pons',chainId:4663});save('pons-settings',{values:{},launchStep:null});for(const id of [...economicFields.map(v=>v[0]),'launch-logo',...metadataIds])$(id).value='';launchStep=null;if(!clearConversation())return;brief={};awaiting=null;restoreSettings();syncBrief();$('brief-status').textContent='';$('reset-draft-dialog').hidden=true;say('Token setup and chat cleared. Saved transaction records are kept.');}catch{say('Browser storage is unavailable. The draft was not reset.');}};

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

 requestedSupply=d.requestedSupply||null;brief=nextBrief;awaiting=nextAwaiting;setupActive=d.active;restoreSettings();launchPair=d.pair||launchPair;syncBrief();renderSetupChoices();

}

function appendChatActionNote(body,text,{success=false,pending=false,hash,chainId=4663}={}){
 const p=document.createElement('p');p.textContent=text;if(success)p.className='operation-success';if(pending)p.classList.add('chat-action-pending');body.append(p);
 const explorers={4663:'https://robinhoodchain.blockscout.com',8453:'https://basescan.org',42161:'https://arbiscan.io'};if(hash&&/^0x[0-9a-f]{64}$/i.test(hash)&&explorers[chainId]){const a=document.createElement('a');a.href=explorers[chainId]+'/tx/'+hash;a.target='_blank';a.rel='noopener noreferrer';a.textContent='View transaction';body.append(a);}
 const i=history.findLastIndex(m=>m.role==='assistant');if(i>=0){history[i].content+='\n\n'+text;try{save('chat',{messages:history,results:chatResults});}catch{}}
 scrollChat();return p;
}
async function approveWalletFromChat(action,body){
 let pendingNote;try{
  const review=action.review;if(!review)throw Error('This review is unavailable. Ask Dinn to check the action again.');if(!walletUI)throw Error('Your wallet is not ready. Reconnect it, then ask Dinn to review the action again.');pendingNote=appendChatActionNote(body,walletSource==='embedded'?'Dinn is submitting from your Dinn wallet…':'Waiting for your external wallet confirmation…',{pending:true});const record=await walletUI.approveChat(review);
  if(record.state==='rejected'){pendingNote.classList.remove('chat-action-pending');appendChatActionNote(body,'Wallet request declined. Nothing was sent.');return;}
  if(!record.hash){pendingNote.classList.remove('chat-action-pending');appendChatActionNote(body,'Wallet result is uncertain. Check wallet activity before asking Dinn to review it again.');return;}
  pendingNote.textContent='Sent on '+({4663:'Robinhood Chain',8453:'Base',42161:'Arbitrum'}[review.chainId]||'the selected network')+'. Waiting for confirmation.';
  if(record.networkWarning)appendChatActionNote(body,'Your wallet could not return to its previous network. Switch it back manually before your next action.');if(record.storageWarning)appendChatActionNote(body,'Save this transaction hash: '+record.hash);
  const actionEpoch=epoch,actionAccount=account;let attempts=0;const clearPending=()=>pendingNote.classList.remove('chat-action-pending');
  const check=async()=>{if(epoch!==actionEpoch||account!==actionAccount)return;try{
   const endpoint=review.kind==='send'?'/api/robinhood/wallet/receipt':review.kind==='burn'?'/api/pons/burn/receipt':['pons-approval','pons-buy','pons-sell'].includes(review.kind)?'/api/pons/trade/receipt':'/api/robinhood/route/status',result=await api(endpoint,{hash:record.hash,review});if(epoch!==actionEpoch||account!==actionAccount)return;if(result.hash?.toLowerCase()!==record.hash.toLowerCase()){clearPending();appendChatActionNote(body,'The returned status did not match this transaction. Ask Dinn to check it again.');return;}
   if(result.state==='verified'&&review.kind==='burn'){clearPending();appendChatActionNote(body,'\u2713 Burn confirmed: '+result.amount+' '+result.symbol+' removed. Supply fell from '+result.supplyBefore+' to '+result.supplyAfter+' (at least '+result.supplyDecreaseAtLeast+' since review).',{success:true,hash:record.hash,chainId:review.chainId});return;}if(result.state==='verified'&&review.kind==='pons-approval'){clearPending();appendChatActionNote(body,'\u2713 Exact token approval confirmed for '+result.amount+' '+result.asset+'. No trade was placed; ask Dinn to check the quote again.',{success:true,hash:record.hash,chainId:review.chainId});return;}if(result.state==='verified'&&['pons-buy','pons-sell'].includes(review.kind)){clearPending();appendChatActionNote(body,'\u2713 '+(review.tradeSide==='buy'?'Bought ':'Sold ')+result.amount+' '+result.symbol+' on the Pons bonding curve.',{success:true,hash:record.hash,chainId:review.chainId});return;}if(result.state==='verified'&&review.ponsTradeKind){clearPending();appendChatActionNote(body,'\u2713 '+(review.ponsTradeKind==='buy'?'Bought ':'Sold ')+review.expectedAmount+' '+review.outputAsset.symbol+' through the graduated Pons pool.',{success:true,hash:result.destinationHash||record.hash,chainId:review.destinationChainId||review.chainId});return;}if(result.state==='verified'){clearPending();appendChatActionNote(body,review.kind==='send'?'✓ Transfer confirmed on '+({4663:'Robinhood Chain',8453:'Base',42161:'Arbitrum'}[review.chainId]||'the selected network')+'.':review.kind==='bridge'?'✓ Funds received on Robinhood Chain.':'✓ Swap completed on '+({4663:'Robinhood Chain',8453:'Base',42161:'Arbitrum'}[review.destinationChainId]||'the destination network')+'.',{success:true,hash:result.destinationHash||record.hash,chainId:result.destinationHash?(result.refundChainId||review.destinationChainId||4663):review.chainId});return;}
   if(result.state==='refunded'){clearPending();appendChatActionNote(body,'✓ Refund confirmed. Network and provider fees may have been deducted.',{success:true,hash:result.destinationHash,chainId:result.refundChainId||review.chainId});return;}
   if(result.state==='reverted'){clearPending();appendChatActionNote(body,review.kind==='burn'?'The burn failed. No tokens were removed.':['pons-approval','pons-buy','pons-sell'].includes(review.kind)?'The Pons action failed. No approval or trade was confirmed.':'The transfer failed. No funds were sent.',{hash:record.hash,chainId:review.chainId});return;}
   if(result.state==='refund-reported'||result.needsRecovery){clearPending();appendChatActionNote(body,result.message||'This transfer needs another step. Check its status before trying again.');return;}
   if(attempts++<18){setTimeout(check,10000);return;}clearPending();appendChatActionNote(body,'Confirmation is still pending. Ask Dinn to check this transaction again.');
  }catch(error){if(epoch===actionEpoch&&account===actionAccount){clearPending();appendChatActionNote(body,'Could not verify the transaction status yet. No additional transaction was sent. '+error.message);}}};setTimeout(check,2500);
 }catch(error){pendingNote?.classList.remove('chat-action-pending');appendChatActionNote(body,error.message||'Wallet approval could not be completed.');}
}
function renderToolResult(body,result){

 renderAssistantText(body,result.message);

 if(result.tokenState){const extra=document.createElement('p');extra.className='research-transcript';extra.textContent=['Token: '+result.tokenState.address,'Fee recipient: '+result.tokenState.feeRecipient,'Fees shown for: '+result.tokenState.viewerAccount,'Checked at block '+result.tokenState.blockNumber+' · '+result.tokenState.checkedAt,result.tokenState.claimScope].filter(Boolean).join('\n');body.append(extra);}
 if(result.tokenAddress&&/^0x[0-9a-f]{40}$/i.test(result.tokenAddress))selectedToken=result.tokenAddress;

 for(const a of result.actions||[]){if(a.id==='wallet_approve'){const kind=a.review?.kind||'wallet';chatPendingApproval={label:({send:'transfer',bridge:'bridge',swap:'swap',burn:'burn','pons-approval':'token approval','pons-buy':'token buy','pons-sell':'token sell'}[kind]||'wallet action'),action:a,run:body=>approveWalletFromChat(a,body)};continue;}if(a.id==='claim'){void openFeeClaim(a.address);continue;}if(a.id==='pinklock'){const link=document.createElement('a');link.className='inline-link';link.href='https://www.pinksale.finance/pinklock/create';link.target='_blank';link.rel='noopener noreferrer';link.textContent='Create a lock or vesting schedule on PinkSale';body.append(document.createTextNode(' '),link);continue;}if(a.id==='dex'&&a.address){try{const link=document.createElement('a');link.className='inline-link';link.href=dexCheckoutFor(a.address);link.target='_blank';link.rel='noopener noreferrer';link.textContent='Pay for a DEX Screener profile';body.append(document.createTextNode(' '),link);if(a.preparation?.profile){const content=profileText(a.preparation.profile);const pre=document.createElement('pre');pre.className='research-transcript';pre.textContent=content;body.append(pre);}}catch{}}}
 if((result.actions||[]).some(a=>a.id==='review')&&$('chat-review').disabled){view('assistant');queueMicrotask(()=>submitChoice('resume setup'));}
 if((result.actions||[]).some(a=>['new_setup','resume_setup'].includes(a.id))){view('assistant');launchReturnPending=true;return;}
 if((result.actions||[]).some(a=>a.id==='launch')){view('assistant');queueMicrotask(()=>submitChoice('resume setup'));}
 if((result.actions||[]).some(a=>a.id==='launchpads'))view('launches');

 if(result.inspection){const transcript=document.createElement('div');renderInspection(transcript,result.inspection,{restored:!!result.restored});transcript.querySelectorAll('button,.inspection-controls').forEach(b=>b.remove());const evidence=document.createElement('p');evidence.className='research-transcript';evidence.textContent=[...transcript.children].map(el=>el.innerText||el.textContent).filter(Boolean).join('\n\n').trim();body.append(evidence);for(const source of result.inspection.sources||[]){try{const link=document.createElement('a');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=source.label;body.append(document.createTextNode(' '),link);}catch{}}body.scrollIntoView({block:'start',behavior:'instant'});}else scrollChat();

}

function renderToolDirectory(capabilities){
 const host=$('tool-directory');host.replaceChildren();const prompts={launch:'I want to launch',inspect:'Research a token',balance:'Check my ETH balance on Robinhood Chain',transaction:'Check a transaction',options:'Show current Pons launch options',lock:'Check locked supply or vesting',burn:'Burn Pons tokens',buy:'Buy a Pons token',sell:'Sell a Pons token',claim:'Check my claimable Pons fees',transfer:'Send tokens',fund:'Bridge funds',swap:'Swap assets',portfolio:'Check my wallet portfolio',dex:'Pay for a DEX Screener profile'};
 const copy={launch:'Plan a token launch on Pons. Dinn checks the current launch options and cost; your wallet approves the final transaction.',inspect:'See when a token launched, its trading activity and fees, what large wallets have bought or sold, and any matching PinkLock lock or vesting records. Some data may be missing. This is research, not a safety guarantee.',balance:'Ask for one asset on Robinhood Chain, Base or Arbitrum. Change the network or token in chat.',transaction:'See whether a Robinhood Chain transaction succeeded or failed. A status check does not prove what the transaction did.',options:'See which Pons launch settings are currently enabled, including supply and fees.',lock:'Use PinkSale to create a token lock or release schedule. Dinn can check supported PinkLock records on Robinhood Chain, but cannot create the lock or check every locking service.',burn:'Remove eligible Pons tokens from supply after reviewing the amount and approving it in your wallet. Other tokens are not supported.',buy:'Buy a token while it is on its launch curve, or from an exchange pool after it leaves the curve when that option is available. Dinn shows the price, fees and minimum amount you will get before wallet approval.',sell:'Sell a token while selling is open on its launch curve, or from an exchange pool after it leaves the curve when that option is available. The shown price is an estimate; the final result can differ.',claim:'Check and collect fees available to your wallet. Dinn shows separately any fees that have not been sent to it yet.',transfer:'Send ETH or tokens on Robinhood Chain; send ETH, USDC or USDT on Base and Arbitrum. Review the recipient and network before approval.',fund:'Bridge ETH, USDC or USDT from Base or Arbitrum to Robinhood Chain. Dinn checks both the source payment and destination delivery.',swap:'Swap assets when an option is available. Base and Arbitrum support ETH, USDC and USDT; Robinhood Chain choices depend on what can be traded.',portfolio:'View token balances across a network with estimated USD values. Some tokens or prices may be missing.',dex:'Dinn prepares your project details and a checkout link. Review the current price, then pay DEX Screener directly.'};
 const groups=[['Tokens and launches',['inspect','lock','buy','sell','burn','launch','options','claim','dex']],['Wallet',['portfolio','balance','transfer','fund','swap','transaction']]],labels={'wallet-approval':'Confirm in wallet','read-only':'Check only','unavailable':'Not available','coming-soon':'Coming soon','external-checkout':'Open external site'};
 for(const [title,ids]of groups){const heading=document.createElement('h3');heading.className='tool-group-title';heading.textContent=title;host.append(heading);for(const id of ids){const c=(capabilities||{})[id];if(!c)continue;const item=document.createElement('article');item.className='tool-item';const badge=document.createElement('span');badge.className='capability-status '+String(c.status||'').replace(/[^a-z-]/g,'');badge.textContent=labels[c.status]||'Check with Dinn';const h=document.createElement('h3');h.textContent=({launch:'Launch a token',inspect:'Research a token',balance:'Check one token balance',transaction:'Check a transaction',options:'Pons launch options',lock:'Create or check a token lock',burn:'Burn tokens',buy:'Buy a Pons token',sell:'Sell a Pons token',claim:'Collect Pons fees',transfer:'Send tokens',fund:'Bridge funds',swap:'Swap assets',portfolio:'View all wallet balances',dex:'Pay for a DEX Screener profile'})[id]||c.title;const p=document.createElement('p');p.textContent=copy[id]||c.description;item.append(badge,h,p);if(id==='lock'){const a=document.createElement('a');a.href='https://www.pinksale.finance/pinklock/create';a.target='_blank';a.rel='noopener noreferrer';a.textContent='Create on PinkSale';item.append(a);}if(prompts[id]){const b=document.createElement('button');b.className='subtle';b.textContent=id==='dex'?'Ask Dinn to prepare payment':id==='lock'?'Ask Dinn to check a token':'Ask Dinn';b.onclick=()=>{view('assistant');submitChoice(prompts[id]);};item.append(b);}host.append(item);}}
}
let selectedAgentMarketplace=null;
function renderAgentAccess(manifest,checking=false){
 const root=$('agent-access-view'),cards=$('agent-marketplace'),detail=$('agent-service-directory'),boundary=root.querySelector('.agent-boundary'),guide=root.querySelector(':scope > .agent-note'),market=manifest?.marketplace,priceValue=Number(market?.pricePerCallUsd),live=market?.status==='live'&&market?.listingUrl==='https://market.near.ai/a/dinn'&&Number.isFinite(priceValue)&&priceValue>0,listing=live?market.listingUrl:'https://market.near.ai/a/dinn',services=Array.isArray(manifest?.services)?new Set(manifest.services):new Set();
 root.querySelector('h2').textContent='Dinn services on agent marketplaces';root.querySelector('h2').nextElementSibling.textContent='Choose a marketplace to see what agents can use there.';cards.className='agent-marketplace-grid';detail.hidden=true;boundary.hidden=true;guide.hidden=true;
 const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
 function showOverview(){selectedAgentMarketplace=null;cards.hidden=false;detail.hidden=true;boundary.hidden=true;guide.hidden=true;}
 function showDetail(kind){selectedAgentMarketplace=kind;cards.hidden=true;detail.hidden=false;boundary.hidden=false;guide.hidden=false;detail.replaceChildren();const head=el('div','agent-service-head');const back=el('button','agent-back','Back to marketplaces');back.type='button';back.onclick=showOverview;head.append(back);detail.append(head);
  if(kind==='near'){
   const title=el('h2',null,'NEAR AI Agent Market');const status=el('span','badge '+(live?'wallet-approval':''),live?'Live listing':checking?'Checking listing':'Listing status unavailable');const intro=el('p',null,'One sourced token research report and one refresh for the same token.');const price=el('p','agent-market-price',live?'$'+market.pricePerCallUsd+' per call':checking?'Checking current listing details.':'Listing availability and price could not be checked.');const link=el('a','subtle','Open Dinn on NEAR');link.href=listing;link.target='_blank';link.rel='noopener noreferrer';const meta=el('div','agent-market-detail-meta');meta.append(status,price,link);detail.append(title,intro,meta);
   if(!live){detail.append(el('p','agent-service-empty',checking?'Checking the live listing now.':'Live listing details are unavailable right now. The service list will appear after Dinn verifies the listing.'));return;}
   const items=[{title:'Token research',ids:['token.research','token.inspect'],body:'See when a token launched, how much was traded during its Pons launch, trading fees, what the largest holders bought or sold, basic contract checks, and supported PinkLock locks or vesting. Source links and notes about missing data are included.',note:'Dinn does not buy or sell tokens. No matching lock record does not mean the tokens are unlocked.'},{title:'Wallet balances',ids:['wallet.balances'],body:'Check ETH and supported token balances on Robinhood Chain, Base or Arbitrum for any address you provide.',note:'An address does not prove that you own the wallet.'},{title:'Pons launch options',ids:['launch.options'],body:'Check current Pons launch settings and whether a wallet can launch.',note:'Checked on Robinhood Chain.'},{title:'Swap and bridge quotes',ids:['swap.quote','bridge.quote'],body:'Get estimated swap choices or a bridge quote from Base or Arbitrum to Robinhood Chain for supported assets.',note:'Quotes show costs only. They do not send money or ask you to approve a transaction.'}];
   for(const item of items){if(!item.ids.some(id=>services.has(id)))continue;const card=el('article','agent-service-card');card.append(el('h3',null,item.title),el('p',null,item.body),el('small',null,item.note));detail.append(card);}
  }else{
   detail.append(el('span','badge agent-coming-soon','Coming soon'),el('h2',null,'OKX AI Marketplace'),el('p',null,'Dinn is not available through OKX AI yet. These are planned service areas, not callable integrations.'),el('p','agent-market-price','Marketplace availability and requirements are still being evaluated.'));
   for(const [title,body] of [['Token research','Token launch date, trading activity and fees, largest-holder buys or sells, contract checks, and supported PinkLock lock or vesting records.'],['Wallet balances','Supported token balances and trading activity for an address you provide.'],['Swap and bridge estimates','Estimated swap or bridge prices where available. These do not move funds.']]){const card=el('article','agent-service-card planned');card.append(el('span','planned-label','Planned'),el('h3',null,title),el('p',null,body));detail.append(card);}
  }
 }
 cards.replaceChildren();
 function marketCard(title,badge,description,meta,kind){const button=el('button','agent-market-card');button.type='button';const icon=el('img','agent-market-icon');icon.src='/brand/'+kind+'.png';icon.alt='';icon.width=30;icon.height=30;button.append(icon,el('span','agent-market-card-status '+(kind==='near'&&live?'live':''),badge),el('strong',null,title),el('span','agent-market-card-description',description),el('span','agent-market-card-meta',meta),el('span','agent-market-card-action','View services  →'));button.onclick=()=>showDetail(kind);cards.append(button);}
 marketCard('NEAR AI Agent Market',live?'Live listing':checking?'Checking listing':'Listing status unavailable','Token research and wallet or swap checks for agents.',live?'$'+market.pricePerCallUsd+' per call':checking?'Checking current listing':'Listing state could not be checked','near');marketCard('OKX AI Marketplace','Coming soon','Planned marketplace access for Dinn services.','Not available yet','okx');if(selectedAgentMarketplace)showDetail(selectedAgentMarketplace);
}

startAuthBootTimer();try{const [config,status]=await Promise.all([fetch('/api/auth/config').then(r=>r.json()),fetch('/api/status').then(r=>r.json())]);draftSync.configure(status.draftSyncEnabled);renderToolDirectory(status.capabilities);renderAgentAccess(null,true);fetch('/.well-known/dinn.json').then(r=>r.ok?r.json():null).then(data=>renderAgentAccess(data,false)).catch(()=>renderAgentAccess(null,false));if(status.legalLinks){$('terms-link').href=status.legalLinks.terms;$('privacy-link').href=status.legalLinks.privacy;}const {mountRobinhoodWallet}=await import('/pons/entry.js');walletUI=mountRobinhoodWallet({api,getAccount:()=>account,getProvider:()=>provider,getSendTransaction:()=>walletSource==='embedded'?walletSendTransaction:null,getWalletSource:()=>walletSource,getEpoch:()=>epoch,onSwitch:(value,restored)=>{walletNetworkBusy=value;if(!value&&restored)window.dispatchEvent(new CustomEvent('dinn:wallet-network-restored'));}});const {mountEmbeddedAuth}=await import('/auth/entry.js');mountEmbeddedAuth($('embedded-auth'),config,$('account-controls'));}catch{clearAuthBootTimer();authBootResolved=true;$('session-loading').hidden=true;$('auth-gate').hidden=false;$('embedded-auth').replaceChildren();const note=document.createElement('p');note.textContent='Sign-in could not connect. Your saved drafts are still here.';const retry=document.createElement('button');retry.className='social-login';retry.textContent='Retry sign-in';retry.onclick=()=>location.reload();$('embedded-auth').append(note,retry);}


launchesView=mountDinnLaunches({host:$('launches-view'),getAccessToken:async()=>{const {getAccessToken}=await import('/auth/entry.js');return getAccessToken();},onStart:()=>{view('assistant');submitChoice('create a token');},onResearch:address=>{selectedToken=address;view('assistant');submitChoice('check token '+address);}});
let launchesOwner=user;window.addEventListener('launchflow:auth',event=>{const detail=event.detail||{},next=detail.authenticated?(detail.userId||detail.address):null;if(next!==launchesOwner){launchesView?.reset();launchesOwner=next;}});
