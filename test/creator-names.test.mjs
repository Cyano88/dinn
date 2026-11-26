import test from 'node:test';
import assert from 'node:assert/strict';
import {composeLore,nameSavedConcept} from '../src/creator-lore.mjs';
import {ideaReply,bankrBrief,sharedFinding} from '../public/stock-watch.js';
import {cleanBrief} from '../public/pons-flow.js';

const article={title:'FCC approves SpaceX plan for AI data centers in orbit',publishedAt:'2026-11-25T12:00:00Z',source:'Publisher',url:'https://example.org/report'};
const format={key:'design and vote / collectible poster series'};
const reply=(symbol)=>({env:{OG_API_KEY:'test',OG_MODEL:'test'},fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({format:format.key,name:'Rack Cadets',symbol,activity:'Draw a mission patch for the first orbital server rack.'})}}]})})});
test('the suggested ticker follows the creator concept into chat, briefs and public preview',async()=>{
 const {concept}=await composeLore('SPCX',article,[format],reply('rack'));
 const watch={ticker:'SPCX',ideaSource:article,concept};
 assert.deepEqual(cleanBrief({name:concept.name,symbol:concept.symbol}),{name:'Rack Cadets',symbol:'RACK'});
 for(const text of [ideaReply(watch),bankrBrief(watch),sharedFinding('SPCX',article,concept).idea])assert.match(text,/Rack Cadets \(\$RACK\)/);
 for(const invalid of ['SPCX','SPCXC','BTC','bad ticker','123'])await assert.rejects(composeLore('SPCX',article,[format],reply(invalid)));
});
test('adding a ticker to a saved idea preserves its established name and activity',async()=>{
 const old={name:'Orbital Office Huddles',activity:'Draw a floating server rack.',question:'Has hardware shipped?'};
 assert.deepEqual(await nameSavedConcept('SPCX',old,reply('rack')),{...old,symbol:'RACK'});
});

test('a reopened marketplace brief watches the reported event and keeps the launch choice',()=>{
 const story={...article,title:'Nvidia Halts Server Shipments to Southeast Asia: Report. The Stock Can’t Catch a Break.'};
 const concept={name:'Paper Heat Sink',symbol:'COOL',activity:'Make a paper fan.',question:'What new detail would belong in the next panel?'};
 const watch={ticker:'NVDA',ideaSource:story,concept,reference:'saved',launchChainId:8453};
 const text=ideaReply(watch);
 assert.match(text,/Has NVIDIA confirmed the reported halt to server shipments to Southeast Asia/);
 assert.match(text,/Would you like to check the Bankr launch terms on Base\?$/);
 assert.doesNotMatch(text,/next panel/);
 assert.equal(concept.question,'What new detail would belong in the next panel?');
});
