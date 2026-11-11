import {attachVerifiedArtifact} from './token-controls.mjs';
import {blockscoutRead} from './blockscout.mjs';
﻿import {parseAbi,formatUnits,zeroAddress} from 'viem';
import {PONS_FACTORY} from './pons.mjs';
const factoryAbi=parseAbi(['struct Launch { address token; address curve; address deployer; address creatorFeeRecipient; address pairToken; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; uint16 creatorTaxBps; bool buybackEnabled; uint8 phase; uint256 sweptQuote; uint256 sweptTokens; uint256 sweptAt; bool exists; }','function getLaunchedToken(address token) view returns (Launch)']);
const curveAbi=parseAbi(['function token() view returns(address)','function factory() view returns(address)','function pairToken() view returns(address)','function feeBps() view returns(uint256)','function creatorTaxBps() view returns(uint256)','function realQuoteReserve() view returns(uint256)','function readyToGraduate() view returns(bool)','function graduated() view returns(bool)']);
const tokenAbi=parseAbi(['function symbol() view returns(string)','function decimals() view returns(uint8)','function balanceOf(address) view returns(uint256)']);
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const explorer=address=>'https://robinhoodchain.blockscout.com/address/'+address;
export async function researchPonsToken(address,{client,blockNumber}){
 const result={checks:[],sources:[]};let launch;
 try{launch=await client.readContract({address:PONS_FACTORY,abi:factoryAbi,functionName:'getLaunchedToken',args:[address],blockNumber});}catch{return result;}
 if(!launch?.exists||!same(launch.token,address)||same(launch.curve,zeroAddress))return result;
 const check=(label,status,detail,evidence)=>result.checks.push({label,status,detail,evidence});
 result.sources=[{label:'Pons factory record',url:explorer(PONS_FACTORY)+'?tab=read_contract'},{label:'Trading curve',url:explorer(launch.curve)+'?tab=read_contract'},{label:'Pons lifecycle documentation',url:'https://docs.ponsfamily.com/v2#reading-state'}];
 result.protocol={name:'Pons v2',factory:PONS_FACTORY,curve:launch.curve,deployer:launch.deployer,pairToken:launch.pairToken,phase:Number(launch.phase)};
 const phase=['Bonding curve','Swept; pool pending','Uniswap v4 pool created','Rescue path used'][Number(launch.phase)]||'Unrecognized phase';
 check('Launch provenance','observed','Registered by Pons v2. Deployer: '+launch.deployer+'. Fee recipient: '+launch.creatorFeeRecipient+'. The deployer is not necessarily the current owner or controller.',['Pons factory getLaunchedToken(token)']);
 check('Trading venue',Number(launch.phase)===3?'attention':'observed',phase+'. Curve: '+launch.curve+'.',['Pons factory getLaunchedToken(token).phase']);
 const read=(functionName)=>client.readContract({address:launch.curve,abi:curveAbi,functionName,blockNumber});let identity;
 try{identity=await Promise.all(['token','factory','pairToken'].map(read));}catch{return result;}
 if(!same(identity[0],address)||!same(identity[1],PONS_FACTORY)||!same(identity[2],launch.pairToken)){check('Curve binding','attention','Curve getters do not match the factory record. No curve trading conclusions accepted.',['token()','factory()','pairToken()']);return result;}
 const safe=async(fn)=>{try{return await fn();}catch{return null;}};
 const [fee,tax,reserve,ready,graduated,symbol,decimals,deployerBalance,curveBalance]=await Promise.all([
 ...['feeBps','creatorTaxBps','realQuoteReserve','readyToGraduate','graduated'].map(n=>safe(()=>read(n))),
 same(launch.pairToken,zeroAddress)?'ETH':safe(()=>client.readContract({address:launch.pairToken,abi:tokenAbi,functionName:'symbol',blockNumber})),
 same(launch.pairToken,zeroAddress)?18:safe(()=>client.readContract({address:launch.pairToken,abi:tokenAbi,functionName:'decimals',blockNumber})),
 ...[launch.deployer,launch.curve].map(holder=>safe(()=>client.readContract({address,abi:tokenAbi,functionName:'balanceOf',args:[holder],blockNumber})))
 ]);
 const pairSymbol=typeof symbol==='string'?symbol.replace(/[\x00-\x1f]/g,'').slice(0,30):launch.pairToken;
 result.protocol.pairSymbol=pairSymbol;
 check('Trading pair','observed',pairSymbol+' ('+launch.pairToken+'). This is the quote asset, not stock ownership conferred by the launch token.',['Factory pairToken','Curve pairToken()','Pair symbol()']);
 if(typeof fee==='bigint'&&typeof tax==='bigint'&&fee+tax<=10000n)check('Trading fees','observed',Number(fee)/100+'% base + '+Number(tax)/100+'% creator = '+Number(fee+tax)/100+'% on the quote leg. Buy-side opening tax, gas and price impact are separate.',['Curve feeBps()','creatorTaxBps()']);
 if(typeof reserve==='bigint'&&Number.isInteger(decimals)&&decimals>=0&&decimals<=255)check('Curve reserves','observed',formatUnits(reserve,decimals)+' '+pairSymbol+' real quote reserve; graduation target '+formatUnits(launch.graduationThreshold,decimals)+' '+pairSymbol+'. Virtual pricing reserves are excluded.',['realQuoteReserve()','Factory graduationThreshold']);
 if(Number(launch.phase)===0&&ready===false&&graduated===false){check('LP lock','observed','Not yet applicable to the Pons v4 pool: this launch is still on its bonding curve. No graduated Pons pool is recorded. This says nothing about unrelated pools.',['Factory phase = 0','Curve graduated() = false']);check('Can I sell?','observed','Curve sell gate is open at this block (not graduated and not ready to graduate). No wallet-specific sell simulation was run; this is not a guaranteed execution or honeypot verdict.',['readyToGraduate() = false','graduated() = false','Factory/curve/token binding']);}
 else if(ready===true||graduated===true||Number(launch.phase)!==0)check('Can I sell?','attention','Do not route a sell to the bonding curve in this state. Current phase: '+phase+'. Pool execution needs a separate route check.',['Factory phase','readyToGraduate()','graduated()']);
 result.protocol.knownBalances={deployer:typeof deployerBalance==='bigint'?String(deployerBalance):null,curve:typeof curveBalance==='bigint'?String(curveBalance):null};
 return result;
}
export async function explorerSource(address,code,{fetchImpl=fetch,signal}={}){
 const sourceUrl=explorer(address)+'?tab=contract';
 try{if(process.env.BLOCKSCOUT_API_KEY){const r=await blockscoutRead('smart-contracts/'+address,{fetchImpl,signal});if((r.is_verified===true||typeof r.verified_at==='string')&&r.deployed_bytecode?.toLowerCase()===code.toLowerCase()&&(!r.address||same(r.address,address)))return attachVerifiedArtifact({label:'Source verification',status:'verified',detail:'Blockscout reports verified source and its deployed bytecode matches the checked runtime. Not a security audit.',evidence:['Authenticated Blockscout source record','eth_getCode at report block'],sourceUrl},r);return {label:'Explorer source lookup',status:'unknown',detail:'No runtime-matched verified source record was returned by Blockscout.',evidence:['Authenticated Blockscout source lookup'],sourceUrl};}const response=await fetchImpl('https://robinhoodchain.blockscout.com/api/v2/smart-contracts/'+address,{redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(7000)]):AbortSignal.timeout(7000)});if(!response.ok)return {label:'Explorer source lookup',status:'unknown',detail:response.status===403?'Blockscout rejected automated source lookup (HTTP 403). Source status there could not be read.':'Blockscout source lookup unavailable (HTTP '+response.status+').',evidence:['Blockscout smart-contract API'],sourceUrl};const text=await response.text();if(text.length>1500000)throw Error();const r=JSON.parse(text);if((r.is_verified===true||typeof r.verified_at==='string')&&r.deployed_bytecode?.toLowerCase()===code.toLowerCase()&&(!r.address||same(r.address,address)))return attachVerifiedArtifact({label:'Source verification',status:'verified',detail:'Blockscout reports verified source and its deployed bytecode matches the checked runtime. This is explorer verification, not a security audit.',evidence:['Blockscout source record','eth_getCode at report block'],sourceUrl},r);return {label:'Explorer source lookup',status:'unknown',detail:'No runtime-matched verified source record was returned by Blockscout.',evidence:['Blockscout smart-contract API'],sourceUrl};}catch{return {label:'Explorer source lookup',status:'unknown',detail:'Blockscout source lookup could not complete.',evidence:[],sourceUrl};}
}
