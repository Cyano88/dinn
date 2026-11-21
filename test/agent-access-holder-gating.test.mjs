import test from 'node:test';
import assert from 'node:assert/strict';
import {agentAccessRequest} from '../src/agent-access.mjs';

const address='0x'+'1'.repeat(40);

test('GoldRush holder reads are disabled for public previews and enabled for paid marketplace hires only',async()=>{
 const observed=[];
 const baseStockResearch=async(_input,options)=>{
  observed.push(options.holderSnapshotEnabled);
  return {address,chainId:8453,classification:'insufficient-evidence',checkedAt:'2026-11-19T12:00:00Z',coverage:{holders:options.holderSnapshotEnabled?'not configured':'not requested for the free public preview'},verification:{status:'unavailable'}};
 };
 await agentAccessRequest({service:'base.stock-paired.research',input:{address}},{baseStockResearch});
 await agentAccessRequest({service:'base.stock-paired.research',input:{address}},{baseStockResearch,paidMarketplaceHire:true});
 assert.deepEqual(observed,[false,true]);
});

test('Coinbase stock research is a separate query-based agent service with paid-only holder evidence',async()=>{
 const observed=[],stockReport={address:'0x'+'2'.repeat(40),chainId:8453,checkedAt:'2026-11-21T12:00:00Z',identity:{status:'matched',name:'NVIDIA Corporation',symbol:'NVDAc'},stock:{referenceNav:'180.25',referenceNavUpdatedAt:'2026-11-21T11:55:00Z',ageDaysSinceFirstMint:20},contract:{address:'0x'+'2'.repeat(40),blockNumber:'12345',blockHash:'0x'+'a'.repeat(64),name:'NVIDIA Corporation',symbol:'NVDAc',decimals:8,totalSupply:'62019.7',multiplier:'1000000000000000000',pausedFeatures:[],transferPolicies:[]},market:{status:'no-matching-pairs',pairs:[]},holders:null,tradeHandoff:{status:'not-listed-for-bankr-stock-trading',url:null,execution:'No Bankr handoff.'},coverage:{holders:'Not requested for this free preview.',contractControls:'Role members are not enumerated.'},sources:[]};
 const holderAddress='0x'+'3'.repeat(40),paidReport={...stockReport,market:{status:'available',checkedAt:'2026-11-21T11:59:00Z',pairs:[{pairAddress:holderAddress,dex:'aerodrome',url:'https://dexscreener.com/base/'+holderAddress,baseToken:{symbol:'NVDAc'},quoteToken:{symbol:'USDC'},tokenIsBase:true}]},holders:{source:'GoldRush Token Holders API',checkedAt:'2026-11-21T11:58:00Z',blockNumber:12344,holderCount:10,sampleSize:10,hasMore:false,sampleTop10SharePercent:55,largestBalancesInSample:[{address:holderAddress,balance:'50',percentOfSupply:10}],holderActivity:[{address:holderAddress,status:'contract',reason:'Contract code is present.',marketPairMatch:{address:holderAddress,dex:'aerodrome'}}],coverage:'Full returned list.'},sources:[{label:'GoldRush Token Holders API documentation',url:'https://goldrush.dev/products/foundational-api/token-holders/'}]};
 const run=paidMarketplaceHire=>agentAccessRequest({service:'base.stock.research',requestId:'stock-001',input:{query:'NVDAc'}},{paidMarketplaceHire,baseStockAssetResearch:async(input,options)=>{observed.push({input,enabled:options.holderSnapshotEnabled});return options.holderSnapshotEnabled?paidReport:stockReport;}});
 const free=await run(false),paid=await run(true);
 assert.deepEqual(observed,[{input:{query:'NVDAc'},enabled:false},{input:{query:'NVDAc'},enabled:true}]);
 assert.equal(free.status,'completed');assert.equal(free.broadcast,false);assert.equal(free.charged,false);assert.match(free.deliverableMarkdown,/NVIDIA Corporation \(NVDAc\)/);assert.match(free.deliverableMarkdown,/B20 snapshot/);assert.match(free.deliverableMarkdown,/not a security audit|safe-to-trade verdict/i);
 assert.equal(JSON.parse(free.evidence.content).service,'base.stock.research');assert.equal(free.evidence.sha256.length,64);assert.equal(paid.result.address,stockReport.address);assert.match(paid.deliverableMarkdown,/checked 2026-11-21T11:58:00Z/);assert.match(paid.deliverableMarkdown,/Address exactly matches the DEX Screener aerodrome pair contract/);assert.match(paid.deliverableMarkdown,/GoldRush Token Holders API documentation https:\/\/goldrush.dev/);
 await assert.rejects(()=>agentAccessRequest({service:'base.stock.research',input:{query:'NVDAc'}},{baseStockAssetResearch:async()=>({...stockReport,address:address})}),/requested Base token/);
});
