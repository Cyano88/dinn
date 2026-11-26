import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {agentAccessRequest} from '../src/agent-access.mjs';
import {communityBrief,saveBrief,openBrief,linkVerifiedBrief,originalFinding} from '../src/agent-launch-idea.mjs';

const asset={symbol:'TEST',address:'0x'+'1'.repeat(40)};
const article={title:'Test milestone',publishedAt:'2026-11-25T10:00:00Z',source:'Issuer',url:'https://example.com/release'};
const concept={name:'Test concept',symbol:'EXM',activity:'Draw a new mascot for the community.',question:'Was the next milestone reported?'};
const coverage={screened:1,quiet:0,eligible:1};
const data={ideas:[{asset,article,blockNumber:123}],checkedAt:'2026-11-26T10:00:00Z',coverage,missing:[],unchecked:[]};
const request={service:'stock.launch-idea',input:{}};
test('one paid report carries the same sourced concept into the owner brief and a pair-matched verified receipt',async()=>{
 const db=new PGlite();
 try{
  await db.exec(await readFile(new URL('../migrations/20261126_agent_ideas.sql',import.meta.url),'utf8'));
  const deps={discover:async()=>({data}),generate:async()=>({concept}),save:brief=>saveBrief(brief,{},db)};
  await assert.rejects(agentAccessRequest(request,{ideaDependencies:deps}),/funded/);
  const report=await agentAccessRequest(request,{paidResearch:true,ideaDependencies:deps});
  assert.equal(report.status,'completed');assert.match(report.deliverableMarkdown,/Test milestone/);assert.equal(report.result.chainId,4663);
  const id=new URLSearchParams(new URL(report.result.openUrl).hash.slice(1)).get('idea');
  const saved=await openBrief(id,{},db);assert.deepEqual(saved.brief.concept,concept);
  const item={token:'0x'+'2'.repeat(40),hash:'0x'+'3'.repeat(64),pairToken:'0x'+'4'.repeat(40)};
  await linkVerifiedBrief(saved.reference,item,{},db);assert.equal(await originalFinding(item.token,{},db),null);
  await linkVerifiedBrief(saved.reference,{...item,pairToken:asset.address},{},db);
  assert.deepEqual((await originalFinding(item.token,{},db)).article,article);
 }finally{await db.close();}
});
test('quiet checked coverage can return wait; outages cannot become a paid wait finding',async()=>{
 const options={generate:()=>assert.fail(),save:()=>assert.fail()};
 const quiet={...data,ideas:[],coverage:{...coverage,quiet:1}};
 assert.equal((await communityBrief({...options,discover:async()=>({data:quiet})})).result.outcome,'wait');
 await assert.rejects(communityBrief({...options,discover:async()=>({data:{...quiet,coverage:{...coverage,screened:0}}})}),/unavailable/);
});
