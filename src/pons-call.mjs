import {purchaseConfig,purchaseQuote,PONS_BUY_ROUTER} from './pons-purchase.mjs';
import {cleanSocials} from '../public/launch-metadata.js';
﻿import {parseAbi,encodeFunctionData,isAddress,zeroAddress,toHex} from 'viem';
export const PONS_FACTORY='0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e';
export const launchAbi=parseAbi([
 'struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }',
 'struct TokenParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }',
 'function launchToken(TokenParams params,uint256 launchConfigId,address pairToken) payable returns(address token,address curve)',
 'function launchAndBuy(TokenParams params,uint256 launchConfigId,address pairToken,uint256 quoteIn,uint256 minTokensOut,address recipient,address[] snipeTaxExemptions) payable returns(address token,address curve,uint256 tokensOut)',
 'function previewLaunchEconomics(uint256 launchConfigId,address pairToken) view returns(bytes32)',
 'event TokenLaunched(address indexed token,address indexed curve,address indexed deployer,address pairToken,uint256 launchConfigId,uint256 graduationThreshold)'
]);
export const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
export const hashValid=v=>typeof v==='string'&&/^0x[a-f0-9]{64}$/i.test(v);
export function launchConfig(v){
 const keys=['name','symbol','description','logo','account','creatorFeeRecipient','creatorTaxBps','buybackEnabled','configId','salt','launchpad','chainId','pairToken','socials','purchase'];
 if(!v||Object.keys(v).some(k=>!keys.includes(k))||v.launchpad!=='pons'||v.chainId!==4663)throw Error('Invalid Pons launch settings.');
 for(const f of ['name','symbol','description','logo'])if(typeof v[f]!=='string')throw Error('Missing '+f+'.');
 if(!v.name.trim()||v.name.length>40||/[\x00-\x1f\x7f]/.test(v.name)||!/^[a-z0-9]{1,12}$/i.test(v.symbol)||v.description.length>500)throw Error('Check the token name, ticker and description.');
 if(v.logo){let u;try{u=new URL(v.logo);}catch{throw Error('Use a public HTTPS or IPFS logo URL.');}if(!['https:','ipfs:'].includes(u.protocol)||u.username||u.password||v.logo.length>500)throw Error('Use a public HTTPS or IPFS logo URL.');}
 for(const f of ['account','creatorFeeRecipient'])if(!isAddress(v[f]||'',{strict:false})||same(v[f],zeroAddress))throw Error('Use a nonzero '+f+' address.');
 if(!Number.isSafeInteger(v.configId)||v.configId<0||!Number.isInteger(v.creatorTaxBps)||v.creatorTaxBps<0||v.creatorTaxBps>10000||typeof v.buybackEnabled!=='boolean'||!hashValid(v.salt))throw Error('Choose a config, creator tax and buyback setting.');
 if(v.pairToken!==undefined&&!isAddress(v.pairToken,{strict:false}))throw Error('Use ETH or a valid Robinhood pairing-token address.');
 purchaseConfig(v.purchase);
 return {...v,pairToken:v.pairToken||zeroAddress,socials:cleanSocials(v.socials)};
}
export function launchArgs(configuration,quote){const c=launchConfig(configuration);if(!hashValid(quote.expectedEconomics))throw Error('Missing pinned economics.');return [{name:c.name,symbol:c.symbol,description:c.description,logo:c.logo,socials:c.socials,creatorFeeRecipient:c.creatorFeeRecipient,creatorTaxBps:c.creatorTaxBps,buybackEnabled:c.buybackEnabled,expectedEconomics:quote.expectedEconomics,salt:c.salt},BigInt(c.configId),c.pairToken];}
export function launchCall(c,q){
 const args=launchArgs(c,q),purchase=purchaseQuote(c,q);
 return purchase?{address:PONS_BUY_ROUTER,functionName:'launchAndBuy',args:[...args,BigInt(purchase.amountWei),BigInt(purchase.minTokensOutWei),c.account,[]],value:BigInt(q.launchFeeWei)+(same(c.pairToken||zeroAddress,zeroAddress)?BigInt(purchase.amountWei):0n)}:{address:PONS_FACTORY,functionName:'launchToken',args,value:BigInt(q.launchFeeWei)};
}
export function launchTransaction(c,q){if(!/^\d+$/.test(q.launchFeeWei))throw Error('Invalid launch fee.');const call=launchCall(c,q);return {from:c.account,to:call.address,chainId:'0x1237',data:encodeFunctionData({abi:launchAbi,functionName:call.functionName,args:call.args}),value:toHex(call.value)};}
export function assertPrepared(p,c,now=Date.now()){
 if(p?.chainId!==4663||p.simulated!==true||!Number.isFinite(p.expiresAt)||p.expiresAt<now||p.expiresAt>now+120000)throw Error('Simulation expired. Review and simulate again.');
 const tx=launchTransaction(c,p.quote);for(const k of Object.keys(tx))if(!same(tx[k],p.transaction?.[k]))throw Error('Prepared transaction differs from reviewed settings.');
 return tx;
}
