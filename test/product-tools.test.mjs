import test from 'node:test';import assert from 'node:assert/strict';
import {executeProductTool,directProductIntent,transactionStatus} from '../src/product-tools.mjs';
import {streamProductChat} from '../src/product-chat.mjs';
import {productTools,productCapabilities} from '../src/tool-catalog.mjs';
const account='0x1111111111111111111111111111111111111111';
const baseToken='0x'+'8'.repeat(40);
test('explicit stock-paired research language routes to Base without redirecting ordinary Pons trades',()=>{
 for(const message of [`Research this Bankr token paired with NVDA ${baseToken}`,`Check the tokenized stock pair ${baseToken}`,`Look up this stock-paired token ${baseToken}`])assert.deepEqual(directProductIntent(message),{name:'research_base_stock_paired_token',args:{address:baseToken}},message);
 assert.equal(directProductIntent(`Buy 0.1 ETH of ${baseToken}`).name,'pons_trade');
});
test('normal Coinbase stock tickers route to the separate Base stock research tool',()=>{
 for(const message of ['Research Coinbase stock NVDAc','Check Base stock token NVDAc',`Research this Coinbase stock token ${baseToken}`])assert.equal(directProductIntent(message).name,'research_base_stock',message);
 assert.match(directProductIntent('Research NVDAc').message,/Which chain/);
 assert.deepEqual(directProductIntent('Research Coinbase stock NVDAc. Read only; do not trade.'),{name:'research_base_stock',args:{query:'NVDAc'}});
 assert.deepEqual(directProductIntent('Do not prepare a transaction. Research NVDAc.'),{name:'research_base_stock',args:{query:'NVDAc'}});
 assert.equal(directProductIntent(`Research Bankr token paired with NVDA ${baseToken}`).name,'research_base_stock_paired_token');
});
test('a follow-up Coinbase stock buy or sell request hands off to Bankr conversationally',()=>{
 const history=[{role:'assistant',content:`NVIDIA Corporation (NVDAc) · Base\nCoinbase registry and onchain token identity match.\nContract: ${baseToken}\nWant to trade? [Open Bankr](https://bankr.bot) and ask for NVDAc on Base.`}];
 assert.deepEqual(directProductIntent('Research Coinbase stock NVDAc. Read only; do not trade.',{history}),{name:'research_base_stock',args:{query:'NVDAc'}});
 assert.deepEqual(directProductIntent('Do not trade NVDAc; check its latest evidence.',{history}),{name:'research_base_stock',args:{query:'NVDAc'}});
 assert.deepEqual(directProductIntent('Buy it',{history}),{name:'research_base_stock',args:{query:baseToken}});
 const result=directProductIntent('Buy it',{history:[{role:'assistant',content:history[0].content+' [Trade](https://bankr.bot/trade/'+baseToken+')'}]});
 assert.match(result.message,new RegExp(`https:\\/\\/bankr\\.bot\\/trade\\/${baseToken}`));assert.match(result.message,/NVDAc on Base/);assert.match(result.message,/choose whether to buy or sell and the amount/i);assert.match(result.message,/checks if trading is available where you are/i);assert.deepEqual(result.actions,[]);
 const updatedReport=`## NVIDIA Corporation (NVDAc) on Base\n\n**Identity**\n\nThe ticker, name, and token-unit settings in Coinbase’s stock list match what Base reports for this token.\n\n**Token details**\n\n- Token address: ${baseToken}\n[Open on Bankr](https://bankr.bot/trade/${baseToken})`;
 const paired='**Pairing**\n\nNTA (NTA) is confirmed as paired with ANTc on Base. Token address: '+account;
 const stock={role:'assistant',content:updatedReport},launch={role:'assistant',content:paired};
 assert.deepEqual(directProductIntent('Can I trade this?',{history:[stock,launch]}),{name:'base_stock_trade',args:{kind:'availability',address:account}});
 assert.match(directProductIntent('Can I trade this?',{history:[launch,stock]}).message,/NVDAc/);
 const updated=directProductIntent('Buy it',{history:[{role:'assistant',content:updatedReport}]});
 assert.match(updated.message,new RegExp(`https:\\/\\/bankr\\.bot\\/trade\\/${baseToken}`));assert.match(updated.message,/Bankr checks if trading is available where you are/);
});
test('normal Coinbase stock research executes directly in chat without inference',async()=>{
 const message='Research Coinbase stock NVDAc',events=[];let toolCalls=0;
 for await(const event of streamProductChat({message,history:[{role:'user',content:message}]},[],{env:{OG_API_KEY:'test',OG_MODEL:'test'},fetchImpl:async()=>{throw Error('Inference is not required for direct stock research.');},execute:async(name,args)=>{toolCalls++;assert.equal(name,'research_base_stock');assert.deepEqual(args,{query:'NVDAc'});return {message:'NVDAc identity and market report.',data:{identity:{status:'matched'}},actions:[]};}}))events.push(event);
 assert.equal(toolCalls,1);assert.equal(events.at(-1).result.toolsUsed[0],'research_base_stock');assert.equal(events.filter(event=>event.type==='delta')[0].text,'NVDAc identity and market report.');
});
test('normal stock report tool exposes the exact provider report and enables configured holder evidence',async()=>{
 const data={address:baseToken,chainId:8453,classification:'coinbase-registry-match',identity:{status:'matched',name:'NVIDIA Corporation',symbol:'NVDAc'},stock:{referenceNav:'100',referenceNavUpdatedAt:'2026-11-20T00:00:00Z',firstMintAt:'2026-10-01T00:00:00Z',ageDaysSinceFirstMint:50},contract:{blockNumber:'123',name:'NVIDIA Corporation',symbol:'NVDAc',decimals:8,totalSupply:'1000',multiplier:'1',pausedFeatures:[],transferPolicies:[{scope:'TRANSFER_SENDER_POLICY',id:0},{scope:'TRANSFER_RECEIVER_POLICY',id:0},{scope:'TRANSFER_EXECUTOR_POLICY',id:0}]},market:{status:'no-matching-pairs',checkedAt:'2026-11-20T00:00:00Z',pairs:[]},holders:null,coverage:{holders:'Not requested.'},tradeHandoff:{status:'not-listed',url:null}};let holdersEnabled;
 const result=await executeProductTool('research_base_stock',{query:'NVDAc'},{env:{GOLDRUSH_API_KEY:'configured'}},{baseStockAssetResearch:async(input,options)=>{assert.deepEqual(input,{query:'NVDAc'});holdersEnabled=options.holderSnapshotEnabled;return data;}});
 assert.equal(holdersEnabled,true);assert.equal(result.data,data);assert.deepEqual(result.actions,[]);
});
test('Base stock-paired research runs directly in human chat and returns the checked answer unchanged',async()=>{
 const message=`Research this Bankr token paired with NVDA ${baseToken}`,events=[];let inferenceCalls=0,toolCalls=0;
 for await(const event of streamProductChat({message,history:[{role:'user',content:message}]},[],{env:{OG_API_KEY:'test',OG_MODEL:'test'},fetchImpl:async()=>{inferenceCalls++;throw Error('Inference must not be called for direct research.');},execute:async(name,args)=>{toolCalls++;assert.equal(name,'research_base_stock_paired_token');assert.deepEqual(args,{address:baseToken});return {message:'Verified stock-paired research. Sources: Bankr · Coinbase.',data:{classification:'verified-bankr-stock-paired-token'},actions:[]};}}))events.push(event);
 assert.equal(inferenceCalls,0);assert.equal(toolCalls,1);assert.deepEqual(events.filter(event=>event.type==='delta').map(event=>event.text),['Verified stock-paired research. Sources: Bankr · Coinbase.']);assert.deepEqual(events.at(-1).result.actions,[]);assert.deepEqual(events.at(-1).result.toolsUsed,['research_base_stock_paired_token']);
});
test('Base stock-pair trade requests return a read-only estimate and hand execution to Bankr',async()=>{
 const token=baseToken,stock='0x'+'9'.repeat(40),reportMessage=`**Pairing**\n\nExample (EX) is confirmed as paired with NVDA on Base.\n\nToken address: ${token}.`,report={address:token,classification:'verified-bankr-stock-paired-token',verification:{status:'verified'},market:{matchesBankrPool:true},launch:{symbol:'EX',poolId:'0x'+'c'.repeat(64),pairedStock:{address:stock,symbol:'NVDA'}},stock:{address:stock,symbol:'NVDA'}};
 let quoted=0,researchOptions;
 const dependencies={baseStockResearch:async(_input,options)=>{researchOptions=options;return report;},quoteRoute:async(input,options)=>{quoted++;assert.deepEqual(input,{kind:'swap',chainId:8453,account,amount:'10',asset:stock,outputAsset:token});assert.equal(options.baseResearchResult,report);return {amount:'10',asset:{symbol:'NVDA'},outputAsset:{symbol:'EX'},expectedAmount:'500',minimumAmount:'495',provider:'Uniswap V4 pool reference'};}};
 const availabilityEvents=[];
 for await(const event of streamProductChat({message:'Can I trade this?',history:[{role:'assistant',content:reportMessage}]},[],{env:{},execute:async(name,args)=>{
  assert.equal(name,'base_stock_trade');assert.equal(args.kind,'availability');
  return {message:'Check the NTA quote on Bankr.',actions:[]};
 }}))availabilityEvents.push(event);
 assert.match(availabilityEvents.filter(event=>event.type==='delta').map(event=>event.text).join(''),/quote on Bankr/);
 const context={walletAccount:account,message:'Buy 10 NVDA',history:[{role:'assistant',content:reportMessage}]};
 const quote=await executeProductTool('base_stock_trade',{kind:'buy',address:token},context,dependencies);
 assert.match(quote.message,/Estimated output: 500 EX/);assert.match(quote.message,/not Bankr's execution quote/);assert.match(quote.message,new RegExp('https://bankr\\.bot/trade/'+token));assert.match(quote.message,/Bankr must provide its executable quote and perform the required location check/);assert.match(quote.message,/No wallet permission or transaction was prepared/);assert.deepEqual(quote.actions,[]);assert.equal(quoted,1);assert.equal(researchOptions.holderSnapshotEnabled,false);
 const noQuote=await executeProductTool('base_stock_trade',{kind:'buy',address:token},context,{...dependencies,quoteRoute:async()=>{throw Error('No usable Base pool quote is available for this amount.');}});assert.match(noQuote.message,/could not get a current pool quote/);assert.deepEqual(noQuote.actions,[]);
 assert.equal(directProductIntent('verified',{walletAccount:account,history:[...context.history,{role:'user',content:'Buy 10 NVDA'},{role:'assistant',content:quote.message}]}).name,'base_stock_trade');
 assert.equal(directProductIntent(`Buy 10 NVDA on Base ${token}`,{history:[{role:'assistant',content:reportMessage}]}).name,'base_stock_trade');
 const events=[];for await(const event of streamProductChat({message:context.message,walletAccount:account,history:context.history},[],{env:{},fetchImpl:async()=>{throw Error('Inference is not needed for a direct trade estimate.');},execute:async(name,args,streamContext)=>{assert.equal(name,'base_stock_trade');assert.deepEqual(args,{kind:'buy',address:token});assert.equal(streamContext.walletAccount,account);return quote;}}))events.push(event);
 assert.match(events.filter(event=>event.type==='delta').map(event=>event.text).join(''),/Estimated output: 500 EX/);assert.deepEqual(events.at(-1).result.actions,[]);
});
test('signed-in chat enables Base holder research through the same tool used by paid agent hires',async()=>{
 const message=`Research this Bankr token paired with NVDA ${baseToken}`,events=[];let enabled;
 const report={address:baseToken,chainId:8453,classification:'insufficient-evidence',checkedAt:'2026-11-20T12:00:00.000Z',launch:null,market:null,fees:null,vesting:null,contract:null,holders:null,verification:{status:'unavailable'},coverage:{holders:'GoldRush snapshot not returned'}};
 const execute=(name,args,context)=>executeProductTool(name,args,context,{baseStockResearch:async(_input,options)=>{enabled=options.holderSnapshotEnabled;return report;}});
 for await(const event of streamProductChat({message,walletAccount:account,history:[{role:'user',content:message}]},[],{env:{OG_API_KEY:'test',OG_MODEL:'test'},fetchImpl:async()=>{throw Error('Direct research must not call inference.');},execute}))events.push(event);
 assert.equal(enabled,true);assert.equal(events.at(-1).result.toolsUsed[0],'research_base_stock_paired_token');assert.match(events.at(-1).result.message,/Holder data is unavailable from the configured source/);
});
test('Base research answer separates evidence by topic and keeps coverage limits visible',async()=>{
 const data={address:baseToken,checkedAt:'2026-11-19T12:00:00.000Z',classification:'verified-bankr-stock-paired-token',launch:{name:'Example',symbol:'EX',deployedAt:'2026-11-18T12:00:00.000Z',ageDays:1,pairedStock:{symbol:'NVDA'},transactionHash:'0x'+'a'.repeat(64)},stock:{symbol:'NVDA',referencePrice:100,referencePriceUpdatedAt:'2026-11-19T11:00:00.000Z'},market:{source:'GeckoTerminal',matchesBankrPool:true,liquidityUsd:125,volumeUsd:{h24:800},transactions:{h24:{buys:7,sells:3}},priceNative:0.012,baseToken:{symbol:'EX'},quoteToken:{symbol:'NVDA'},url:'https://www.geckoterminal.com/base/pools/'+'b'.repeat(64)},fees:{share:'100%',token0Label:'EX',token1Label:'NVDA',claimable:{token0:'0',token1:'0'},claimed:{token0:'1',token1:'2'},lifetime:{status:'reported',lifetimeEarnedWeth:'0.5',earningDays:2}},vesting:{status:'no-eligible-schedule'},contract:{blockNumber:'123',symbol:'EX',checks:[{label:'Total supply (TS)',value:'1000'},{label:'Reported owner',detail:'Owner is 0x'+'1'.repeat(40)},{label:'Source verification',status:'verified'},{label:'Proxy indicators',status:'attention'}]},holders:{holderCount:20,hasMore:true,sampleSize:10,sampleTop10SharePercent:55,largestBalancesInSample:[{address:'0x'+'2'.repeat(40),percentOfSupply:12}],blockNumber:123,coverage:'First 10 returned holders only.',holderActivity:[{address:'0x'+'2'.repeat(40),status:'contract'}]},verification:{status:'verified'},coverage:{holders:'sampled'}};
 const result=await executeProductTool('research_base_stock_paired_token',{address:baseToken},{},{baseStockResearch:async()=>data});
 for(const heading of ['**Pairing**\n\n','**Market**\n\n','**Fees and vesting**\n\n','**Holders**\n\n','**Contract**\n\n','**Sources**\n\n'])assert.ok(result.message.includes(heading),heading);
 assert.ok(result.message.includes('Bankr reports no eligible vesting schedule. This does not prove the supply is unlocked.'));
 assert.ok(result.message.includes('This is not a full safety check and does not confirm that a token can be sold.'));
 assert.ok(result.message.includes('last hour volume not available')||result.message.includes('7-day and 30-day totals are not provided'));
 let holderSnapshotEnabled;
 await executeProductTool('research_base_stock_paired_token',{address:baseToken},{},{baseStockResearch:async(_input,options)=>{holderSnapshotEnabled=options.holderSnapshotEnabled;return data;}});
 assert.equal(holderSnapshotEnabled,true);
});
test('Base stock-pair chat formats large balances and tiny prices for people',async()=>{
 const data={address:baseToken,classification:'verified-bankr-stock-paired-token',checkedAt:'2026-11-21T12:00:00Z',launch:{name:'Example',symbol:'EX',deployedAt:'2026-11-20T12:00:00Z',ageDays:1,pairedStock:{symbol:'ANT'}},stock:{symbol:'ANT'},market:{source:'DEX Screener',matchesBankrPool:true,liquidityUsd:8508.3,volumeUsd:{h6:48.54,h24:102.16},transactions:{m5:{buys:0,sells:0},h1:{buys:0,sells:0},h6:{buys:0,sells:1},h24:{buys:3,sells:8}},priceNative:1.148e-9,baseToken:{symbol:'EX'},quoteToken:{symbol:'ANTc'}},fees:{share:'95%',token0Label:'EX',token1Label:'ANT',claimable:{token0:'3110341.753937',token1:'0.004004'},claimed:{token0:'0',token1:'0'},lifetime:{status:'reported',lifetimeEarnedWeth:'0',earningDays:0}},vesting:{status:'reported',tokenSymbol:'EX',totalAmount:'15000000000',allocationPercentOfSupply:15,lockedAmount:'15000000000',claimableAmount:'0',releasedAmount:'0',unlockedPercent:0,phase:'cliff',cliffEndsAt:'2026-12-20T00:00:00Z',vestingEndsAt:'2027-11-20T00:00:00Z'},contract:{blockNumber:'123',symbol:'EX',checks:[{label:'Total supply (TS)',value:'100000000000'}]},holders:null,coverage:{holders:'not configured'}};
 const result=await executeProductTool('research_base_stock_paired_token',{address:baseToken},{},{baseStockResearch:async()=>data});
 for(const value of ['3,110,341.753937 EX','0.004004 ANT','creator allocation of 15,000,000,000 EX','Pool price: 0.000000001148 ANTc per EX.','no trades observed','0 buys and 1 sell','Current stage: before the first release','7-day and 30-day totals are not provided by this source.'])assert.ok(result.message.includes(value),value+'\n'+result.message);
 assert.doesNotMatch(result.message,/1\.148e-9|15e\+10|0 WETH over 0 days/);
});
test('tools cannot sign or send and expose only a reviewed Pons burn',()=>{assert.ok(productTools.every(t=>!/(send|sign|broadcast|swap|lock_tokens)/.test(t.function.name)));assert.ok(productTools.some(t=>t.function.name==='burn_token'));assert.equal(productCapabilities.burn.status,'wallet-approval');});
test('wallet balance tools honor the selected network and asset',async()=>{for(const [network,asset,name]of [['4663','ETH','Robinhood Chain'],['8453','ETH','Base']]){let seen;const r=await executeProductTool('wallet_balance',{network,asset},{walletAccount:account},{balance:async input=>{seen=input;return {account,network:name,asset:{symbol:asset},balance:'0.5',blockNumber:'5'};}});assert.deepEqual(seen,{account,chainId:Number(network),asset});assert.equal(r.message,`${name} ${asset} balance: 0.5 ${asset}. Checked at block 5.`);assert.deepEqual(r.actions,[]);}await assert.rejects(executeProductTool('wallet_balance',{chainId:99901}),/Unexpected/);await assert.rejects(executeProductTool('eth_sendTransaction',{}),/Unknown/);await assert.rejects(executeProductTool('inspect_token',{address:'bad'}),/Invalid/);});
test('signed-in balance questions use the selected chain without inference or stale launch follow-up',async()=>{for(const [message,network,asset]of [['What is my Robinhood Chain ETH balance?','4663','ETH'],['base eth balance','8453','ETH']]){let inference=0,executed=0;const events=[];for await(const e of streamProductChat({message,walletAccount:account,ponsSetup:{active:true,field:'openingPurchase'}},[{role:'assistant',content:'Your launch setup is complete. Would you like to review it?'},{role:'user',content:message}],{env:{OG_API_KEY:'test',OG_MODEL:'test'},fetchImpl:async()=>{inference++;throw Error('inference must not be called');},execute:async(name,args,context)=>{executed++;assert.equal(name,'wallet_balance');assert.deepEqual(args,{network,asset});assert.equal(context.walletAccount,account);return {message:`${asset} balance checked on ${network}.`,data:{balance:'0.5',blockNumber:'5'},actions:[]};}}))events.push(e);assert.equal(inference,0);assert.equal(executed,1);assert.deepEqual(events.filter(e=>e.type==='delta').map(e=>e.text),[`${asset} balance checked on ${network}.`]);assert.equal(events.at(-1).result.toolsUsed[0],'wallet_balance');assert.equal(events.at(-1).result.actions.length,0);}});
test('plain follow-up questions during launch setup remain normal conversation',async()=>{for(const message of ['why','Can I use Base?','Do you support swaps?']){let request;for await(const e of streamProductChat({message,walletAccount:account,ponsSetup:{active:true,field:'openingPurchase'}},[{role:'assistant',content:'Would you like to review your launch?'},{role:'user',content:message}],{env:{OG_API_KEY:'test',OG_MODEL:'test'},fetchImpl:async(u,o)=>{request=JSON.parse(o.body);return stream([{choices:[{delta:{content:'You can ask me about wallet networks or supported actions.'},finish_reason:'stop'}]}]);}})){}assert.equal(request.tools,undefined,message);assert.equal(request.tool_choice,undefined,message);}});
test('wallet actions stay in Dinn chat and balance questions validate network support',()=>{const c={ponsSetup:{active:true,field:'openingPurchase'}};for(const [message,kind]of [['send 2 USDC to '+account+' on Base','send'],['bridge 0.1 ETH from Base to Robinhood Chain','bridge'],['swap 1 ETH for USDC on Base','swap']])assert.deepEqual(directProductIntent(message,c),{name:'open_wallet_action',args:{kind}});assert.equal(directProductIntent('Do you support swaps on Base?',c),null);assert.match(directProductIntent('base usdg balance',c).message,/not a supported balance asset on Base/);assert.match(directProductIntent('Ethereum ETH balance',c).message,/Robinhood Chain and Base/);});
test('a Base transaction hash cannot be checked with Robinhood receipt tooling',()=>{const hash='0x'+'a'.repeat(64);assert.match(directProductIntent('Check Base transaction '+hash).message,/only on Robinhood Chain/);});
test('PinkLock creation and DEX profile payment are clearly routed to their external sites',()=>{const lock=directProductIntent('Create a pinlock for this token');assert.match(lock.message,/PinkSale PinkLock/);assert.match(lock.message,/cannot create a lock/);assert.equal(lock.actions[0].url,'https://www.pinksale.finance/pinklock/create');assert.match(directProductIntent('Pay for DEX Screener profile '+account).name,/open_dex_profile/);assert.equal(productCapabilities.lock.status,'external-checkout');assert.match(productCapabilities.dex.title,/Pay for a DEX Screener profile/);});
test('Pons buys are reviewed for the connected wallet and never sent by chat',async()=>{const token='0x'+'5'.repeat(40);let seen;const tradePair=async input=>({token:{address:input.token,symbol:'TOK',decimals:18},pair:{address:'0x'+'0'.repeat(40),symbol:'ETH',decimals:18}});const prepareTrade=async input=>{seen=input;return {kind:'pons-buy',tradeSide:'buy',asset:{symbol:'ETH'},outputAsset:{symbol:'TOK'},amount:'0.1',outputAmount:'42',minimumOutput:'41.58',baseFeeBps:'100',creatorTaxBps:'0',openingTaxBps:'0',networkFee:'0.0002',blockNumber:'123'};};const intent=directProductIntent('Buy 0.1 ETH of '+token);assert.equal(intent.name,'pons_trade');const result=await executeProductTool(intent.name,intent.args,{walletAccount:account,message:'Buy 0.1 ETH of '+token},{tradePair,prepareTrade});assert.deepEqual(seen,{kind:'buy',token,account,amount:'0.1'});assert.match(result.message,/to buy TOK/);assert.match(result.message,/Expected receive: 42 TOK; minimum: 41.58 TOK/);assert.match(result.message,/No transaction has been sent/);assert.equal(result.actions[0].id,'wallet_approve');});
test('Pons trade chat returns the exact reviewed quote without a model rewrite',async()=>{const token='0x'+'6'.repeat(40),events=[];let calls=0;const review={kind:'pons-buy',tradeSide:'buy',amount:'0.1',outputAmount:'42',minimumOutput:'41.58',asset:{symbol:'ETH'},outputAsset:{symbol:'TOK'}};for await(const e of streamProductChat({message:'Buy 0.1 ETH of '+token,walletAccount:account},[{role:'user',content:'Buy 0.1 ETH of '+token}],{env:{OG_API_KEY:'test',OG_MODEL:'test'},fetchImpl:async(u,o)=>{calls++;const req=JSON.parse(o.body);assert.equal(req.tools[0].function.name,'pons_trade');return stream([{choices:[{delta:{tool_calls:[{index:0,id:'trade',function:{name:'pons_trade',arguments:'{}'}}]},finish_reason:'tool_calls'}]}]);},execute:async(name,args)=>{assert.equal(name,'pons_trade');assert.deepEqual(args,{kind:'buy',token});return {message:'Spend 0.1 ETH; expected 42 TOK, minimum 41.58 TOK. No transaction has been sent.',data:{walletReview:review},actions:[{id:'wallet_approve',review}]};}}))events.push(e);assert.equal(calls,1);assert.match(events.filter(e=>e.type==='delta').map(e=>e.text).join(''),/expected 42 TOK, minimum 41.58 TOK/);assert.equal(events.at(-1).result.actions[0].id,'wallet_approve');});
test('burn chat collects explicit amount and token before returning wallet approval',async()=>{const token='0x'+'4'.repeat(40),message='Burn 5 GRAIL '+token,route=directProductIntent(message);assert.equal(route.name,'burn_token');let called=0;const prepareBurn=async input=>{called++;assert.deepEqual(input,{account,address:token,amount:'5'});return {kind:'burn',chainId:4663,account,asset:{address:token,symbol:'GRAIL'},amount:'5',supplyBefore:'1000',networkFee:'0.0001'};};const missing=await executeProductTool('burn_token',{}, {walletAccount:account,message:'Burn Pons tokens'},{prepareBurn});assert.match(missing.message,/contract address/);assert.equal(called,0);const noWallet=await executeProductTool('burn_token',route.args,{message},{prepareBurn});assert.match(noWallet.message,/connect the wallet/);assert.equal(called,0);const result=await executeProductTool(route.name,route.args,{walletAccount:account,message},{prepareBurn});assert.match(result.message,/burn 5 GRAIL/);assert.match(result.message,new RegExp(token));assert.equal(result.actions[0].id,'wallet_approve');assert.equal(result.actions[0].review.amount,'5');assert.equal(called,1);});
test('direct routing refuses other chains, multiple addresses and unsupported write claims',()=>{assert.match(directProductIntent('check '+account+' on Ethereum').message,/Only Robinhood/);assert.match(directProductIntent('check '+account+' '+account).message,/one contract/);assert.match(directProductIntent('lock my tokens').message,/cannot create a lock/);assert.equal(directProductIntent('check TS '+account).args.focus,'supply');assert.equal(directProductIntent('check SC '+account).args.focus,'source');assert.equal(directProductIntent('sc',{tokenAddress:account}).args.address,account);});
const stream=chunks=>new Response(chunks.map(c=>'data: '+JSON.stringify(c)+'\n\n').join('')+'data: [DONE]\n\n');
test('AI tool calls execute through bounded registry and return evidence/actions to the UI',async()=>{let rounds=0;const requests=[];const events=[];for await(const e of streamProductChat({message:'Please help me understand my funds',walletAccount:account},[{role:'user',content:'funds'}],{env:{OG_API_KEY:'test',OG_MODEL:'test'},fetchImpl:async(u,o)=>{requests.push(JSON.parse(o.body));rounds++;return rounds===1?stream([{choices:[{delta:{tool_calls:[{index:0,id:'call_1',function:{name:'wallet_balance',arguments:'{}'}}]},finish_reason:'tool_calls'}]}]):stream([{choices:[{delta:{content:'Your checked balance is 0.5 ETH.'},finish_reason:'stop'}]}]);},execute:async(name,args,c)=>{assert.equal(name,'wallet_balance');assert.equal(c.walletAccount,account);return {message:'0.5 ETH at block 5',data:{balance:'0.5'},actions:[{id:'wallet',title:'Open wallet'}]};}}))events.push(e);assert.equal(rounds,2);assert.equal(requests[1].messages.at(-1).role,'tool');assert.deepEqual(events.at(-1).result.toolsUsed,['wallet_balance']);assert.equal(events.at(-1).result.actions[0].id,'wallet');});
test('clear commands never claim success in model responses or call provider',async()=>{let result;for await(const e of streamProductChat({message:'clear chat'},[],{fetchImpl:()=>{throw Error('must not call');}}))if(e.type==='done')result=e.result;assert.match(result.message,/No data was cleared/);});
test('RPC errors do not leak provider URLs into tool replies',async()=>{await assert.rejects(executeProductTool('wallet_balance',{}, {walletAccount:account},{balance:async()=>{throw Error('https://private.example/SECRET');}}),e=>!e.message.includes('SECRET'));});
test('explicit tool request cannot publish a stale answer without executing a tool',async()=>{const events=[];await assert.rejects(async()=>{for await(const e of streamProductChat({message:'Use your tools to check my latest funds'},[],{env:{OG_API_KEY:'test',OG_MODEL:'test'},fetchImpl:async()=>stream([{choices:[{delta:{content:'Your old balance is 5 ETH'},finish_reason:'stop'}]}])}))events.push(e);},/did not run/);assert.equal(events.length,0);});

test('DEX payment wording routes to profile preparation, with an address follow-up',async()=>{
 for(const message of ['i want to pay for dex','pay for dex','dex payment','open dex checkout','prepare dex profile'])assert.equal(directProductIntent(message).name,'open_dex_profile');
 const r=await executeProductTool('open_dex_profile',{});assert.match(r.message,/complete payment on DEX Screener/);assert.deepEqual(r.actions,[]);
 assert.equal(directProductIntent(account,{history:[{role:'assistant',content:r.message}]}).name,'open_dex_profile');
 assert.equal(directProductIntent('what is a dex?'),null);
});
test('fragmented tool markup never reaches visible output or executes as a tool',async()=>{
 const events=[];await assert.rejects(async()=>{for await(const e of streamProductChat({message:'Please assist me'},[],{env:{OG_API_KEY:'test',OG_MODEL:'test'},execute:()=>{throw Error('Must not execute markup');},fetchImpl:async()=>stream([{choices:[{delta:{content:'<tool_'}}]},{choices:[{delta:{content:'call>\n<function=launch_options>\n</function>\n</tool_call>'},finish_reason:'stop'}]}])}))events.push(e);},/invalid tool response/);assert.deepEqual(events,[]);
});
test('tool-round commentary is withheld while structured calls still execute',async()=>{
 let round=0;const events=[];for await(const e of streamProductChat({message:'Please assist me'},[],{env:{OG_API_KEY:'test',OG_MODEL:'test'},execute:async()=>({message:'Checked',actions:[]}),fetchImpl:async()=>++round===1?stream([{choices:[{delta:{content:'<tool_call>private syntax</tool_call>',tool_calls:[{index:0,id:'call_1',function:{name:'product_capabilities',arguments:'{}'}}]},finish_reason:'tool_calls'}]}]):stream([{choices:[{delta:{content:'Here are the available services.'},finish_reason:'stop'}]}])}))events.push(e);assert.equal(events.filter(e=>e.type==='delta').map(e=>e.text).join(''),'Here are the available services.');
});

test('all directly routed AI-assisted tools use inference then backend then a grounded inference reply',async()=>{
 for(const message of ['i want to pay for dex','check TS '+account]){
  const intent=directProductIntent(message),order=[],events=[];let round=0;
  for await(const e of streamProductChat({message,walletAccount:account},[{role:'user',content:message}],{env:{OG_API_KEY:'test',OG_MODEL:'test'},fetchImpl:async(u,o)=>{const req=JSON.parse(o.body);order.push('inference');if(++round===1){assert.equal(req.tools.length,1);assert.equal(req.tools[0].function.name,intent.name);return stream([{choices:[{delta:{tool_calls:[{index:0,id:'call',function:{name:intent.name,arguments:'malformed provider arguments'}}]},finish_reason:'tool_calls'}]}]);}assert.equal(req.tools,undefined);assert.ok(req.messages.some(m=>m.role==='tool'&&m.content.includes('backendEvidence')));return stream([{choices:[{delta:{content:'Here is the checked result.'},finish_reason:'stop'}]}]);},execute:async(name,args)=>{order.push('backend');assert.equal(name,intent.name);assert.deepEqual(args,intent.args);return {data:{backendEvidence:true},actions:[]};}}))events.push(e);
  assert.deepEqual(order,['inference','backend','inference']);assert.deepEqual(events.at(-1).result.toolsUsed,[intent.name]);assert.equal(events.at(-1).result.mode,'0g-tools');
 }
});

test('DEX conversation reuses a supplied profile address but not an unrelated wallet',()=>{
 assert.equal(directProductIntent('i want to pay for dex',{history:[{role:'user',content:'Prepare DEX Screener profile for '+account},{role:'assistant',content:'Review the profile.'}]}).args.address,account);
 assert.equal(directProductIntent('i want to pay for dex',{history:[{role:'user',content:'read wallet balance '+account},{role:'assistant',content:'Checked.'}]}).args.address,undefined);
});

test('holder portfolio requests stay token research even when wallet balance is mentioned',()=>{const r=directProductIntent('research top holders and their wallet balances '+account);assert.equal(r.name,'inspect_token');assert.equal(r.args.focus,'holders');assert.equal(r.args.address,account);assert.deepEqual(directProductIntent('top holders').args,{focus:'holders'});});

test('fresh inspection synthesis excludes old assistant claims and retains holder evidence',async()=>{
 const stale='Source verification is unknown (no Sourcify match).';let round=0;const inspection={checks:[{label:'Source verification',status:'verified',detail:'Blockscout runtime matches'}],holders:{status:'partial',rows:[{address:account,sharePercent:'95'}]}};
 for await(const e of streamProductChat({message:'check Robinhood token '+account},[{role:'user',content:'i want to pay for dex'},{role:'assistant',content:stale},{role:'user',content:'check Robinhood token '+account}],{env:{OG_API_KEY:'test',OG_MODEL:'test'},execute:async()=>({data:inspection,inspection,actions:[]}),fetchImpl:async(u,o)=>{const req=JSON.parse(o.body);if(++round===1)return stream([{choices:[{delta:{tool_calls:[{index:0,id:'check',function:{name:'inspect_token',arguments:'{}'}}]},finish_reason:'tool_calls'}]}]);assert.ok(!req.messages.some(m=>m.role==='assistant'&&m.content===stale));assert.ok(!req.messages.some(m=>m.role==='user'&&m.content==='i want to pay for dex'));assert.ok(!req.messages.some(m=>m.role==='user'&&m.content==='i want to pay for dex'));assert.ok(req.messages.some(m=>m.role==='system'&&m.content.includes('same snapshot')));assert.ok(req.messages.some(m=>m.role==='tool'&&JSON.parse(m.content).data.holders.rows.length===1));return stream([{choices:[{delta:{content:'Source now matches. Holder coverage is partial.'},finish_reason:'stop'}]}]);}})){if(e.type==='done')assert.equal(e.result.inspection,inspection);}
});

test('inspection retries unrelated checkout offers before publishing any text',async()=>{
 let round=0;const events=[],inspection={checks:[],holders:{rows:[]}};
 for await(const e of streamProductChat({message:'top holders '+account},[{role:'user',content:'top holders '+account}],{env:{OG_API_KEY:'test',OG_MODEL:'test'},execute:async()=>({data:inspection,inspection}),fetchImpl:async()=>{round++;return round===1?stream([{choices:[{delta:{tool_calls:[{index:0,id:'c',function:{name:'inspect_token',arguments:'{}'}}]},finish_reason:'tool_calls'}]}]):stream([{choices:[{delta:{content:round===2?'Would you like DEX Screener checkout?':'Holder portfolio coverage is partial.'},finish_reason:'stop'}]}]);}}))events.push(e);
 assert.equal(round,3);assert.deepEqual(events.filter(e=>e.type==='delta').map(e=>e.text),['Holder portfolio coverage is partial.']);
});

test('inference connection retries once before tools execute and hides provider errors',async()=>{let attempts=0;const events=[];for await(const e of streamProductChat({message:'Hello'},[],{env:{OG_API_KEY:'test',OG_MODEL:'test'},fetchImpl:async()=>{if(++attempts===1)throw Error('https://private.example/key');return stream([{choices:[{delta:{content:'Hello.'},finish_reason:'stop'}]}]);}}))events.push(e);assert.equal(attempts,2);assert.equal(events.at(-1).result.message,'Hello.');await assert.rejects(async()=>{for await(const e of streamProductChat({message:'Hello'},[],{env:{OG_API_KEY:'test',OG_MODEL:'test'},fetchImpl:async()=>{throw Error('https://private.example/key');}})){}},/inference provider/);});
test('guided research carries a ticker across chain and asset questions',()=>{
 const ask=(text,previous='')=>directProductIntent(text,{history:[{role:'assistant',content:previous}]});
 const first=ask('NVDAc');assert.match(first.message,/Which chain/);
 const second=ask('Base',first.message);assert.match(second.message,/Coinbase stock token or a Bankr/);
 assert.deepEqual(ask('Coinbase',second.message),{name:'research_base_stock',args:{query:'NVDAc'}});
 const ca=ask('Robinhood',first.message);assert.match(ca.message,/Pons contract address/);
 assert.equal(ask(baseToken,ca.message).args.address,baseToken);
 assert.match(ask('Solana',first.message).message,/currently researches/);
});
test('chat discovery intent executes through the registered product tool',async()=>{
 const intent=directProductIntent('Find a stock-paired token on Base by liquidity');
 const result=await executeProductTool(intent.name,intent.args,{},{
  discoverStockPairs:async metric=>({metric,listed:50,checked:2,comparable:0,eligible:2,candidates:[],checkedAt:'today',feedUrl:'https://api.bankr.bot/token-launches'})
 });
 assert.match(result.message,/too little verified market data/);
});

test('read-only Pons quotes keep the researched contract and side across turns',async()=>{
 const token='0xb902ec380bafc472bb07010ff90b09d7d6df67af';
 const history=[{role:'user',content:'Research '+token},{role:'assistant',content:'Grail (GRAIL) · Robinhood Chain · checked at block 10.'}];
 const dependencies={tradePair:async()=>({phase:2,token:{symbol:'GRAIL'},pair:{symbol:'ETH'}}),tradeQuote:async input=>{
  assert.equal(input.token,token);assert.equal(input.amount,'0.001');assert.equal(input.kind,'buy');
  return {venue:'Relay',output:'52',symbol:'GRAIL'};
 }};
 async function ask(message){
  const context={history,walletAccount:account,message,tokenAddress:token};
  const intent=directProductIntent(message,context);
  assert.equal(intent.name,'pons_trade_quote');
  const answer=await executeProductTool(intent.name,intent.args,context,dependencies);
  assert.deepEqual(answer.actions,[]);
  history.push({role:'user',content:message},{role:'assistant',content:answer.message});
  return answer.message;
 }
 assert.match(await ask('Is this token tradeable?'),/graduated/);
 assert.match(await ask('buy'),/enter the amount in ETH/);
 assert.match(await ask('0.001 USDC'),/enter the amount in ETH/);
 assert.match(await ask('0.001 ETH'),/52 GRAIL/);
 assert.match(directProductIntent('bridge from Arbitrum').message,/paused/);
});

test('Pons chat distinguishes a direct pool estimate from a rejected Relay route',async()=>{
 const token='0xb902ec380bafc472bb07010ff90b09d7d6df67af';
 const args={token,kind:'buy',amount:'0.001',unit:'ETH'};
 const dependencies={tradePair:async()=>({phase:2,token:{symbol:'GRAIL'},pair:{symbol:'ETH'}}),tradeQuote:async()=>({venue:'The Uniswap pool',output:'651589.773038197223710124',symbol:'GRAIL',block:'120860842',reference:true,impactLimit:true})};
 const quote=await executeProductTool('pons_trade_quote',args,{walletAccount:account},dependencies);
 assert.match(quote.message,/0.001 ETH could get you about 651,590 GRAIL/);assert.equal(quote.data.block,'120860842');assert.match(quote.message,/could not find an executable route/);assert.doesNotMatch(quote.message,/block|Relay|Uniswap/);assert.deepEqual(quote.actions,[]);
 dependencies.tradeQuote=async()=>({venue:'Relay',symbol:'GRAIL',output:'200',minimum:'198',impactPercent:10.86});
 const available=await executeProductTool('pons_trade_quote',args,{walletAccount:account},dependencies);
 assert.match(available.message,/minimum is about 198 GRAIL/);assert.match(available.message,/Proceed to review/);
 assert.deepEqual(available.tradeQuoteOffer,{account,token,kind:'buy',amount:'0.001',unit:'ETH'});assert.deepEqual(available.actions,[]);
 assert.match(available.message,/High price impact for this quote: 10.86%/);
});

test('an active Pons setup cannot consume an onchain withdrawal or overwrite the stated network',async()=>{
 const message='I want to withdraw eth on base',context={message,walletAccount:account,ponsSetup:{active:true,field:'description'}};
 const events=[];
 for await(const event of streamProductChat(context,[],{env:{}}))events.push(event);
 const result=events.at(-1).result;
 assert.deepEqual(result.toolsUsed,['open_wallet_action']);
 assert.match(result.message,/address.*ETH on Base/i);assert.deepEqual(result.actions,[]);assert.equal(result.launchDraft,undefined);
 assert.match(directProductIntent('withdraw ETH on Arbitrum',context).message,/paused/);
 assert.match(directProductIntent('withdraw ETH to my bank',context).message,/bank withdrawal/);
});
test('0G can identify a wallet request in prose while a launch question is pending',async()=>{
 const context={message:'I would like some of my ETH moved from Base to my other wallet',history:[],walletAccount:account,ponsSetup:{active:true,field:'description'}};
 const fetchImpl=async(url,options)=>{const body=JSON.parse(options.body);assert.match(body.messages[0].content,/Classify/);return Response.json({choices:[{message:{content:'send'}}]});};
 let result;for await(const event of streamProductChat(context,[],{env:{OG_API_KEY:'test',OG_MODEL:'test'},fetchImpl}))if(event.type==='done')result=event.result;
 assert.deepEqual(result.toolsUsed,['open_wallet_action']);assert.match(result.message,/ETH on Base/);assert.equal(result.launchDraft,undefined);
});
