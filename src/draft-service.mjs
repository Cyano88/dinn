import {randomUUID,createHash} from 'node:crypto';
import {equityContext} from './equity-context.mjs';
import {composeLore,chooseFormats,loreKey} from './creator-lore.mjs';
import {sharedFinding,hasLaunchEvent,launchStory} from '../public/stock-watch.js';
import {chatLimit,createChatAllowanceStore} from './chat-allowance.mjs';
import {PrivyClient} from '@privy-io/node';
import {validateDraft} from '../public/draft-data.js';
import {createDraftStore} from './draft-store.mjs';
export function createDraftService({env=process.env,verify,storeFactory=createDraftStore,fetchImpl=fetch,research=equityContext,generate=composeLore,allowanceFactory=createChatAllowanceStore}={}){
 let client,pending,usage;
 const enabled=()=>!!env.DATABASE_URL||!!env.DINN_DRAFT_SYNC_URL;
 return {enabled,async findings(id){
  if(id&&!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))return [];
  pending||=storeFactory({env}).catch(error=>{pending=null;throw error;});
  return (await pending).findings(id);
 },async handle(req,path,data){
  if(!['/api/drafts/get','/api/drafts/save','/api/drafts/records','/api/drafts/record','/api/drafts/share-finding','/api/drafts/creator-idea'].includes(path))return {status:404,body:{error:'Unknown draft action.'}};
  if(!enabled())return {status:503,body:{error:'Account draft storage is unavailable.'}};
  const token=req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];if(!token||token.length>12000)return {status:401,body:{error:'Sign in to sync your draft.'}};
  if(Object.keys(data).some(k=>!(path.endsWith('/save')?['revision','data']:path.endsWith('/record')?['key','revision','value']:path.endsWith('/creator-idea')?['ticker','url']:path.endsWith('/share-finding')?['ticker','url','publishedAt','finding','idea','activity','source','followUp','question']:[]).includes(k)))return {status:400,body:{error:'Unexpected draft request field.'}};
  if(path.endsWith('/save')){if(!Number.isSafeInteger(data.revision)||data.revision<0)return {status:400,body:{error:'Invalid draft revision.'}};try{data={revision:data.revision,data:validateDraft(data.data)};}catch(e){return {status:400,body:{error:e.message}};}}
  // Local development forwards the verified user's bearer token to this app's hosted API.
  // It never opens the production database to the browser or to the local network.
  if(!env.DATABASE_URL&&env.DINN_DRAFT_SYNC_URL){
   const target=new URL(env.DINN_DRAFT_SYNC_URL);if(target.protocol!=='https:'||target.username||target.password||target.pathname!=='/'||target.search||target.hash)throw Error('Invalid draft sync origin.');
   const response=await fetchImpl(target.origin+path,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(data),signal:AbortSignal.timeout(15000),redirect:'error'});
   return {status:response.status,body:await response.json()};
  }
  let owner;try{if(verify)owner=await verify(token);else{client||=new PrivyClient({appId:env.PRIVY_APP_ID,appSecret:env.PRIVY_APP_SECRET});owner=(await client.utils().auth().verifyAccessToken(token)).user_id;}if(!owner)throw Error();}catch{return {status:401,body:{error:'Your sign-in expired. Sign in again to sync.'}};}
  pending||=storeFactory({env}).catch(error=>{pending=null;throw error;});const store=await pending;
  if(path.endsWith('/share-finding')||path.endsWith('/creator-idea')){
   if(typeof data.ticker!=='string'||!/^[A-Z][A-Z0-9.-]{0,14}$/.test(data.ticker))return {status:400,body:{error:'Choose a supported stock before sharing.'}};
   const context=await research(data.ticker,{headlinesOnly:true});
   const article=context?.recentArticles?.find(a=>a.url===data.url&&hasLaunchEvent(a));
   if(!article)return {status:409,body:{error:'This source is no longer in the current research. Refresh the research before sharing.'}};
   const story=createHash('sha256').update(context.ticker+' '+article.title.trim().toLowerCase()).digest('hex');
   let concept=await store.creatorLore(owner,story);
   if(path.endsWith('/creator-idea')){
    if(!launchStory(context.ticker,[article],context.checkedAt))return {status:409,body:{error:'This story needs a fresh research check.'}};
    if(concept)return {status:200,body:{concept}};
    usage||=allowanceFactory({env}).catch(e=>{usage=null;throw e;});
    const meter=await usage, reservation=await meter.reserve(owner,'lore-'+story,['creator-idea',story],chatLimit(env));
    if(!reservation.ticket)return {status:reservation.status||409,body:{error:reservation.error||'Reload your saved idea.'}};
    try{
     for(let n=0;!concept&&n<3;n++){
      const used=await store.usedIdeas(story);
      const formats=chooseFormats(used.map(row=>row.format));if(!formats.length)break;
      let generated;
      try{generated=await generate(context.ticker,article,formats,{env,fetchImpl,used});}catch(error){if(error instanceof TypeError&&n<2)continue;throw error;}
      const {format,concept:idea}=generated;
      concept=await store.reserveLore(owner,story,format,loreKey(idea.name),loreKey(idea.activity),idea)||await store.creatorLore(owner,story);
     }
     if(concept){await meter.finish(reservation.ticket,{message:concept.name});return {status:200,body:{concept}};}
    }finally{if(!concept)await meter.release(reservation.ticket);}
    return {status:409,body:{error:'I could not find a fresh concept for this story. Try another finding.'}};
   }
   if(!concept)return {status:409,body:{error:'Ask Dinn for your own idea before sharing it.'}};
   const entry=sharedFinding(context.ticker,article,concept);
   if(Object.entries(entry).some(([key,value])=>data[key]!==value))return {status:409,body:{error:'The research changed. Review a new preview before sharing.'}};
   return {status:200,body:await store.publishFinding(owner,randomUUID(),createHash('sha256').update(entry.url).digest('hex'),entry)};
  }
  if(path.endsWith('/records'))return {status:200,body:{records:await store.records(owner)}};
  if(path.endsWith('/record')){
   const {key,revision,value}=data;
   if(typeof key!=='string'||!/^dinn\.(multi\.|logo\.preview\.|pons\.|pons-request\.|robinhood\.wallet\.)/.test(key)||key.length>1800||!Number.isSafeInteger(revision)||revision<0||!(value===null||typeof value==='string'&&value.length<=300000))return {status:400,body:{error:'Invalid account record.'}};
   const saved=await store.writeRecord(owner,key,revision,value);
   return saved?{status:200,body:saved}:{status:409,body:{error:'This record changed in another session. Refresh before continuing.'}};
  }
  if(path.endsWith('/get'))return {status:200,body:await store.get(owner)};
  const saved=await store.put(owner,data.revision,data.data);
  return saved?{status:200,body:saved}:{status:409,body:{error:'The account draft has a newer revision.'}};
 }};
}
