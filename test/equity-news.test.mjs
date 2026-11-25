import test from 'node:test';
import assert from 'node:assert/strict';
import {equityContext} from '../src/equity-context.mjs';
import {filingsArticles} from '../src/equity-news.mjs';
const now=Date.parse('2026-11-25T12:00:00Z');
test('indexed headlines retain the attributed outlet and reject lookalike sources, duplicates and login pages',async()=>{
 const item=(host,title,id)=>'<item><title>'+title+' - Reuters</title><link>https://news.google.com/rss/articles/'+id+'</link><source url="https://'+host+'">Reuters</source><pubDate>Wed, 25 Nov 2026 09:00:00 GMT</pubDate></item>';
 const result=await equityContext('TSLA',{now,env:{},fetchImpl:async url=>new Response(url.includes('news.google.com')?'<rss>'+item('reuters.com','Tesla reports deliveries',1)+item('reuters.com','Tesla reports deliveries',2)+item('reuters.com.example.org','Tesla sets record',3)+'</rss>':'<html>Sign in</html>')});
 assert.deepEqual(result.recentArticles.map(a=>[a.title,a.source,a.via]),[['Tesla reports deliveries','Reuters','Google News']]);
 assert.equal(result.sources.find(s=>s.publisher==='Financial Times').status,'unavailable');
 assert.equal(result.quote,null);
});
test('SEC receipts require matching issuer and timestamp and link to the filing',()=>{
 const data={cik:1318605,tickers:['TSLA'],filings:{recent:{form:['8-K'],acceptanceDateTime:['2026-11-25T08:00:00Z'],accessionNumber:['0001318605-26-000100'],primaryDocument:['report.htm']}}};
 assert.match(filingsArticles(data,'TSLA',now)[0].url,/1318605\/000131860526000100\/report.htm$/);
 assert.throws(()=>filingsArticles(data,'NVDA',now));
 assert.deepEqual(filingsArticles(data,'TSLA',now-86400000),[]);
});
