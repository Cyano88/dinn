import {prepareMarketTrade,marketTradeReceipt} from '../src/market-execution.mjs';
import {createMarketSubmitter} from '../src/market-submission.mjs';
import {prepareTransfer,transferReceipt} from '../src/wallet-actions.mjs';
import {createTransferSubmitter} from '../src/transfer-submission.mjs';
// Integration test only. Never accepts an external transaction endpoint or a private key.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {createPublicClient,createWalletClient,http,parseAbi,keccak256,zeroAddress,parseEther,parseEventLogs,ContractFunctionRevertedError,stringToHex,toHex,zeroHash,encodeFunctionData,decodeFunctionData} from 'viem';
let block;
const port=18546,url=`http://127.0.0.1:${port}`,upstream='https://rpc.montramarkets.xyz';
const exe='node_modules/@foundry-rs/anvil-win32-amd64/bin/anvil.exe';
const report={kind:'local-fork-only',upstream,block,startedAt:new Date().toISOString(),steps:[]};
let proc,proxy;
const record=(step,detail={})=>{report.steps.push({step,...detail});console.log(step,JSON.stringify(detail,(_,v)=>typeof v==='bigint'?v.toString():v));};
try {
 {const r=await fetch(upstream,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_blockNumber',params:[]}),signal:AbortSignal.timeout(20000)});const j=await r.json();assert(/^0x[0-9a-f]+$/i.test(j.result),'Cannot read fork head');block=Number(BigInt(j.result))-128;report.block=block;}
 // Refuse an already-running endpoint, so we never accidentally use another node.
 try {await fetch(url,{signal:AbortSignal.timeout(500)});throw Error('Port already in use');}catch(e){if(e.message==='Port already in use')throw e;}
 // Node's HTTP transport works with this workstation's network configuration.
 // Explicit read-only allowlist prevents a fork request from broadcasting upstream.
 const allowed=new Set(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getBlockByHash','eth_getBalance','eth_getCode','eth_getStorageAt','eth_getTransactionCount','eth_getTransactionByHash','eth_getTransactionReceipt','eth_getProof','eth_call','eth_getLogs','eth_gasPrice','eth_feeHistory','net_version']);
 proxy=createServer(async(req,res)=>{try{let body='';for await(const chunk of req){body+=chunk;if(body.length>1000000)throw Error('Request too large');}const payload=JSON.parse(body);for(const item of Array.isArray(payload)?payload:[payload])assert(allowed.has(item.method),'Read-only upstream');const response=await fetch(upstream,{method:'POST',headers:{'content-type':'application/json'},body,signal:AbortSignal.timeout(20000)});res.writeHead(response.status,{'content-type':'application/json'});res.end(await response.text());}catch(e){res.writeHead(502);res.end(JSON.stringify({error:e.message}));}});
 await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',resolve);});
 proc=spawn(exe,['--host','127.0.0.1','--port',String(port),'--fork-url',`http://127.0.0.1:${proxy.address().port}`,'--fork-block-number',String(block),'--chain-id','99901','--silent'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
 let startupError='';proc.on('error',e=>startupError=e.message);proc.stderr.on('data',d=>startupError+=d.toString());
 const client=createPublicClient({cacheTime:0,transport:http(url,{retryCount:0,timeout:60000})});
 let ready=false;
 for(let i=0;i<90;i++){if(proc.exitCode!==null||startupError.includes('ENOENT'))throw Error(startupError);try{await client.getChainId();ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}
 assert(ready,'Local fork did not start: '+startupError);
 const metadata=await client.request({method:'anvil_nodeInfo'});
 assert.equal(Number(metadata.forkConfig.forkBlockNumber),block);
 assert.equal(await client.getChainId(),99901);
 const account=(await client.request({method:'eth_accounts'}))[0];
 const wallet=createWalletClient({account,transport:http(url,{retryCount:0,timeout:60000})});
 record('fork ready',{account,metadata});
 const registry='0xF1E2FA75422F889e565F3142bdbf60B28dce2aa7';
 const loadAbi=async name=>{const response=await fetch('https://montramarkets.xyz/docs/abis/'+name+'.json',{signal:AbortSignal.timeout(20000)});assert(response.ok,'ABI fetch failed');const abi=await response.json();assert(Array.isArray(abi));return abi;};
 const [registryAbi,factoryAbi,lensAbi,routerAbi]=await Promise.all(['LaunchpadRegistry','LaunchFactory','LaunchLens','LaunchRouter'].map(loadAbi));
 const contracts={};for(const name of ['factory','router','lens','poolManager']){contracts[name]=await client.readContract({address:registry,abi:registryAbi,functionName:'get',args:[stringToHex(name,{size:32})]});assert((await client.getCode({address:contracts[name]}))?.length>2,name+' missing');}
 record('registry resolved',contracts);
 const readFactory=(functionName,args=[])=>client.readContract({address:contracts.factory,abi:factoryAbi,functionName,args});
 const count=await readFactory('configCount');let row,configId;
 for(let i=0n;i<count;i++){const candidate=await readFactory('getConfig',[i]);if(candidate.enabled&&candidate.quote.toLowerCase()===zeroAddress&&Number(candidate.earlyBuyFeeWindow)===0){row=candidate;configId=i;break;}}
 assert(row,'No enabled native HYPE row without an anti-snipe window');
 const module=await readFactory('getModuleSet',[row.moduleSetId]);
 assert(await client.readContract({address:registry,abi:registryAbi,functionName:'isKnownHook',args:[module.hook]}));
 const launchFee=await readFactory('launchFee');
 const params={name:'Dinn Montra Fork Test',symbol:'DMTEST',metadataURI:'https://example.invalid/dinn-local-test.json',profile:{logo:'',description:'Local fork integration test only',socials:{telegram:'',twitter:'',discord:'',website:'',extra:''}},configId,supply:0n,salt:keccak256(stringToHex('dinn-montra-fork-v1')),feeRecipients:[],feeShares:[],firstBuyAmount:0n,firstBuyMinOut:0n,permit:{deadline:0n,v:0,r:zeroHash,s:zeroHash}};
 const builderCode='dinn-fork-test'; // Deliberately unregistered; no reward claim or external registration.
 const suffix=stringToHex(builderCode)+toHex(builderCode.length,{size:1}).slice(2)+'00'+'80218021802180218021802180218021';
 const launchRequest={account,address:contracts.factory,abi:factoryAbi,functionName:'launch',args:[params],value:launchFee,dataSuffix:suffix};
 const without=await client.simulateContract({...launchRequest,dataSuffix:undefined});
 const withSuffix=await client.simulateContract(launchRequest);assert.deepEqual(withSuffix.result,without.result,'Suffix changed launch result');
 const hash=await wallet.writeContract({...withSuffix.request,chain:null});
 const receipt=await client.waitForTransactionReceipt({hash});assert.equal(receipt.status,'success');
 const tx=await client.getTransaction({hash});const canonical=encodeFunctionData({abi:factoryAbi,functionName:'launch',args:[params]});
 assert.equal(tx.input,canonical+suffix.slice(2));assert.deepEqual(decodeFunctionData({abi:factoryAbi,data:tx.input}).args,[params]);
 const trailer=tx.input.slice(canonical.length);const marker='80218021802180218021802180218021';assert(trailer.endsWith(marker));const suffixBytes=Buffer.from(trailer,'hex');const codeLength=suffixBytes[suffixBytes.length-18];assert.equal(suffixBytes[suffixBytes.length-17],0);assert.equal(suffixBytes.subarray(0,codeLength).toString(),builderCode);
 const launched=parseEventLogs({abi:factoryAbi,eventName:'TokenLaunched',logs:receipt.logs.filter(l=>l.address.toLowerCase()===contracts.factory.toLowerCase())});assert.equal(launched.length,1);
 const {token,poolId,creator,supply,firstBuyIn,firstBuyOut}=launched[0].args;assert.equal(creator.toLowerCase(),account.toLowerCase());assert.equal(token.toLowerCase(),withSuffix.result[0].toLowerCase());assert.equal(poolId,withSuffix.result[1]);assert.equal(firstBuyIn,0n);assert.equal(firstBuyOut,0n);
 const view=await client.readContract({address:contracts.lens,abi:lensAbi,functionName:'tokenView',args:[token]});assert.equal(view.key.hooks.toLowerCase(),module.hook.toLowerCase());assert(view.config.seeded);assert(view.config.seedLiquidity>0n);assert.equal(view.key.currency0,zeroAddress);
 record('local launch and builder suffix verified',{token,poolId,configId,supply,launchFee,hash,builderCode,suffix,attribution:'calldata only; no registered code or reward eligibility',seedLiquidity:view.config.seedLiquidity,activeLiquidityBeforeFirstTrade:view.activeLiquidity});
 const erc20=parseAbi(['function balanceOf(address) view returns (uint256)','function totalSupply() view returns (uint256)','function approve(address,uint256) returns (bool)']);
 const tokenBalance=()=>client.readContract({address:token,abi:erc20,functionName:'balanceOf',args:[account]});
 const actualSupply=await client.readContract({address:token,abi:erc20,functionName:'totalSupply'});
 const transfers=parseEventLogs({abi:parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']),eventName:'Transfer',logs:receipt.logs.filter(l=>l.address.toLowerCase()===token.toLowerCase())});
 const minted=transfers.filter(e=>e.args.from===zeroAddress).reduce((sum,e)=>sum+e.args.value,0n),burned=transfers.filter(e=>e.args.to===zeroAddress).reduce((sum,e)=>sum+e.args.value,0n);
 assert.equal(minted,supply);assert.equal(actualSupply,minted-burned);record('supply reconciled',{minted,burned,actualSupply});
 for(const side of ['buy','sell']){
  const amountIn=side==='buy'?parseEther('0.01'):(await tokenBalance())/2n,zeroForOne=side==='buy'?view.config.quoteIsCurrency0:!view.config.quoteIsCurrency0;
  assert(amountIn>0n);
  const {result:amountOut}=await client.simulateContract({address:contracts.router,abi:routerAbi,functionName:'quoteExactIn',args:[view.key,zeroForOne,amountIn]});assert(amountOut>0n);
  if(side==='sell'){const approved=await client.simulateContract({account,address:token,abi:erc20,functionName:'approve',args:[contracts.router,amountIn]});assert.equal(approved.result,true);const h=await wallet.writeContract({...approved.request,chain:null});assert.equal((await client.waitForTransactionReceipt({hash:h})).status,'success');}
  const deadline=(await client.getBlock()).timestamp+300n;
  const swap={key:view.key,zeroForOne,amountIn,minAmountOut:amountOut*99n/100n,recipient:account,deadline};
  const request={account,address:contracts.router,abi:routerAbi,functionName:'swapExactIn',args:[swap],value:side==='buy'?amountIn:0n};
  for(const invalid of [{...swap,minAmountOut:amountOut*2n},{...swap,deadline:deadline-301n}]){let reverted=false;try{await client.simulateContract({...request,args:[invalid]});}catch(e){assert(e.walk?.(cause=>cause instanceof ContractFunctionRevertedError),'Expected contract revert, not a transport error');reverted=true;}assert(reverted);}
  const nativeBefore=await client.getBalance({address:account}),tokenBefore=await tokenBalance();
  const simulated=await client.simulateContract(request);const h=await wallet.writeContract({...simulated.request,chain:null});const r=await client.waitForTransactionReceipt({hash:h});assert.equal(r.status,'success');
  const nativeAfter=await client.getBalance({address:account}),tokenAfter=await tokenBalance(),gas=r.gasUsed*r.effectiveGasPrice;
  const paid=side==='buy'?nativeBefore-nativeAfter-gas:tokenBefore-tokenAfter,received=side==='buy'?tokenAfter-tokenBefore:nativeAfter-nativeBefore+gas;
  assert.equal(paid,amountIn);assert.equal(received,amountOut);assert(received>=swap.minAmountOut);
  const swaps=parseEventLogs({abi:routerAbi,eventName:'Swapped',logs:r.logs.filter(l=>l.address.toLowerCase()===contracts.router.toLowerCase())});assert.equal(swaps.length,1);assert.equal(swaps[0].args.poolId,poolId);assert.equal(swaps[0].args.amountIn,paid);assert.equal(swaps[0].args.amountOut,received);assert.equal(swaps[0].args.recipient.toLowerCase(),account.toLowerCase());
  assert.equal((await client.getBlock({blockNumber:r.blockNumber})).hash,r.blockHash);
  record(side+' verified',{hash:h,paid,received,minimum:swap.minAmountOut,gasUsed:r.gasUsed,slippageRevert:true,expiredDeadlineRevert:true});
 }
 const env={ELYSIUM_AUTH_CHAIN_ID:'99901',ELYSIUM_RPC_URL:upstream,ELYSIUM_PUBLIC_RPC_URL:upstream,ELYSIUM_MARKET_RPC_URL:upstream,ENABLE_MONTRA_SWAPS:'true',ENABLE_WALLET_TRANSFERS:'true'};
 const fetchImpl=async()=>({ok:true,json:async()=>({chainId:99901,sends:{enabled:true}})});
 const store=new Map(),storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
 const lock=fn=>fn(),provider={request:args=>client.request(args)};
 const trades=createMarketSubmitter({storage,lock});
 for(const side of ['buy','sell']){const intent={account,chainId:99901,token,route:'Montra:'+poolId,side,amount:side==='buy'?'0.001':'100',slippageBps:100};let completed=false;
 for(let step=0;step<3;step++){await client.request({method:'evm_setNextBlockTimestamp',params:[Math.floor(Date.now()/1000)+step+1]});await client.request({method:'evm_mine',params:[]});const p=await prepareMarketTrade(intent,{env,client,fetchImpl});const result=await trades.submit(p.review,intent,provider,()=>true);await client.request({method:'evm_mine',params:[]});const checked=await marketTradeReceipt({hash:result.hash,review:p.review},{client});assert.equal(checked.state,'confirmed');trades.settle(intent,checked.state);record('Dinn '+side+' '+p.review.step+' confirmed',{hash:result.hash,minimum:p.review.minimumOut});if(p.review.step==='swap'){completed=true;break;}}
 assert(completed,'Dinn trade did not complete');}
 const recipient=(await client.request({method:'eth_accounts'}))[1],transferIntent={account,recipient,chainId:99901,asset:'native',amount:'0.001',decimals:18};const send=await prepareTransfer(transferIntent,{env,client,fetchImpl});const nativeSubmitter=createTransferSubmitter({storage,lock});const sent=await nativeSubmitter.submit(send,transferIntent,provider,()=>true);await client.request({method:'evm_mine',params:[]});const checked=await transferReceipt({hash:sent.hash,intent:transferIntent},{env,client});assert.equal(checked.state,'confirmed');nativeSubmitter.settle(transferIntent,'confirmed');record('Dinn HYPE transfer confirmed',{hash:sent.hash});
 report.passed=true;
}catch(e){report.passed=false;report.error=e.shortMessage||e.message;console.error(report.error);process.exitCode=1;}
finally{proc?.kill();proxy?.closeAllConnections();proxy?.close();fs.mkdirSync('output/research',{recursive:true});fs.writeFileSync('output/research/montra-fork-result.json',JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2));}
