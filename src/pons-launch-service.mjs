import {getClient,PONS_FACTORY,snapshot} from './pons.mjs';
import {factoryAbi} from './pons-fee-abi.mjs';
import {blockscoutRead} from './blockscout.mjs';
import {PrivyClient} from '@privy-io/node';
import {launchConfig,hashValid} from './pons-call.mjs';
import {ponsReceipt} from './pons-launch.mjs';
import {ponsTokenState} from './pons-token-state.mjs';
import {usdProduct} from './agent-access.mjs';
import {createPonsLaunchStore} from './pons-launch-store.mjs';

const PATHS=new Set(['/api/dinn/launches/list','/api/dinn/launches/register']);
const validAddress=value=>typeof value==='string'&&/^0x[0-9a-f]{40}$/i.test(value);
const publicLaunch=item=>Object.fromEntries(['hash','token','curve','name','symbol','logo','pairToken','pairSymbol','blockNumber','launchedAt'].filter(key=>item[key]!==undefined).map(key=>[key,item[key]]));
function publicMetrics(state){
 const curve=state.curve?{progressPercent:state.curve.progressPercent,raised:state.curve.raised,threshold:state.curve.threshold,priceQuote:state.curve.priceQuote,fdvQuote:state.curve.fdvQuote}:null;
 const pairUsd=state.quoteUsd?.available?state.quoteUsd:null;
 const curvePriceUsd=curve&&pairUsd?usdProduct(curve.priceQuote,pairUsd.unitPriceUsd,8):null;
 const curveFdvUsd=curve&&pairUsd?usdProduct(curve.fdvQuote,pairUsd.unitPriceUsd,2):null;
 return {status:state.status,phase:state.phase,pair:{symbol:state.pair?.symbol||null,address:state.pair?.address||null},curve,market:{priceUsd:state.market?.priceUsd||null,marketCapUsd:state.market?.marketCapUsd||null,fdvUsd:state.market?.fdvUsd||null,source:state.market?.source||'Unavailable',checkedAt:state.market?.checkedAt||null},curvePriceUsd,curveFdvUsd,curveUsdSource:pairUsd?.source||pairUsd?.basis||null,blockNumber:state.blockNumber,checkedAt:state.checkedAt};
}
async function mapLimit(items,limit,fn){const out=new Array(items.length);let next=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const index=next++;try{out[index]=await fn(items[index]);}catch{out[index]=null;}}}));return out;}

async function registeredCandidates(addresses,env){
 const client=getClient({env}),block=await snapshot(client);
 const found=await mapLimit(addresses,5,async address=>{
  const launch=await client.readContract({address:PONS_FACTORY,abi:factoryAbi,functionName:'getLaunchedToken',args:[address],blockNumber:block.number});
  return launch.exists&&launch.token.toLowerCase()===address?address:false;
 });
 return {addresses:found.filter(Boolean),partial:found.includes(null)};
}

export function createPonsLaunchService({env=process.env,verify,storeFactory=createPonsLaunchStore,verifyReceipt=ponsReceipt,readMetrics=ponsTokenState,searchExplorer=blockscoutRead,findRegistered=registeredCandidates,fetchImpl=fetch,now=Date.now}={}){
 let client,storePromise;const metricsCache=new Map();
 const enabled=()=>!!env.DATABASE_URL||!!env.DINN_DRAFT_SYNC_URL;
 async function ownerFrom(req){const token=req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];if(!token||token.length>12000)throw Object.assign(Error('Sign in to view Dinn launches.'),{status:401});try{let owner;if(verify)owner=await verify(token);else{client||=new PrivyClient({appId:env.PRIVY_APP_ID,appSecret:env.PRIVY_APP_SECRET});owner=(await client.utils().auth().verifyAccessToken(token)).user_id;}if(typeof owner!=='string'||!owner||owner.length>256)throw Error();return owner;}catch{throw Object.assign(Error('Your sign-in expired. Sign in again.'),{status:401});}}
 async function getStore(){storePromise||=storeFactory({env}).catch(error=>{storePromise=null;throw error;});return storePromise;}
 async function proxy(path,req,data){let target;try{target=new URL(env.DINN_DRAFT_SYNC_URL);}catch{throw Error('Account launch history is unavailable.');}if(target.protocol!=='https:'||target.username||target.password||target.pathname!=='/'||target.search||target.hash)throw Error('Account launch history is unavailable.');const response=await fetchImpl(target.origin+path,{method:'POST',headers:{'content-type':'application/json',authorization:req.headers.authorization},body:JSON.stringify(data),signal:AbortSignal.timeout(20000),redirect:'error'});const result=await response.json();return {status:response.status,body:result};}
 return {enabled,async handle(req,path,data){
  if(!PATHS.has(path))return {status:404,body:{error:'Unknown launch history action.'}};
  if(!enabled())return {status:503,body:{error:'Dinn launch history is unavailable.'}};
  if(!data||typeof data!=='object'||Array.isArray(data))return {status:400,body:{error:'Invalid launch history request.'}};
  if(!env.DATABASE_URL&&env.DINN_DRAFT_SYNC_URL){if(path.endsWith('/list')&&Object.keys(data).some(k=>!['query','limit','offset'].includes(k))||path.endsWith('/register')&&Object.keys(data).some(k=>!['hash','configuration','quote'].includes(k)))return {status:400,body:{error:'Unexpected launch history field.'}};if(path.endsWith('/register')&&(!hashValid(data.hash)||!data.configuration||!data.quote))return {status:400,body:{error:'Invalid verified launch record.'}};return proxy(path,req,data);}
  let owner;try{owner=await ownerFrom(req);}catch(error){return {status:error.status||401,body:{error:error.message}};}
  if(path.endsWith('/list')){
   if(Object.keys(data).some(k=>!['query','limit','offset'].includes(k)))return {status:400,body:{error:'Unexpected launch history field.'}};
   const query=data.query===undefined?'':data.query;if(typeof query!=='string'||query.length>64||/[\x00-\x1f\x7f]/.test(query))return {status:400,body:{error:'Search must be 64 characters or fewer.'}};
   const limit=data.limit===undefined?10:data.limit,offset=data.offset===undefined?0:data.offset;if(!Number.isInteger(limit)||limit<1||limit>10||!Number.isInteger(offset)||offset<0||offset>10000)return {status:400,body:{error:'Invalid launch history page.'}};
   const rows=await (await getStore()).list({query:query.trim(),limit,offset});
   const items=await mapLimit(rows.items,3,async item=>{try{const key=item.token.toLowerCase(),cached=metricsCache.get(key);let metrics,logo=cached?.logo;if(cached&&now()-cached.at<60000)metrics=cached.value;else{const state=await readMetrics({address:item.token},{includeLogo:!item.logo});metrics=publicMetrics(state);logo=state.logo;metricsCache.set(key,{at:now(),value:metrics,logo});if(metricsCache.size>500)metricsCache.delete(metricsCache.keys().next().value);}return {...publicLaunch(item),logo:item.logo||logo||null,metrics};}catch{return {...publicLaunch(item),metrics:null};}});
   const external=[];
   let searchNotice='';
   const term=query.trim().replace(/^\$/,'');
   if(!offset&&(validAddress(term)||term.length>=2&&!/^0x/i.test(term))){
    try{
     let candidates=[term];
     if(!validAddress(term)){
      const result=await searchExplorer('search',{env,fetchImpl,query:{q:term}});
      if(!Array.isArray(result.items))throw Error();
      candidates=result.items.filter(hit=>hit.type==='token'&&[hit.symbol,hit.name].some(value=>typeof value==='string'&&value.toLowerCase().includes(term.toLowerCase()))).map(hit=>hit.address_hash||hit.address);
     }
     const known=new Set(items.map(item=>item.token.toLowerCase()));
     let addresses=[...new Set(candidates.filter(validAddress).map(value=>value.toLowerCase()))].filter(value=>!known.has(value)).slice(0,50);
     if(addresses.length&&!validAddress(term)){
      const found=await findRegistered(addresses,env);addresses=found.addresses.slice(0,4);
      if(found.partial||found.addresses.length>4)searchNotice='Showing verified matches from the first search results. Use a contract address for an exact lookup.';
     }
     const matches=await mapLimit(addresses,2,async token=>{
      try{
       const state=await readMetrics({address:token},{includeLogo:true});
       return {token,name:state.name,symbol:state.symbol,logo:state.logo||null,origin:'pons',metrics:publicMetrics(state)};
      }catch(error){
       if(!error.message.includes('not registered in the supported Pons'))searchNotice='Some Pons launches could not be checked. Try again.';
       return null;
      }
     });
     external.push(...matches.filter(Boolean));
    }catch{searchNotice='Pons search is unavailable. Try the token contract address.';}
   }
   return {status:200,body:{items,external,searchNotice,total:rows.total,limit,offset,source:'Dinn verified Pons launch receipts'}};
  }
  if(Object.keys(data).some(k=>!['hash','configuration','quote'].includes(k))||!hashValid(data.hash)||!data.configuration||!data.quote||JSON.stringify(data.quote).length>10000)return {status:400,body:{error:'Invalid verified launch record.'}};
  let configuration;try{configuration=launchConfig(data.configuration);}catch(error){return {status:400,body:{error:error.message}};}
  if(data.quote.pairToken!==undefined&&(!validAddress(data.quote.pairToken)||data.quote.pairToken.toLowerCase()!==configuration.pairToken.toLowerCase()))return {status:400,body:{error:'Pairing asset does not match the reviewed launch.'}};
  let result;try{result=await verifyReceipt({hash:data.hash,configuration,quote:data.quote});}catch{return {status:400,body:{error:'Dinn could not verify this exact Pons launch receipt.'}};}
  if(result?.state!=='verified'||result.chainId!==4663||!validAddress(result.token)||!validAddress(result.curve)||!Number.isSafeInteger(Number(result.blockNumber)))return {status:409,body:{error:'This launch is not yet verified. Dinn did not add it to Launches.'}};
  if(!validAddress(configuration.account)||!Number.isFinite(Number(result.blockTimestamp)))return {status:400,body:{error:'Verified launch details are incomplete.'}};
  const item={hash:data.hash,token:result.token,curve:result.curve,account:configuration.account,name:configuration.name,symbol:configuration.symbol,logo:configuration.logo||'',pairToken:configuration.pairToken,pairSymbol:configuration.pairToken.toLowerCase()==='0x'+'0'.repeat(40)?'ETH':'Pair token',blockNumber:Number(result.blockNumber),launchedAtSeconds:Number(result.blockTimestamp)};
  const saved=await (await getStore()).put(owner,item);
  return {status:200,body:{saved:true,item:saved,source:'Dinn verified Pons launch receipt'}};
 }};
}
