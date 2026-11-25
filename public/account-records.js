// Memory holds a view of the authenticated account. Each durable write uses the server revision.
export function createAccountRecords(){
 let current=null;
 async function start(owner,request,wallet,legacy){
  if(!owner){current=null;return;}
  if(current?.owner!==owner)current={owner,request,rows:new Map(),ready:false};
  const session=current;
  const pending=(session.loading||Promise.resolve()).catch(()=>{}).then(async()=>{
  if(current!==session)return;
  if(!session.ready){
   await request('records',{},owner).then(({records})=>{
    session.rows=new Map(records.map(r=>[r.key,r]));session.ready=true;
   });
  }
  if(current!==session||!legacy)return;
  const addr=wallet?.toLowerCase();
  const keys=[];
  for(let i=0;i<legacy.length;i++){
   const k=legacy.key(i);
   if(!k)continue;
   if(['stock-watch','stock-shortlist','research-feedback','creator-preview','last-deployer'].some(kind=>k==='dinn.multi.'+kind+'.v1:'+owner)||
    k.startsWith('dinn.logo.preview.v1:'+JSON.stringify([owner]).slice(0,-1)+',')||
    addr&&['dinn.robinhood.wallet.v1:','dinn.pons.claim.v1:4663:','dinn.pons.pending.v1:4663:','dinn.pons.approval.v1:4663:'].some(prefix=>k===prefix+addr))keys.push(k);
  }
  for(const key of keys){
   if(current!==session)return;
   const value=legacy.getItem(key);if(value===null)continue;
   if(!session.rows.has(key))await write(session,key,value);
   if(session.rows.get(key)?.value===value&&legacy.getItem(key)===value)legacy.removeItem(key);
  }
  });
  session.loading=pending;
  try{await pending;}finally{if(session.loading===pending)session.loading=null;}
 }
 async function write(session,key,value){
  if(!session?.ready||session!==current)throw Error('Wait for your account to load, then retry.');
  const previous=session.rows.get(key),revision=previous?.revision||0;
  let result;
  try{result=await session.request('record',{key,value,revision},session.owner);}
  catch(error){if(error.status===409)session.ready=false;error.accountRecordError=true;throw error;}
  session.rows.set(key,{key,value,revision:result.revision});
 }
 function scope(){
  const session=current;
  return {
   getItem:key=>session?.ready&&session===current?session.rows.get(key)?.value??null:null,
   setItem:(key,value)=>write(session,key,String(value)),
   removeItem:key=>write(session,key,null)
  };
 }
 return {start,scope,getItem:key=>scope().getItem(key),setItem:(key,value)=>scope().setItem(key,value),removeItem:key=>scope().removeItem(key)};
}
// UI bundles and native ES modules must share the same in-memory session.
export const accountRecords=globalThis[Symbol.for('dinn.account.records')]??=createAccountRecords();
