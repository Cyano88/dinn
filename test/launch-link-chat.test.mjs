import test from 'node:test';
import assert from 'node:assert/strict';
import {launchLinkSteps,parseLaunchLink,previewLimitMessage} from '../public/launch-link-chat.js';
test('guided link order is X, Telegram, then website',()=>assert.deepEqual(launchLinkSteps.map(s=>s.field),['twitter','telegram','website']));
test('handles and bare domains normalize within the current question',()=>{assert.deepEqual(parseLaunchLink('@dinn','twitter'),{action:'set',field:'twitter',url:'https://x.com/dinn'});assert.equal(parseLaunchLink('@dinn','telegram').url,'https://t.me/dinn');assert.equal(parseLaunchLink('dinn.example','website').url,'https://dinn.example/');});
test('skip is per field and skip all is explicit',()=>{assert.deepEqual(parseLaunchLink('skip','twitter'),{action:'skip',field:'twitter'});assert.equal(parseLaunchLink('skip all links','website').action,'skip-all');assert.equal(parseLaunchLink('keep','telegram').action,'keep');});
test('labelled links preserve field identity instead of overwriting the question field',()=>{assert.equal(parseLaunchLink('website https://example.com','twitter').field,'website');assert.equal(parseLaunchLink('tg @dinn','website').field,'telegram');});
test('invalid schemes, credentials and misleading social domains are rejected',()=>{for(const value of ['http://x.com/dinn','https://user:pass@x.com/dinn','https://x.com.evil.example/dinn','https://x.com'])assert.equal(parseLaunchLink(value,'twitter').action,'error');assert.equal(parseLaunchLink('https://x.com/dinn','telegram').action,'error');assert.equal(parseLaunchLink('what is Telegram?','telegram'),null);});

test('preview allowance uses local calendar days across midnight and scopes saved-preview guidance',()=>{
 const now=new Date(2026,10,23,23,59);
 const at=new Date(2026,10,24,0,1,15);
 const info={availableAt:at.toISOString(),pendingSlot:false};
 assert.match(previewLimitMessage(info,true,now),/opens tomorrow at .+saved preview/);
 assert.match(previewLimitMessage({...info,pendingSlot:true},false,at),/Check again today at /);
 assert.doesNotMatch(previewLimitMessage(info,false,now),/saved preview/);
});
