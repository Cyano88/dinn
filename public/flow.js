export const fields = [
 {key:'name',label:'Token name',question:'What would you like to call your token?',hint:'A name of up to 40 characters. For example, Orbit.'},
 {key:'symbol',label:'Ticker',question:'What is its ticker?',hint:'Use 1–12 letters or numbers. For example, ORBT.'},
 {key:'pair',label:'Trading pair',question:'Which asset should your token trade against?',hint:'Choose the quote asset for your Ascend pool.',choices:['USDC','HYPE','KNTQ']},
 {key:'feePercent',label:'Trading fee',question:'What trading fee would you like?',hint:'Choose 1–10%. This is a percentage of each trade, not an upfront launch fee.',choices:['1%','2%','5%']},
 {key:'account',label:'Deployer wallet',question:'Which wallet will deploy the token?',hint:'Paste your EVM wallet address. No private key or seed phrase.'},
 {key:'recipient',label:'Fee recipient',question:'Where should creator fees go?',hint:'Use the deployer wallet or paste a different EVM address.',choices:['Use deployer wallet']},
 {key:'cto',label:'Community takeovers',question:'Should community takeovers be allowed?',hint:'Choose explicitly. This setting is included in your launch configuration.',choices:['Allow','Do not allow']}
];
export function parseField(key,raw,draft={}){
 const value=String(raw).trim();
 if(key==='name'){if(!value||[...value].length>40||/[\x00-\x1f\x7f]/.test(value))throw Error('Use a name with 1–40 characters and no control characters.');return value;}
 if(key==='symbol'){if(!/^[a-z0-9]{1,12}$/i.test(value))throw Error('Use 1–12 letters or numbers for the ticker.');return value.toUpperCase();}
 if(key==='pair'){if(!['USDC','HYPE','KNTQ'].includes(value.toUpperCase()))throw Error('Choose USDC, HYPE or KNTQ.');return value.toUpperCase();}
 if(key==='feePercent'){const fee=value.replace(/%$/,'');if(!/^\d+(\.\d{1,2})?$/.test(fee)||+fee<1||+fee>10)throw Error('Enter a fee from 1% to 10%, with up to two decimal places.');return fee;}
 if(key==='account'||key==='recipient'){const address=key==='recipient'&&value==='Use deployer wallet'?draft.account:value;if(!/^0x[0-9a-fA-F]{40}$/.test(address||'')||/^0x0{40}$/i.test(address))throw Error('Paste a nonzero EVM address: 0x followed by 40 hexadecimal characters.');return address;}
 if(key==='cto'){if(['allow','yes','true'].includes(value.toLowerCase()))return true;if(['do not allow','no','false'].includes(value.toLowerCase()))return false;throw Error('Choose Allow or Do not allow.');}
 throw Error('Unknown setting.');
}
export function missingField(draft){return fields.find(f=>draft[f.key]===undefined);}
export function restoreDraft(raw){
 try{const saved=JSON.parse(raw);if(saved?.version!==1||!saved.draft||typeof saved.draft!=='object')return {};
 const draft={};for(const field of fields){if(Object.hasOwn(saved.draft,field.key)){try{draft[field.key]=parseField(field.key,saved.draft[field.key],draft);}catch{}}}return draft;
 }catch{return {};}
}
export function displayValue(key,value){if(value===undefined)return 'Not set';if(key==='cto')return value?'Allowed':'Not allowed';if(key==='feePercent')return value+'%';return value;}

export function launchIntent(text){
 const match=String(text).trim().match(/^(?:please\s+)?(?:(?:can|could) you\s+|(?:i (?:want|would like) to|let.s)\s+)?(?:launch|deploy|create)\s+(.+)$/i);
 if(!match)return null;
 const rest=match[1].trim();
 const named=rest.match(/(?:called|named)\s+["“]?([^"”]+?)["”]?(?:\s+(?:ticker|symbol)\b.*)?$/i);
 const plain=rest.match(/^(?:a\s+)?(.+?)\s+token[.!]?$/i);
 let name=named?.[1]||plain?.[1];
 if(name&&/^(?:a|my|the|new|another|a new|my new)$/i.test(name))name=undefined;
 if(name){try{name=parseField('name',name);}catch{name=undefined;}}
 return /\btoken\b/i.test(rest)||name?{name}:null;
}
export function setupReply(key,text,draft={},explicit=false){
 const raw=String(text).trim();
 if(!explicit&&(/^(?:hi|hello|hey|thanks|thank you|good morning|good evening)[!. ]*$/i.test(raw)||/\?|^(?:what|why|how|which|when|where|who|can|could|should|would|explain|tell me|help|i (?:don.t|do not|am not))\b/i.test(raw)))return {kind:'chat'};
 let value=raw;
 if(!explicit){
  const patterns={name:/^(?:call it|name it|name is|token name is)\s+(.+)$/i,symbol:/^(?:ticker|symbol)(?: is)?\s+\$?([a-z0-9]{1,12})$/i,pair:/^(?:use|choose|select|go with|let.s use)\s+(USDC|HYPE|KNTQ)$/i,feePercent:/^(?:use|set(?: it)? to|fee(?: is)?)\s+(\d+(?:\.\d{1,2})?%?)$/i};
  value=raw.match(patterns[key]||/a^/)?.[1]||raw;
 }
 try{return {kind:'value',value:parseField(key,value,draft)};}catch(error){
  if(!explicit&&raw.split(/\s+/).length>=3)return {kind:'chat'};
  return {kind:'invalid',message:error.message};
 }
}

// Explicit edits are handled before the current setup question. Questions never mutate settings.
export function conversationTask(text){
 const raw=String(text).trim();
 if(/^(?:please\s+)?(?:clear|discard|delete|reset)(?:\s+(?:(?:my|the)\s+)?(?:current\s+)?(?:draft|token setup|token details|setup))?[.!]*$/i.test(raw))return {kind:'discard'};
 if(/^(?:please\s+)?(?:clear|new|reset|delete)\s+(?:(?:the|this|my|current)\s+)?(?:chat(?:\s+session)?|conversation)[.!]*$/i.test(raw))return {kind:'new-chat'};
 if(/^(?:what(?:'s| is) (?:still )?missing|what(?:'s| is) next)[?.!]*$/i.test(raw))return {kind:'missing'};
 if(/^(?:please\s+)?(?:add|upload|change|set|replace)(?:\s+(?:a|my|the|token))?\s+(?:logo|image|avatar)[.!]?$/i.test(raw))return {kind:'logo'};
 const match=raw.match(/^(?:please\s+)?(?:(?:can|could) you\s+)?(?:change|set|update|add)\s+(?:(?:my|the|token|project)\s+)?(token name|name|ticker|symbol|trading pair|pair|trading fee|fee|deployer wallet|fee recipient|community takeovers|description|website|x account|x|twitter|telegram|tg)\s+(?:(?:to|is)\s+)?(.+?)\s*$/i);
 if(!match)return /^(?:please\s+)?(?:change|set|update|add)\b/i.test(raw)?{kind:'clarify'}:null;
 if(raw.endsWith('?')&&!/^(?:please\s+)?(?:can|could) you\s+/i.test(raw))return null;
 const keys={'token name':'name',name:'name',ticker:'symbol',symbol:'symbol','trading pair':'pair',pair:'pair','trading fee':'feePercent',fee:'feePercent','deployer wallet':'account','fee recipient':'recipient','community takeovers':'cto',description:'description',website:'website','x account':'twitter',x:'twitter',twitter:'twitter',telegram:'telegram',tg:'telegram'};
 const key=keys[match[1].toLowerCase()];let value=match[2];
 if(/^(?:can|could) you\s+/i.test(raw))value=value.replace(/\?$/,'');
 value=value.replace(/^(?:"([^"\n]+)"|'([^'\n]+)')$/,'$1$2');
 if(key==='symbol')value=value.replace(/^\$/,'');
 if(['twitter','telegram'].includes(key)&&/^@[a-z0-9_]+$/i.test(value))value='https://'+(key==='twitter'?'x.com/':'t.me/')+value.slice(1);
 if(/\s+(?:and|then)\s+(?:change|set|update|add)\b/i.test(value))return {kind:'clarify'};
 return {kind:'edit',key,value,profile:['description','website','twitter','telegram'].includes(key)};
}
