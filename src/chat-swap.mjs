import {assets,networks} from './robinhood-wallet-call.mjs';

const unit='(ETH|USDC|USDT|USDG|WETH)';
const network='(Base|Robinhood(?: Chain)?)';
const swap=new RegExp('^(?:swap|exchange|convert)\\s+(?:(all(?: of)?(?: my)?|my entire|[0-9]+(?:\\.[0-9]+)?)\\s+)?'+unit+'(?:\\s+on\\s+'+network+')?\\s+(?:to|for|into)\\s+'+unit+'(?:\\s+on\\s+'+network+')?[.!?]?$', 'i');
const chain=name=>/^base$/i.test(name)?8453:4663;
function parse(text){
 const m=String(text||'').trim().match(swap);
 if(!m||(!m[3]&&!m[5])||(m[3]&&m[5]&&chain(m[3])!==chain(m[5])))return null;
 const chainId=chain(m[3]||m[5]),asset=m[2].toUpperCase(),outputAsset=m[4].toUpperCase();
 if(asset===outputAsset||![asset,outputAsset].every(s=>assets[chainId].some(a=>a.symbol===s)))return null;
 return {chainId,asset,outputAsset,amount:m[1]&&/^\d/.test(m[1])?m[1]:m[1]?'all':null};
}
export function chatSwap(context){
 const request=parse(context.message);if(request)return request;
 const history=context.history||[],last=history.at(-1);
 if(last?.role!=='assistant'||!(/^(?:To swap this,|Invalid amount\.$)/i.test(last.content))||/^To swap this,\s*review:/i.test(last.content))return null;
 const reply=String(context.message||'').trim().match(/^(\d+(?:\.\d+)?|all)(?:\s+(ETH|USDC|USDT|USDG|WETH))?$/i);
 if(!reply)return null;
 for(let i=history.length-2;i>=0;i-=2){
  if(history[i]?.role!=='user')break;
  const original=parse(history[i].content);
  if(original){
   if(reply[2]&&reply[2].toUpperCase()!==original.asset)return {...original,amount:null};
   return {...original,amount:reply[1].toLowerCase()};
  }
  if(!/^To swap this,(?!\s*review:)/i.test(history[i-1]?.content||''))break;
 }
 return null;
}
export const swapAmountPrompt=s=>'how much '+s.asset+' would you like to swap for '+s.outputAsset+' on '+networks[s.chainId].name+'?';
