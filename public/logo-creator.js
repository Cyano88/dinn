export function mountLogoCreator({host,getContext,onAccept,onDiscard}){

 const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};

 const box=el('section',null,'logo-creator');box.hidden=true;

 const title=el('h3','Create with Dinn'),intro=el('p','A logo inspired by your token.');

 const label=el('label','Describe the style (optional)'),style=el('textarea');style.id='logo-style';label.htmlFor=style.id;style.maxLength=700;style.rows=3;style.placeholder='Colours, symbol, mood, or a change to the preview…';

 const generate=el('button','Create preview','subtle'),refine=el('button','Revise preview','subtle'),accept=el('button','Use this logo','primary'),discard=el('button','Keep my existing logo','subtle');

 for(const b of [generate,refine,accept,discard])b.type='button';

 const recover=el('button','Check saved request','subtle');recover.type='button';

 const status=el('p');status.id='logo-generation-status';status.setAttribute('role','status');

 const image=el('img');image.alt='Generated token logo preview';image.width=256;image.height=256;image.hidden=true;

 const download=el('a','Download PNG','subtle');download.download='token-logo.png';download.hidden=true;

 const more=el('details',null,'logo-more'),moreTitle=el('summary','More options');more.append(moreTitle);const info=el('p',null,'logo-model-info'),actions=el('div',null,'logo-actions');actions.append(accept,generate,discard,recover);more.append(refine,download,info);

 box.append(title,intro,label,style,image,actions,status,more);host.prepend(box);

 let epoch=0,candidate=null,pending=null,timer=null,busy=false,config=null,contextKey='';

 const identity=c=>JSON.stringify([c.user,c.name,c.symbol,c.description]);

 const key=c=>'dinn.logo.preview.v1:'+identity(c);

 async function api(path,data={}){const {getAccessToken}=await import('/auth/entry.js');if(!getAccessToken)throw Error('Sign in again to create a logo.');const token=await getAccessToken();if(!token)throw Error('Sign in again to create a logo.');const r=await fetch('/api/logos/'+path,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(data),signal:AbortSignal.timeout(15000)});const result=await r.json();if(!r.ok)throw Error(result.error||'Logo request failed.');return result;}

 const current=(run,c)=>run===epoch&&identity(getContext())===identity(c);

 function buttons(){label.hidden=style.hidden=!!candidate?.preview;generate.textContent=candidate?.preview?'Try another':'Create preview';accept.textContent=candidate?.accepted?'Logo selected':'Use this logo';recover.hidden=!pending&&candidate?.state!=='uncertain';recover.disabled=busy;generate.disabled=busy||!!pending;refine.hidden=!candidate?.preview||!config?.supportsReference;refine.disabled=busy;accept.hidden=!candidate?.preview;accept.disabled=busy||!!candidate?.accepted;discard.hidden=!candidate&&!pending;discard.disabled=busy||!!pending;}

 function show(result){candidate=result;image.hidden=!result.preview;if(result.preview){image.src=result.preview;download.href=result.preview;download.hidden=false;}else{image.removeAttribute('src');download.hidden=true;}buttons();}

 async function poll(id,run,c){

  try{const result=await api('get',{id});if(!current(run,c))return;

   if(result.state==='generating'){status.textContent='Creating your preview. You can close this step and return later.';timer=setTimeout(()=>poll(id,run,c),2500);return;}

   busy=false;pending=null;if(result.accepted&&result.url)await onAccept(result);if(!current(run,c))return;show(result);status.textContent=result.accepted&&result.url?'Logo selected. It will be included when you review your launch.':result.state==='ready'?'Select this logo or try another.':result.error||'The result is uncertain. Check before trying again.';

  }catch(error){if(current(run,c)){busy=false;if(error.message==='Logo not found.'){pending=null;candidate=null;localStorage.removeItem(key(c));buttons();status.textContent='No saved generation was found for this account. You can create a new preview.';}else{buttons();status.textContent=error.message+' Your request is saved; reopen this step to check it before retrying.';}}}

 }

 async function start(useReference){

  const c=getContext(),run=epoch;if(busy)return;if(!c.name||!c.symbol){status.textContent='Add your token name and ticker first.';return;}

  const data={requestId:crypto.randomUUID(),name:c.name,symbol:c.symbol,description:c.description||'',style:style.value.trim(),...(useReference&&candidate?.id?{referenceId:candidate.id}:{})};

  busy=true;pending=data.requestId;buttons();status.textContent='Creating your preview…';

  // Save before sending so a lost connection can recover the same charged request.

  try{localStorage.setItem(key(c),JSON.stringify({id:data.requestId,data}));const result=await api('generate',data);if(!current(run,c))return;await poll(result.id,run,c);}

  catch(error){if(current(run,c)){busy=false;buttons();status.textContent=error.message+' No logo has been replaced.';}}

 }

 recover.onclick=()=>{const id=pending||candidate?.id;if(!id)return;busy=true;buttons();void poll(id,epoch,getContext());};

 generate.onclick=()=>start(false);refine.onclick=()=>start(true);

 accept.onclick=async()=>{const c=getContext(),run=epoch,id=candidate?.id;if(!id||busy)return;busy=true;buttons();try{const result=await api('accept',{id});if(!current(run,c))return;await onAccept(result);show(result);status.textContent=result.url?'Logo selected. It will be included when you review your launch.':'Saved for this local test. To launch with it, download the PNG under More options and provide a public image URL.';}catch(error){if(current(run,c))status.textContent=error.message;}finally{if(current(run,c)){busy=false;buttons();}}};

 discard.onclick=()=>{clearTimeout(timer);epoch++;busy=false;candidate=null;pending=null;image.hidden=true;download.hidden=true;localStorage.removeItem(key(getContext()));onDiscard();status.textContent='Your existing logo is unchanged.';buttons();};

 async function open(){

  const c=getContext();clearTimeout(timer);const run=++epoch;busy=false;candidate=null;pending=null;image.hidden=true;download.hidden=true;contextKey=identity(c);box.hidden=true;buttons();

  try{config=await api('config');if(!current(run,c)||!config.enabled||!config.eligible)return;box.hidden=false;title.textContent='Create with Dinn';info.textContent='Powered by 0G · '+config.model+' · Up to '+config.dailyLimit+' previews per day. Each new preview uses your allowance.';

   let saved;try{saved=JSON.parse(localStorage.getItem(key(c)));}catch{}

   status.textContent=config.publicHosting?'Only your accepted logo becomes public.':'Local testing: previews are saved on this PC. Public launch URLs become available after deployment.';

   if(saved?.id){busy=true;pending=saved.id;buttons();await poll(saved.id,run,c);if(current(run,c)&&candidate?.preview)await image.decode().catch(()=>{});}

  }catch(error){if(current(run,c)){box.hidden=false;status.textContent=error.message;generate.disabled=true;}}

 }

 function reset(){clearTimeout(timer);epoch++;busy=false;candidate=null;pending=null;box.hidden=true;image.removeAttribute('src');download.removeAttribute('href');style.value='';}

 return {open,reset,isPending:()=>busy||!!pending,accept:()=>accept.click(),discard:()=>discard.click(),create:description=>{if(config?.enabled&&config?.eligible){style.value=description;void start(false);}else status.textContent='Logo creation is unavailable for this account.';},hasUnselected:()=>!!pending||busy||!!candidate?.preview&&!candidate.accepted};

}

