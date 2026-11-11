import test from 'node:test';
import assert from 'node:assert/strict';
import {fields,parseField,missingField,restoreDraft} from '../public/flow.js';
test('guided flow collects explicit settings including false CTO',()=>{
 const draft={};const answers=['Orbit','orbt','usdc','2%','0x1111111111111111111111111111111111111111','Use deployer wallet','Do not allow'];
 for(const answer of answers){const field=missingField(draft);draft[field.key]=parseField(field.key,answer,draft);}
 assert.equal(missingField(draft),undefined);assert.equal(draft.cto,false);assert.equal(draft.recipient,draft.account);assert.equal(draft.symbol,'ORBT');
 assert.deepEqual(restoreDraft(JSON.stringify({version:1,draft})),draft);
});
test('bad inputs do not advance and corrupt stored data cannot create launch settings',()=>{
 for(const [field,value] of [['name',''],['symbol','x y'],['pair','ETH'],['feePercent','0.5'],['feePercent','2.001'],['account','0x'+'0'.repeat(40)],['cto','maybe']])assert.throws(()=>parseField(field,value));
 assert.deepEqual(restoreDraft('not json'),{});assert.deepEqual(restoreDraft('{"version":2,"draft":{"name":"old"}}'),{});
 const restored=restoreDraft(JSON.stringify({version:1,draft:{name:'Orbit',cto:false,feePercent:'99',privateKey:'secret'}}));
 assert.deepEqual(restored,{name:'Orbit',cto:false});assert.equal(missingField(restored).key,'symbol');assert.equal(fields.length,7);
});

 test('setup distinguishes conversation from field values without changing the draft',async()=>{
 const {setupReply,launchIntent}=await import('../public/flow.js');const draft={name:'GOK',symbol:'GOK'};
 assert.equal(setupReply('pair','HI',draft).kind,'chat');
 assert.equal(setupReply('pair','What does HYPE mean?',draft).kind,'chat');
 assert.equal(setupReply('name','hello',{}).kind,'chat');
 assert.deepEqual(setupReply('pair','use hype',draft),{kind:'value',value:'HYPE'});
 assert.equal(setupReply('pair','HYP',draft).kind,'invalid');
 assert.deepEqual(setupReply('symbol','ticker HI',{}),{kind:'value',value:'HI'});
 assert.deepEqual(setupReply('symbol','HI',{},true),{kind:'value',value:'HI'});
 assert.deepEqual(launchIntent('i want to launch GOK TOKEN'),{name:'GOK'});
 assert.deepEqual(launchIntent('launch a token'),{name:undefined});
 assert.equal(launchIntent('What does a token launch cost?'),null);
 assert.deepEqual(draft,{name:'GOK',symbol:'GOK'});
 });
