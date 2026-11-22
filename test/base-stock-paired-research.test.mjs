import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters} from 'viem';
import {researchBaseStockPairedToken} from '../src/base-stock-paired-research.mjs';
import {baseV4PoolId} from '../src/base-stock-v4.mjs';

const token='0x1111111111111111111111111111111111111111';
const stock='0x2222222222222222222222222222222222222222';
const other='0x3333333333333333333333333333333333333333';
const txHash='0x'+'a'.repeat(64);
const poolKey={currency0:token,currency1:stock,fee:8388608,tickSpacing:200,hooks:'0x'+'6'.repeat(40)};
const poolId=baseV4PoolId(poolKey);
const poolManager='0x498581ff718922c3f8e6a244956af099b2652b2b';
const initialize='0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438';
const topicAddress=value=>'0x'+'0'.repeat(24)+value.slice(2).toLowerCase();
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});

function setup({receiptQuote=stock,registryAddress=stock,baseRpc='https://mainnet.base.org'}={}){
 const launch={chain:'base',status:'deployed',tokenAddress:token,tokenName:'Example',tokenSymbol:'EX',pairedStock:{address:stock,symbol:'NVDA'},poolId,timestamp:Date.now(),txHash};
 const calls=[];
 const fetchImpl=async(input,options={})=>{
  const url=String(input);calls.push(url);
  if(url==='https://api.bankr.bot/token-launches')return response({launches:[launch]});
  if(url===`https://api.bankr.bot/token-launches/${token}/fees`)return response({tokens:[]});
  if(url===`https://api.bankr.bot/token-launches/${token}/vesting`)return response({tokenAddress:token,chain:'base',tokenSymbol:'EX',eligible:false,vesting:null});
  if(url===`https://api.dexscreener.com/token-pairs/v1/base/${token}`)return response([]);
  if(new URL(url).href===new URL(baseRpc).href){
   const body=JSON.parse(options.body);
   if(body.method==='eth_getTransactionReceipt'){const key={...poolKey,currency1:receiptQuote};return response({result:{status:'0x1',blockNumber:'0x10',blockHash:'0x'+'c'.repeat(64),logs:[{address:poolManager,topics:[initialize,receiptQuote===stock?poolId:'0x'+'b'.repeat(64),topicAddress(token),topicAddress(receiptQuote)],data:encodeAbiParameters([{type:'uint24'},{type:'int24'},{type:'address'},{type:'uint160'},{type:'int24'}],[key.fee,key.tickSpacing,key.hooks,1n,0])}]} });}
  }
  return response({},404);
 };
 let inspectOptions;const inspectTokenImpl=async(address,options)=>{inspectOptions=options;return {address,chainId:8453,network:'Base',blockNumber:'16',blockHash:'0x'+'c'.repeat(64),checkedAt:new Date().toISOString(),tokenName:'Example',symbol:'EX',decimals:18,rawSupply:'1000000000000000000000',implementationAddress:null,checks:[],sources:[]};};
 const baseStockOptionsImpl=async()=>({coinbaseRegistry:[{address:registryAddress.toLowerCase(),symbol:'NVDA',name:'NVIDIA',coinbase:{referencePrice:'100',referencePriceUpdatedAt:new Date().toISOString(),multiplier:'1'}}]});
 const holderSnapshotImpl=async()=>null;
 return {fetchImpl,inspectTokenImpl,baseStockOptionsImpl,holderSnapshotImpl,calls,get inspectOptions(){return inspectOptions;}};
}

test('verifies stock pairing only when the successful Base receipt event matches the exact token, stock and Bankr pool',async()=>{
 const deps=setup();
 const result=await researchBaseStockPairedToken({address:token},{...deps});
 assert.equal(result.classification,'verified-bankr-stock-paired-token');
 assert.equal(result.verification.status,'verified');
 assert.equal(result.verification.poolId,poolId);
 assert.equal(result.stock.symbol,'NVDA');
 assert.equal(result.coverage.contractSafety,'not assessed');
});

test('does not verify a launch when the receipt event pairs the token with another asset',async()=>{
 const deps=setup({receiptQuote:other});
 const result=await researchBaseStockPairedToken({address:token},{...deps});
 assert.equal(result.classification,'insufficient-evidence');
 assert.equal(result.verification.status,'unverified');
 assert.equal(result.verification.poolId,null);
});

test('does not verify a launch when its stock address is absent from the Coinbase registry',async()=>{
 const deps=setup({registryAddress:other});
 const result=await researchBaseStockPairedToken({address:token},{...deps});
 assert.equal(result.classification,'insufficient-evidence');
 assert.equal(result.stock,null);
 assert.equal(result.coverage.stockRegistry,'unavailable');
});

test('coalesces concurrent reports for the same token to avoid duplicate upstream reads',async()=>{
 const deps=setup();let stockReads=0,contractReads=0,holderReads=0;
 const options={...deps,baseStockOptionsImpl:async input=>{stockReads++;await new Promise(resolve=>setTimeout(resolve,5));return deps.baseStockOptionsImpl(input);},inspectTokenImpl:async(...args)=>{contractReads++;return deps.inspectTokenImpl(...args);},holderSnapshotImpl:async(...args)=>{holderReads++;return deps.holderSnapshotImpl(...args);}};
 const [first,second]=await Promise.all([researchBaseStockPairedToken({address:token},options),researchBaseStockPairedToken({address:token},options)]);
 assert.equal(first,second);assert.equal(stockReads,1);assert.equal(contractReads,1);assert.equal(holderReads,1);
});

test('free-preview mode skips GoldRush holder calls and labels that coverage gap',async()=>{
 const deps=setup();let holderReads=0;
 const result=await researchBaseStockPairedToken({address:token},{...deps,env:{GOLDRUSH_API_KEY:'test-only'},holderSnapshotEnabled:false,holderSnapshotImpl:async()=>{holderReads++;return null;}});
 assert.equal(holderReads,0);assert.equal(result.holders,null);assert.match(result.coverage.holders,/not requested for the free public preview/);
});

test('paid-hire mode includes the configured GoldRush holder snapshot without exposing its key',async()=>{
 const deps=setup();let holderReads=0,authorization;
 const fetchImpl=async(input,options={})=>{
  if(String(input).startsWith('https://api.covalenthq.com/v1/base-mainnet/tokens/')){
   holderReads++;authorization=options.headers?.authorization;
   return response({data:{updated_at:'2026-11-20T12:00:00Z',chain_tip_height:16,pagination:{total_count:1,page_size:1000,has_more:false},items:[{address:other,balance:'1000000000000000000',contract_decimals:18,total_supply:'1000000000000000000',block_height:16}]}});
  }
  return deps.fetchImpl(input,options);
 };
 const providerDeps={...deps};delete providerDeps.holderSnapshotImpl;
 const result=await researchBaseStockPairedToken({address:token},{...providerDeps,fetchImpl,env:{GOLDRUSH_API_KEY:'test-only'},holderSnapshotEnabled:true});
 assert.equal(holderReads,1);assert.equal(authorization,'Bearer test-only');
 assert.equal(result.holders?.source,'GoldRush Token Holders API');assert.equal(result.holders?.holderCount,1);
 assert.equal(result.holders?.largestBalancesInSample[0]?.address,other);assert.match(result.coverage.holders,/Complete holder list returned/);
});

test('Base research uses the configured server RPC for contract and receipt reads',async()=>{
 const baseRpc='https://base-provider.example/rpc/credential-path',deps=setup({baseRpc});
 await researchBaseStockPairedToken({address:token},{...deps,env:{NODE_ENV:'production',BASE_RPC_URL:baseRpc},holderSnapshotEnabled:false});
 assert.equal(deps.inspectOptions.rpc,baseRpc);assert.ok(deps.calls.includes(baseRpc));
});

test('rejects invalid token addresses before any source request',async()=>{
 const deps=setup();
 await assert.rejects(researchBaseStockPairedToken({address:'0x0'},{...deps}),/valid Base token/);
 assert.equal(deps.calls.length,0);
});
test('discovery counts only the receipt-verified pool and preserves missing volume',async()=>{
 const {fetchImpl}=setup();
 const {discoverStockPairs}=await import('../src/base-stock-paired-research.mjs');
 const options={baseStockOptionsImpl:async()=>({sources:{coinbase:{status:'available'}},coinbaseRegistry:[{address:stock,symbol:'NVDAc'}]}),fetchImpl:async(url,init)=>{
  if(String(url).includes('/pools/multi/'))return response({data:[]});
  if(String(url).includes('dexscreener.com'))return response([{chainId:'base',pairAddress:poolId,baseToken:{address:token},quoteToken:{address:stock},liquidity:{usd:700}}]);
  const r=await fetchImpl(url,init);
  if(init?.method==='POST'){const j=await r.json();j.result.transactionHash=txHash;return response(j);}
  return r;
 }};
 const ranked=await discoverStockPairs('liquidity',options);assert.equal(ranked.candidates[0].address,token);assert.equal(ranked.candidates[0].liquidity,700);
 const missing=await discoverStockPairs('volume',options);assert.equal(missing.comparable,0);assert.deepEqual(missing.candidates,[]);
 const {PGlite}=await import('@electric-sql/pglite');
 const {createPairCatalog}=await import('../src/base-pair-catalog.mjs');
 const db=new PGlite();
 try{
  const catalog=await createPairCatalog(db);
  await discoverStockPairs('liquidity',{...options,catalog});
  const reopened=await createPairCatalog(db);
  const older=await discoverStockPairs('liquidity',{...options,catalog:reopened,fetchImpl:(url,init)=>
   String(url)==='https://api.bankr.bot/token-launches'?response({launches:[]}):options.fetchImpl(url,init)});
  assert.equal(older.listed,0);
  assert.equal(older.eligible,1);
  assert.equal(older.candidates[0].address,token);
  assert.equal(older.candidates[0].liquidity,700);
 }finally{await db.close();}

});
