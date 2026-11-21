const address=/^0x[0-9a-f]{40}$/i;
const symbol=/^[A-Za-z][A-Za-z0-9._-]{0,14}$/;
export function researchTarget(text){
 const match=/^(?:(?:please\s+)?(?:research|inspect|check|look up)\s+(?:(?:this|the)\s+)?(?:token\s+)?|(?:ticker|token|address|symbol):\s*)?\$?(0x[0-9a-f]{40}|[a-z][a-z0-9._-]{0,14})[?!]?$/i.exec(text.trim());
 if(!match)return null;
 const target=match[1];
 if(!address.test(target) && (!symbol.test(target)||/^(yes|no|skip|next|stop|help|why|wallet|swap|send|bridge|launch|research|check|balance|buy|sell|base|robinhood|pons|bankr|approve|cancel|continue|fees|hello|hi|thanks)$/i.test(target)))return null;
 if(text.trim()===target && !address.test(target) && !/[A-Z]/.test(target))return null;
 return target;
}
export function researchQuestion(stage,target){
 if(stage==='chain')return 'Which chain is '+target+' on: Robinhood Chain or Base?';
 if(stage==='kind')return 'On Base, is '+target+' a Coinbase stock token or a Bankr token paired with a stock?';
 return 'What is the '+(stage==='pons-address'?'Pons':'Bankr')+' contract address for '+target+'? Tickers can be shared by different tokens.';
}
export function followResearch(stage,target,answer){
 const t=answer.trim().replace(/[.!?]+$/,'');
 const isAddress=address.test(target);
 if(stage==='chain'){
  if(/^(?:on )?(?:robinhood(?: chain)?|pons|4663)$/i.test(t))return isAddress?{service:'token.research',address:target}:{stage:'pons-address'};
  if(/^(?:on )?(?:base(?: chain)?|8453)$/i.test(t))return {stage:'kind'};
  if(/^(?:on )?(?:arbitrum|ethereum|solana|polygon|near|bsc|avalanche)(?: chain| mainnet)?$/i.test(t))return {unsupported:true};
 }
 if(stage==='kind'){
  if(/^(?:coinbase(?: stock)?(?: token)?|(?:tokenized |tokenised )?stock(?: token)?)$/i.test(t))return {service:'base.stock.research',query:target};
  if(/^(?:bankr(?: token)?(?: paired with a stock)?|stock[- ]paired(?: token)?)$/i.test(t))return isAddress?{service:'base.stock-paired.research',address:target}:{stage:'bankr-address'};
 }
 if((stage==='pons-address'||stage==='bankr-address')&&address.test(t))return {service:stage==='pons-address'?'token.research':'base.stock-paired.research',address:t};
 return null;
}
export function chatResearchGuide(text,previous){
 for(const stage of ['chain','kind','pons-address','bankr-address']){
  const pattern=researchQuestion(stage,'TARGET').split('TARGET');
  if(!previous.startsWith(pattern[0])||!previous.endsWith(pattern[1]))continue;
  const target=previous.slice(pattern[0].length,-pattern[1].length);
  if(!address.test(target)&&!symbol.test(target))return null;
  const step=followResearch(stage,target,text);
  if(!step)return null;
  if(step.unsupported)return {message:'Dinn currently researches tokens on Robinhood Chain and Base.'};
  if(step.stage)return {message:researchQuestion(step.stage,target)};
  const {service,...args}=step;
  return {name:{'token.research':'inspect_token','base.stock.research':'research_base_stock','base.stock-paired.research':'research_base_stock_paired_token'}[service],args};
 }
 return null;
}
