import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createDraftStore} from '../src/draft-store.mjs';
import {createDraftService} from '../src/draft-service.mjs';
import {createDraftSync} from '../public/draft-sync.js';
import {emptyDraft,validateDraft} from '../public/draft-data.js';
const draft=name=>({version:1,values:{'pons-brief':{launchpad:'pons',chainId:4663,name,symbol:'DAN'}}});
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};};
const wait=async fn=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Sync did not settle');};
const key=id=>'dinn.multi.pons-brief.v1:'+id;

test('draft storage isolates owners and rejects stale concurrent saves',async()=>{
 const db=new PGlite();try{const store=await createDraftStore({db});assert.equal((await store.get('alice')).revision,0);
 const results=await Promise.all([store.put('alice',0,draft('Diana')),store.put('alice',0,draft('Stale'))]);assert.equal(results.filter(Boolean).length,1);
 assert.equal((await store.get('bob')).revision,0);assert.equal(await store.put('alice',0,draft('Overwrite')),null);
 assert.equal((await store.put('alice',1,emptyDraft())).revision,2);assert.deepEqual((await store.get('alice')).data,emptyDraft());
 }finally{await db.close();}
});
test('server derives draft ownership from verified token and validates writes',async()=>{
 const db=new PGlite();try{const store=await createDraftStore({db});const service=createDraftService({env:{DATABASE_URL:'configured'},storeFactory:async()=>store,verify:async token=>{if(token==='alice'||token==='bob')return token;throw Error();}});
 const req=name=>({headers:{authorization:'Bearer '+name}});
 assert.equal((await service.handle({headers:{}},'/api/drafts/get',{})).status,401);
 assert.equal((await service.handle(req('invalid'),'/api/drafts/get',{})).status,401);
 assert.equal((await service.handle(req('alice'),'/api/drafts/save',{owner:'bob',revision:0,data:draft('Diana')})).status,400);
 assert.equal((await service.handle(req('alice'),'/api/drafts/save',{revision:0,data:draft('Diana')})).status,200);
 assert.equal((await service.handle(req('bob'),'/api/drafts/get',{})).body.revision,0);
 assert.equal((await service.handle(req('alice'),'/api/drafts/save',{revision:0,data:draft('Old')})).status,409);
 assert.throws(()=>validateDraft({version:1,values:{provider:'secret'}}));assert.throws(()=>validateDraft({version:1,values:{chat:'x'.repeat(300001)}}));
 }finally{await db.close();}
});
function harness(remote={revision:0,data:emptyDraft()}){
 const local=storage();let cloud=remote,latest={};
 const controller=createDraftSync({storage:local,delay:1,onStatus:s=>latest=s,request:async(action,body)=>{if(action==='get')return structuredClone(cloud);if(body.revision!==cloud.revision){const e=Error('Conflict');e.status=409;throw e;}cloud={revision:cloud.revision+1,data:structuredClone(body.data)};return structuredClone(cloud);}});
 controller.configure(true);return {local,controller,get state(){return latest.state;},get cloud(){return cloud;},set cloud(value){cloud=value;}};
}
test('legacy local draft imports once and a new browser restores the account draft',async()=>{
 const h=harness();h.local.setItem(key('alice'),JSON.stringify(draft('Diana').values['pons-brief']));h.controller.start('alice');await wait(()=>h.cloud.revision===1);assert.equal(h.cloud.data.values['pons-brief'].name,'Diana');
 await h.controller.refresh();assert.equal(h.cloud.revision,1);
 const next=harness(h.cloud);next.controller.start('alice');await wait(()=>next.state==='saved');assert.equal(JSON.parse(next.local.getItem(key('alice'))).name,'Diana');h.controller.stop();next.controller.stop();
});
test('conflicting local and account drafts require a choice and preserve a backup',async()=>{
 const h=harness({revision:3,data:draft('Account')});h.local.setItem(key('alice'),JSON.stringify(draft('Local').values['pons-brief']));h.controller.start('alice');await wait(()=>h.state==='conflict');assert.equal(h.cloud.revision,3);
 await h.controller.useAccount();assert.equal(JSON.parse(h.local.getItem(key('alice'))).name,'Account');assert.equal(JSON.parse(h.local.getItem('dinn.draft-backups.v1:alice'))[0].data.values['pons-brief'].name,'Local');h.controller.stop();
});
test('stale tab cannot overwrite newer edits until Keep this draft is chosen',async()=>{
 const h=harness({revision:1,data:draft('Original')});h.controller.start('alice');await wait(()=>h.state==='saved');h.cloud={revision:2,data:draft('Elsewhere')};h.local.setItem(key('alice'),JSON.stringify(draft('Local edit').values['pons-brief']));await h.controller.flush();await wait(()=>h.state==='conflict');assert.equal(h.cloud.data.values['pons-brief'].name,'Elsewhere');
 await h.controller.keepLocal();assert.equal(h.cloud.revision,3);assert.equal(h.cloud.data.values['pons-brief'].name,'Local edit');h.controller.stop();
});
test('a late response after switching accounts cannot apply another owner draft',async()=>{
 let release;const local=storage(),applied=[];const sync=createDraftSync({storage:local,onApply:id=>applied.push(id),request:async(action,body,id)=>id==='alice'?await new Promise(r=>release=r):{revision:1,data:draft('Bob')}});
 sync.configure(true);sync.start('alice');sync.start('bob');await wait(()=>applied.length===1);release({revision:1,data:draft('Alice')});await new Promise(r=>setTimeout(r,10));assert.deepEqual(applied,['bob']);assert.equal(local.getItem(key('alice')),null);sync.stop();
});
test('pending wallet records are never included in portable drafts',()=>{
 const local=storage();local.setItem('dinn.pons.pending.v1:4663:0x123','pending');local.setItem('dinn.deployer.v1:alice','external');local.setItem(key('alice'),JSON.stringify(draft('Diana').values['pons-brief']));const sync=createDraftSync({storage:local,request:()=>{}});assert.deepEqual(Object.keys(sync.snapshot('alice').values),['pons-brief']);
});
