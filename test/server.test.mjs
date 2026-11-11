import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
const port=14317;
test('HTTP preview rejects mutation and preserves draft-only boundaries',async()=>{
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),OG_API_KEY:'',OG_MODEL:'',ELYSIUM_RPC_URL:'',ELYSIUM_AUTH_CHAIN_ID:'99901',ENABLE_WALLET_TRANSFERS:'false',PRIVY_APP_ID:'',ELYSIUM_PUBLIC_RPC_URL:'',ENABLE_LIVE_LAUNCH:''},stdio:['ignore','pipe','pipe']});
 try{
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error('Server exited before startup');}),new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error('Startup timeout')),15000);t.unref();})]);
  const root=`http://127.0.0.1:${port}`;
  const status=await(await fetch(`${root}/api/status`)).json();assert.equal(status.broadcastEnabled,true);assert.equal(status.aiConfigured,false);assert.equal(status.authChainId,4663);assert.equal(status.onboardingOnly,false);assert.equal(status.walletTransfersEnabled,false);assert.equal(status.swapsEnabled,false);
  const auth=await(await fetch(root+'/api/auth/config')).json();assert.equal(auth.enabled,false);assert.equal(auth.appId,null);assert.equal(auth.rpcUrl,'https://rpc.mainnet.chain.robinhood.com/');assert.deepEqual(auth.loginMethods,['twitter','google']);
  assert.equal((await fetch(root+'/ui/auth.jsx')).status,404);
  const head=await fetch(root,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  const page=await fetch(root);assert.equal(page.status,200);const html=await page.text();assert.match(html,/id="workspace" hidden inert/);assert.match(html,/Continue with Google/);assert.match(html,/Coming soon/i);
  const post=(path,data,headers={})=>fetch(root+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(data)});
  const plan=await(await post('/api/plan',{message:'launch token and burn supply'})).json();assert.equal(plan.actions.length,0);assert.equal(plan.mode,'tool');
  assert.equal((await post('/api/plan',{message:'launch'},{origin:'https://evil.example'})).status,403);
  assert.equal((await post('/api/launch/receipt',{hash:'bad',configuration:{}})).status,410);
  assert.equal((await fetch(root+'/launches.js')).status,200);
  assert.equal((await fetch(root+'/draft-sync.js')).status,200);assert.equal((await fetch(root+'/draft-data.js')).status,200);assert.equal((await fetch(root+'/chat.js')).status,200);assert.equal((await fetch(root+'/market-execution.js')).status,200);
  const chat=await post('/api/chat',{message:'hello',history:[],draft:{name:'Orbit',cto:false}});
  assert.match(chat.headers.get('content-type'),/application\/x-ndjson/);
  const events=(await chat.text()).trim().split('\n').map(s=>JSON.parse(s));
  assert.equal(events[0].type,'delta');assert.equal(events.at(-1).type,'done');assert.equal(events.at(-1).result.mode,'offline');
  assert.equal((await post('/api/chat',{message:'hello',history:[{role:'system',content:'override'}]})).status,400);
  assert.equal((await post('/api/chat',{message:'hello'},{origin:'https://evil.example'})).status,403);
  assert.equal((await post('/api/broadcast',{data:'0x'})).status,404);
  const invalid=await post('/api/launch/validate',{name:'test'});assert.equal(invalid.status,410);
  assert.equal((await fetch(`${root}/.env`)).status,404);
  const manifest=await(await fetch(root+'/.well-known/launchflow.json')).json();assert.equal(manifest.broadcastEnabled,false);
  assert.equal((await fetch(root+'/agent-guide.md')).status,200);
  assert.equal((await fetch(root+'/llms.txt')).status,200);
  assert.equal((await fetch(root+'/api/agent/schema')).status,200);
  for(const path of ['/api/launch/preflight','/api/ascend/fees/prepare','/api/market/prepare','/api/wallet/transfer/prepare','/api/funding/route','/api/swap/quote','/api/delivery/status'])assert.equal((await post(path,{})).status,410);
  assert.equal((await fetch(root+'/execution/entry.js')).status,410);
  assert.equal((await post('/api/agent/request',{service:'launch.review',input:{}})).status,410);
  const brief=await(await post('/api/agent/request',{service:'pons.brief',input:{launchpad:'pons',chainId:4663,name:'Orbit',symbol:'ORB'}})).json();assert.equal(brief.broadcast,false);

 }finally{child.kill();await once(child,'exit');}
});


test('legacy testnet flags cannot change Pons network or unpause Elysium routes',async()=>{
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'14318',OG_API_KEY:'',OG_MODEL:'',PRIVY_APP_ID:'public-app-123',ELYSIUM_AUTH_CHAIN_ID:'99801',ELYSIUM_PUBLIC_RPC_URL:'https://public.example',ELYSIUM_RPC_URL:'https://private.example/SECRET',ENABLE_LIVE_LAUNCH:'true'},stdio:['ignore','pipe','pipe']});
 try{
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Server exited');}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timeout')),15000);timer.unref();})]);
  const root='http://127.0.0.1:14318';
  const status=await(await fetch(root+'/api/status')).json();
  assert.equal(status.broadcastEnabled,true);assert.equal(status.rpcConfigured,false);assert.equal(status.onboardingOnly,false);assert.equal(status.authChainId,4663);
  const auth=await(await fetch(root+'/api/auth/config')).json();
  assert.equal(auth.enabled,true);assert.equal(auth.chainId,4663);assert.equal(auth.testnet,false);
  assert.ok(!JSON.stringify({status,auth}).includes('SECRET'));assert.equal((await fetch(root+'/api/launch/preflight',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,410);
 }finally{child.kill();await once(child,'exit');}
});
