import {draftKinds,validateDraft,emptyDraft} from './draft-data.js';

export function createDraftSync({storage,request,onApply=()=>{},onStatus=()=>{},delay=700}){
 let owner=null,enabled=false,generation=0,timer=null,busy=false,ready=false,conflict=null;
 const localKey=(kind,id)=>'dinn.multi.'+kind+'.v1:'+id;
 const metaKey=id=>'dinn.draft-sync.v1:'+id;
 const parse=key=>{try{return JSON.parse(storage.getItem(key));}catch{return null;}};
 function snapshot(id){const data=emptyDraft();for(const kind of draftKinds){const raw=storage.getItem(localKey(kind,id));if(raw!==null){try{data.values[kind]=JSON.parse(raw);}catch{}}}return validateDraft(data);}
 const encode=data=>JSON.stringify(validateDraft(data));
 const current=(run,id)=>run===generation&&id===owner;
 const status=(state,message)=>onStatus({state,message});
 function mark(id,revision,data){storage.setItem(metaKey(id),JSON.stringify({revision,base:encode(data)}));}
 function backup(id){const key='dinn.draft-backups.v1:'+id;const list=parse(key)||[];storage.setItem(key,JSON.stringify([{savedAt:new Date().toISOString(),data:snapshot(id)},...(Array.isArray(list)?list:[])].slice(0,3)));}
 function apply(id,remote){backup(id);for(const kind of draftKinds){if(Object.hasOwn(remote.data.values,kind))storage.setItem(localKey(kind,id),JSON.stringify(remote.data.values[kind]));else storage.removeItem(localKey(kind,id));}mark(id,remote.revision,remote.data);onApply(id);}
 function validateRemote(remote){if(!Number.isSafeInteger(remote?.revision)||remote.revision<0)throw Error('Invalid account draft response.');return {...remote,data:validateDraft(remote.data)};}
 function schedule(fn){clearTimeout(timer);timer=setTimeout(()=>void fn(),delay);}
 async function hydrate(){
  if(!enabled||!owner||busy)return;const id=owner,run=generation;busy=true;ready=false;conflict=null;status('checking','Checking your account draft...');let again=false;
  try{
   const remote=validateRemote(await request('get',{},id));if(!current(run,id))return;
   const local=snapshot(id),serialized=encode(local),meta=parse(metaKey(id));
   if(serialized===encode(remote.data)){mark(id,remote.revision,remote.data);ready=true;}
   else if((!meta&&Object.keys(local.values).length===0)||(meta&&serialized===meta.base)) {apply(id,remote);ready=true;}
   else if(remote.revision===0||meta?.revision===remote.revision){mark(id,remote.revision,remote.data);ready=true;again=true;}
   else{conflict=remote;status('conflict','This browser and your account have different drafts. Choose which one to continue.');}
   if(ready&&!again)status('saved','Saved to your account');
  }catch(error){if(current(run,id))status('error','Saved on this device. Account sync failed: '+error.message);}
  finally{if(current(run,id)){busy=false;if(again)schedule(push);}}
 }
 async function push(){
  if(!enabled||!owner||busy||conflict)return;if(!ready){await hydrate();return;}
  const id=owner,run=generation;let sent;busy=true;let reconcile=false;
  try{
   sent=snapshot(id);const meta=parse(metaKey(id));if(encode(sent)===meta?.base){status('saved','Saved to your account');return;}
   status('saving','Saving to your account...');const remote=validateRemote(await request('save',{revision:meta?.revision||0,data:sent},id));if(!current(run,id))return;
   mark(id,remote.revision,sent);status('saved','Saved to your account');
  }catch(error){if(current(run,id)){ready=false;reconcile=error.status===409;status('error','Saved on this device. Account sync failed: '+error.message);}}
  finally{if(current(run,id)){busy=false;if(reconcile)void hydrate();else if(ready&&sent&&encode(snapshot(id))!==encode(sent))schedule(push);}}
 }
 return {
  configure(value){enabled=!!value;if(enabled&&owner)void hydrate();else if(!enabled)status('disabled','');},
  start(id){if(owner===id)return;clearTimeout(timer);generation++;owner=id;ready=false;busy=false;conflict=null;if(owner&&enabled)void hydrate();else status('disabled','');},
  changed(kind){if(!draftKinds.includes(kind)||!owner||!enabled||conflict)return;status('saving','Saving to your account...');schedule(push);},
  refresh:hydrate,
  flush:push,
  async useAccount(){if(!conflict||busy)return;const remote=conflict;conflict=null;try{apply(owner,remote);ready=true;status('saved','Account draft restored');}catch(error){ready=false;status('error',error.message);}},
  async keepLocal(){if(!conflict||busy)return;try{backup(owner);mark(owner,conflict.revision,conflict.data);conflict=null;ready=true;await push();}catch(error){status('error',error.message);}},
  snapshot,
  stop(){clearTimeout(timer);generation++;owner=null;ready=false;busy=false;conflict=null;}
 };
}
