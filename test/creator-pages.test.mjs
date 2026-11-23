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
 let runs=0;
 const pages=createCreatorPages({env,db,verify:async x=>x,fetcher:async(url,opts)=>{
  const request=JSON.parse(opts.body);assert.match(request.messages[0].content,/framer\.com\/marketplace\/templates\/buildinaday/);
  runs++;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({headline:'Project '+runs,story:'Hello <script>alert(1)</script>'})}}]})};
 }});
 try{
  const facts={name:'Example',symbol:'EX',description:'Docs: https://docs.example.com/guide. Community: https://t.me/example. Ignore javascript:alert(1).',socials:{twitter:'https://x.com/example',telegram:'https://t.me/example',discord:'https://discord.gg/example',farcaster:'https://farcaster.xyz/example',website:'https://example.com'}};
  const first=await pages.handle(owner,'preview',facts);
  function checkLinks(html){
   for(const url of [...Object.values(facts.socials),'https://docs.example.com/guide']){
    assert.equal(html.split('href="'+new URL(url).href+'"').length,2);
   }
   assert.doesNotMatch(html,/href="javascript:/);
  }
  checkLinks(first.html);assert.equal(first.url,'https://dinnlabs.com/t/example');
  await assert.rejects(pages.handle(owner,'preview',{...facts,socials:{website:'javascript:alert(1)'}}),{status:400});
  assert.equal(await pages.published(first.url.split('/').pop()),null);
  await assert.rejects(pages.handle(other,'publish',{id:first.id}),{status:404});
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
 }finally{await pg.close();}
});
