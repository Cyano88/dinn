import {createHash,randomUUID} from 'node:crypto';
import {ponsTokenState,tokenStateMessage} from './pons-token-state.mjs';
import {ponsReadiness} from './pons.mjs';
import {robinhoodBalances} from './robinhood-wallet.mjs';
import {robinhoodRouteQuote} from './robinhood-routes.mjs';
import {address,same} from './robinhood-wallet-call.mjs';
const account={type:'string',pattern:'^0x[0-9a-fA-F]{40}$'};
export const agentServices={
 'token.research':{description:'Live supported Pons v2 token phase, bonding metrics, reference market data and explicitly scoped fees. No security verdict or lifetime earnings.',required:['address'],properties:{address:account,account}},
 'wallet.balances':{description:'Public onchain balances, with unavailable data preserved. This does not authenticate wallet ownership.',required:['account','chainId'],properties:{account,chainId:{type:'integer',enum:[4663,8453,42161]}}},
 'launch.options':{description:'Current enabled Pons configurations and optional account launch permission.',required:[],properties:{account}},
 'swap.quote':{description:'Read-only same-chain route quote; no deposit or signing. Base/Arbitrum support ETH, USDC and USDT only.',required:['account','chainId','asset','outputAsset','amount'],properties:{account,chainId:{type:'integer',enum:[4663,8453,42161]},asset:account,outputAsset:account,amount:{type:'string',pattern:'^[0-9]+(\\.[0-9]+)?$'}}},
 'bridge.quote':{description:'Read-only Base/Arbitrum to Robinhood route quote; no deposit or signing.',required:['account','chainId','asset','outputAsset','amount'],properties:{account,chainId:{type:'integer',enum:[8453,42161]},asset:account,outputAsset:account,amount:{type:'string',pattern:'^[0-9]+(\\.[0-9]+)?$'}}}
};
export function agentAccessManifest(){return {name:'Dinn',version:'3',services:['plan','pons.brief',...Object.keys(agentServices)],discovery:{instructions:'/agent-guide.md',schema:'/api/agent/schema',tools:'/api/tools'},transport:{type:'http-json',endpoint:'/api/agent/request'},broadcastEnabled:false,canSign:false,acceptsPrivateKeys:false,payment:{mode:'free-public-preview',charged:false},marketplace:{provider:'NEAR Agent Market',status:'not-listed',agentId:null},notes:['Public account input is a query target, not proof of ownership.','Research is a dated chain snapshot, not a security audit.','Marketplace payment never grants wallet authority.']};}
export function agentAccessSchema(){return {type:'object',required:['service','input'],additionalProperties:false,properties:{service:{enum:['plan','pons.brief',...Object.keys(agentServices)]},input:{type:'object'},requestId:{type:'string',pattern:'^[A-Za-z0-9._-]{1,100}$'}},serviceInputs:Object.fromEntries(Object.entries(agentServices).map(([k,v])=>[k,{type:'object',additionalProperties:false,...v}]))};}
function validate(request){
 if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(k=>!['service','input','requestId'].includes(k)))throw Error('Expected service, input and optional requestId only.');
 if(request.requestId!==undefined&&(typeof request.requestId!=='string'||!/^[A-Za-z0-9._-]{1,100}$/.test(request.requestId)))throw Error('Invalid requestId.');
 const spec=agentServices[request.service];if(!spec)throw Error('Unsupported agent service.');const i=request.input;
 if(!i||typeof i!=='object'||Array.isArray(i)||Object.keys(i).some(k=>!Object.hasOwn(spec.properties,k)))throw Error('Unsupported input field. Never send keys, wallet permissions or execution flags.');
 const missing=spec.required.filter(k=>i[k]===undefined||i[k]==='');if(missing.length)return missing;
 for(const [k,v]of Object.entries(i)){const s=spec.properties[k];if(s.type==='integer'?!Number.isSafeInteger(v):typeof v!=='string')throw Error('Invalid '+k+'.');if(s.enum&&!s.enum.includes(v)||s.pattern&&!new RegExp(s.pattern).test(v))throw Error('Invalid '+k+'.');if(['address','account'].includes(k)&&!address(v))throw Error('Use a nonzero '+k+'.');}
 return [];
}
const safeText=v=>String(v).replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/[\\`*_{}\[\]<>#|]/g,'\\$&');
export async function agentAccessRequest(request,dependencies={}){
 const missing=validate(request),base={schemaVersion:'3',requestId:request.requestId||randomUUID(),service:request.service,broadcast:false,charged:false,ownershipVerified:false};
 if(missing.length)return {...base,status:'needs_input',missingFields:missing,next:{type:'collect_fields',message:'Supply the missing fields explicitly. No wallet or financial choices were inferred.'}};
 const i=request.input;let result,deliverable;
 if(request.service==='token.research'){
  result=await (dependencies.tokenState||ponsTokenState)(i);
  if(result.chainId!==4663||!same(result.address,i.address)||!/^\d+$/.test(result.blockNumber)||!Number.isFinite(Date.parse(result.checkedAt))||!same(result.viewerAccount,i.account||result.feeRecipient))throw Error('Research evidence does not match the requested token or fee viewer.');
  const feeView=i.account?'Caller-specified query wallet':'Current creator fee recipient; no caller wallet was supplied';
  deliverable=['# Dinn token research','Token: '+i.address,'Network: Robinhood Chain (4663)','Checked block: '+result.blockNumber,'Checked at: '+result.checkedAt,feeView+': '+result.viewerAccount,...tokenStateMessage(result).split('\n\n').map(safeText),'Fee scope: '+safeText(result.claimScope),'Evidence: https://robinhoodchain.blockscout.com/token/'+i.address,'Limitations: This is a dated snapshot, not a security audit, proof of ownership, guaranteed sellability or an investment recommendation. Reference market data may be unavailable. No funds were claimed or moved.'].join('\n\n');
 }else if(request.service==='wallet.balances')result=await (dependencies.balances||robinhoodBalances)(i);
 else if(request.service==='launch.options')result=await (dependencies.options||ponsReadiness)(i);
 else result=await (dependencies.quote||robinhoodRouteQuote)({...i,kind:request.service==='swap.quote'?'swap':'bridge'});
 const evidence={service:request.service,input:i,result,...(deliverable?{deliverableMarkdown:deliverable}:{})};
 const content=JSON.stringify(evidence),sha256=createHash('sha256').update(content).digest('hex');
 return {...base,status:'completed',result,...(deliverable?{deliverableMarkdown:deliverable}:{}),evidence:{format:'application/json',content,sha256,meaning:'Content integrity only; not a signature or proof of payment.'},next:{type:'stop',message:request.service.endsWith('.quote')?'Quote only. No transfer was prepared or sent; obtain a fresh wallet-approved review to execute.':'Read-only result. No wallet authority or marketplace payment was granted.'}};
}
