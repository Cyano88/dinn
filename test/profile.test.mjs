import test from 'node:test';
import assert from 'node:assert/strict';
import {validateProfile,restoreProfile} from '../public/profile.js';
test('profile accepts optional project links and rejects executable or spoofed URLs',()=>{
 const p=validateProfile({description:'GOK community',website:'https://example.com',twitter:'https://x.com/gok',telegram:'https://t.me/gok'});assert.equal(p.website,'https://example.com/');
 for(const value of ['javascript:alert(1)','http://example.com','https://user:password@example.com'])assert.throws(()=>validateProfile({website:value}));
 assert.throws(()=>validateProfile({twitter:'https://x.com.evil.example/name'}));
 assert.throws(()=>validateProfile({telegram:'https://evil.example/t.me'}));
 assert.throws(()=>validateProfile({description:'a'.repeat(501)}));
 assert.throws(()=>validateProfile({image:'data:image/svg+xml;base64,PHN2Zz4='}));
 assert.deepEqual(restoreProfile('{bad'),validateProfile());
});
