import assert from 'node:assert/strict';
import test from 'node:test';
import {discoverLaunchStories} from '../src/launch-story-discovery.mjs';
import {directProductIntent} from '../src/product-tools.mjs';
import {selectLaunchStory} from '../public/stock-watch.js';
import {pairCandidates} from '../public/pons-assets.js';
const assets=pairCandidates.filter(a=>['TSLA','AAPL','GME'].includes(a.symbol));
const approval=async list=>list.map(()=>true);
const now=Date.parse('2026-11-25T15:00:00Z');
const sources=[{publisher:'Google News',status:'checked'}];
const article=title=>({kind:'market-report',source:'Financial Times',title,url:'https://example.com/news',publishedAt:new Date(now-3600000).toISOString()});
test('discovery routes broad briefs and keeps an explicit Base request on Base',()=>{
 assert.equal(directProductIntent('What stock should I launch around?',{ponsSetup:{active:true,field:'name'}}).name,'discover_launch_stories');
 assert.deepEqual(directProductIntent('Find me the best stock to launch around on Base').args,{chainId:8453});
});
test('reports quiet and unavailable coverage without promoting rumors',async()=>{
 const result=await discoverLaunchStories({now,assets,approval,research:async t=>{if(t==='TSLA')throw Error();return {sources,recentArticles:[article('Nvidia could launch a chip')]};},pair:()=>assert.fail()});
 assert.deepEqual(result.data.ideas,[]);assert.deepEqual(result.data.missing,['TSLA']);assert.equal(result.data.coverage.screened,2);
});
test('shortlist requires matching approved pair and supports conversational ticker selection',async()=>{
 const result=await discoverLaunchStories({now,assets,approval,research:async t=>({sources,recentArticles:['TSLA','AAPL'].includes(t)?[article(t+' announces deliveries')]:[]}),pair:async({pairToken})=>({symbol:'TSLA',chainId:4663,address:pairToken,blockNumber:'12'})});
 assert.deepEqual(result.data.unchecked,['AAPL']);assert.equal(selectLaunchStory('Research Tesla deeper',result.data.ideas).asset.symbol,'TSLA');assert.equal(selectLaunchStory('buy Tesla',result.data.ideas),null);
});
test('approval is checked before news; funds and unknown issuers do not enter the stock search',async()=>{
 const visited=[];
 const r=await discoverLaunchStories({now,assets,approval:async list=>list.map(a=>a.symbol==='GME'?true:a.symbol==='TSLA'?false:null),research:async symbol=>{visited.push(symbol);return {sources,recentArticles:[]};}});
 assert.deepEqual(visited,['GME']);assert.deepEqual(r.data.coverage.disabled,['TSLA']);assert.deepEqual(r.data.coverage.approvalUnknown,['AAPL']);assert.equal(r.data.coverage.quiet,1);
});
test('new issuers route to a named stock with ambiguous ticker words left alone',()=>{
 assert.equal(directProductIntent('Check stock news for NET').args.ticker,'NET');
 assert.equal(directProductIntent('Why did GameStop surge?').args.ticker,'GME');
 assert.equal(directProductIntent('What stock should I launch around?').name,'discover_launch_stories');
});
