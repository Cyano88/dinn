import test from 'node:test';import assert from 'node:assert/strict';import {appendChatState,restoreChatState,savedChatResult} from '../public/chat-state.js';
const address='0x1111111111111111111111111111111111111111',profile={address,name:'Example',symbol:'EX',description:'Example description',logo:'',website:'',twitter:'',telegram:''};
test('DEX review payload survives refresh and stays aligned after chat trimming',()=>{let s=appendChatState([],[],'prepare dex '+address,'Prepared DEX Screener profile.',{actions:[{id:'dex',address,preparation:{profile,inference:'generated'}}]});let r=restoreChatState(JSON.stringify(s));assert.equal(r.results[1].actions[0].preparation.profile.description,profile.description);assert.equal(r.results[1].actions[0].preparation.restored,true);for(let i=0;i<8;i++)s=appendChatState(s.messages,s.results,'question '+i,'answer '+i);assert.equal(s.messages.length,12);assert.ok(s.results.every(x=>x===null));});
test('legacy DEX reply recovers checkout only from its explicit token address',()=>{const messages=[{role:'user',content:'Prepare DEX Screener profile for '+address},{role:'assistant',content:'Prepared DEX Screener profile.'}];assert.equal(restoreChatState(JSON.stringify({messages})).results[1].actions[0].address,address);messages[0].content='read wallet balance '+address;assert.equal(restoreChatState(JSON.stringify({messages})).results[1],null);assert.equal(savedChatResult({actions:[{id:'dex',address:'https://evil.test'},{id:'launch',address}]}),null);});

test('inspection evidence survives refresh without changing its checked time or becoming a fresh report',()=>{const inspection={chainId:4663,address,blockNumber:'42',blockHash:'0x'+'a'.repeat(64),checkedAt:'2026-11-10T12:00:00Z',checks:[{label:'LP lock',status:'unknown',detail:'Not verified.',evidence:[]}]};const s=appendChatState([],[],'check token '+address,'Checked.',{inspection});const r=restoreChatState(JSON.stringify(s)).results[1];assert.equal(r.inspection.checkedAt,inspection.checkedAt);assert.equal(r.restored,true);assert.equal(r.tokenAddress,address);assert.equal(savedChatResult({inspection:{...inspection,chainId:1}}),null);assert.equal(savedChatResult({inspection:{...inspection,checks:[{label:'x',status:'safe',detail:'safe'}]}}),null);});

test('chat keeps locker results and release dates after saving and reopening a report',async()=>{
 const {cleanInspection,lockCoverageText}=await import('../public/token-report.js');
 const report={chainId:4663,address:'0x'+'1'.repeat(40),blockNumber:'77',blockHash:'0x'+'a'.repeat(64),checkedAt:'2026-11-22T12:00:00Z',checks:[],titanLocks:[{status:'observed',records:[{id:'1',locked:'25',unlockDate:'2027-01-01'}]}],hoodLocks:[{status:'no-match',records:[]}],uncxVesting:{status:'partial',records:[]},pinkLock:{status:'partial',records:[]}};
 const restored=cleanInspection(cleanInspection(report));
 assert.equal(restored.titanLocks[0].records[0].unlockDate,'2027-01-01');
 const summary=lockCoverageText(restored);
 assert.match(summary,/across our locker providers/);
 assert.match(summary,/Found 1 lock or vesting record/);
 assert.doesNotMatch(summary,/PinkLock|HoodLock|Titan|UNCX/);
 assert.match(summary,/incomplete/);
 assert.doesNotMatch(lockCoverageText(cleanInspection({...report,titanLocks:undefined,hoodLocks:undefined,uncxVesting:undefined})),/UNCX|HoodLock|Titan/);
});

test('public lock links use the correct network, record ID and manager version',async()=>{
 const {firstLockPreview}=await import('../public/token-report.js');
 const record={id:'14',locked:'15',unlockDate:'2027-01-01'};
 for(const [input,url] of [
  [{titanLocks:[{version:'V2.2',records:[record]}]},'https://titanlocker.com/lock/v2_2/14'],
  [{hoodLocks:[{kind:'vesting',records:[record]}]},'https://hoodlock.tech/proof/vesting/14'],
  [{uncxVesting:{records:[record]}},'https://app.uncx.network/vesting-v2/flux/4663-14'],
  [{pinkLock:{records:[{...record,pinkSaleUrl:'https://www.pinksale.finance/pinklock/robinhood/record/14'}]}},'https://www.pinksale.finance/pinklock/robinhood/record/14']
 ])assert.ok(firstLockPreview(input).includes('[View lock]('+url+')'));
 assert.doesNotMatch(firstLockPreview({pinkLock:{records:[{...record,pinkSaleUrl:'https://www.pinksale.finance/pinklock/robinhood/record/15'}]}}),/View lock/);
});
