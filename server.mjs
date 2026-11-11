import {createDraftService} from './src/draft-service.mjs';
import {inferenceAccess} from './src/inference-access.mjs';
import {purchaseUsdReference} from './src/purchase-usd.mjs';
import {createLogoService} from './src/logo-service.mjs';
import {ponsPair} from './src/pons-pairs.mjs';
import {downloadDexLogo} from './src/dex-logo.mjs';
import {productTools,productCapabilities} from './src/tool-catalog.mjs';
import {executeProductTool} from './src/product-tools.mjs';
import {ponsReview,ponsSimulate,ponsReceipt,ponsPurchaseApproval,ponsApprovalReceipt} from './src/pons-launch.mjs';
import {productStatus,isPausedRoute,pausedMessage} from './src/product-policy.mjs';
import {ponsReadiness,ponsBrief,robinhoodBalance} from './src/pons.mjs';
import {launchPreflight} from './src/launch-preflight.mjs';
import {prepareCreatorFee,creatorFeeReceipt} from './src/ascend-fee-service.mjs';
import {inspectCreatorFees} from './src/ascend-fees.mjs';
import {bridgeBalance,prepareBridge,bridgeSourceReceipt} from './src/bridge-wallet.mjs';
import {walletPrices} from './src/wallet-prices.mjs';
import {relayQuote,relayStatus} from './src/relay-funding.mjs';
import {prepareDeposit} from './src/funding-deposit.mjs';
import {depositReceipt} from './src/funding-receipt.mjs';
import {fundingRoute,fundingBalance} from './src/funding-route.mjs';
import {marketTokens} from './src/market-tokens.mjs';
import {nativeTransfersEnabled,montraSwapsEnabled,ascendLaunchEnabled,ascendFeesEnabled} from './src/execution-policy.mjs';
import {prepareMarketTrade,marketTradeReceipt} from './src/market-execution.mjs';
import {walletRouteCheck,trackMontraDelivery} from './src/delivery-status.mjs';
import {detectMarket,marketQuote} from './src/market-quotes.mjs';
import {walletNativeBalance,walletBalances,prepareTransfer,transferReceipt} from './src/wallet-actions.mjs';
import {quoteSwap,swapReceipt,swapPreviewEnabled} from './src/swap-service.mjs';
import {streamChat,validateChat,chatMessages,clarifySupplyRequest,tokenChatResult} from './src/chat.mjs';
import {readLaunchReceipt} from './src/launch-receipt.mjs';
import {embeddedAuthConfig,contentSecurityPolicy} from './src/auth-config.mjs';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {draftPlan,capabilities,validateLaunch,CHAIN_ID} from './src/domain.mjs';
import {simulateLaunch} from './src/ascend.mjs';
import {manifest,requestSchema,agentRequest} from './src/agent-service.mjs';
// Keep direct Node starts consistent with npm start without overriding environment values.
try{process.loadEnvFile(new URL('./.env',import.meta.url));}catch(error){if(error.code!=='ENOENT')throw error;}
const port=Number(process.env.PORT||4317), host=process.env.RENDER?'0.0.0.0':'127.0.0.1';
const logoService=createLogoService();
const draftService=createDraftService();
const checkInferenceAccess=inferenceAccess();
const publicOrigin=process.env.DINN_PUBLIC_URL||process.env.RENDER_EXTERNAL_URL;
const allowedOrigins=new Set([`http://127.0.0.1:${port}`,`http://localhost:${port}`,...(publicOrigin?[new URL(publicOrigin).origin]:[])]);
const publicDir=resolve('public');
const authConfig=embeddedAuthConfig({...process.env,DINN_AUTH_CHAIN_ID:'4663'});
function publicPolicyUrl(value){
 if(!value)return null;
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
const termsUrl=publicPolicyUrl(process.env.DINN_TERMS_URL),privacyUrl=publicPolicyUrl(process.env.DINN_PRIVACY_URL);
const legalLinks=termsUrl&&privacyUrl?{terms:termsUrl,privacy:privacyUrl}:null;
const onboardingOnly=authConfig.chainId!==CHAIN_ID;
const launchRpcUrl=onboardingOnly?undefined:process.env.ELYSIUM_RPC_URL;
const launchEnabled=ascendLaunchEnabled();
function json(res,status,data){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));}
async function body(req,limit=16000){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw new Error('Request too large.');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
async function buildPlan(message){let result;for await(const event of streamChat({message},{productMode:true})){if(event.type==='done')result=event.result;}return result;}
let walletReadStarts=[];
const server=createServer(async(req,res)=>{
 try{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',contentSecurityPolicy(authConfig));
  const path=new URL(req.url,'http://localhost').pathname;
  if(isPausedRoute(path)||path==='/execution/entry.js')return json(res,410,{error:pausedMessage,code:'COMING_SOON'});
  if(req.method==='HEAD' && path==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end();}
  if(req.method==='GET' && path==='/api/tools')return json(res,200,{tools:productTools,capabilities:productCapabilities,chainId:4663,canSign:false});
  if(req.method==='GET' && path==='/api/auth/config')return json(res,200,authConfig);
  if(req.method==='GET' && path==='/api/status')return json(res,200,{...productStatus(),legalLinks,draftSyncEnabled:draftService.enabled(),aiConfigured:!!(process.env.OG_API_KEY&&process.env.OG_MODEL)});
  if(req.method==='GET' && path==='/.well-known/launchflow.json')return json(res,200,{name:'Dinn',version:'2',services:['plan','pons.brief'],tools:'/api/tools',capabilities:productCapabilities,launchpads:productStatus().launchpads,broadcastEnabled:false});
  if(req.method==='GET' && path==='/api/agent/schema')return json(res,200,{type:'object',required:['service','input'],properties:{service:{enum:['plan','pons.brief']},input:{type:'object'}},additionalProperties:false});
  if(req.method==='GET' && /^\/media\/logos\/[0-9a-f-]+\.png$/.test(path)){try{const bytes=await logoService.publicImage(path.split('/').pop().replace('.png',''));if(!bytes)return json(res,404,{error:'Logo not found.'});res.writeHead(200,{'content-type':'image/png','cache-control':'public, max-age=31536000, immutable','content-length':bytes.length});return res.end(bytes);}catch{return json(res,503,{error:'Logo temporarily unavailable.'});}}
  if(req.method==='POST'){
   if(path.startsWith('/api/drafts/')){if(req.headers.origin&&!allowedOrigins.has(req.headers.origin))return json(res,403,{error:'Origin rejected.'});if(req.headers['content-type']?.split(';')[0]!=='application/json')return json(res,415,{error:'JSON required.'});try{const result=await draftService.handle(req,path,await body(req,350000));return json(res,result.status,result.body);}catch{return json(res,503,{error:'Account draft storage is unavailable. Your local draft is kept.'});}}
   if(path.startsWith('/api/logos/')){if(req.headers.origin&&!allowedOrigins.has(req.headers.origin))return json(res,403,{error:'Origin rejected.'});if(req.headers['content-type']?.split(';')[0]!=='application/json')return json(res,415,{error:'JSON required.'});try{return json(res,200,await logoService.handle(req,path,await body(req,5000)));}catch(e){const safe=/^(Sign in|Your sign-in|Logo |This request|A logo|Daily logo|Invalid |Enter your|Reference logo|Unknown logo)/.test(e.message)?e.message:'Logo service is unavailable. Please try again.';return json(res,/sign.in/i.test(safe)?401:400,{error:safe});}}

   if(req.headers.origin && !allowedOrigins.has(req.headers.origin))return json(res,403,{error:'Origin rejected.'});
   if(req.headers['content-type']?.split(';')[0]!=='application/json')return json(res,415,{error:'JSON required.'});
   const data=await body(req,path==='/api/chat'?100000:16000);
   if(path==='/api/chat'||path==='/api/agent/request'&&data.service==='plan'){const denied=await checkInferenceAccess(req);if(denied)return json(res,denied.status,{error:denied.error});}
   if(path==='/api/dex/logo-download'){const image=await downloadDexLogo(data);res.writeHead(200,{'content-type':image.type,'content-disposition':'attachment; filename="'+image.filename+'"','cache-control':'no-store'});return res.end(image.bytes);}
   if(path==='/api/tools/run'){if(Object.keys(data).some(k=>!['name','args','walletAccount'].includes(k)))throw Error('Unknown tool request field.');walletReadStarts=walletReadStarts.filter(t=>Date.now()-t<60000);if(walletReadStarts.length>=40)return json(res,429,{error:'Tool checks are busy.'});walletReadStarts.push(Date.now());return json(res,200,await executeProductTool(data.name,data.args,{walletAccount:data.walletAccount,env:process.env}));}
   if(path==='/api/pons/brief')return json(res,200,ponsBrief(data));
   if(['/api/pons/purchase-usd','/api/pons/approval','/api/pons/approval-receipt','/api/pons/pair','/api/pons/review','/api/pons/simulate','/api/pons/receipt','/api/pons/readiness','/api/robinhood/balance'].includes(path)){
    walletReadStarts=walletReadStarts.filter(t=>Date.now()-t<60000);
    if(walletReadStarts.length>=40)return json(res,429,{error:'Please wait a minute before checking again.'});
    walletReadStarts.push(Date.now());
    try{return json(res,200,await ({'/api/pons/purchase-usd':purchaseUsdReference,'/api/pons/approval':ponsPurchaseApproval,'/api/pons/approval-receipt':ponsApprovalReceipt,'/api/pons/pair':ponsPair,'/api/pons/review':ponsReview,'/api/pons/simulate':ponsSimulate,'/api/pons/receipt':ponsReceipt,'/api/pons/readiness':ponsReadiness,'/api/robinhood/balance':robinhoodBalance}[path])(data));}catch(e){return json(res,400,{error:e.name==='Error'&&!/https?:|api.key/i.test(e.message)?e.message:'Robinhood network reads or simulation could not complete. Retry the check; no transaction was sent.'});}
   }
   if(['/api/ascend/fees/prepare','/api/ascend/fees/receipt','/api/ascend/fees','/api/funding/source/balance','/api/funding/source/prepare','/api/funding/source/receipt','/api/wallet/prices','/api/funding/balance','/api/wallet/native','/api/funding/relay/quote','/api/funding/relay/status','/api/funding/prepare','/api/funding/receipt','/api/funding/route','/api/wallet/balances','/api/wallet/transfer/prepare','/api/wallet/transfer/receipt','/api/swap/quote','/api/swap/receipt','/api/market/detect','/api/market/quote','/api/wallet/route-check','/api/delivery/status','/api/market/prepare','/api/market/receipt','/api/market/tokens'].includes(path)){
    walletReadStarts=walletReadStarts.filter(t=>Date.now()-t<60000);
    if(walletReadStarts.length>=40)return json(res,429,{error:'Wallet checks are busy. Please try again in a minute.'});
    walletReadStarts.push(Date.now());
    try{const action=path==='/api/ascend/fees/prepare'?prepareCreatorFee:path==='/api/ascend/fees/receipt'?creatorFeeReceipt:path==='/api/ascend/fees'?inspectCreatorFees:path==='/api/funding/source/balance'?bridgeBalance:path==='/api/funding/source/prepare'?prepareBridge:path==='/api/funding/source/receipt'?bridgeSourceReceipt:path==='/api/wallet/prices'?walletPrices:path==='/api/funding/balance'?fundingBalance:path==='/api/wallet/native'?walletNativeBalance:path==='/api/funding/relay/quote'?relayQuote:path==='/api/funding/relay/status'?relayStatus:path==='/api/funding/prepare'?prepareDeposit:path==='/api/funding/receipt'?depositReceipt:path==='/api/funding/route'?fundingRoute:path==='/api/market/tokens'?marketTokens:path==='/api/market/prepare'?prepareMarketTrade:path==='/api/market/receipt'?marketTradeReceipt:path==='/api/wallet/route-check'?walletRouteCheck:path==='/api/delivery/status'?trackMontraDelivery:path==='/api/market/detect'?detectMarket:path==='/api/market/quote'?marketQuote:path==='/api/swap/quote'?quoteSwap:path==='/api/swap/receipt'?swapReceipt:path.endsWith('/balances')?walletBalances:path.endsWith('/prepare')?prepareTransfer:transferReceipt;return json(res,200,await action(data));}
    catch(error){const message=error.name==='Error'&&!/https?:|api.key|rpc/i.test(error.message)?error.message:'Wallet reads could not complete. Please try again.';return json(res,400,{error:message});}
   }
   if(path==='/api/chat'){

    validateChat(data);
    const controller=new AbortController();
    const cancel=()=>controller.abort();res.on('close',cancel);
    res.writeHead(200,{'content-type':'application/x-ndjson; charset=utf-8','cache-control':'no-store','x-accel-buffering':'no'});res.flushHeaders();
    try{for await(const event of streamChat(data,{productMode:true,signal:controller.signal,onboardingOnly,launchEnabled,transfersEnabled:nativeTransfersEnabled(),swapsEnabled:montraSwapsEnabled()})){if(res.destroyed)break;res.write(JSON.stringify(event)+'\n');}}
    catch(error){if(!res.destroyed)res.write(JSON.stringify({type:'error',message:error.name==='TimeoutError'?'Dinn took too long to respond. Please try again.':error.message})+'\n');}
    finally{res.off('close',cancel);controller.abort();res.end();}
    return;
   }
   if(path==='/api/agent/request'){
    if(data.service==='plan')return json(res,200,await buildPlan(data.input?.message));
    if(data.service==='pons.brief')return json(res,200,ponsBrief(data.input));
    return json(res,410,{error:'This service is unavailable. Use plan or pons.brief.'});
   }
   if(path==='/api/plan'){
    return json(res,200,await buildPlan(data.message));
   }
   if(path==='/api/launch/preflight')return json(res,200,await launchPreflight(data));
   if(path==='/api/launch/receipt')return json(res,200,await readLaunchReceipt(data,launchRpcUrl));
   if(path==='/api/launch/validate')return json(res,200,{configuration:validateLaunch(data),broadcast:false});
   if(path==='/api/launch/simulate')return json(res,200,await simulateLaunch(data,launchRpcUrl));
   return json(res,404,{error:'Unknown action. Broadcasting is not enabled.'});
  }
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed.'});
  if(/^\/auth\/(entry|chunk-[A-Z0-9]+)\.js$/.test(path)){
   try{const content=await readFile(resolve(publicDir,'.'+path));res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});return res.end(content);}catch{return json(res,404,{error:'Authentication bundle is not built. Run npm run build.'});}
  }
  if(path==='/execution/entry.js'){
   try{const content=await readFile(resolve(publicDir,'execution/entry.js'));res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});return res.end(content);}catch{return json(res,404,{error:'Build the execution module with npm run build.'});}
  }
  const files={'/draft-sync.js':'draft-sync.js','/draft-data.js':'draft-data.js','/purchase-usd.js':'purchase-usd.js','/launch-link-chat.js':'launch-link-chat.js','/logo-creator.js':'logo-creator.js','/launch-metadata.js':'launch-metadata.js','/launch-activity.js':'launch-activity.js','/holder-report.js':'holder-report.js','/token-report.js':'token-report.js','/chat-state.js':'chat-state.js','/chat-format.js':'chat-format.js','/dex-profile.js':'dex-profile.js','/dex-service.js':'dex-service.js','/pons-assets.js':'pons-assets.js','/creator-fees.js':'creator-fees.js','/relay-funding.js':'relay-funding.js','/asset-icon.js':'asset-icon.js','/funding.js':'funding.js','/brand/hype.svg':'brand/hype.svg','/market-execution.js':'market-execution.js','/market.js':'market.js','/swap.js':'swap.js','/portfolio.js':'portfolio.js','/profile.js':'profile.js','/inspection.js':'inspection.js','/pons/entry.js':'pons/entry.js','/pons-flow.js':'pons-flow.js','/chat.js':'chat.js','/terms':'terms.html','/privacy':'privacy.html','/brand/0g.svg':'brand/0g.svg','/brand/dinn-mark-dark.svg':'brand/dinn-mark-dark.svg','/brand/dinn-mark-light.svg':'brand/dinn-mark-light.svg','/brand/dinn-icon.svg':'brand/dinn-icon.svg','/brand/google.svg':'brand/google.svg','/brand/x.svg':'brand/x.svg','/':'index.html','/app.js':'workspace.js','/workspace.css':'workspace.css','/flow.js':'flow.js','/wallet.js':'wallet.js','/launches.js':'launches.js','/style.css':'style.css','/favicon.svg':'favicon.svg','/agent-guide.md':'agent-guide.md','/llms.txt':'llms.txt'};
  if(!files[path])return json(res,404,{error:'Not found.'});
  const file=files[path],types={'.svg':'image/svg+xml','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.md':'text/markdown; charset=utf-8','.txt':'text/plain; charset=utf-8'};
  res.writeHead(200,{'content-type':types[extname(file)],'cache-control':'no-store'});res.end(await readFile(resolve(publicDir,file)));
 }catch(e){json(res,400,{error:e.shortMessage||e.message||'Request failed.'});}
});
server.listen(port,host,()=>console.log(`Dinn preview: http://${host}:${port}`));


