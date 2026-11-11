import {PrivyClient} from '@privy-io/node';
import {validateDraft} from '../public/draft-data.js';
import {createDraftStore} from './draft-store.mjs';
export function createDraftService({env=process.env,verify,storeFactory=createDraftStore,fetchImpl=fetch}={}){
 let client,pending;
 const enabled=()=>!!env.DATABASE_URL||!!env.DINN_DRAFT_SYNC_URL;
 return {enabled,async handle(req,path,data){
  if(!['/api/drafts/get','/api/drafts/save'].includes(path))return {status:404,body:{error:'Unknown draft action.'}};
  if(!enabled())return {status:503,body:{error:'Account draft storage is unavailable. Your local draft is kept.'}};
  const token=req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];if(!token||token.length>12000)return {status:401,body:{error:'Sign in to sync your draft.'}};
  if(Object.keys(data).some(k=>!(path.endsWith('/save')?['revision','data']:[]).includes(k)))return {status:400,body:{error:'Unexpected draft request field.'}};
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
  if(path.endsWith('/get'))return {status:200,body:await store.get(owner)};
  const saved=await store.put(owner,data.revision,data.data);
  return saved?{status:200,body:saved}:{status:409,body:{error:'Your account draft changed elsewhere. Choose which draft to keep.'}};
 }};
}
