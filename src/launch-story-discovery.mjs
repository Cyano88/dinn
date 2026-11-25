import {equityContext,equityTicker} from './equity-context.mjs';
import {ponsPair} from './pons-pairs.mjs';
import {pairCandidates} from '../public/pons-assets.js';

const universe=pairCandidates.filter(asset=>equityTicker(asset.symbol)===asset.symbol);
const day=86400000;
const concrete=/\b(announces?|announced|unveils?|unveiled|launches|launched|appoints?|appointed|approves?|approved|releases?|released|reports?|reported|signs|signed|wins|won|acquires|acquired|recalls?|recalled|cuts|raises|raised|halts?|halted|resigns?|resigned|sues|sued)\b/i;
const speculative=/\?|\b(could|might|may|rumou?rs?|expected|prediction|forecast|analysts?|should you|stock to buy|reportedly|according to sources)\b/i;
function lead(packet,now){
 return (packet?.recentArticles||[]).filter(a=>{
  const age=now-Date.parse(a.publishedAt);
  return age>=0&&age<=2*day&&a.kind!=='regulatory-filing'&&concrete.test(a.title)&&!speculative.test(a.title)&&a.url.length<=1000;
 }).sort((a,b)=>Number(b.kind==='issuer-announcement')-Number(a.kind==='issuer-announcement')||Date.parse(b.publishedAt)-Date.parse(a.publishedAt))[0];
}
export async function discoverLaunchStories({research=ticker=>equityContext(ticker,{headlinesOnly:true}),pair=ponsPair,now=Date.now()}={}){
 const scans=await Promise.allSettled(universe.map(async asset=>{
  const packet=await research(asset.symbol);
  if(!packet?.sources?.some(s=>s.status==='checked'&&s.publisher!=='SEC EDGAR'))throw Error('News sources unavailable');
  const article=lead(packet,now);
  if(!article)return null;
  return {asset,article,quote:packet.quote,partial:packet.sources.some(s=>s.status!=='checked')};
 }));
 const ranked=scans.flatMap(s=>s.value?[s.value]:[]).sort((a,b)=>Number(b.article.kind==='issuer-announcement')-Number(a.article.kind==='issuer-announcement')||Date.parse(b.article.publishedAt)-Date.parse(a.article.publishedAt));
 const checks=await Promise.allSettled(ranked.map(async idea=>{
  const approval=await pair({pairToken:idea.asset.address});
  if(approval.chainId!==4663||approval.symbol!==idea.asset.symbol||approval.address?.toLowerCase()!==idea.asset.address.toLowerCase())throw Error('Pair identity mismatch');
  return {...idea,blockNumber:approval.blockNumber};
 }));
 const ideas=checks.flatMap(s=>s.value?[s.value]:[]).slice(0,3);
 const missing=scans.flatMap((s,i)=>s.status==='rejected'?[universe[i].symbol]:[]);
 const unchecked=checks.flatMap((s,i)=>s.status==='rejected'?[ranked[i].asset.symbol]:[]);
 const lines=[ideas.length?'Stock stories with an available Pons pair':'I found no fresh story with a verified Pons pair to shortlist.'];
 for(const {asset,article,quote,partial} of ideas){
  const move=quote?'Underlying stock: '+quote.changePercent.toFixed(2)+'% from its previous close at '+quote.asOf.slice(0,16).replace('T',' ')+' UTC.':'Stock price change unavailable.';
  lines.push(asset.symbol+' · '+article.title+'\n['+article.source+' · '+article.publishedAt.slice(0,10)+']('+article.url+')\n'+move+' Pair: '+asset.symbol+' on Robinhood Chain.'+(partial?' Some news sources were unavailable.':''));
 }
 lines.push('Screened '+(universe.length-missing.length)+' of '+universe.length+' supported stocks for dated event headlines in the past 48 hours.'+(missing.length?' News unavailable: '+missing.join(', ')+'.':'')+(unchecked.length?' Pair availability unconfirmed: '+unchecked.join(', ')+'.':''));
 if(ideas.length)lines.push('Choose a ticker to research the story or watch it before launching.');
 return {message:lines.join('\n\n'),data:{checkedAt:new Date(now).toISOString(),ideas,missing,unchecked},actions:[]};
}
