import {PrivyClient} from '@privy-io/node';

// Public deployments must not expose the paid model endpoint anonymously.
export function inferenceAccess({env=process.env,verify,now=Date.now}={}){
 let client;const requests=new Map();
 return async req=>{
  if(env.NODE_ENV!=='production'&&!env.RENDER)return null;
  const token=req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
  if(!token||token.length>12000)return {status:401,error:'Sign in to chat with Dinn.'};
  let owner;
  try{if(verify)owner=await verify(token);else{client||=new PrivyClient({appId:env.PRIVY_APP_ID,appSecret:env.PRIVY_APP_SECRET});owner=(await client.utils().auth().verifyAccessToken(token)).user_id;}if(!owner)throw Error();}
  catch{return {status:401,error:'Your sign-in expired. Sign in again.'};}
  const time=now();for(const [id,values]of requests)if(values.at(-1)<=time-60000)requests.delete(id);
  const recent=(requests.get(owner)||[]).filter(t=>t>time-60000);
  if(recent.length>=12)return {status:429,error:'Please wait a minute before asking Dinn again.'};
  recent.push(time);requests.set(owner,recent);return null;
 };
}
