// Integration test only. Never accepts an external transaction endpoint or a private key.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {createPublicClient,createWalletClient,http,parseAbi,parseAbiParameters,encodeAbiParameters,keccak256,zeroAddress,parseEther,parseEventLogs,ContractFunctionRevertedError} from 'viem';
import {contracts as C,pairs} from '../src/domain.mjs';
import {launchAbi} from '../src/launch-call.mjs';
import {quoteSwap,swapReceipt} from '../src/swap-service.mjs';
import {createSwapSubmitter} from '../src/swap-submission.mjs';
let block=1868843;
const port=18545,url=`http://127.0.0.1:${port}`,upstream='https://rpc.boxa.club';
const exe='node_modules/@foundry-rs/anvil-win32-amd64/bin/anvil.exe';
const report={kind:'local-fork-only',upstream,block,startedAt:new Date().toISOString(),steps:[]};
let proc,proxy;
const record=(step,detail={})=>{report.steps.push({step,...detail});console.log(step,JSON.stringify(detail,(_,v)=>typeof v==='bigint'?v.toString():v));};
try {
 if(process.argv.includes('--fresh-block')){const r=await fetch(upstream,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_blockNumber',params:[]}),signal:AbortSignal.timeout(20000)});const j=await r.json();assert(/^0x[0-9a-f]+$/i.test(j.result),'Cannot read fork head');block=Number(BigInt(j.result))-128;report.block=block;}
 // Refuse an already-running endpoint, so we never accidentally use another node.
 try {await fetch(url,{signal:AbortSignal.timeout(500)});throw Error('Port already in use');}catch(e){if(e.message==='Port already in use')throw e;}
 // Node's HTTP transport works with this workstation's network configuration.
 // Explicit read-only allowlist prevents a fork request from broadcasting upstream.
 const allowed=new Set(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getBlockByHash','eth_getBalance','eth_getCode','eth_getStorageAt','eth_getTransactionCount','eth_getTransactionByHash','eth_getTransactionReceipt','eth_getProof','eth_call','eth_getLogs','eth_gasPrice','eth_feeHistory','net_version']);
 proxy=createServer(async(req,res)=>{try{let body='';for await(const chunk of req){body+=chunk;if(body.length>1000000)throw Error('Request too large');}const payload=JSON.parse(body);for(const item of Array.isArray(payload)?payload:[payload])assert(allowed.has(item.method),'Read-only upstream');const response=await fetch(upstream,{method:'POST',headers:{'content-type':'application/json'},body,signal:AbortSignal.timeout(20000)});res.writeHead(response.status,{'content-type':'application/json'});res.end(await response.text());}catch(e){res.writeHead(502);res.end(JSON.stringify({error:e.message}));}});
 await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',resolve);});
 proc=spawn(exe,['--host','127.0.0.1','--port',String(port),'--fork-url',`http://127.0.0.1:${proxy.address().port}`,'--fork-block-number',String(block),'--chain-id','99901','--silent'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
 let startupError='';proc.on('error',e=>startupError=e.message);proc.stderr.on('data',d=>startupError+=d.toString());
 const client=createPublicClient({transport:http(url,{retryCount:0,timeout:60000})});
 let ready=false;
 for(let i=0;i<90;i++){if(proc.exitCode!==null||startupError.includes('ENOENT'))throw Error(startupError);try{await client.getChainId();ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}
 assert(ready,'Local fork did not start: '+startupError);
 const metadata=await client.request({method:'anvil_nodeInfo'});
 assert.equal(Number(metadata.forkConfig.forkBlockNumber),block);
 assert.equal(await client.getChainId(),99901);
 const account=(await client.request({method:'eth_accounts'}))[0];
 const wallet=createWalletClient({account,transport:http(url,{retryCount:0,timeout:60000})});
 record('fork ready',{account,metadata});
 const read=(address,signature,args=[])=>client.readContract({address,abi:parseAbi([signature]),functionName:signature.match(/function (\w+)/)[1],args});
 const send=async(address,abi,functionName,args=[],value=0n)=>{
  const {request}=await client.simulateContract({account,address,abi,functionName,args,value});
  const hash=await wallet.writeContract({...request,chain:null});
  const receipt=await client.waitForTransactionReceipt({hash});assert.equal(receipt.status,'success');return receipt;
 };
 for(const [name,address] of Object.entries(C))assert((await client.getCode({address}))?.length>2,`${name} missing`);
 const quote=pairs.HYPE.address;
 const ruleSet=await read(C.factory,'function ruleSet() view returns (address)');
 const config=await read(C.launchpad,'function quoteConfig(address) view returns ((bool allowed,int24 startTick,uint128 maxClip))',[quote]);
 assert(config.allowed,'WHYPE launches disabled');
 const params={name:'Dinn Fork Verification',symbol:'DFORK',quote,devBuyQuote:0n,minDevOut:0n,salt:keccak256(new TextEncoder().encode('dinn-fork-integration-v1')),creator:zeroAddress,fee:20000,builderFee:0};
 const route={recipient:account,dev:account,builder:zeroAddress,cto:true};
 const launchArgs=[params,route,ruleSet,config.startTick];
 const prediction=await client.simulateContract({account,address:C.factory,abi:launchAbi,functionName:'launchChecked',args:launchArgs});
 const [token,poolId]=prediction.result;
 const launchReceipt=await send(C.factory,launchAbi,'launchChecked',launchArgs);
 record('launched local token',{token,poolId,hash:launchReceipt.transactionHash});
 await send(quote,parseAbi(['function deposit() payable']),'deposit',[],parseEther('1'));
 const key={currency0:BigInt(token)<BigInt(quote)?token:quote,currency1:BigInt(token)<BigInt(quote)?quote:token,fee:0x800000,tickSpacing:200,hooks:C.launchpad};
 const keyType='(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)';
 const quoterAbi=parseAbi([`function quoteExactInputSingle((${keyType} poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)`]);
 const erc20=parseAbi(['function approve(address,uint256) returns (bool)','function balanceOf(address) view returns (uint256)']);
 const permitAbi=parseAbi(['function approve(address token,address spender,uint160 amount,uint48 expiration)']);
 const routerAbi=parseAbi(['function execute(bytes commands,bytes[] inputs,uint256 deadline) payable']);
 const hookAbi=parseAbi(['event HookSwap(bytes32 indexed poolId,address indexed sender,int128 amount0,int128 amount1,uint128 hookLPfeeAmount0,uint128 hookLPfeeAmount1)']);
 const balance=asset=>client.readContract({address:asset,abi:erc20,functionName:'balanceOf',args:[account]});
 for(const side of ['buy','sell']){
  const input=side==='buy'?quote:token,output=side==='buy'?token:quote;
  const amount=side==='buy'?parseEther('0.01'):(await balance(token))/2n;
  assert(amount>0n);
  const zeroForOne=input.toLowerCase()===key.currency0.toLowerCase();
  const {result:[amountOut]}=await client.simulateContract({account,address:C.quoter,abi:quoterAbi,functionName:'quoteExactInputSingle',args:[{poolKey:key,zeroForOne,exactAmount:amount,hookData:'0x'}]});
  assert(amountOut>0n);const minOut=amountOut*99n/100n;
  const deadline=(await client.getBlock()).timestamp+300n;
  await send(input,erc20,'approve',[C.permit2,amount]);
  await send(C.permit2,permitAbi,'approve',[input,C.router,amount,Number(deadline)]);
  const swap=minimum=>encodeAbiParameters(parseAbiParameters(`(${keyType} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)`),[{poolKey:key,zeroForOne,amountIn:amount,amountOutMinimum:minimum,minHopPriceX36:0n,hookData:'0x'}]);
  const inputs=minimum=>[encodeAbiParameters(parseAbiParameters('bytes,bytes[]'),['0x060c0f',[swap(minimum),encodeAbiParameters(parseAbiParameters('address,uint256'),[input,amount]),encodeAbiParameters(parseAbiParameters('address,uint256'),[output,minimum])]])];
  async function expectRevert(args){try{await client.simulateContract({account,address:C.router,abi:routerAbi,functionName:'execute',args});}catch(e){assert(e.walk?.(cause=>cause instanceof ContractFunctionRevertedError),'Expected contract revert, not a transport failure');return true;}throw Error('Unsafe swap unexpectedly simulated successfully');}
  const rejected=await expectRevert(['0x10',inputs(amountOut*2n),deadline]);
  const expiredRejected=await expectRevert(['0x10',inputs(minOut),(await client.getBlock()).timestamp-1n]);
  const beforeIn=await balance(input),beforeOut=await balance(output);
  const receipt=await send(C.router,routerAbi,'execute',['0x10',inputs(minOut),deadline]);
  const spent=beforeIn-await balance(input),received=(await balance(output))-beforeOut;
  assert(spent>0n&&spent<=amount);assert(received>=minOut);
  const events=parseEventLogs({abi:hookAbi,logs:receipt.logs.filter(log=>log.address.toLowerCase()===C.launchpad.toLowerCase())});
  assert(events.some(event=>event.args.poolId===poolId),'Missing matching HookSwap event');
  record(side+' verified',{amount,amountOut,minOut,spent,received,hash:receipt.transactionHash,hookEvents:events.length,slippageRevert:rejected,expiredDeadlineRevert:expiredRejected});
 }
 // Exercise the same service and wallet-submission module used by Dinn.
 const env={ELYSIUM_RPC_URL:url,ELYSIUM_AUTH_CHAIN_ID:'99901',ENABLE_LOCAL_SWAP_PREVIEW:'true'};
 // Force the service through HYPE wrapping and a nonzero allowance reset too.
 await send(quote,parseAbi(['function withdraw(uint256)']),'withdraw',[await balance(quote)]);
 await send(quote,erc20,'approve',[C.permit2,1n]);
 const saved=new Map(),submitter=createSwapSubmitter({storage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},lock:fn=>fn()});
 const provider={request:args=>client.request(args)};
 for(const side of ['buy','sell']){
  const intent={account,chainId:99901,token,side,pair:'HYPE',amount:side==='buy'?'0.001':'1',slippageBps:100};
  let completed=false;
  for(let i=0;i<6;i++){
   const review=await quoteSwap(intent,{env});
   const sent=await submitter.submit(review,intent,provider,()=>true);
   await client.waitForTransactionReceipt({hash:sent.hash});await client.request({method:'evm_mine',params:[]});
   const result=await swapReceipt({hash:sent.hash,review},{env});assert.equal(result.state,'confirmed');submitter.settle(intent,result.state);
   record('Dinn '+side+' '+review.step,{hash:sent.hash,state:result.state});
   if(review.step==='swap'){completed=true;break;}
  }
  assert(completed,'Dinn flow did not reach a confirmed swap');
 }
 report.passed=true;
}catch(e){report.passed=false;report.error=e.shortMessage||e.message;console.error(report.error);process.exitCode=1;}
finally{proc?.kill();proxy?.closeAllConnections();proxy?.close();fs.mkdirSync('output/research',{recursive:true});fs.writeFileSync('output/research/fork-swap-result.json',JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2));}
