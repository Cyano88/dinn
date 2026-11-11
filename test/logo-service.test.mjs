import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {createLogoStore} from '../src/logo-store.mjs';
import {createLogoService,logoOrigin,logoPrompt} from '../src/logo-service.mjs';
import {generateLogoImage,normaliseLogo,fetchProviderImage} from '../src/logo-provider.mjs';
const req=id=>({headers:{authorization:'Bearer '+id}});
const input=()=>({requestId:randomUUID(),name:'Diana',symbol:'DAN',description:'Ecommerce launchpad',style:'Green geometric mark'});
const env={NODE_ENV:'development',DINN_LOGO_LOCAL_TEST:'true',DINN_LOGOS_ENABLED:'true',DINN_LOGO_LOCAL_DB:'memory://',DINN_LOGO_DAILY_LIMIT:'2',OG_IMAGE_MODEL:'bytedance/seedream-5.0-lite'};
const png=()=>sharp({create:{width:64,height:64,channels:3,background:'#234834'}}).png().toBuffer();
const settle=async(s,id,owner='alice')=>{for(let i=0;i<50;i++){const r=await s.handle(req(owner),'/api/logos/get',{id});if(r.state!=='generating')return r;await new Promise(r=>setTimeout(r,10));}throw Error('Job did not finish');};
test('database persists image and acceptance across restart; idempotency, quotas and ownership are enforced',async()=>{
 const path=await mkdtemp(join(tmpdir(),'dinn-logo-'));let db=await createLogoStore({...env,DINN_LOGO_LOCAL_DB:path});
 try{const id=randomUUID(),args={id,owner:'alice',fingerprint:'a',model:'test',prompt:'logo',limit:1};
  const results=await Promise.all([db.reserve(args),db.reserve(args)]);assert.equal(results.filter(r=>r.created).length,1);
  await assert.rejects(db.reserve({...args,owner:'bob'}),/different/);await assert.rejects(db.reserve({...args,fingerprint:'changed'}),/different/);
  assert.equal(await db.publicImage(id),undefined);await db.ready(id,await png());assert.equal(await db.accept(id,'bob'),undefined);assert.equal(await db.get(id,'bob'),undefined);
  assert.equal(await db.publicImage(id),undefined);await db.accept(id,'alice');const bytes=Buffer.from(await db.publicImage(id));await db.close();db=await createLogoStore({...env,DINN_LOGO_LOCAL_DB:path});assert.deepEqual(Buffer.from(await db.publicImage(id)),bytes);
  await assert.rejects(db.reserve({...args,id:randomUUID()}),/allowance/);
 }finally{await db.close();await rm(path,{recursive:true,force:true});}
});
test('generation is private until accepted; replay does not charge again; refinement is owner scoped',async()=>{
 let calls=0;const db=await createLogoStore(env),s=createLogoService({env,storeFactory:async()=>db,verify:async token=>token,generate:async({reference})=>{calls++;if(calls===2)assert.ok(reference);return png();}});
 try{const data=input();await s.handle(req('alice'),'/api/logos/generate',data);const first=await settle(s,data.requestId);assert.equal(first.state,'ready');assert.match(first.preview,/^data:image\/png/);assert.equal(await s.publicImage(data.requestId),undefined);
  await s.handle(req('alice'),'/api/logos/generate',data);assert.equal(calls,1);
  await assert.rejects(s.handle(req('bob'),'/api/logos/get',{id:data.requestId}),/not found/);
  await assert.rejects(s.handle(req('bob'),'/api/logos/generate',{...input(),referenceId:data.requestId}),/unavailable/);
  const second={...input(),referenceId:data.requestId};await s.handle(req('alice'),'/api/logos/generate',second);await settle(s,second.requestId);assert.equal(calls,2);
  const selected=await s.handle(req('alice'),'/api/logos/accept',{id:data.requestId});assert.equal(selected.localOnly,true);assert.equal(selected.url,null);assert.ok(await s.publicImage(data.requestId));
 }finally{await s.close();}
});
test('production ignores local test bypass and fails closed without a database',async()=>{
 const production={...env,NODE_ENV:'production'};await assert.rejects(createLogoStore(production),/database/);
 const s=createLogoService({env:production,verify:async()=> 'alice',storeFactory:()=>{throw Error('must not reach database');}});
 assert.equal((await s.handle(req('alice'),'/api/logos/config',{})).eligible,false);
 await assert.rejects(s.handle(req('alice'),'/api/logos/generate',input()),/not enabled/);
 await assert.rejects(s.handle({headers:{}},'/api/logos/generate',input()),/Sign in/);
});
test('failed provider request is retained and never automatically retried',async()=>{
 let calls=0;const s=createLogoService({env,verify:async()=> 'alice',generate:async()=>{calls++;throw Error('secret provider details');}});
 try{const data=input();await s.handle(req('alice'),'/api/logos/generate',data);const r=await settle(s,data.requestId);assert.equal(r.state,'uncertain');assert.doesNotMatch(r.error,/secret/);await s.handle(req('alice'),'/api/logos/generate',data);assert.equal(calls,1);await assert.rejects(s.handle(req('alice'),'/api/logos/accept',{id:data.requestId}),/not found/);}finally{await s.close();}
});
test('only public HTTPS origins can become launch URLs; image inputs are bounded',async()=>{
 assert.equal(logoOrigin({}),null);for(const value of ['http://localhost:4317','https://user:pass@example.com','https://example.com/path'])assert.throws(()=>logoOrigin({DINN_PUBLIC_URL:value}));
 assert.equal(logoOrigin({RENDER_EXTERNAL_URL:'https://dinn.onrender.com'}),'https://dinn.onrender.com');assert.throws(()=>logoPrompt({...input(),name:''}));assert.throws(()=>logoPrompt({...input(),style:'a'.repeat(701)}));
 await assert.rejects(normaliseLogo(Buffer.from('<svg/>')));await assert.rejects(fetchProviderImage('https://127.0.0.1/logo.png'),/not public/);
 const bytes=await png();const result=await generateLogoImage({model:'bytedance/seedream-5.0-lite',prompt:'logo'},{env:{OG_API_KEY:'test'},fetcher:async(url,options)=>{const b=JSON.parse(options.body);assert.equal(b.size,'2048x2048');assert.equal(b.n,1);return new Response(JSON.stringify({data:[{b64_json:bytes.toString('base64')}]}));}});assert.equal((await sharp(result).metadata()).format,'png');
});
test('Z-Image saves the provider handle before polling and resumes without another submission',async()=>{
 const bytes=await png();let submitted=0,polled=0,saved;
 const fetcher=async(url)=>{if(String(url).endsWith('/async/images/generations')){submitted++;return new Response(JSON.stringify({jobId:'job_123',provider_address:'0x'+'1'.repeat(40)}));}polled++;assert.ok(saved);return new Response(JSON.stringify({status:'completed',data:{data:[{b64_json:bytes.toString('base64')}]}}));};
 const options={env:{OG_API_KEY:'test'},fetcher,onJob:async job=>{saved=job;},sleep:async()=>{}};
 await generateLogoImage({model:'z-image-turbo',prompt:'logo'},options);assert.equal(submitted,1);assert.equal(polled,1);
 await generateLogoImage({model:'z-image-turbo',prompt:'logo'},{...options,resume:saved});assert.equal(submitted,1);assert.equal(polled,2);
});

test('recovered provider job remains generating while its saved handle is polled',async()=>{
 const id=randomUUID();let complete;const done=new Promise(resolve=>{complete=resolve;});
 const job={id,state:'uncertain',model:'z-image-turbo',prompt:'logo',created_at:new Date(0),provider_job:{jobId:'saved',provider_address:'0x'+'1'.repeat(40)}};
 const db={get:async()=>job,ready:async(_id,bytes)=>{job.image=bytes;job.state='ready';},fail:async()=>{},close:async()=>{}};
 const service=createLogoService({env,verify:async()=> 'alice',storeFactory:async()=>db,generate:async(_input,options)=>{assert.equal(options.resume.jobId,'saved');await done;return png();}});
 try{const result=await service.handle(req('alice'),'/api/logos/get',{id});assert.equal(result.state,'generating');}finally{complete();await service.close();}
 assert.equal(job.state,'ready');
});

test('first local startup creates missing parent directories before initializing the database',async()=>{
 const root=await mkdtemp(join(tmpdir(),'dinn-first-start-'));
 let db;
 try{db=await createLogoStore({...env,DINN_LOGO_LOCAL_DB:join(root,'missing-parent','logos')});const id=randomUUID();await db.reserve({id,owner:'alice',fingerprint:'first',model:'test',prompt:'logo',limit:1});assert.equal((await db.get(id,'alice')).state,'generating');}finally{if(db)await db.close();await rm(root,{recursive:true,force:true});}
});
