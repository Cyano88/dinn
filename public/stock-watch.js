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
const concrete=/\b(postpones?|postponed|announces?|announced|unveils?|unveiled|launches|launched|appoints?|appointed|approves?|approved|releases|released|reports|reported|signs|signed|wins|won|acquires|acquired|recalls?|recalled|cuts|raises|raised|halts?|halted|resigns?|resigned|sues|sued)\b/i;
const speculative=/\?|\b(could|might|may|rumou?rs?|expected|prediction|forecast|analysts?|should you|stock to buy|reportedly|according to sources|what happens if|what if|if one|if it|if they|my portfolio|model portfolio|dividend portfolio|market report|research report|industry report)\b/i;
export function hasLaunchEvent(article){
 return !!article&&article.kind!=='regulatory-filing'&&concrete.test(article.title)&&!speculative.test(article.title);
}
export function launchStory(ticker, articles, checkedAt){
 if(!Object.hasOwn(stocks,ticker))return null;
 return articles.find(article=>{
  const age=Date.parse(checkedAt)-Date.parse(article?.publishedAt);
  return age>=0&&age<=2*86400000&&hasLaunchEvent(article)&&mentionsStock(article.title,ticker);
 })||null;
}
export const ideaInvite=ticker=>'Want a launch idea around this '+ticker+' story?';
export function launchAngle(watch){
 const a=watch.ideaSource;
 if(!a)return null;
 if(watch.concept)return {...watch.concept,article:a};
 if(watch.concept)return {...watch.concept,article:a};
 const t=a.title;
 const ticker=watch.ticker;
 let name=ticker+' Front Page',activity='Ask everyone to draw a four-panel comic explaining this headline to someone seeing it for the first time. Pin the clearest strip next to the original story, then invite readers to draw the sequel when a new fact lands.',question='What new detail would belong in the next panel?';
 if(/\b(?:orbit\w*|space|satellite\w*)\b/i.test(t)&&/\bdata cent(?:er|re)s?\b/i.test(t)){
  name='Server Room in Space';
  activity='Give the community one design challenge: draw a mission patch for an AI data center in orbit. Let people vote for the patch they would put on the first server rack. Pin the winning design beside the original report.';
  question='Has anyone published a launch date or shown hardware for the proposed data center?';
 }else if(/\bpostpon(?:es?|ed)\b/i.test(t)){
  name=ticker+' Rain Check';activity='Make a two-frame meme about the postponed decision. Everyone draws the delay today and leaves frame two blank. Reopen the thread when a new date is announced and let the community finish it.';
  question='Has the decision maker published a new date?';
 }else if(/\b(?:approval|approves?|license|permit|regulat\w*)\b/i.test(t)){
  name=ticker+' Green Light';activity='Start a thread called "Approved. Now what?" Ask members to sketch the first thing a customer might actually see. When the rollout begins, put the sketches beside a sourced photo or announcement.';
  question='What is the first public sign that the approved plan has reached customers?';
 }else if(/\b(?:earnings|revenue|quarter|results|profit)\b/i.test(t)){
  name=ticker+' In One Chart';activity='Challenge members to explain one number from the earnings release in a single chart. Every entry links to the figure it used. Let readers choose the clearest chart and bring it back at the next release.';
  question='How does the same figure change in the next company release?';
 }else if(/\b(?:stake|shares|holding|holdings)\b/i.test(t)){
  name=ticker+' Filing Detectives';activity='Turn the stake story into a filing hunt. Ask members to find the original disclosure and mark the line showing the position. Pin the first correct citation alongside its reporting period.';
  question='Which filing and reporting date support the stake in the headline?';
 }else if(/\b(?:launch\w*|deploy\w*|deliver\w*|unveil\w*|rollout|production)\b/i.test(t)){
  name=ticker+' First Sighting';activity='Open a first-sighting board for the rollout in this story. Ask members for a dated photo, release note or product listing. Feature the earliest entry others can verify.';
  question='Where can someone independently verify the first delivery or release?';
 }
 return {name,activity,question,article:a};
}
const setupInvite='Want to start setting up a token for this idea on Pons?';
export const conceptLabel=idea=>idea.symbol?idea.name+' ($'+idea.symbol+')':idea.name;
export function ideaReply(watch){
 const idea=launchAngle(watch);if(!idea)return 'Which stock story would you like to research first?';
 return '**'+conceptLabel(idea)+'**\n\n'+idea.activity+'\n\nInspired by '+label(idea.article)+'\n\n'+setupInvite;
}
export function ideaChoice(text,watch,last){
 if(!watch?.ideaSource)return null;
 const t=text.trim().replace(/[.!?]+$/,'').toLowerCase();
 if(last?.endsWith(ideaInvite(watch.ticker))){
  if(/^(?:yes|yes please|sure|go ahead|show me|give me (?:an?|the) (?:launch )?idea)$/.test(t))return 'idea';
  if(/^(?:no|no thanks|skip|just research)$/.test(t))return 'decline';
 }
 if((last?.endsWith(ideaInvite(watch.ticker))||last===ideaReply(watch)||last?.endsWith('Or choose Pons, Bankr, or watch the story.'))&&/^what (?:could|can|should) (?:i|we) launch around (?:this|that)(?: story| finding| research)?$/.test(t))return 'idea';
 if(last?.endsWith(ideaInvite(watch.ticker))&&/^(?:can (?:i|you)|give me|show me|suggest|create|build).*\blaunch idea\b/.test(t))return 'idea';
 const currentIdea=last===ideaReply(watch);
 if(currentIdea&&/^(?:yes|yep|yeah|sure|go ahead|yes please|let.s do it|start setup|use this idea)$/.test(t))return 'launch';
 if(currentIdea&&/^(?:no|no thanks|not now|maybe later)$/.test(t))return 'decline';
 if(currentIdea||last?.endsWith('Or choose Pons, Bankr, or watch the story.')){
  if(/^(?:pons|(?:check|launch|use|start)(?: this| the)?(?: pair)? on pons)$/.test(t))return 'launch';
  if(/^(?:bankr|launch on bankr|on bankr|use bankr|(?:prepare |create )?(?:a |the )?brief for bankr)$/.test(t))return 'bankr';
  if(/^(?:watch|just watch|watch (?:it|the story|this story))$/.test(t))return 'watch-idea';
 }
 return null;
}
export function bankrBrief(watch,availability){
 const i=launchAngle(watch);
 return '**Base creator brief: '+conceptLabel(i)+'**\n\n'+i.activity+'\n\nStory: '+label(i.article)+'\n\nFirst milestone: '+i.question+'\n\nProposed pairing asset: the Base stock token for '+watch.ticker+'. '+(availability||'Check current pair support with Bankr.');
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

export function sharedFinding(ticker,article,concept){
 const idea=launchAngle({ticker,ideaSource:article,concept});
 return {ticker,question:'What is the launch idea around '+ticker+'?',finding:article.title,source:article.source,url:article.url,publishedAt:article.publishedAt,idea:conceptLabel(idea),activity:idea.activity,followUp:idea.question};
}
