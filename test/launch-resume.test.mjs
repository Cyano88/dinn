import test from 'node:test';
import assert from 'node:assert/strict';
import {hasLaunchProgress,launchReturnChoice} from '../public/launch-resume.js';
test('saved launch progress ignores empty metadata but preserves explicit zero and false choices',()=>{
 assert.equal(hasLaunchProgress({launchpad:'pons',chainId:4663},{socials:{website:''}}),false);
 for(const brief of [{name:'Diana'},{symbol:'DAN'},{description:'My project'}])assert.equal(hasLaunchProgress(brief),true);
 for(const settings of [{creatorTaxBps:0},{buybackEnabled:false},{configId:0},{socials:{website:'https://example.com'}}])assert.equal(hasLaunchProgress({},settings),true);
});
test('return choices accept conversational answers without consuming unrelated wallet or research requests',()=>{
 for(const answer of ['continue','Continue with this token.','resume setup','keep my launch'])assert.equal(launchReturnChoice(answer),'continue');
 for(const answer of ['new','start a new token','start fresh','start over'])assert.equal(launchReturnChoice(answer),'new');
 assert.equal(launchReturnChoice('not now'),'cancel');
 for(const answer of ['check my Base balance','continue swap','research Grail','send tokens'])assert.equal(launchReturnChoice(answer),null);
});
