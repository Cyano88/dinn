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
