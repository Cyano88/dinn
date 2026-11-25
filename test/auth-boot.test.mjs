import test from 'node:test';
import assert from 'node:assert/strict';
import {clearBootReload,loadAuthConfig,reserveBootReload} from '../public/auth-boot.js';
test('auth recovers a transient request and stops after repeated failures',async()=>{
 let attempts=0;const wait=async()=>{};
 assert.deepEqual(await loadAuthConfig(async()=>++attempts===1?new Response(null,{status:503}):Response.json({ok:true}),wait),{ok:true});
 attempts=0;await assert.rejects(loadAuthConfig(async()=>{attempts++;throw Error('offline');},wait));assert.equal(attempts,3);
 attempts=0;await assert.rejects(loadAuthConfig(async()=>{attempts++;return new Response(null,{status:403});},wait));assert.equal(attempts,1);
});
test('failed module graph gets one fresh navigation and resets after authentication',()=>{
 const data=new Map(),storage={setItem:(k,v)=>data.set(k,v),getItem:k=>data.get(k),removeItem:k=>data.delete(k)};
 assert.equal(reserveBootReload(storage,5000),true);assert.equal(reserveBootReload(storage,6000),false);clearBootReload(storage);assert.equal(reserveBootReload(storage,7000),true);
});
