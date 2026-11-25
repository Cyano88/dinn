import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createDraftService} from '../src/draft-service.mjs';
import {createDraftStore} from '../src/draft-store.mjs';
import {sharedFinding} from '../public/stock-watch.js';
import {createAccountRecords} from '../public/account-records.js';

test('sharing rechecks the source, preserves the feed link and exposes only the preview',async()=>{
 const db=new PGlite();
 try {
  const article={title:'Tesla reports deliveries',source:'Tesla',url:'https://example.com/deliveries',publishedAt:'2026-11-22T12:00:00Z'};
  const entry=sharedFinding('TSLA',article);
  const store=await createDraftStore({db});
  const service=createDraftService({env:{DATABASE_URL:'test'},storeFactory:async()=>store,verify:async()=> 'private-user',research:async()=>({ticker:'TSLA',recentArticles:[article]})});
  const share=data=>service.handle({headers:{authorization:'Bearer test'}},'/api/drafts/share-finding',data);
  assert.equal((await share({...entry,wallet:'private'})).status,400);
  assert.equal((await share({...entry,finding:'edited'})).status,409);
  assert.equal((await share({...entry,url:'https://example.com/else'})).status,409);
  const first=await share(entry);
  assert.equal(first.status,200);
  assert.equal((await share(entry)).body.id,first.body.id);
  const [row]=await service.findings(first.body.id);
  assert.deepEqual(row.entry,entry);
  assert.deepEqual(Object.keys(row).sort(),['entry','id','shared_at']);
  assert.equal((await service.findings()).length,1);
 } finally {await db.close();}
});

test('concurrent account hydration migrates a legacy watch once',async()=>{
 const records=createAccountRecords(),key='dinn.multi.stock-watch.v1:alice';
 let old='research',writes=0;
 const legacy={length:1,key:()=>key,getItem:()=>old,removeItem:()=>{old=null;}};
 const request=async(action)=>{if(action==='records')return {records:[]};writes++;await Promise.resolve();return {revision:1};};
 await Promise.all([records.start('alice',request,null,legacy),records.start('alice',request,null,legacy)]);
 assert.equal(writes,1);assert.equal(old,null);assert.equal(records.getItem(key),'research');
});
