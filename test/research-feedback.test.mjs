import test from 'node:test';
import assert from 'node:assert/strict';
import {feedbackRequest} from '../src/research-feedback.mjs';
const id='11111111-1111-4111-8111-111111111111',target='0x'+'3'.repeat(40),code='a'.repeat(64);
const req={headers:{}};
test('chat feedback needs sign-in and rejects empty answers',async()=>{
 const path='/api/feedback/chat',data={id,target,chainId:8453};
 assert.equal((await feedbackRequest(req,path,data)).status,401);
 assert.equal((await feedbackRequest(req,path,{...data,reply:'  '})).status,400);
});
test('market feedback only opens for the accepted private assignment capability',async()=>{
 let phase='submitted',writes=0;
 const database=async()=>({query:async(sql,args)=>{
  if(sql.startsWith('SELECT')){assert.equal(args[0],id);assert.notEqual(args[1],code);return {rows:[{phase,target,test:'true'}]};}
  writes++;return {rowCount:1};
 }});
 const run=()=>feedbackRequest(req,'/api/feedback/market',{id,code,reply:'Notify on unlocks'},{database});
 assert.equal((await run()).status,409);assert.equal(writes,0);
 phase='accepted-test-run';assert.equal((await run()).body.saved,true);assert.equal(writes,2);
});
import {PGlite} from '@electric-sql/pglite';
import {feedbackSchema,feedbackFeed} from '../src/research-feedback.mjs';
test('public replies require the shown byline, preserve private history and stay withdrawn on retry',async()=>{
 const pg=new PGlite();
 try{
  await pg.exec(feedbackSchema);
  const database=async()=>({query:async(sql,args)=>{
   const result=await pg.query(sql,args);
   return {...result,rowCount:result.affectedRows};
  }});
  const send=(actor,data)=>feedbackRequest({headers:{authorization:'Bearer '+actor}},'/api/feedback/chat',data,{
   database,verifyChatUser:async value=>value,chatProfile:async()=>({linked_accounts:[{type:'twitter_oauth',username:'Example'}]})
  });
  const offer={id,target,chainId:8453,publicFeed:true};
  await send('old',{id,target,chainId:8453,reply:'Private'});
  assert.equal((await send('old',offer)).body.byline,null);
  const submission={...offer,byline:'@Exa\u2026le',reply:'Unlock updates please'};
  assert.equal((await send('old',submission)).status,409);
  assert.equal((await send('alice',offer)).body.byline,'@Exa\u2026le');
  assert.equal((await send('alice',{...submission,byline:'@Fake'})).status,409);
  assert.equal((await send('alice',submission)).body.published,true);
  assert.deepEqual((await feedbackFeed(database)).entries,[{reply:submission.reply,byline:'@Exa\u2026le',source:'chat'}]);
  assert.equal((await send('bob',{action:'removeLatest'})).body.removed,false);
  assert.equal((await send('alice',{action:'removeLatest'})).body.removed,true);
  assert.equal((await send('alice',submission)).body.published,false);
  assert.deepEqual((await feedbackFeed(database)).entries,[]);
 }finally{await pg.close();}
});

test('public chat attribution masks short handles and email providers without leaking a private domain',async()=>{
 const {publicChatByline,publicAgentByline}=await import('../public/feedback-byline.js');
 assert.equal(publicAgentByline('Atlas'),'Atlas');
 assert.equal(publicAgentByline('hdbdd12345@gmail.com'),'hdbdd\u2026@gmail');
 for(const [raw,masked] of [['@egf01234yhth','@egf\u2026yhth'],['hdbdd12345@gmail.com','hdbdd\u2026@gmail'],['ab@personal.org','a\u2026@email'],['@x','@\u2026'],['Legacy Name','Dinn member']]){
  assert.equal(publicChatByline(raw),masked);
  assert.equal(publicChatByline(masked),masked);
 }
});
