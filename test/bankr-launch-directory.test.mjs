import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createPonsLaunchStore} from '../src/pons-launch-store.mjs';
test('the shared directory paginates both chains, deduplicates receipt retries and finds a Bankr ticker', async()=>{
 const db=new PGlite();
 try{
  const store=await createPonsLaunchStore({db});
  const first={hash:'0x11',token:'0xabc',curve:'0xdef',account:'0xaaa',name:'First',symbol:'ONE',logo:'',pairToken:'0x123',pairSymbol:'ETH',blockNumber:100,launchedAtSeconds:1000};
  await store.put('owner',first);
  const next={...first,hash:'0x22',name:'Turkey',symbol:'TURKEY',pairSymbol:'NFLXc',poolId:'0x456',launchedAtSeconds:2000};
  await store.putBankr(next);await store.putBankr(next);
  const page=await store.list({limit:1});assert.equal(page.total,2);assert.equal(page.items[0].chainId,8453);
  assert.equal((await store.list({offset:1})).items[0].name,'First');
  assert.equal((await store.list({query:'$turkey'})).items[0].origin,'dinn-bankr');
 }finally{await db.close();}
});
