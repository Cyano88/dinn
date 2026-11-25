import {pairCandidates} from './pons-assets.js';

import {equityNames as stocks,mentionsStock} from './pons-equities.js';
export function asksForLaunchIdeas(text){
 return !Object.keys(stocks).some(t=>mentionsStock(text,t))&&/\b(?:stock|stocks|equities)\b/i.test(text)&&/\b(?:launch|launching)\b/i.test(text)&&/\b(?:what|which|find|best|ideas?|discover|suggest|worth|shortlist)\b/i.test(text);
}
export function selectLaunchStory(text,ideas){
 const choice=text.trim().toLowerCase().replace(/[.!?]+$/,'').replace(/^(?:research|watch)\s+/,'').replace(/\s+deeper$/,'').replace(/^\$/,'');
 return ideas.find(({asset})=>[asset.symbol,asset.name].some(name=>name.toLowerCase()===choice))||null;
}
export function watchIntent(text,watch){
 const names=Object.keys(stocks).filter(t=>mentionsStock(text,t));
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
function link(text,raw){
 try{
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password)return text;
  return '['+text.replace(/[\[\]\r\n]/g,' ')+']('+url.href.replace(/\(/g,'%28').replace(/\)/g,'%29')+')';
 }catch{return text;}
}
const label=a=>link(a.title,a.url)+' '+[a.source,a.publishedAt.slice(0,10)].filter(Boolean).join(' \u00b7 ');
export const ideaInvite=ticker=>'Want a launch idea around this '+ticker+' story?';
export function launchAngle(watch){
 const a=watch.ideaSource;
 if(!a)return null;
 const t=a.title;
 let name='Evidence Club',activity='Members bring one dated source to each update and vote on the next question to investigate.',question='What new primary source would change the original finding?';
 if(/\b(?:approval|approves?|license|permit|regulat\w*)\b/i.test(t)){
  name='Clearance Watch';activity='Build a public timeline from the reported decision to the first real-world rollout. Members add a source for each milestone.';
  question='Has the company published the first rollout milestone covered by this decision?';
 }else if(/\b(?:launch\w*|deploy\w*|deliver\w*|unveil\w*|rollout|production)\b/i.test(t)){
  name='Launch Log';activity='Let the community track promised milestones against dated delivery updates on the project page.';
  question='What has actually shipped since this report?';
 }else if(/\b(?:earnings|revenue|quarter|results|profit)\b/i.test(t)){
  name='Quarter Watch';activity='Invite members to pick one reported business metric and track it through the next earnings release.';
  question='How does the next published result compare with this one?';
 }else if(/\b(?:stake|shares|holding|holdings)\b/i.test(t)){
  name='Filing Club';activity='Give the community a dated log of disclosed positions, with each change linked to the corresponding filing.';
  question='Does the next filing show the same position, and what period does it cover?';
 }
 return {name:watch.ticker+' '+name,activity,question,article:a};
}
export function ideaReply(watch){
 const idea=launchAngle(watch);if(!idea)return 'Which stock story would you like to research first?';
 return '**'+idea.name+'**\n\n'+idea.activity+'\n\n**The starting point**\n'+label(idea.article)+'\n\n**First question to track**\n'+idea.question+'\n\nWant to check this pair on Pons, prepare a brief for Bankr, or just watch the story?';
}
export function ideaChoice(text,watch,last){
 if(!watch?.ideaSource)return null;
 const t=text.trim().replace(/[.!?]+$/,'').toLowerCase();
 if(last?.endsWith(ideaInvite(watch.ticker))){
  if(/^(?:yes|yes please|sure|go ahead|show me|give me (?:an?|the) (?:launch )?idea)$/.test(t))return 'idea';
  if(/^(?:no|no thanks|skip|just research)$/.test(t))return 'decline';
 }
 if(last?.endsWith(ideaInvite(watch.ticker))&&/^(?:can (?:i|you)|give me|show me|suggest|create|build).*\blaunch idea\b/.test(t))return 'idea';
 if(last===ideaReply(watch)){
  if(/^(?:pons|(?:check|launch|use|start)(?: this| the)?(?: pair)? on pons)$/.test(t))return 'launch';
  if(/^(?:bankr|launch on bankr|on bankr|use bankr|(?:prepare |create )?(?:a |the )?brief for bankr)$/.test(t))return 'bankr';
  if(/^(?:watch|just watch|watch (?:it|the story|this story))$/.test(t))return 'watch-idea';
 }
 return null;
}
export function bankrBrief(watch){
 const i=launchAngle(watch);
 return '**Base creator brief: '+i.name+'**\n\n'+i.activity+'\n\nStory: '+label(i.article)+'\n\nFirst milestone: '+i.question+'\n\nProposed pairing asset: the Base stock token for '+watch.ticker+'. Check current pair support with Bankr. Launching through Bankr in Dinn is coming soon.';
}
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
 if(articles.length)lines.push((refresh?'New coverage to review':'Recent coverage to investigate')+'\n'+articles.slice(0,3).map(label).join('\n\n'));
 else lines.push(missing.length?'I couldn’t check all the news sources. There isn’t enough evidence here to judge the story.':refresh?'I found no new matching headline in the sources checked since your original brief. The question is still open.':'I’d wait for a clearer story. I found no recent headline in the sources checked.');
 if(refresh&&articles.length&&question)lines.push('Check the linked reporting against your question. A new headline alone does not confirm it.');
 if(current.quote)lines.push('Underlying stock: $'+current.quote.priceUsd+' at '+current.quote.asOf+' ('+current.quote.changePercent.toFixed(2)+'% from the previous close). '+link('View stock quote',current.quote.url));
 if(missing.length)lines.push('Couldn’t check: '+missing.join(', ')+'.');
 if(refresh)lines.push('Your original brief is saved.');
 else if(!articles.length)lines.push('Tell me what to watch for, then ask "Any update?" whenever you want a fresh check.');
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

export function ideaDescription(i){
 const source=i.article.source||'Source';
 const date=i.article.publishedAt.slice(0,10);
 const note=' ('+source+', '+date+')';
 const ending=i.article.url.length<200?note+' '+i.article.url:note;
 return (i.activity+' Starting point: '+i.article.title).slice(0,500-ending.length)+ending;
}
