import assert from 'node:assert/strict';
import test from 'node:test';
import {discoverLaunchStories} from '../src/launch-story-discovery.mjs';
import {directProductIntent} from '../src/product-tools.mjs';
import {selectLaunchStory} from '../public/stock-watch.js';
const now=Date.parse('2026-11-25T15:00:00Z');
const sources=[{publisher:'Financial Times',status:'checked'}];
const article=title=>({kind:'market-report',source:'Financial Times',title,url:'https://example.com/news',publishedAt:new Date(now-3600000).toISOString()});
test('discovery routes broad briefs and keeps an explicit Base request on Base',()=>{
 assert.equal(directProductIntent('What stock should I launch around?',{ponsSetup:{active:true,field:'name'}}).name,'discover_launch_stories');
 assert.match(directProductIntent('Find me the best stock to launch around on Base').message,/currently checks Pons/);
});
test('reports quiet and unavailable coverage without promoting rumors',async()=>{
 const result=await discoverLaunchStories({now,research:async t=>{if(t==='TSLA')throw Error();return {sources,recentArticles:[article('Nvidia could launch a chip')]};},pair:()=>assert.fail()});
 assert.deepEqual(result.data.ideas,[]);assert.deepEqual(result.data.missing,['TSLA']);assert.match(result.message,/6 of 7/);
});
test('shortlist requires matching approved pair and supports conversational ticker selection',async()=>{
 const result=await discoverLaunchStories({now,research:async t=>({sources,recentArticles:['TSLA','AAPL'].includes(t)?[article(t+' announces deliveries')]:[]}),pair:async({pairToken})=>({symbol:'TSLA',chainId:4663,address:pairToken,blockNumber:'12'})});
 assert.deepEqual(result.data.unchecked,['AAPL']);assert.equal(selectLaunchStory('Research Tesla deeper',result.data.ideas).asset.symbol,'TSLA');assert.equal(selectLaunchStory('buy Tesla',result.data.ideas),null);
});
