import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {chatLimit,createChatAllowanceStore} from '../src/chat-allowance.mjs';

test('free allowance defaults to 50 and supports a positive integer override',()=>{
 assert.equal(chatLimit({}),50);
 assert.equal(chatLimit({DINN_CHAT_FREE_DAILY_LIMIT:'30'}),30);
 for(const value of ['0','-1','abc','0.5'])assert.throws(()=>chatLimit({DINN_CHAT_FREE_DAILY_LIMIT:value}));
});

test('per-account reservations, replay, recovery and midnight rollover',async()=>{
 const db=new PGlite();
 try{
  const first=await createChatAllowanceStore({db}),second=await createChatAllowanceStore({db});
  const input={message:'Research NVDAc on Base'},owner='alice';
  const responses=await Promise.all([first.reserve(owner,'one',input,1),second.reserve(owner,'two',input,1)]);
  const held=responses.find(r=>r.ticket).ticket,id=held[2];
  assert.equal(responses.find(r=>r.error).status,429);
  assert.equal((await second.reserve(owner,id,input,1)).status,409);
  assert.ok((await first.reserve('bob',id,input,1)).ticket);
  await first.release(held);
  const replacement=(await second.reserve(owner,id,input,1)).ticket;
  await first.release(held);
  await second.finish(replacement,{message:'Report ready.',actions:[]});
  assert.equal((await first.reserve(owner,id,input,1)).replay.message,'Report ready.');
  assert.equal((await first.reserve(owner,id,{message:'Other request'},1)).status,409);
  assert.equal((await first.reserve(owner,'fresh',input,1)).status,429);
  await db.query("UPDATE dinn_chat_turns SET day=day-1 WHERE owner=$1",[owner]);
  const today=(await first.reserve(owner,'fresh',input,1)).ticket;
  await second.release(replacement);
  await db.query("UPDATE dinn_chat_turns SET started=now()-interval '11 minutes' WHERE owner=$1",[owner]);
  const next=(await first.reserve(owner,'fresh',input,1)).ticket;
  await assert.rejects(first.finish(today,{message:'stale'}));
  await first.finish(next,{message:'Approve?',actions:[{id:'wallet_approve'}]});
  const {replay}=await first.reserve(owner,'fresh',input,1);
  assert.deepEqual(replay.actions,[]);assert.match(replay.message,/fresh terms/);
  for(let turn=0;turn<50;turn++){
   const r=await first.reserve('new-customer',String(turn),input,chatLimit({}));
   assert.ok(r.ticket);
   await first.finish(r.ticket,{message:'Completed',actions:[]});
  }
  assert.equal((await first.reserve('new-customer','51',input,50)).code,'daily_chat_limit');
  assert.equal((await first.reserve('new-customer','49',input,50)).replay.message,'Completed');
 }finally{await db.close();}
});
