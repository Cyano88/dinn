import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationTask,parseField} from '../public/flow.js';
import {validateProfile} from '../public/profile.js';
test('conversational edits target an explicit field rather than the pending question',()=>{
 const task=conversationTask('change the ticker to GOK');assert.equal(task.key,'symbol');assert.equal(parseField(task.key,task.value),'GOK');
 assert.equal(conversationTask('Can you change the name to Orbit?').value,'Orbit');
 assert.equal(conversationTask('set the trading fee to 2%').key,'feePercent');
 assert.equal(conversationTask('what is a ticker?'),null);
 assert.equal(conversationTask('change supply to 2 billion').kind,'clarify');
 assert.equal(conversationTask('change the ticker to GOK and set the fee to 2%').kind,'clarify');
});
test('social edits use existing profile validation and retain other fields',()=>{
 const task=conversationTask('add X account @gok');assert.equal(task.key,'twitter');
 const next=validateProfile({description:'Existing',website:'https://example.com',[task.key]:task.value});assert.equal(next.twitter,'https://x.com/gok');assert.equal(next.description,'Existing');
 const bad=conversationTask('set website to javascript:alert(1)');assert.throws(()=>validateProfile({[bad.key]:bad.value}));
 assert.throws(()=>parseField('symbol',conversationTask('change ticker to TOO_LONG_TICKER').value));
 assert.equal(conversationTask('what is still missing?').kind,'missing');assert.equal(conversationTask('add a logo').kind,'logo');assert.equal(conversationTask('add logo').kind,'logo');
});

test('discard and chat commands are recognized independently of setup answers',()=>{
 for(const text of ['clear','clear draft','Discard','delete my draft','reset token setup','please discard the current draft']){
  assert.equal(conversationTask(text)?.kind,'discard',text);
 }
 for(const text of ['clear chat','delete this chat','delete this chat session'])assert.equal(conversationTask(text).kind,'new-chat');
 assert.equal(conversationTask('what happens if I discard?'),null);
 assert.equal(conversationTask('USDC'),null);
});
