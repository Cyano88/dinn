import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,encodeFunctionData,encodeFunctionResult,parseAbi} from 'viem';
import {baseStockLookup} from '../src/base-stock-data.mjs';
import {b20Snapshot,researchBaseStock,baseStockResearchMessage} from '../src/base-stock-research.mjs';

const address='0xb20000000000000000000078ee7ce2fe4908108c';
const other='0x1111111111111111111111111111111111111111';
const row={chainId:8453,address,symbol:'NVDAc',name:'NVIDIA Corporation',decimals:8,totalSupply:'62019.73777574',multiplier:'1.0005',referencePrice:'180.25',referencePriceUpdatedAt:'2026-11-20T20:00:00Z',firstMintAt:'2026-10-01T00:00:00Z',isin:'US67066G1040'};
const result=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});

test('Base stock lookup searches Coinbase registry, not just Bankr quote tokens',async()=>{
 const fetchImpl=async input=>{
  const url=new URL(String(input));
  if(url.hostname==='api.coinbase.com')return result({tokens:[{contract_address:address,symbol:'NVDAc',name:'NVIDIA Corporation',decimals:8,total_supply:'62019.73777574',multiplier:'1.0005',nav_price:'180.25',nav_price_updated_at:'2026-11-20T20:00:00Z',first_mint_date:'2026-10-01T00:00:00Z',isin:'US67066G1040'}]});
  if(url.hostname==='api.bankr.bot')return result({chain:'base',quoteTokens:[{kind:'stock',address:other,symbol:'OTHc',name:'Other',deployField:'pairedStockAddress',illiquid:false}]});
  return result({},404);
 };
 const found=await baseStockLookup({query:'NVDAc'},{fetchImpl});
 assert.equal(found.stocks.length,1);assert.equal(found.stocks[0].address,address);assert.equal(found.stocks[0].bankrPairSupported,false);
});

test('B20 reads are pinned to one Base block and report transfer controls without owner() assumptions',async()=>{
 const abi=parseAbi(['function name() view returns (string)','function symbol() view returns (string)','function decimals() view returns (uint8)','function totalSupply() view returns (uint256)','function multiplier() view returns (uint256)','function pausedFeatures() view returns (uint8[])','function TRANSFER_SENDER_POLICY() view returns (bytes32)','function TRANSFER_RECEIVER_POLICY() view returns (bytes32)','function TRANSFER_EXECUTOR_POLICY() view returns (bytes32)','function MINT_RECEIVER_POLICY() view returns (bytes32)','function policyId(bytes32 policyScope) view returns (uint64)']);
 const pinned=[];
 const fetchImpl=async(_url,options)=>{
  const body=JSON.parse(options.body);
  if(body.method==='eth_chainId')return result({result:'0x2105'});
  if(body.method==='eth_getBlockByNumber')return result({result:{number:'0x394c9a7',hash:'0x'+'a'.repeat(64),timestamp:'0x673f4b80'}});
  assert.equal(body.method,'eth_call');pinned.push(body.params[1]);
  const data=body.params[0].data,functionName=Object.entries({name:'name',symbol:'symbol',decimals:'decimals',totalSupply:'totalSupply',multiplier:'multiplier',pausedFeatures:'pausedFeatures',sender:'TRANSFER_SENDER_POLICY',receiver:'TRANSFER_RECEIVER_POLICY',executor:'TRANSFER_EXECUTOR_POLICY',mint:'MINT_RECEIVER_POLICY',policyId:'policyId'}).find(([,name])=>encodeFunctionData({abi,functionName:name,args:name==='policyId'?['0x'+'0'.repeat(64)]:[]}).slice(0,10)===data.slice(0,10))?.[1];
  const resultValue={name:'NVIDIA Corporation',symbol:'NVDAc',decimals:8,totalSupply:6201973777574n,multiplier:1000537939576369481n,pausedFeatures:[0],TRANSFER_SENDER_POLICY:'0x'+'1'.repeat(64),TRANSFER_RECEIVER_POLICY:'0x'+'2'.repeat(64),TRANSFER_EXECUTOR_POLICY:'0x'+'3'.repeat(64),MINT_RECEIVER_POLICY:'0x'+'4'.repeat(64),policyId:5n}[functionName];
  if(functionName==='policyId'){decodeFunctionData({abi,data});}
  assert.notEqual(resultValue,undefined,'recognized B20 selector '+data);
  return result({result:encodeFunctionResult({abi,functionName,result:resultValue})});
 };
 const snapshot=await b20Snapshot(address,row,{fetchImpl,env:{BASE_RPC_URL:'https://base.example/rpc',NODE_ENV:'test'},signal:AbortSignal.timeout(5000)});
 assert.equal(snapshot.identityStatus,'matched');assert.equal(snapshot.blockNumber,'60082599');assert.equal(snapshot.totalSupply,'62019.73777574');
 assert.deepEqual(snapshot.pausedFeatures,['TRANSFER']);assert.deepEqual(snapshot.transferPolicies.map(item=>item.id),['5','5','5','5']);
 assert.ok(pinned.length>=10);assert.ok(pinned.every(tag=>tag==='0x394c9a7'));
});

test('stock research reports dated provider evidence and only offers Bankr when currently listed',async()=>{
 const calls=[];
 const report=await researchBaseStock({query:'NVDAc'},{
  env:{GOLDRUSH_API_KEY:'not-used-by-stub'},
  baseStockLookupImpl:async()=>({stocks:[{...row,bankrPairSupported:true,liquidityAdvisory:{illiquid:false,source:'Bankr quote-token API'}}]}),
  b20SnapshotImpl:async(token)=>({address:token,blockNumber:'123',blockHash:'0x'+'b'.repeat(64),blockTimestamp:'2026-11-21T00:00:00Z',name:row.name,symbol:row.symbol,decimals:row.decimals,totalSupply:row.totalSupply,multiplier:'1000000000000000000',pausedFeatures:[],transferPolicies:[{scope:'TRANSFER_SENDER_POLICY',id:5},{scope:'TRANSFER_RECEIVER_POLICY',id:5},{scope:'TRANSFER_EXECUTOR_POLICY',id:5},{scope:'MINT_RECEIVER_POLICY',id:5}],identityStatus:'matched',registryComparison:{name:true,symbol:true,decimals:true}}),
  marketSnapshotImpl:async()=>({source:'DEX Screener',status:'available',checkedAt:'2026-11-21T00:00:00Z',pairs:[{pairAddress:other,dex:'aerodrome',url:'https://dexscreener.com/base/'+other,baseToken:{symbol:'NVDAc'},quoteToken:{symbol:'USDC'},tokenIsBase:true,tokenPriceUsd:180.2,liquidityUsd:100000,volume24hUsd:200000,transactions24h:{buys:10,sells:8}}]}),
  holderSnapshotImpl:async()=>{calls.push('holders');return {source:'GoldRush',blockNumber:123,holderCount:20,sampleSize:20,hasMore:false,sampleTop10SharePercent:50,largestBalancesInSample:[],holderActivity:[],coverage:'Full returned list.'};}
 });
 assert.equal(report.identity.status,'matched');assert.equal(report.tradeHandoff.status,'open-bankr-for-current-quote');assert.equal(report.tradeHandoff.url,'https://bankr.bot');assert.equal(report.tradeHandoff.assetSymbol,'NVDAc');assert.equal(report.market.pairs[0].liquidityUsd,100000);assert.deepEqual(calls,['holders']);
 assert.match(baseStockResearchMessage(report),/Bankr must show its current executable quote and check location eligibility/);
});

test('free stock preview omits holder lookups and no Bankr link is invented',async()=>{
 let holders=0;
 const report=await researchBaseStock({query:address},{holderSnapshotEnabled:false,baseStockLookupImpl:async()=>({stocks:[{...row,bankrPairSupported:false}]}),b20SnapshotImpl:async token=>({address:token,blockNumber:'456',blockHash:'0x'+'c'.repeat(64),name:row.name,symbol:row.symbol,decimals:8,totalSupply:row.totalSupply,multiplier:'1',pausedFeatures:[],transferPolicies:[],identityStatus:'matched',registryComparison:{name:true,symbol:true,decimals:true}}),marketSnapshotImpl:async()=>({source:'DEX Screener',status:'no-matching-pairs',checkedAt:new Date().toISOString(),pairs:[]}),holderSnapshotImpl:async()=>{holders++;return null;}});
 assert.equal(holders,0);assert.equal(report.tradeHandoff.url,null);assert.match(report.coverage.holders,/Not requested/);
});

test('rejects unresolved or mismatched identity as a verified match',async()=>{
 const report=await researchBaseStock({query:'NVDAc'},{baseStockLookupImpl:async()=>({stocks:[{...row,bankrPairSupported:true}]}),b20SnapshotImpl:async token=>({address:token,blockNumber:'789',blockHash:'0x'+'d'.repeat(64),name:'Impostor',symbol:row.symbol,decimals:8,totalSupply:row.totalSupply,multiplier:'1',pausedFeatures:[],transferPolicies:[],identityStatus:'mismatch',registryComparison:{name:false,symbol:true,decimals:true}}),marketSnapshotImpl:async()=>({source:'DEX Screener',status:'no-matching-pairs',pairs:[]}),holderSnapshotImpl:async()=>null});
 assert.equal(report.classification,'onchain-registry-mismatch');assert.equal(report.tradeHandoff.url,null);
});
