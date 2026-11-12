import test from 'node:test';import assert from 'node:assert/strict';import {blockscoutRead} from '../src/blockscout.mjs';
const path='addresses/0x1111111111111111111111111111111111111111/tokens';
test('authenticated research uses fixed chain routing and constrained pagination',async()=>{const result=await blockscoutRead(path,{env:{BLOCKSCOUT_API_KEY:'fixture'},query:{type:'ERC-20',fiat_value:null,id:7},fetchImpl:async(url,opts)=>{const u=new URL(url);assert.equal(u.origin,'https://api.blockscout.com');assert.match(u.pathname,/^\/4663\/api\/v2\//);assert.equal(u.searchParams.get('apikey'),'fixture');assert.equal(u.searchParams.get('type'),'ERC-20');assert.equal(opts.redirect,'error');return new Response('{"items":[]}');}});assert.deepEqual(result,{items:[]});await assert.rejects(blockscoutRead(path,{env:{BLOCKSCOUT_API_KEY:'fixture'},query:{apikey:'override'}}),/Invalid explorer/);});
test('holder history routes only allowlisted address, transaction, and cursor inputs',async()=>{
 const address='0x'+'2'.repeat(40),hash='0x'+'3'.repeat(64),requests=[];
 const fetchImpl=async url=>{requests.push(new URL(url));return new Response('{"items":[],"next_page_params":null}');};
 await blockscoutRead('addresses/'+address+'/transactions',{env:{BLOCKSCOUT_API_KEY:'fixture'},query:{filter:'from',items_count:20,block_number:123,index:4},fetchImpl});
 await blockscoutRead('transactions/'+hash+'/token-transfers',{env:{BLOCKSCOUT_API_KEY:'fixture'},fetchImpl});
 await blockscoutRead('transactions/'+hash+'/internal-transactions',{env:{BLOCKSCOUT_API_KEY:'fixture'},fetchImpl});
 assert.equal(requests[0].searchParams.get('filter'),'from');assert.equal(requests[0].searchParams.get('items_count'),'20');assert.equal(requests[0].searchParams.get('block_number'),'123');
 assert.match(requests[1].pathname,/\/transactions\/0x3{64}\/token-transfers$/);assert.match(requests[2].pathname,/\/transactions\/0x3{64}\/internal-transactions$/);
 await assert.rejects(blockscoutRead('addresses/'+address+'/transactions',{env:{BLOCKSCOUT_API_KEY:'fixture'},query:{filter:'latest'},fetchImpl}),/Invalid explorer/);
});
test('provider failures do not expose API keys or provider response bodies',async()=>{await assert.rejects(blockscoutRead(path,{env:{BLOCKSCOUT_API_KEY:'SECRET'},fetchImpl:async()=>new Response('SECRET',{status:403})}),e=>!e.message.includes('SECRET'));await assert.rejects(blockscoutRead('https://evil.test',{env:{BLOCKSCOUT_API_KEY:'SECRET'}}),/Unsupported/);});
