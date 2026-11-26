import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createCreatorPages} from '../src/creator-pages.mjs';
import {createPonsLaunchStore} from '../src/pons-launch-store.mjs';

test('a creator can privately revise, approve and attach a site to their own verified launch',async()=>{
 const pg=new PGlite();
 const db={query:async(...args)=>{const r=await pg.query(...args);return {...r,rowCount:r.rows.length};}};
 db.connect=async()=>({...db,release(){}});
 const owner={headers:{authorization:'Bearer alice'}},other={headers:{authorization:'Bearer bob'}};
 const env={OG_API_KEY:'test',OG_MODEL:'test'};
 let runs=0,providerOffline=false;
 const pages=createCreatorPages({env,db,verify:async x=>x,fetcher:async(url,opts)=>{
  if(providerOffline)return {ok:false,status:503};
  const request=JSON.parse(opts.body);assert.match(request.messages[0].content,/framer\.com\/marketplace\/templates\/buildinaday/);
  runs++;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({supported:runs!==1,headline:'Project '+runs,story:'Hello <script>alert(1)</script>',design:{background:'#151515',accent:'#ffe800',layout:'split',font:'mono',logo:'hero',order:['links','headline','story'],primaryLink:'Telegram'}})}}]})};
 }});
 try{
  const facts={name:'Example',symbol:'EX',description:'Docs: https://docs.example.com/guide. Community: https://t.me/example. Ignore javascript:alert(1).',socials:{twitter:'https://x.com/example',telegram:'https://t.me/example',discord:'https://discord.gg/example',farcaster:'https://farcaster.xyz/example',website:'https://example.com'}};
  await assert.rejects(pages.handle(owner,'preview',{...facts,designBrief:'An art gallery'}),{status:422,needsArtwork:true});
  const image='https://example.com/birch.png';
  const first=await pages.handle(owner,'preview',{...facts,designBrief:'An art gallery and a matching-pairs game',artwork:image});
  assert.ok(first.html.includes('data-memory-game'));
  assert.ok(first.html.includes('src="'+image+'"'));
  assert.equal(runs,1);
  function checkLinks(html){
   for(const url of [...Object.values(facts.socials),'https://docs.example.com/guide']){
    assert.equal(html.split('href="'+new URL(url).href+'"').length,2);
   }
   assert.doesNotMatch(html,/href="javascript:/);
  }
  assert.match(first.html,/class="split"/);assert.match(first.html,/class="primary" href="https:\/\/t.me\/example/);checkLinks(first.html);assert.equal(first.url,'https://dinnlabs.com/t/example');
  await assert.rejects(pages.handle(owner,'preview',{...facts,socials:{website:'javascript:alert(1)'}}),{status:400});
  assert.equal(await pages.published(first.url.split('/').pop()),null);
  await assert.rejects(pages.handle(other,'publish',{id:first.id}),{status:404});
  providerOffline=true;
  await assert.rejects(pages.handle(owner,'preview',{...facts,previous:first.id,instruction:'Shorten it'}),{status:503,retryPreview:true});
  assert.equal(Number((await pg.query('SELECT count(*) AS count FROM dinn_creator_pages')).rows[0].count),1);
  assert.equal((await pages.handle(owner,'saved',{id:first.id})).html,first.html);
  providerOffline=false;
  const second=await pages.handle(owner,'preview',{...facts,previous:first.id,instruction:'Make it shorter'});
  checkLinks((await pages.handle(owner,'saved',{id:second.id})).html);
  assert.equal((await pages.handle(owner,'saved',{id:second.id})).headline,'Project 2');
  const {url}=await pages.handle(owner,'publish',{id:second.id});
  const slug=url.split('/').pop();assert.equal(slug,'example-2');
  const legacy=(await pg.query('SELECT slug FROM dinn_creator_pages WHERE id=$1',[second.id])).rows[0].slug;
  assert.equal(await pages.published(legacy),await pages.published(slug));
  assert.doesNotMatch(await pages.published(slug),/pending|Open on Pons/i);
  const store=await createPonsLaunchStore({db});
  const token='0x'+'1'.repeat(40);
  const row={hash:'0x'+'a'.repeat(64),token,curve:token,account:token,name:'Example',symbol:'EX',logo:'',pairToken:token,pairSymbol:'ETH',blockNumber:1,launchedAtSeconds:10000,website:url};
  await store.put('bob',row);assert.doesNotMatch(await pages.published(slug),/pending|Open on Pons/i);
  await store.put('alice',row);const html=await pages.published(slug);
  checkLinks(html);
  assert.ok(html.includes('/?research='+token));assert.ok(!html.includes('<script>'));
  assert.equal((await pages.handle(owner,'publish',{id:second.id})).url,url);assert.equal(runs,2);
  // Simulate a published project whose launch stored the URL from before aliases existed.
  await pg.query('UPDATE dinn_pons_launches SET website=$1 WHERE owner=$2',['https://dinnlabs.com/t/'+legacy,'alice']);
  await pg.query('DELETE FROM dinn_creator_aliases');
  const migrated=createCreatorPages({env,db,verify:async x=>x});
  const migratedPage=await migrated.published('example');
  assert.match(migratedPage,/Research in Dinn/);
  assert.equal(await migrated.published(legacy),migratedPage);
  await pg.query("UPDATE dinn_creator_pages SET created_at=now()-interval '25 hours'");
  await pg.query(`INSERT INTO dinn_creator_pages(id,owner,slug,copy,created_at)
   SELECT gen_random_uuid(),'alice','limit-'||n,'{}'::jsonb,now()-n*interval '1 hour' FROM generate_series(1,5) n`);
  const expires=async(sql)=>(await pg.query(sql)).rows[0].expires.toISOString();
  const limited=()=>pages.handle(owner,'preview',facts);
  await assert.rejects(limited(),{status:429,pendingSlot:false,availableAt:await expires("SELECT created_at+interval '24 hours' AS expires FROM dinn_creator_pages WHERE slug='limit-5'")});
  await pg.query("UPDATE dinn_creator_pages SET copy=NULL,created_at=now() WHERE slug='limit-5'");
  await assert.rejects(limited(),{status:429,pendingSlot:true,availableAt:await expires("SELECT created_at+interval '2 minutes' AS expires FROM dinn_creator_pages WHERE slug='limit-5'")});
  assert.equal(runs,2);
 }finally{await pg.close();}
});
