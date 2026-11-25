import {draftKinds,validateDraft,emptyDraft} from './draft-data.js';

const groups=[['chat'],draftKinds.filter(kind=>kind!=='chat')];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function copyGroup(target,source,keys){
 for(const k of keys){if(Object.hasOwn(source,k))target[k]=source[k];else delete target[k];}
}
export function createDraftSync({storage,request,onApply=()=>{},onStatus=()=>{},delay=0}){
 const sessions=new Map();
 let owner=null,generation=0,busy=false,timer=null;
 function session(id){
  if(!sessions.has(id))sessions.set(id,{data:emptyDraft(),base:null,revision:null});
  return sessions.get(id);
 }
 function legacy(id){
  const data=emptyDraft();
  for(const k of draftKinds){try{const raw=storage.getItem('dinn.multi.'+k+'.v1:'+id);if(raw!==null)data.values[k]=JSON.parse(raw);}catch{}}
  return validateDraft(data);
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(()=>void sync(),delay);}
 function checked(response){
  if(!Number.isSafeInteger(response?.revision)||response.revision<0)throw Error('Invalid account revision');
  return {data:validateDraft(response.data),revision:response.revision};
 }
 async function sync(refresh=false){
  if(!owner||busy)return;
  const id=owner,run=generation,s=session(id),active=()=>owner===id&&generation===run;
  let again=false;
  busy=true;
  if(s.base===null)onStatus({state:'loading',message:''});
  try{
   if(refresh||s.revision===null){
    const remote=checked(await request('get',{},id));if(!active())return;
    const merged=structuredClone(remote.data);
    // Import older browser-only setups only when this account has never saved a draft.
    if(remote.revision===0&&s.base===null)Object.assign(merged.values,legacy(id).values,s.data.values);
    else if(s.base){
     for(const keys of groups){
      const remoteUnchanged=keys.every(k=>same(remote.data.values[k],s.base.values[k]));
      if(remoteUnchanged)copyGroup(merged.values,s.data.values,keys);
     }
    }
    const changed=!same(s.data,merged);s.data=merged;s.base=remote.data;s.revision=remote.revision;
    if(changed)onApply(id);
   }
   if(!same(s.data,s.base)){
    const sent=structuredClone(s.data);
    const remote=checked(await request('save',{revision:s.revision,data:sent},id));if(!active())return;
    s.revision=remote.revision;s.base=remote.data;again=!same(s.data,sent);
   }
   onStatus({state:'saved',message:''});
  }catch(error){
   if(active()){
    if(error.status===409){s.revision=null;again=true;}
    else onStatus({state:'error',message:'Could not sync with your account. Keep this tab open and retry.'});
   }
  }finally{if(active()){busy=false;if(again)schedule();}}
 }
 return {
  read(kind,id){return id&&Object.hasOwn(session(id).data.values,kind)?JSON.stringify(session(id).data.values[kind]):null;},
  write(kind,id,value){
   if(!id||!draftKinds.includes(kind))return;
   const s=session(id);if(value===undefined)delete s.data.values[kind];else s.data.values[kind]=structuredClone(value);
   if(id===owner)schedule();
  },
  start(id){if(owner===id)return;clearTimeout(timer);generation++;owner=id;busy=false;onStatus({state:'checking',message:''});if(id)void sync(true);},
  refresh:()=>sync(true),flush:()=>sync(),
  stop(){this.start(null);}
 };
}
