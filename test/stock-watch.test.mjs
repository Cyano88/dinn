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
