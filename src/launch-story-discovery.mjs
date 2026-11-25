import {hasLaunchEvent} from '../public/stock-watch.js';
import {equityContext} from './equity-context.mjs';
import {ponsPair} from './pons-pairs.mjs';
import {pairCandidates} from '../public/pons-assets.js';

import {issuerIds,nonEquities} from '../public/pons-equities.js';
import {approvedStockPairs} from './pons-stock-approvals.mjs';
const knownStocks=pairCandidates.filter(a=>Object.hasOwn(issuerIds,a.symbol));
const unresolved=pairCandidates.filter(a=>!Object.hasOwn(issuerIds,a.symbol)&&!nonEquities.includes(a.symbol)).map(a=>a.symbol);
async function scanEach(items,fn){
 const results=[];let next=0;
 async function worker(){
  while(next<items.length){
   const i=next++;
   try{results[i]={status:'fulfilled',value:await fn(items[i])};}
   catch{results[i]={status:'rejected'};}
  }
 }
 await Promise.all(Array.from({length:Math.min(6,items.length)},worker));
 return results;
}
const day=86400000;
function lead(packet,now){
 return (packet?.recentArticles||[]).filter(a=>{
  const age=now-Date.parse(a.publishedAt);
  return age>=0&&age<=2*day&&hasLaunchEvent(a)&&a.url.length<=1000;
 }).sort((a,b)=>Number(b.kind==='issuer-announcement')-Number(a.kind==='issuer-announcement')||Date.parse(b.publishedAt)-Date.parse(a.publishedAt))[0];
}
let lastScreen;
export function discoverLaunchStories(options){
 if(options)return screen(options);
 if(lastScreen&&Date.now()<lastScreen.expires)return lastScreen.request;
 const request=screen({});
 lastScreen={request,expires:Date.now()+60000};
 request.catch(()=>{if(lastScreen?.request===request)lastScreen=null;});
 return request;
}
async function screen({research=ticker=>equityContext(ticker,{headlinesOnly:true}),pair=ponsPair,approval=approvedStockPairs,assets=knownStocks,now=Date.now()}={}){
 let flags;
 try{flags=await approval(assets);}catch{flags=[];}
 const universe=assets.filter((a,i)=>flags[i]===true);
 const disabled=assets.filter((a,i)=>flags[i]===false).map(a=>a.symbol);
 const approvalUnknown=assets.filter((a,i)=>typeof flags[i]!=='boolean').map(a=>a.symbol);
 const scans=await scanEach(universe,async asset=>{
  const packet=await research(asset.symbol);
  if(!packet?.sources?.some(s=>s.status==='checked'&&['Market coverage','Google News','NVIDIA newsroom'].includes(s.publisher)))throw Error('News sources unavailable');
  const article=lead(packet,now);
  if(!article)return null;
  return {asset,article,quote:packet.quote,partial:packet.sources.some(s=>s.status!=='checked')};
 });
 const ranked=scans.flatMap(s=>s.value?[s.value]:[]).sort((a,b)=>Number(b.article.kind==='issuer-announcement')-Number(a.article.kind==='issuer-announcement')||Date.parse(b.article.publishedAt)-Date.parse(a.article.publishedAt));
 const checkFinal=async idea=>{
  const approval=await pair({pairToken:idea.asset.address});
  if(approval.chainId!==4663||approval.symbol!==idea.asset.symbol||approval.address?.toLowerCase()!==idea.asset.address.toLowerCase())throw Error('Pair identity mismatch');
  return {...idea,blockNumber:approval.blockNumber};
 };
 const ideas=[],unchecked=[];
 for(let i=0;i<ranked.length&&ideas.length<3;){
  const batch=ranked.slice(i,i+3-ideas.length);
  const results=await scanEach(batch,checkFinal);
  results.forEach((r,j)=>{if(r.status==='fulfilled')ideas.push(r.value);else unchecked.push(batch[j].asset.symbol);});
  i+=batch.length;
 }
 const missing=scans.flatMap((s,i)=>s.status==='rejected'?[universe[i].symbol]:[]);
 const lines=[ideas.length?'Stock stories with an available Pons pair':'I found no fresh story with a verified Pons pair to shortlist.'];
 for(const {asset,article,quote,partial} of ideas){
  const move=quote?'Underlying stock: '+quote.changePercent.toFixed(2)+'% from its previous close at '+quote.asOf.slice(0,16).replace('T',' ')+' UTC.':'Stock price change unavailable.';
  lines.push(asset.symbol+' · '+article.title+'\n['+article.source+' · '+article.publishedAt.slice(0,10)+']('+article.url+')\n'+move+' Pair: '+asset.symbol+' on Robinhood Chain.'+(partial?' Some news sources were unavailable.':''));
 }
 const coverage={catalogCandidates:assets.length,eligible:universe.length,screened:universe.length-missing.length,quiet:scans.filter(s=>s.status==='fulfilled'&&s.value===null).length,disabled,approvalUnknown,unresolved,partialCatalog:true};
 lines.push(coverage.eligible+' approved stock pairs · '+coverage.screened+' checked for news · '+coverage.quiet+' without a qualifying headline in 48 hours.'+(missing.length?' News unavailable: '+missing.join(', ')+'.':'')+(approvalUnknown.length?' Approval unavailable for '+approvalUnknown.length+' candidates.':'')+(unchecked.length?' Final pair check unavailable: '+unchecked.join(', ')+'.':'')+' Coverage uses the known Pons list; newly added pairs can be missing.'+(unresolved.length?' Unmatched: '+unresolved.join(', ')+'.':''));
 if(ideas.length)lines.push('Choose a ticker to research the story or watch it before launching.');
 return {message:lines.join('\n\n'),data:{checkedAt:new Date(now).toISOString(),ideas,missing,unchecked,coverage},actions:[]};
}
