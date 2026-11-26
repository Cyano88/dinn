import {xLayerTarget,stockCode,stockLaunchOptions,launchGuidance} from './xlayer-stock.mjs';
import {createHash} from 'node:crypto';
import {Pool} from 'pg';
import {createPublicClient,decodeEventLog,http,isAddress,parseAbiItem,zeroAddress} from 'viem';
import {base,xLayer} from 'viem/chains';
import {OKXFacilitatorClient} from '@okxweb3/x402-core';
import {serverRpcUrl} from './rpc-config.mjs';
import {x402ResourceServer,HTTPFacilitatorClient} from '@x402/core/server';
import {decodePaymentSignatureHeader,encodePaymentRequiredHeader,encodePaymentResponseHeader} from '@x402/core/http';
import {ExactEvmScheme} from '@x402/evm/exact/server';
import {declareDiscoveryExtension} from '@x402/extensions/bazaar';
import {createFacilitatorConfig} from '@coinbase/x402';
import {agentAccessRequest,agentServices,validateAgentRequest} from './agent-access.mjs';
import {baseStockLookup} from './base-stock-data.mjs';
import {robinhoodStock} from './robinhood-stock.mjs';
import {ponsTradePair} from './pons-trading.mjs';
import {researchBaseStockPairedToken} from './base-stock-paired-research.mjs';

const baseRail={network:'eip155:8453',asset:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',path:'/api/paid/research',table:'dinn_base_research_payments'};
const okxRail={network:'eip155:196',asset:'0x779ded0c9e1022225f8e0630b35a9b54be713736',path:'/api/okx/research',table:'dinn_okx_research_payments'};

const examples={
 'xlayer.stock.research':{query:'COIN'},
 'stock.launch-idea':{chainId:8453},
 'pons.stock.research':{query:'NVDA'},
 'pons.stock-paired.research':{address:'0x451b42a15100c340ca12f7c66de06fac5ea2d751'},
 'base.stock.research':{query:'NVDAc'},
 'base.stock-paired.research':{address:'0x8f277eee1254d3319355e76a8c6594e7d3e2eba3'},
 'base.stock-paired.discover':{metric:'liquidity'},
 'token.research':{address:'0x43468fc21c46d30cf765e1a1d0ed32ecb6bd89a4'}
};
const inputSchema={type:'object',additionalProperties:false,required:['requestId','service','input'],
 properties:{
  requestId:{type:'string',pattern:'^[A-Za-z0-9._-]{1,100}$',description:'Choose an ID for this report. Reuse it when retrying the same payment.',examples:['research-001']},
  service:{type:'string',enum:Object.keys(examples),description:'Choose X Layer tokenized stock research (xlayer.stock.research), a stock-inspired community launch idea (stock.launch-idea with chainId 8453 for Base or 4663 for Robinhood Chain), Base stock research, Bankr stock-pair research or discovery, or Robinhood stock, Pons stock-pair or general Pons launch research.',examples:['base.stock.research']},
  input:{type:'object',description:'For an X Layer, Base or Robinhood stock, send its ticker as query. For a Bankr or Pons token report, send its contract address as address. For discovery, send metric as liquidity or volume.',examples:[examples['base.stock.research']]}
 },
 oneOf:Object.keys(examples).map(service=>({properties:{service:{const:service},input:{
  type:'object',additionalProperties:false,required:agentServices[service].required,properties:agentServices[service].properties
 }}}))};
const extension=declareDiscoveryExtension({method:'POST',bodyType:'json',input:{requestId:'research-001',service:'base.stock.research',input:examples['base.stock.research']},inputSchema,
 output:{example:{status:'completed',charged:true,service:'base.stock.research',result:{
  checkedAt:'2026-11-22T08:39:17.701Z',address:'0xb20000000000000000000078ee7ce2fe4908108c',
  identity:{status:'matched',symbol:'NVDAc',name:'NVIDIA Corporation'}
 }}}});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reply=(status,body,headers={})=>({status,body,headers});
const problem=(status,error)=>reply(status,{error});
const retry=()=>problem(409,'Payment is being checked. Retry the same request ID and signed payment.');
const delivered=(body,receipt)=>reply(200,{...body,charged:true,payment:receipt,next:{type:'stop',message:'Research delivered. No trade or wallet action was authorized.'}},{'PAYMENT-RESPONSE':encodePaymentResponseHeader(receipt)});

const authorizationUsed=parseAbiItem('event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)');
const transfer=parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

// The facilitator may settle even if its HTTP response never reaches Dinn.
export async function recoverPaymentReceipt(chain,row,requirements){
 const {asset,network}=requirements;
 const first=BigInt(row.start_block);
 const latest=await chain.getBlockNumber({cacheTime:0});
 const step=network===okxRail.network?100n:512n;
 for(let from=first;from<=latest && from<first+4096n;from+=step){
  const to=from+step-1n<latest?from+step-1n:latest;
  const logs=await chain.getLogs({address:asset,event:authorizationUsed,args:{authorizer:row.payer,nonce:row.nonce},fromBlock:from,toBlock:to});
  for(const log of logs){
   const tx=await chain.getTransactionReceipt({hash:log.transactionHash});
   if(tx.status!=='success')continue;
   const paid=tx.logs.some(entry=>{
    if(entry.address.toLowerCase()!==asset.toLowerCase())return false;
    try{
     const {args}=decodeEventLog({abi:[transfer],data:entry.data,topics:entry.topics});
     return args.from.toLowerCase()===row.payer && args.to.toLowerCase()===requirements.payTo.toLowerCase() && args.value===BigInt(requirements.amount);
    }catch{return false;}
   });
   if(paid)return {success:true,network,payer:row.payer,transaction:log.transactionHash};
  }
 }
 return null;
}

export function paidResearchConfigured(env){
 return env.DINN_BASE_PAYMENTS_ENABLED==='true' && isAddress(env.DINN_BASE_PAY_TO||'') && env.DINN_BASE_PAY_TO.toLowerCase()!==zeroAddress &&
  !!(env.CDP_API_KEY_ID&&env.CDP_API_KEY_SECRET&&env.DATABASE_URL&&env.DINN_PAID_ORIGIN);
}
const setups=new Map();
function okxConfigured(env){
 return env.DINN_OKX_PAYMENTS_ENABLED==='true'&&isAddress(env.DINN_OKX_PAY_TO||'')&&env.DINN_OKX_PAY_TO.toLowerCase()!==zeroAddress&&
  !!(env.OKX_API_KEY&&env.OKX_SECRET_KEY&&env.OKX_PASSPHRASE&&env.DATABASE_URL&&env.DINN_PAID_ORIGIN);
}
async function initialize(env,rail){
 const {network,asset,path,table}=rail;
 const okx=rail===okxRail;
 const recipient=okx?env.DINN_OKX_PAY_TO:env.DINN_BASE_PAY_TO;
 const origin=new URL(env.DINN_PAID_ORIGIN);
 if(origin.protocol!=='https:'||origin.origin!==env.DINN_PAID_ORIGIN)throw Error('Invalid paid research origin.');
 const chain=createPublicClient({chain:okx?xLayer:base,transport:http(okx?'https://rpc.xlayer.tech':serverRpcUrl(8453,env))});
 const resource={
  url:origin.origin+path,mimeType:'application/json',serviceName:'Dinn Labs',
  iconUrl:new URL('/brand/dinn-icon.png',origin).href,
  tags:['Token research','Tokenized stocks','Base','Bankr','Pons','X Layer'],
  description:'Research tokenized stocks and stock-paired tokens on Base and Robinhood Chain. Verify X Layer xStocks deployments and check OKXICE pools independently. Read dated company news and available SEC filings alongside market activity, holder data and lock schedules for supported assets. Ask for a stock-inspired community launch idea on either chain and get a sourced brief or a dated wait finding. One report per call.'
 };
 const facilitator=okx?new OKXFacilitatorClient({apiKey:env.OKX_API_KEY,secretKey:env.OKX_SECRET_KEY,passphrase:env.OKX_PASSPHRASE,syncSettle:true}):new HTTPFacilitatorClient(createFacilitatorConfig(env.CDP_API_KEY_ID,env.CDP_API_KEY_SECRET));
 const server=new x402ResourceServer(facilitator).register(network,new ExactEvmScheme());
 await server.initialize();
 const [requirements]=await server.buildPaymentRequirements({network,scheme:'exact',payTo:recipient,price:okx?{asset,amount:'100000',extra:{name:'USD\u20ae0',version:'1'}}:'$0.10',maxTimeoutSeconds:180});
 if(requirements?.asset.toLowerCase()!==asset.toLowerCase()||requirements.amount!=='100000'||requirements.payTo.toLowerCase()!==recipient.toLowerCase()||requirements.network!==network||(okx&&(requirements.extra?.name!=='USD\u20ae0'||requirements.extra?.version!=='1')))throw Error('Unexpected payment terms.');
 const challenge=await server.createPaymentRequiredResponse([requirements],resource,undefined,extension);
 const db=new Pool({connectionString:env.DATABASE_URL,max:6,connectionTimeoutMillis:5000,statement_timeout:8000,allowExitOnIdle:true});
 db.on('error',()=>console.error('Paid research database unavailable.'));
 try{await db.query(`CREATE TABLE IF NOT EXISTS ${table}(
  payer text NOT NULL, request_id text NOT NULL, nonce text NOT NULL, proof text NOT NULL,
  request_hash text NOT NULL, start_block bigint NOT NULL, valid_before bigint NOT NULL, report jsonb NOT NULL, receipt jsonb,
  PRIMARY KEY(payer,request_id), UNIQUE(payer,nonce))`);}
 catch(error){await db.end();throw error;}
 return {server,requirements,resource,challenge,db,chain};
}

async function paidStockTarget(input,lookup){
 const query=input.query.trim().toLowerCase();
 const result=await lookup(/^0x/i.test(query)?{address:query}:{query});
 if(result.sources?.coinbase?.status!=='available')return {error:problem(503,'Coinbase stock registry unavailable.')};
 const matches=(result.stocks||[]).filter(s=>{
  const name=s.name?.toLowerCase()||'',symbol=s.symbol?.toLowerCase()||'';
  const company=name.replace(/(?:[,\s]+(?:incorporated|inc|corporation|corp|plc|ltd|limited)\.?)+$/g,'').trim();
  return [s.address?.toLowerCase(),symbol,name,company,symbol.replace(/c$/,'')].includes(query);
 });
 if(matches.length!==1||!isAddress(matches[0].address||''))return {error:problem(422,'Use a company name, exact stock ticker or Base contract address that identifies one Coinbase stock token.')};
 return {address:matches[0].address.toLowerCase()};
}
export async function paidResearch(request,signature,{env=process.env,lookup=baseStockLookup,xlayerLookup=xLayerTarget,launchLookup=stockLaunchOptions,stockLookup=robinhoodStock,ponsLookup=ponsTradePair,bankrLookup=researchBaseStockPairedToken,report=agentAccessRequest,runtime,queryUrl,okx=false}={}){
 const rail=okx?okxRail:baseRail;
 const {table,asset,path,network}=rail;
 if(!runtime&&!(okx?okxConfigured(env):paidResearchConfigured(env)))return problem(503,okx?'X Layer USDT0 payments are not enabled.':'Direct Base payments are not enabled.');
 if(!Object.hasOwn(examples,request?.service)||!request.requestId)return problem(400,'Choose a supported research service and supply a stable requestId.');
 // Some x402 buyers send each CLI parameter as a string, including nested input.
 try{
  if(typeof request.input==='string'){
   // The OKX GET client URL-encodes parameters, including JSON already encoded by a caller.
   const inputText=okx&&queryUrl&&/^%7B/i.test(request.input)?decodeURIComponent(request.input):request.input;
   request={...request,input:JSON.parse(inputText)};
  }
  if(request.service==='stock.launch-idea'&&![8453,4663].includes(request.input?.chainId))return problem(400,'Which launch chain? Send chainId 8453 for Base or 4663 for Robinhood Chain before paying.');
  const missing=validateAgentRequest(request);
  if(missing.length)return problem(400,'Supply the required research input: '+missing.join(', ')+'.');}
 catch{return problem(400,'Check requestId and the input fields. Example input for '+request.service+': '+JSON.stringify(examples[request.service])+'.');}
 const {service,input,requestId}=request;
 if(!runtime&&!setups.has(rail))setups.set(rail,initialize(env,rail).catch(error=>{setups.delete(rail);throw error;}));
 const state=runtime||await setups.get(rail);
 const {server,requirements,db}=state;
 let {challenge,resource}=state;
 let discovery=extension;
 if(queryUrl){
  const url=new URL(queryUrl,resource.url);
  if(url.origin!==new URL(resource.url).origin||url.pathname!==path)return problem(400,'Invalid research URL.');
  resource={...resource,url:url.href};
  // Each GET URL is a specific buyer request. Only the stable POST route is advertised in Bazaar.
  discovery={};
  challenge=await server.createPaymentRequiredResponse([requirements],resource,undefined,discovery);
 }
 if(!signature){
  if(okx){
   try{
    if(service==='pons.stock.research')await stockLookup(input.query);
    if(service==='token.research'||service==='pons.stock-paired.research'){
     const launch=await ponsLookup({token:input.address});
     if(service==='pons.stock-paired.research')await stockLookup(launch.pair.address);
    }
    if(service==='base.stock-paired.research'){
     const launch=await bankrLookup(input,{env,verifyPairOnly:true});
     if(launch.classification!=='verified-bankr-stock-paired-token')return problem(422,'Use the Base contract of a verified Bankr stock-paired launch. For a stock token itself, use base.stock.research.');
    }
   }catch(error){
    if(error.message?.startsWith('No unique active Robinhood stock'))return problem(422,'Use an active Robinhood stock ticker or contract. For a Pons stock pair, its pairing asset must be a Robinhood stock.');
    if(error.message?.includes('not a registered Pons'))return problem(422,'Use the contract of a registered Pons v2 launch on Robinhood Chain.');
    return problem(503,'Dinn could not verify this research target with its sources. Check the chain and contract, then retry.');
   }
  }
  if(service==='xlayer.stock.research'){
   try{stockCode(input.query);}catch{return problem(422,'Use an exact company name or stock ticker.');}
   try{
    const directory=await xlayerLookup(input.query);
    if(!directory.pools?.length&&directory.issuerIdentity?.status!=='verified'){
     const launchOptions=await launchLookup(directory.symbol,{env});
     return reply(422,{charged:false,symbol:directory.symbol,source:directory.source,error:'No matching X Layer deployment or OKXICE pool was found in the sources checked.',launchOptions,guidance:launchGuidance(launchOptions)});
    }
   }catch{return problem(503,'X Layer stock sources could not be verified.');}
  }
  if(service==='base.stock.research'){
   const target=await paidStockTarget(input,lookup);
   if(target.error)return target.error;
  }
  return reply(402,challenge,{'PAYMENT-REQUIRED':encodePaymentRequiredHeader(challenge)});
 }
 let payment;
 try{payment=decodePaymentSignatureHeader(signature);}catch{return problem(400,'Invalid payment header.');}
 const auth=payment?.payload?.authorization;
 if(!payment || payment.x402Version!==2||payment.resource?.url!==resource.url||!server.findMatchingRequirements([requirements],payment)||
  !/^[0-9]{1,18}$/.test(auth?.validBefore||'')||!isAddress(auth?.from||'')||!/^0x[0-9a-f]{64}$/i.test(auth?.nonce||'')||!/^0x[0-9a-f]+$/i.test(payment.payload?.signature||''))return problem(400,'Expected a matching payment authorization for this research endpoint.');
 if(!server.validateExtensions(challenge,payment).valid)return problem(400,'Invalid service metadata.');
 // Only the merchant's resource and discovery declaration may reach the facilitator.
 payment={...payment,resource,extensions:challenge.extensions};
 const payer=auth.from.toLowerCase(),nonce=auth.nonce.toLowerCase();
 const proof=hash(payment.payload.signature.toLowerCase());
 const requestHash=hash([service,Object.entries(input).sort(([a],[b])=>a.localeCompare(b))]);
 const client=await db.connect();
 let locked=false;
 try{
  locked=(await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',[payer+'|'+requestId])).rows[0].locked;
  if(!locked)return retry();
  const existing=(await client.query(`SELECT * FROM ${table} WHERE payer=$1 AND (request_id=$2 OR nonce=$3)`,[payer,requestId,nonce])).rows;
  if(existing.length){
   const prev=existing[0];
   if(existing.length!==1||prev.request_id!==requestId||prev.request_hash!==requestHash||prev.proof!==proof||prev.nonce!==nonce)return problem(409,'Request ID or authorization already used. Replay the original request and payment.');
   if(prev.receipt)return delivered(prev.report,prev.receipt);
   const recovered=await recoverPaymentReceipt(state.chain,prev,requirements);
   if(!recovered){
    // Only release the reservation once chain finality proves the original authorization
    // expired unused. An uncertain payment must never cause a second charge.
    const finalized=await state.chain.getBlock({blockTag:'finalized'});
    if(finalized.timestamp>BigInt(prev.valid_before)){
     const used=await state.chain.readContract({address:asset,abi:[parseAbiItem('function authorizationState(address,bytes32) view returns (bool)')],
      functionName:'authorizationState',args:[payer,nonce],blockNumber:finalized.number});
     if(!used){
      await client.query(`DELETE FROM ${table} WHERE payer=$1 AND request_id=$2 AND receipt IS NULL`,[payer,requestId]);
      return problem(402,'The previous authorization expired unused. Request fresh payment terms for this request ID.');
     }
    }
    return retry();
   }
   await client.query(`UPDATE ${table} SET receipt=$3 WHERE payer=$1 AND request_id=$2`,[payer,requestId,recovered]);
   return delivered(prev.report,recovered);
  }
  const verification=await server.verifyPayment(payment,requirements,discovery);
  if(!verification.isValid||verification.payer?.toLowerCase()!==payer)return problem(402,'Payment authorization was not verified.');
  const target=service==='base.stock.research'?await paidStockTarget(input,lookup):null;
  if(target?.error)return target.error;
  const reportRequest=target?{...request,input:{...input,query:target.address}}:request;
  let result;
  try{result=await report(reportRequest,{paidResearch:true,env});}
  catch(error){if(service!=='stock.launch-idea')throw error;return problem(503,'The sourced idea brief is unavailable. No settlement was requested.');}
  if(service==='stock.launch-idea' && (!['idea','wait'].includes(result?.result?.outcome)||result?.result?.chainId!==input.chainId))return problem(422,'No supported idea brief was delivered. No settlement was requested.');
  if(result.status!=='completed'||
    service==='xlayer.stock.research'&&(result.result?.chainId!==196||result.result.query!==input.query||(!result.result.pools?.length&&result.result.issuerIdentity?.status!=='verified'))||service==='token.research'&&result.result?.protocol?.name!=='Pons v2'||
    service==='pons.stock.research'&&(result.result?.classification!=='verified-robinhood-stock'||![result.result?.stock?.address,result.result?.stock?.symbol].some(v=>v?.toLowerCase()===input.query.toLowerCase()))||
    service==='pons.stock-paired.research'&&(result.result?.classification!=='verified-pons-stock-pair'||result.result?.address?.toLowerCase()!==input.address.toLowerCase()||result.result?.ponsState?.pair?.address?.toLowerCase()!==result.result?.stock?.address?.toLowerCase())||
    service==='base.stock.research'&&(result.result?.identity?.status!=='matched'||result.result.address?.toLowerCase()!==target.address)||
    service==='base.stock-paired.research'&&result.result?.classification!=='verified-bankr-stock-paired-token')return problem(422,'The requested research target could not be verified. No settlement was requested.');
  const startBlock=await state.chain.getBlockNumber();
  const saved=await client.query(`INSERT INTO ${table}(payer,request_id,nonce,proof,request_hash,report,start_block,valid_before) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING request_id`,[payer,requestId,nonce,proof,requestHash,result,startBlock.toString(),auth.validBefore]);
  if(!saved.rowCount)return retry();
  let receipt;
  let settlementError;
  try{receipt=await server.settlePayment(payment,requirements,discovery);}
  catch(error){if(!okx)throw error;settlementError=error;}
  if(okx){
   // Record only structured facilitator diagnostics. Never log its raw payload or buyer signature.
   const code=settlementError?.errorReason??receipt?.errorReason??receipt?.code;
   const reason=typeof code==='string'&&/^[a-z][a-z0-9_]{1,63}$/i.test(code)?code:null;
   const facilitatorStatus=['pending','success','failed','timeout'].includes(receipt?.status)?receipt.status:null;
   // The facilitator can broadcast before its response or the RPC head reflects settlement.
   // Match this authorization and transfer on chain before releasing the stored report.
   for(let attempt=0;attempt<5;attempt++){
    if(attempt)await new Promise(resolve=>setTimeout(resolve,1000));
    receipt=await recoverPaymentReceipt(state.chain,{start_block:startBlock,payer,nonce},requirements);
    if(receipt)break;
   }
   if(!receipt)console.warn('OKX research settlement unconfirmed',{
    request:hash(requestId).slice(0,16),reason,facilitatorStatus,
    httpStatus:Number.isInteger(settlementError?.statusCode)?settlementError.statusCode:null,
    facilitatorThrew:Boolean(settlementError)
   });
  }
  if(!receipt?.success||(receipt.status&&receipt.status!=='success')||receipt.network!==network||receipt.payer?.toLowerCase()!==payer||!/^0x[0-9a-f]{64}$/i.test(receipt.transaction||''))return retry();
  await client.query(`UPDATE ${table} SET receipt=$3 WHERE payer=$1 AND request_id=$2`,[payer,requestId,receipt]);
  return delivered(result,receipt);
 }finally{
  let discard=false;
  if(locked)try{await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[payer+'|'+requestId]);}catch{discard=true;}
  client.release(discard);
 }
}
