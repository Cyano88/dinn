const reloadKey='dinn.auth.boot-reload';
export function clearBootReload(storage){
 try{storage.removeItem(reloadKey);}catch{}
}
export async function loadAuthConfig(fetchConfig,wait){
 for(let attempt=0;;attempt++){
  try{
   const response=await fetchConfig();
   if(response.ok)return await response.json();
   if(response.status<500&&response.status!==429)return Promise.reject(Error('Sign-in configuration is unavailable.'));
  }catch(error){if(attempt===2)throw error;}
  if(attempt===2)throw Error('Sign-in service is unavailable.');
  await wait(1000*(attempt+1));
 }
}
export function reserveBootReload(storage,now=Date.now()){
 try{
  const prior=Number(storage.getItem(reloadKey));
  if(prior>0&&now-prior<120000)return false;
  storage.setItem(reloadKey,String(now));return true;
 }catch{return false;}
}
