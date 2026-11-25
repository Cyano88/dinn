import assert from 'node:assert/strict';
import test from 'node:test';
import {watchIntent,snapshot,watchReply,researchDescription} from '../public/stock-watch.js';
const article=(name,day)=>({title:name,url:'https://example.com/'+encodeURIComponent(name),publishedAt:'2026-11-'+day+'T08:00:00Z'});
const original=snapshot({ticker:'TSLA',checkedAt:'2026-11-23T10:00:00Z',recentArticles:[article('Tesla discusses deliveries',23)]});
test('watch flow routes research, explicit question and updates; unrelated wallet requests pass through',()=>{
 assert.equal(watchIntent('I want to launch around Tesla',null).ticker,'TSLA');
 assert.equal(watchIntent('Watch for deliveries',original).question,'deliveries');
 assert.equal(watchIntent('Any update?',original).kind,'update');
 assert.equal(watchIntent('Launch this pair',original).kind,'launch');
 assert.equal(watchIntent('send ETH',original),null);
});
test('only newly dated and matching evidence is surfaced; original brief stays intact',()=>{
 const latest={...original,articles:[article('Tesla factory profile',24),article('Tesla reports deliveries',24),...original.articles]};
 const answer=watchReply(original,latest,'deliveries',true);
 assert.match(answer,/reports deliveries/);assert.doesNotMatch(answer,/factory profile|discusses deliveries/);
 assert.match(researchDescription({original,latest,question:'deliveries'}),/reports deliveries/);
 assert.match(watchReply(original,original,'deliveries',true),/still open/);
 assert.match(original.articles[0].title,/discusses/);
});
import {ideaInvite,ideaChoice,ideaReply,bankrBrief,launchAngle,ideaDescription} from '../public/stock-watch.js';
test('a creator can opt into a sourced milestone idea without starting a launch',()=>{
 const a=article('Tesla wins approval for a rollout',23),w={ticker:'TSLA',ideaSource:{...a,source:'Reuters'}};
 assert.equal(ideaChoice('yes',w,ideaInvite('TSLA')),'idea');
 assert.equal(ideaChoice('yes',w,'Would you like something else?'),null);
 const idea=ideaReply(w);
 assert.match(idea,/Green Light/);assert.match(idea,/\[Tesla wins approval for a rollout\]\(https:/);
 assert.equal(ideaChoice('Pons',w,idea),'launch');assert.equal(ideaChoice('Bankr',w,idea),'bankr');assert.equal(ideaChoice('just watch',w,idea),'watch-idea');
 assert.match(bankrBrief(w),/Check current pair support with Bankr/);
 assert.match(ideaDescription(launchAngle(w)),/Reuters, 2026-11-23/);
 assert.equal(ideaChoice('no thanks',w,ideaInvite('TSLA')),'decline');
});
test('a hypothetical dividend cut cannot trigger a creator idea',async()=>{
 const {hasLaunchEvent}=await import('../public/stock-watch.js');
 assert.equal(hasLaunchEvent({title:'A portfolio with UPS pays dividends. Here is what happens if one cuts'}),false);
 assert.equal(hasLaunchEvent({title:'UPS announces a new delivery service'}),true);
});
test('the next verified issuer headline can qualify when the lead story is hypothetical',async()=>{
 const {launchStory}=await import('../public/stock-watch.js');
 const articles=['Could Tesla launch a truck?','UPS logistics market report 2026', 'Amazon launches a truck','EU postpones discussion to approve Tesla self-driving tech'].map(t=>article(t,23));
 const found=launchStory('TSLA',articles,'2026-11-24T12:00:00Z');
 assert.equal(found,articles[3]);
 const watch={ticker:'TSLA',ideaSource:found};
 assert.match(ideaReply(watch),/postponed decision/);
 assert.equal(ideaChoice('What could I launch around this?',watch,ideaInvite('TSLA')),'idea');
 assert.equal(launchStory('TSLA',articles.slice(0,2),'2026-11-24T12:00:00Z'),null);
 assert.equal(launchStory('TSLA',articles,'2026-11-26T12:00:00Z'),null);
});

test('the orbital data center idea gives a creator one actionable next step',()=>{
 const w={ticker:'SPCX',ideaSource:article('FCC approves SpaceX plan to put AI data centers in space',25)};
 const reply=ideaReply(w);
 assert.match(reply,/mission patch/);
 assert.match(reply,/check whether you can launch it on Base\?$/);
 assert.doesNotMatch(reply,/choose Pons|Say "Share research"|Bankr/);
 assert.equal(ideaChoice('yes',w,reply),'choose-network');
 for(const request of ['Base please','Can I launch this on Base?','Check whether I can launch it on Base'])assert.equal(ideaChoice(request,w,reply),'bankr');
 assert.equal(ideaChoice('Set up my token on Robinhood Chain',w,reply),'launch');
 assert.equal(ideaChoice('send ETH on Base',w,reply),null);
 assert.equal(ideaChoice('yes',w,'Want to start setting up a token for this idea on Pons?'),'launch');
 assert.equal(ideaChoice('not now',w,reply),'decline');
 assert.equal(ideaChoice('What could I launch around this?',w,reply),'idea');
 assert.equal(ideaChoice('yes',w,'Published.'),null);
 assert.equal(ideaChoice('yes',w,'Or choose Pons, Bankr, or watch the story.'),null);
});
