import {mountLogoCreator} from './logo-creator.js';
export const logoPrompt='Would you like a logo for this token? Say “create a logo”, paste a public image link, or say “skip logo”.';
export const sitePrompt='Have a project website? Paste its link. If you want Dinn to build one, say “create a website”. You can also say “skip website”.';
export function assetCommand(step,text){
 const t=text.trim();
 if(/^(?:cancel|pause setup)$/i.test(t))return {kind:'pause'};
 const skip=t.match(/^skip(?: (?:the |my )?(logo|website))?[.!]?$/i);
 if(skip&&(!skip[1]||skip[1].toLowerCase()===step))return {kind:'skip'};
 if(/^(?:https:|ipfs:)/i.test(t)){
  try{const u=new URL(t);if(!u.hostname||u.username||u.password||t.length>2048)throw Error();return {kind:'url',url:t};}catch{return {kind:'invalid'};}
 }
 if(step==='logo'){
  if(/^(?:use|accept) (?:this |the )?logo[.!]?$/i.test(t))return {kind:'accept'};
  const m=t.match(/^(?:create|generate|make) (?:a |another |my )?logo\b[ :,-]*(.*)$/i);
  if(m)return {kind:'generate',style:m[1]};
 }else{
  if(/^(?:use|publish) (?:this |the |my )?(?:site|website|page)[.!]?$/i.test(t))return {kind:'publish'};
  if(/^show (?:my |the )?preview[.!]?$/i.test(t))return {kind:'saved'};
  const m=t.match(/^(?:build|create|make) (?:a |my )?(?:website|site|web page)\b[ :,-]*(.*)$/i);
  if(m)return {kind:'preview',style:m[1]};
  const rev=t.match(/^revise (?:site|website|page):\s*(.+)$/i);
  if(rev)return {kind:'revise',style:rev[1]};
 }
 return null;
}

export function createBaseAssets({say,reply,records,context,websiteRequest}){
 let project,key,logo,busy=false,generation=0;
 const active=()=>project&&context().owner===project.owner&&context().epoch===project.epoch;
 const load=()=>JSON.parse(records.getItem(key)||'{"step":"logo","image":"","website":""}');
 const save=async state=>records.setItem(key,JSON.stringify(state));
 const reset=()=>{generation++;logo?.reset();logo=null;project=null;busy=false;};
 function bind(next){
  const id='dinn.multi.base-assets.v1:'+JSON.stringify([next.owner,next.ticker,next.name,next.symbol,next.source]);
  if(id===key&&active())return;
  reset();project=next;key=id;
 }
 async function handle(text,start){
  if(!active())return false;
  let state=load();
  if(state.step==='ready')return false;
  if(!state.started){if(!start)return false;await save({...state,started:true});reply(text,state.step==='website'?sitePrompt:logoPrompt);return true;}
  const run=generation,current=()=>run===generation&&active();
  const advance=async(url)=>{
   if(!current())return;
   if(state.step==='logo'){await save({...state,image:url,step:'website'});if(current())say(sitePrompt);}
   else{await save({...state,website:url,step:'ready'});if(current())say('Your project details are ready. Say “check Base launch terms” to review the launch.');}
  };
  let cmd=assetCommand(state.step,text);
  if(state.artwork&&(!cmd||cmd.kind==='url'))cmd={kind:state.artwork.kind,style:state.artwork.style,artwork:text};
  if(!cmd&&state.direction)cmd={kind:'preview',style:text};
  if(!cmd){if(start)reply(text,state.step==='logo'?logoPrompt:sitePrompt);return Boolean(start);}
  if(busy){say('Your preview is still being prepared.');return true;}
  if(cmd.kind==='pause'){await save({...state,started:false,direction:false});reply(text,'Project setup paused.');return true;}
  if(cmd.kind==='invalid'){reply(text,'Paste a public HTTPS or IPFS link.');return true;}
  if(cmd.kind==='skip'||cmd.kind==='url'){reply(text,cmd.kind==='skip'?'Skipped.':'Link selected.');logo?.reset();logo=null;await advance(cmd.url||'');return true;}
  if(state.step==='logo'){
   if(!logo){logo=mountLogoCreator({host:document.createElement('div'),getContext:()=>({user:active()?project.owner:null,name:project?.name||'',symbol:project?.symbol||'',description:project?.description||'',network:'base'}),onDiscard:()=>{},onStatus:msg=>{if(current()&&/unavailable|failed|could not|needs a public|no logo has been replaced/i.test(msg))say(msg);},onPreview:result=>{if(!current()||!result.preview||result.accepted)return;const body=say('Logo preview ready. Say “use this logo”, ask for another, or skip.');const img=document.createElement('img');img.src=result.preview;img.alt='Token logo preview';img.width=192;img.height=192;body.append(img);},onAccept:async result=>{if(!result.url){say('This logo needs a public URL. Paste an image link or skip.');return;}await advance(result.url);}});await logo.open();}
   if(!current())return true;
   if(cmd.kind==='generate'){reply(text,'Creating your logo preview...');logo.create(cmd.style);}
   else if(logo.hasUnselected())logo.accept();else say('Create a logo preview first, paste a link, or skip.');
   return true;
  }
  if(cmd.kind==='preview'&&!cmd.style){await save({...state,direction:true});reply(text,'What should visitors see or do? Describe the style, a game, or a gallery.');return true;}
  if(cmd.kind!=='preview'&&!state.preview){reply(text,'Create a website preview first, paste a link, or skip.');return true;}
  busy=true;
  try{
   const action=cmd.kind==='revise'?'preview':cmd.kind;
   const payload=['publish','saved'].includes(action)?{id:state.preview}:{name:project.name,symbol:project.symbol,description:project.description,logo:state.image,artwork:cmd.artwork||'',designBrief:cmd.style,previous:cmd.kind==='revise'?state.preview:undefined,instruction:cmd.kind==='revise'?cmd.style:undefined};
   reply(text,action==='publish'?'Publishing your website...':action==='saved'?'Opening your preview...':cmd.kind==='revise'?'Revising your website preview...':'Creating your website preview...');
   const result=await websiteRequest(action,payload);if(!current())return true;
   if(action==='publish'){await advance(result.url);return true;}
   await save({...state,direction:false,artwork:null,preview:result.id});if(!current())return true;
   const body=say('Your private website preview is ready. Say “use this website”, “revise website: your change”, or “skip website”.');
   const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([result.html],{type:'text/html;charset=utf-8'}));link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open private preview';body.append(link);
  }catch(error){if(current()){if(error.needsArtwork||error.needsDirection)await save({...state,artwork:error.needsArtwork?{kind:cmd.kind,style:cmd.style}:null,direction:!!error.needsDirection});say(error.message);}}
  finally{if(current())busy=false;}
  return true;
 }
 return {bind,reset,handle,assets:()=>{const state=load();return {image:state.image,website:state.website,description:project.description};}};
}
