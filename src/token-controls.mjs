import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {parseAbi,zeroAddress} from 'viem';
import {PONS_FACTORY} from './pons.mjs';
const profile=JSON.parse(readFileSync(new URL('./pons-token-profile.json',import.meta.url)));
export const verifiedArtifact=Symbol('verified source artifact');
const hash=s=>createHash('sha256').update(s).digest('hex');
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
export function matchesPonsTokenSource(record){
 try{if(record.name!==profile.name||record.file_path!==profile.file||record.compiler_version!==profile.compiler||hash(canonical(record.compiler_settings))!==profile.settingsHash||hash(canonical(record.abi))!==profile.abiHash)return false;
 const files=[{file_path:record.file_path,source_code:record.source_code},...(record.additional_sources||[])];
 return Object.entries(profile.sources).every(([path,digest])=>{const found=files.filter(f=>f.file_path===path);return found.length===1&&typeof found[0].source_code==='string'&&hash(found[0].source_code)===digest;});}catch{return false;}
}
export function attachVerifiedArtifact(finding,record){Object.defineProperty(finding,verifiedArtifact,{value:{abi:Array.isArray(record.abi)?record.abi.slice(0,500):[],ponsProfile:matchesPonsTokenSource(record)}});return finding;}
const getterTypes={owner:'address',pendingOwner:'address',admin:'address',minter:'address',paused:'bool',tradingEnabled:'bool',deployer:'address',launchFactory:'address',curve:'address'};
export async function controlResearch(source,{address,client,blockNumber,protocol,proxyDetected=false}={}){
 const artifact=source?.[verifiedArtifact];if(source?.status!=='verified'||!artifact)return {label:'Control functions',status:'unknown',detail:'Runtime-matched source interface unavailable; token control permissions could not be researched.',evidence:[]};
 const methods=artifact.abi.filter(f=>f?.type==='function'&&/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(f.name));
 const writes=methods.filter(f=>!['view','pure'].includes(f.stateMutability));const flagged=writes.filter(f=>/mint|pause|blacklist|blocklist|whitelist|upgrade|set.*(?:fee|tax)|trading|role|owner|admin|limit|exclude/i.test(f.name));
 const getters=Object.entries(getterTypes).filter(([name,type])=>methods.some(f=>f.name===name&&f.stateMutability==='view'&&f.inputs?.length===0&&f.outputs?.length===1&&f.outputs[0].type===type));
 const values={};await Promise.all(getters.map(async([name,type])=>{try{const v=await client.readContract({address,abi:parseAbi(['function '+name+'() view returns ('+type+')']),functionName:name,blockNumber});if(type==='address'?typeof v==='string'&&/^0x[0-9a-f]{40}$/i.test(v):typeof v==='boolean')values[name]=v;}catch{}}));
 const evidence=['Runtime-matched source ABI',...Object.keys(values).map(k=>k+'() at report block')];
 if(artifact.ponsProfile&&!proxyDetected&&protocol?.name==='Pons v2'&&same(values.launchFactory,PONS_FACTORY)&&same(values.launchFactory,protocol.factory)&&same(values.curve,protocol.curve)&&same(values.deployer,protocol.deployer)){
  return {label:'Control functions',status:'observed',detail:'Matches the reviewed Pons v2 token implementation and all seven source files. Supply is minted only during construction to its curve; no post-launch mint, owner/admin setter, pause, blacklist, token-transfer tax or upgrade entry point exists in this token implementation. burn() reduces the caller\'s balance and total supply; burnFrom() requires allowance. The immutable deployer '+values.deployer+' has no token-control privilege. These findings cover the token, not factory/curve governance, liquidity or sell execution.',evidence:[...evidence,'Pinned PonsV2LauncherToken + ERC20/Burnable dependency hashes'],profile:'pons-v2-fixed-supply',summary:'No token admin controls; holder-authorized burns',roles:values};
 }
 const reads=Object.entries(values).map(([k,v])=>k+'() = '+v+(v===zeroAddress?' (zero address; other roles may exist)':''));
 const detail=(flagged.length?'Control-related methods exposed: '+flagged.slice(0,16).map(f=>f.name).join(', ')+'. Names alone do not establish caller permissions or effects. ':'No recognized control-method names in the verified ABI; this does not rule out hidden, custom or delegated controls. ')+(reads.length?'Current reads: '+reads.join('; ')+'. ':'No supported role/state getters returned a usable value. ')+(artifact.ponsProfile?'Reviewed source profile matched, but proxy or live factory/curve/deployer binding was not established. ':'This implementation has not matched the reviewed Pons source profile. ')+(proxyDetected?'Proxy implementation and its permissions need separate verification. ':'')+'No safety verdict or permissions audit is implied.';
 return {label:'Control functions',status:flagged.length?'attention':'unknown',detail,evidence,roles:values};
}
