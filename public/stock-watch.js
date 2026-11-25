import {pairCandidates} from './pons-assets.js';

const stocks={TSLA:['Tesla'],NVDA:['Nvidia'],AAPL:['Apple'],MSFT:['Microsoft'],AMZN:['Amazon'],META:['Meta'],GOOGL:['Alphabet','Google']};
export function watchIntent(text,watch){
 const names=Object.keys(stocks).filter(symbol=>[symbol,symbol+'c',...stocks[symbol]].some(name=>new RegExp('\\b'+name+'\\b','i').test(text)));
 if(names.length===1&&(/\b(?:launch|launching)\b/i.test(text)&&/\b(?:around|story|news|worth|research|momentum)\b/i.test(text)||/^research (?:a |the )?launch story/i.test(text)))return {kind:'research',ticker:names[0]};
 if(!watch)return null;
 const question=text.match(/^(?:watch for|standing question\s*:|watch question\s*:|watch whether|wait until|(?:I.ll|I will) launch (?:if|when)|let me know (?:if|when))\s*(.{4,350})[.!]?$/i);
 if(question&&!/\b(?:my wallet|swap receipt|my balance|my transfer)\b/i.test(text))return {kind:'question',question:question[1]};
 if(/^(?:any updates?|check (?:my |the )?watch|what(?:'s| is| has)? changed(?: since (?:the |my )?(?:original research|launch|brief))?)[?.!]*$/i.test(text))return {kind:'update',ticker:watch.ticker};
 if(/^(?:launch (?:this|that) pair|use this research for (?:my |a )?launch)(?: on pons)?[.!]?$/i.test(text))return {kind:'launch'};
 return null;
}
export function snapshot(data){
 const articles=(data.recentArticles||[]).filter(a=>a.title&&/^https:\/\//.test(a.url)&&Number.isFinite(Date.parse(a.publishedAt)));
 return {ticker:data.ticker,checkedAt:data.checkedAt,articles,sources:data.sources||[],quote:data.quote};
}
const label=a=>(a.source?a.source+' ? ':'')+a.title+' ('+a.publishedAt.slice(0,10)+') '+a.url;
function findings(original,current,question){
 const known=new Set(original.articles.map(a=>a.url));
 const fresh=current.articles.filter(a=>!known.has(a.url)&&Date.parse(a.publishedAt)>Date.parse(original.checkedAt));
 if(!question)return fresh;
 const ignore=new Set(['the','for','and','are','did','has','its','announces','announced','this','that','with','from','will','when','whether','there','have','tesla','nvidia','company','stock','confirm','confirms','confirmed']);
 const words=question.toLowerCase().match(/[a-z0-9]{3,}/g)?.filter(word=>!ignore.has(word))||[];
 return fresh.filter(a=>words.some(word=>(a.title+' '+(a.excerpt||'')).toLowerCase().includes(word)));
}
export function watchReply(original,current,question,refresh){
 const articles=refresh?findings(original,current,question):current.articles;
 const missing=current.sources.filter(s=>s.status!=='checked').map(s=>s.publisher);
 const lines=[refresh?'Since your '+original.ticker+' brief on '+original.checkedAt.slice(0,10)+(question?' you asked me to watch for: '+question:':'):'Launch research for '+current.ticker];
 if(articles.length)lines.push((refresh?'New coverage to review':'Recent coverage to investigate')+'\n'+articles.slice(0,3).map(label).join('\n'));
 else lines.push(missing.length?'I couldn’t check all the news sources. There isn’t enough evidence here to judge the story.':refresh?'I found no new matching headline in the sources checked since your original brief. The question is still open.':'I’d wait for a clearer story. I found no recent headline in the sources checked.');
 if(refresh&&articles.length&&question)lines.push('Check the linked reporting against your question. A new headline alone does not confirm it.');
 if(current.quote)lines.push('Underlying stock: $'+current.quote.priceUsd+' at '+current.quote.asOf+' ('+current.quote.changePercent.toFixed(2)+'% from the previous close). '+current.quote.url);
 if(missing.length)lines.push('Couldn’t check: '+missing.join(', ')+'.');
 lines.push(refresh?'Your original brief is saved.':'Set a question with “Watch for …”, or say “Launch this pair” to check availability on Pons. Ask “Any update?” whenever you want me to check again.');
 return lines.join('\n\n');
}
export function launchCandidate(ticker){return pairCandidates.find(p=>p.symbol===ticker);}
export function researchDescription(watch){
 const a=(watch.latest&&findings(watch.original,watch.latest,watch.question)[0])||watch.original.articles[0];
 if(!a)return '';
 const citation=' ('+a.publishedAt.slice(0,10)+'). '+a.url;
 if(a.url.length>300||citation.length>420)return '';
 return a.title.slice(0,500-citation.length)+citation;
}
