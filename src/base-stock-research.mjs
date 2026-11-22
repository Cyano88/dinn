import {baseLockEvidence,chatLockEvidence} from './base-lock-evidence.mjs';
import {decodeFunctionResult,encodeFunctionData,formatUnits,parseAbi} from 'viem';
import {baseStockLookup} from './base-stock-data.mjs';
import {baseHolderSnapshot} from './base-stock-paired-research.mjs';
import {serverRpcUrl} from './rpc-config.mjs';

const ADDRESS=/^0x[0-9a-f]{40}$/i;
const STOCK_ABI=parseAbi([
 'function name() view returns (string)',
 'function symbol() view returns (string)',
 'function decimals() view returns (uint8)',
 'function totalSupply() view returns (uint256)',
 'function multiplier() view returns (uint256)',
 'function pausedFeatures() view returns (uint8[])',
 'function TRANSFER_SENDER_POLICY() view returns (bytes32)',
 'function TRANSFER_RECEIVER_POLICY() view returns (bytes32)',
 'function TRANSFER_EXECUTOR_POLICY() view returns (bytes32)',
 'function MINT_RECEIVER_POLICY() view returns (bytes32)',
 'function policyId(bytes32 policyScope) view returns (uint64)'
]);
const POLICY_SCOPES=['TRANSFER_SENDER_POLICY','TRANSFER_RECEIVER_POLICY','TRANSFER_EXECUTOR_POLICY','MINT_RECEIVER_POLICY'];
const PAUSABLE=['TRANSFER','MINT','BURN','SEIZE'];
const COINBASE_URL='https://api.coinbase.com/v1/tokenized-stocks';
const DEX_URL='https://api.dexscreener.com/token-pairs/v1/base/';

const finite=value=>value===null||value===undefined||typeof value==='boolean'||typeof value==='string'&&!value.trim()?null:Number.isFinite(Number(value))?Number(value):null;
const address=value=>typeof value==='string'&&ADDRESS.test(value);
const cleanText=(value,max=100)=>typeof value==='string'?value.slice(0,max):null;
function ageDays(timestamp,now){const date=Date.parse(timestamp||'');return Number.isFinite(date)&&date<=now?Math.floor((now-date)/86400000):null;}
function fromUnits(raw,decimals){try{return formatUnits(raw,decimals);}catch{return null;}}

async function json(url,fetchImpl,signal){
 const response=await fetchImpl(url,{headers:{accept:'application/json'},signal});
 if(!response.ok)throw new Error('A Base stock research source is temporarily unavailable.');
 return response.json();
}
async function rpc(fetchImpl,rpcUrl,method,params,signal){
 const response=await fetchImpl(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal});
 if(!response.ok)throw new Error('Base chain data is temporarily unavailable.');
 const payload=await response.json();
 if(payload?.error||payload?.result===undefined)throw new Error('Base chain data is temporarily unavailable.');
 return payload.result;
}
async function call(fetchImpl,rpcUrl,token,blockTag,functionName,args,signal){
 const data=encodeFunctionData({abi:STOCK_ABI,functionName,args});
 const result=await rpc(fetchImpl,rpcUrl,'eth_call',[{to:token,data},blockTag],signal);
 return decodeFunctionResult({abi:STOCK_ABI,functionName,data:result});
}
export async function b20Snapshot(token,stock,{fetchImpl,env,signal}){
 const rpcUrl=serverRpcUrl(8453,env),chainId=await rpc(fetchImpl,rpcUrl,'eth_chainId',[],signal);
 if(String(chainId).toLowerCase()!=='0x2105')throw new Error('Configured Base RPC returned the wrong network.');
 const head=await rpc(fetchImpl,rpcUrl,'eth_getBlockByNumber',['latest',false],signal);
 if(!head||!/^0x[0-9a-f]+$/i.test(head.number||'')||!/^0x[0-9a-f]{64}$/i.test(head.hash||''))throw new Error('Base block snapshot could not be verified.');
 const blockNumber=BigInt(head.number),blockTag='0x'+blockNumber.toString(16),timestamp=Number.parseInt(head.timestamp,16);
 if(!Number.isSafeInteger(timestamp)||timestamp<=0)throw new Error('Base block timestamp could not be verified.');
 const [name,symbol,decimals,totalSupply,multiplier,pausedValues,...scopeValues]=await Promise.all([
  call(fetchImpl,rpcUrl,token,blockTag,'name',[],signal),
  call(fetchImpl,rpcUrl,token,blockTag,'symbol',[],signal),
  call(fetchImpl,rpcUrl,token,blockTag,'decimals',[],signal),
  call(fetchImpl,rpcUrl,token,blockTag,'totalSupply',[],signal),
  call(fetchImpl,rpcUrl,token,blockTag,'multiplier',[],signal),
  call(fetchImpl,rpcUrl,token,blockTag,'pausedFeatures',[],signal),
  ...POLICY_SCOPES.map(scope=>call(fetchImpl,rpcUrl,token,blockTag,scope,[],signal))
 ]);
 if(typeof name!=='string'||typeof symbol!=='string'||typeof decimals!=='number'||decimals<0||decimals>36||typeof totalSupply!=='bigint'||typeof multiplier!=='bigint'||!Array.isArray(pausedValues))throw new Error('Base stock B20 reads returned an unexpected response.');
 const policies=await Promise.all(scopeValues.map(async(scope,index)=>{
  try{return {scope:POLICY_SCOPES[index],id:String(await call(fetchImpl,rpcUrl,token,blockTag,'policyId',[scope],signal))};}
  catch{return {scope:POLICY_SCOPES[index],id:null};}
 }));
 const paused=[...new Set(pausedValues.map(Number))].filter(value=>Number.isInteger(value)&&value>=0&&value<PAUSABLE.length).map(value=>PAUSABLE[value]);
 const registryMatches=name===stock.name&&symbol===stock.symbol&&decimals===stock.decimals;
 return {blockNumber:blockNumber.toString(),blockHash:head.hash.toLowerCase(),blockTimestamp:new Date(timestamp*1000).toISOString(),address:token,name,symbol,decimals,totalSupply:fromUnits(totalSupply,decimals),rawTotalSupply:totalSupply.toString(),multiplier:multiplier.toString(),pausedFeatures:paused,transferPolicies:policies,identityStatus:registryMatches?'matched':'mismatch',registryComparison:{name:name===stock.name,symbol:symbol===stock.symbol,decimals:decimals===stock.decimals},source:'Base B20 token read at one pinned block'};
}
function marketPair(row,token){
 if(!row||String(row.chainId).toLowerCase()!=='base'||!address(row.pairAddress))return null;
 const base=row.baseToken,quote=row.quoteToken;
 if(!address(base?.address)||!address(quote?.address)||![base.address,quote.address].some(value=>value.toLowerCase()===token))return null;
 const pairAddress=row.pairAddress.toLowerCase(),tokenIsBase=base.address.toLowerCase()===token;
 return {pairAddress,dex:cleanText(row.dexId,50),url:typeof row.url==='string'&&row.url.startsWith('https://')?row.url:'https://dexscreener.com/base/'+pairAddress,baseToken:{address:base.address.toLowerCase(),name:cleanText(base.name),symbol:cleanText(base.symbol,32)},quoteToken:{address:quote.address.toLowerCase(),name:cleanText(quote.name),symbol:cleanText(quote.symbol,32)},tokenIsBase,tokenPriceUsd:tokenIsBase?finite(row.priceUsd):null,pairPriceNative:tokenIsBase?finite(row.priceNative):null,liquidityUsd:finite(row.liquidity?.usd),volume24hUsd:finite(row.volume?.h24),transactions24h:row.txns?.h24&&Number.isFinite(finite(row.txns.h24.buys))&&Number.isFinite(finite(row.txns.h24.sells))?{buys:finite(row.txns.h24.buys),sells:finite(row.txns.h24.sells)}:null,fdvUsd:finite(row.fdv),marketCapUsd:finite(row.marketCap),pairCreatedAt:Number.isFinite(Number(row.pairCreatedAt))?new Date(Number(row.pairCreatedAt)).toISOString():null};
}
async function marketSnapshot(token,{fetchImpl,signal}){
 try{
  const rows=await json(DEX_URL+token,fetchImpl,signal);
  const pairs=Array.isArray(rows)?rows.map(row=>marketPair(row,token)).filter(Boolean).sort((a,b)=>(b.liquidityUsd||0)-(a.liquidityUsd||0)).slice(0,5):[];
  return {source:'DEX Screener',status:pairs.length?'available':'no-matching-pairs',checkedAt:new Date().toISOString(),pairs};
 }catch{return {source:'DEX Screener',status:'unavailable',checkedAt:new Date().toISOString(),pairs:[]};}
}
function holderCoverage(holders,enabled,env){
 if(holders)return holders.coverage;
 if(!enabled)return 'Not requested for this free preview.';
 return env.GOLDRUSH_API_KEY?'The GoldRush holder provider returned no snapshot.':env.BLOCKSCOUT_API_KEY?'The Blockscout holder provider returned no snapshot.':'No Base holder-data source is configured.';
}
export async function researchBaseStock(input,{fetchImpl=fetch,env=process.env,holderSnapshotEnabled=true,baseStockLookupImpl=baseStockLookup,b20SnapshotImpl=b20Snapshot,marketSnapshotImpl=marketSnapshot,holderSnapshotImpl=baseHolderSnapshot}={}){
 const query=typeof input?.query==='string'?input.query.trim():'';
 const addressValue=typeof input?.address==='string'?input.address.trim().toLowerCase():'';
 if(Boolean(query)===Boolean(addressValue))throw new Error('Provide one Coinbase stock ticker, name or Base token address.');
 if(addressValue&&!address(addressValue))throw new Error('Enter a valid Base token address.');
 const queryAddress=address(query)?query.toLowerCase():'';
 if(query&&!queryAddress&&(query.length>40||/[^a-z0-9 ._-]/i.test(query)))throw new Error('Enter a stock ticker or name.');
 const requestedAddress=addressValue||queryAddress;
 const lookup=await baseStockLookupImpl(requestedAddress?{address:requestedAddress}:{query},{fetchImpl,signal:AbortSignal.timeout(12000)});
 if(!Array.isArray(lookup?.stocks)||!lookup.stocks.length)throw new Error('That ticker or address was not found in Coinbase’s current Base tokenized-stock registry.');
 let stock=lookup.stocks.find(row=>requestedAddress?row.address===requestedAddress:row.symbol.toLowerCase()===query.toLowerCase());
 if(!stock&&lookup.stocks.length===1)stock=lookup.stocks[0];
 if(!stock)throw new Error('Several Coinbase stock tokens match. Use the exact ticker shown in the registry.');
 const token=stock.address.toLowerCase(),signal=AbortSignal.timeout(30000),now=Date.now();
 const [contractResult,marketResult,holderResult]=await Promise.allSettled([
  b20SnapshotImpl(token,stock,{fetchImpl,env,signal}),
  marketSnapshotImpl(token,{fetchImpl,signal}),
  holderSnapshotEnabled?holderSnapshotImpl(token,fetchImpl,signal,serverRpcUrl(8453,env),env):Promise.resolve(null)
 ]);
 if(contractResult.status==='rejected')throw new Error('The Base token identity could not be checked onchain. Try again shortly.');
 const contract=contractResult.value,identityVerified=contract.identityStatus==='matched';
 const market=marketResult.status==='fulfilled'?marketResult.value:{source:'DEX Screener',status:'unavailable',checkedAt:new Date().toISOString(),pairs:[]};
 const holderSnapshot=holderResult.status==='fulfilled'?holderResult.value:null;
 const holders=holderSnapshot?{...holderSnapshot,
  sourceUrl:holderSnapshot.url||(holderSnapshot.source==='GoldRush Token Holders API'?'https://goldrush.dev/products/foundational-api/token-holders/':null),
  holderActivity:(holderSnapshot.holderActivity||[]).map(row=>{const pair=(market.pairs||[]).find(candidate=>candidate.pairAddress?.toLowerCase()===row.address?.toLowerCase());return pair?{...row,marketPairMatch:{address:pair.pairAddress,dex:pair.dex,url:pair.url}}:row;})
 }:null;
 const tokenLocks=identityVerified?await baseLockEvidence(token,contract.blockNumber,serverRpcUrl(8453,env),fetchImpl,env,holders):null;
 const checkedAt=new Date().toISOString(),bankrSupported=stock.bankrPairSupported===true;
 return {tokenLocks,address:token,chainId:8453,network:'Base',checkedAt,classification:identityVerified?'coinbase-registry-match':'onchain-registry-mismatch',identity:{status:identityVerified?'matched':'mismatch',name:stock.name,symbol:stock.symbol,registryAddress:token,decimals:stock.decimals,isin:stock.isin||null,source:'Coinbase tokenized-stock registry',sourceUrl:COINBASE_URL,checks:contract.registryComparison},stock:{referenceNav:stock.referencePrice,referenceNavUpdatedAt:stock.referencePriceUpdatedAt,multiplier:stock.multiplier,firstMintAt:stock.firstMintAt,ageDaysSinceFirstMint:ageDays(stock.firstMintAt,now),bankrPairSupported:bankrSupported,bankrLiquidityAdvisory:stock.liquidityAdvisory||null},contract,market,holders,tradeHandoff:identityVerified&&bankrSupported&&!contract.pausedFeatures.includes('TRANSFER')?{status:'open-bankr-for-current-quote',url:`https://bankr.bot/trade/${token}`,assetSymbol:stock.symbol,chain:'Base',checkedAt,execution:'Open the exact Base stock token in Bankr. Bankr determines route availability, checks location eligibility and provides the executable quote. Dinn did not select a side or amount and did not prepare or send a trade.'}:{status:!identityVerified?'identity-mismatch':contract.pausedFeatures.includes('TRANSFER')?'transfers-paused':'not-listed-for-bankr-stock-trading',url:null,checkedAt,execution:!identityVerified?'I could not confirm this token?s identity against the Coinbase stock list.':contract.pausedFeatures.includes('TRANSFER')?'Transfers are paused for this token.':'This stock is not on Bankr?s current Base stock list.'},coverage:{coinbaseRegistry:'Matched by exact Base token address; onchain name, ticker and decimals compared.',onchain:'B20 reads pinned to Base block '+contract.blockNumber+'.',market:market.status==='available'?'Exact token-address pairs from DEX Screener, ranked by reported liquidity.':market.status==='no-matching-pairs'?'DEX Screener returned no matching Base pair.':'DEX Screener data unavailable.',holders:holderCoverage(holders,holderSnapshotEnabled,env),contractControls:'B20 policy IDs and paused features are read when supported; role-holder identities and wallet-specific policy authorization are not checked.',trade:'Bankr list membership is a handoff hint, not proof of a current executable quote, eligibility or route.'},sources:[{label:'Coinbase tokenized-stock registry',url:COINBASE_URL},{label:'Base B20 specification',url:'https://docs.base.org/upgrades/beryl/b20'},{label:'DEX Screener pairs API',url:'https://docs.dexscreener.com/api/reference'},{label:'Bankr tokenized-stock trading and location checks',url:'https://docs.bankr.bot/features/trading/tokenized-stocks/'},...(holders?.source==='GoldRush Token Holders API'?[{label:'GoldRush Token Holders API documentation',url:holders.sourceUrl}]:holders?.url?[{label:'Blockscout holder list',url:holders.url}]:[])]};
}

export function baseStockResearchMessage(report){
 const money=value=>value==null?'not available':'$'+Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const date=value=>{const time=Date.parse(value||'');return Number.isFinite(time)?new Date(time).toISOString().slice(0,16).replace('T',' ')+' UTC':'date unavailable';};
 const amount=value=>{const raw=String(value??'not available'),match=raw.match(/^(-?)(\d+)(?:\.(\d+))?$/);if(!match)return raw;const integer=match[2].replace(/\B(?=(\d{3})+(?!\d))/g,','),fraction=(match[3]||'').replace(/0+$/,'');return match[1]+integer+(fraction?'.'+fraction:'');};
 const short=value=>value.slice(0,6)+'…'+value.slice(-4);
 const market=report.market?.pairs?.[0],lines=['**'+report.identity.name+' ('+report.identity.symbol+') on Base**'];
 lines.push('**Identity**\n\n'+(report.identity.status==='matched'?'The ticker, name, and token-unit settings in Coinbase’s stock list match what Base reports for this token.':'The token details do not fully match Coinbase’s list, so its identity is not confirmed.')+'\n\n[Coinbase stock list]('+report.identity.sourceUrl+') · [View token on BaseScan](https://basescan.org/address/'+report.address+')');
 const reference=report.stock.referenceNav==null?'not available':money(report.stock.referenceNav);
 const created=report.stock.firstMintAt?date(report.stock.firstMintAt)+(Number.isInteger(report.stock.ageDaysSinceFirstMint)?' (about '+report.stock.ageDaysSinceFirstMint+' days ago)':''):'not available';
 const policySet=report.contract.transferPolicies?.some(row=>Number(row.id)!==0);
 lines.push('**Token details**\n\n- Token address: '+report.address+'\n- Supply: '+amount(report.contract.totalSupply)+' '+report.identity.symbol+'\n- First created: '+created+'\n- Coinbase reference value: '+reference+(report.stock.referenceNavUpdatedAt?', updated '+date(report.stock.referenceNavUpdatedAt):'')+'. This is a reference value, not a live trade price.\n- Transfer check: '+(report.contract.pausedFeatures.includes('TRANSFER')?'transfers are paused in the contract.':'the contract does not report transfers as paused.')+' '+(policySet?'Transfer rules are also set; they may limit who can send or receive. We did not check whether a specific wallet can transfer.':'No transfer rules were reported.'));
 if(market)lines.push('**Market activity**\n\n- Market: '+(market.dex||'DEX')+' · '+market.baseToken.symbol+'/'+market.quoteToken.symbol+'\n- Money in the pool: '+money(market.liquidityUsd)+'\n- Traded in the last 24 hours: '+money(market.volume24hUsd)+' ('+(market.transactions24h?market.transactions24h.buys+' buys and '+market.transactions24h.sells+' sells':'trade count not available')+')\n- Token price: '+money(market.tokenPriceUsd)+(market.tokenIsBase?'':' (not reported for this side of the pair)')+'\n- Reported market cap: '+money(market.marketCapUsd)+'\n- Estimated value of all tokens at this price: '+money(market.fdvUsd)+'\n- Data checked: '+date(report.market.checkedAt)+' · [Open this market]('+market.url+')');
 else lines.push('**Market activity**\n\n'+(report.market.status==='no-matching-pairs'?'No matching Base market was found.':'Market data could not be loaded just now.')+' No missing values have been filled in.');
 if(report.holders){
  const holder=report.holders,share=holder.sampleTop10SharePercent,balances=holder.largestBalancesInSample||[];
  const coverage=holder.hasMore?'The provider returned '+(holder.sampleSize||'a partial set')+' of '+(holder.holderCount??'an unknown number of')+' holders, so this is a sample, not a full ranking.':'The provider returned the full holder list.';
  const rows=['- Holders reported: '+(holder.holderCount??'not available'),'- Largest 10 in '+(holder.hasMore?'the returned sample':'the list')+' hold '+(share==null?'an unreported share':Number(share).toFixed(2)+'%')+' of supply','- '+coverage,'- Checked: '+date(holder.checkedAt)+(holder.blockNumber?' · block '+holder.blockNumber:'')];
  for(const [index,row] of (holder.holderActivity||[]).slice(0,3).entries()){
   const balance=balances.find(candidate=>candidate.address.toLowerCase()===row.address.toLowerCase());
   const quantity=balance?amount(balance.balance)+' '+report.identity.symbol+(balance.percentOfSupply==null?'':' ('+amount(balance.percentOfSupply)+'% of supply)'):'balance not available';
   const addressLink='['+short(row.address)+'](https://basescan.org/address/'+row.address+')';
   let detail='Recent buy/sell activity was not checked for this address.';
   if(row.marketPairMatch)detail='This is the '+(row.marketPairMatch.dex||'DEX')+' market contract, not an individual wallet.';
   else if(row.status==='contract')detail='Code is published at this address, so it is not labeled as an individual wallet.';
   else if(row.status==='available')detail=row.buys+' buys and '+row.sells+' sells found among '+row.transactionsChecked+' recent transactions checked.';
   else if(row.status!=='contract'&&row.reason)detail='Recent activity was unavailable: '+row.reason;
   rows.push('- Large holder '+(index+1)+': '+addressLink+' · '+quantity+'. '+detail);
  }
  if(holder.source==='GoldRush Token Holders API')rows.push('- Recent activity only covers transactions returned by the provider. No recent activity does not prove there were no earlier trades.');
  rows.push('- Addresses are not identified as people or labeled as team wallets.');
  const holderSourceUrl=holder.sourceUrl||holder.url;
  const holderSourceLabel=holder.source==='GoldRush Token Holders API'?'GoldRush holder data':holder.url?'Blockscout holder list':'Holder data source';
  lines.push('**Who holds it**\n\n'+rows.join('\n')+(holderSourceUrl?'\n\n['+holderSourceLabel+']('+holderSourceUrl+')':''));
 }else lines.push('**Who holds it**\n\nHolder data is not available: '+report.coverage.holders+'.');
 if(report.tokenLocks)lines.push(chatLockEvidence(report.tokenLocks,report.identity.symbol));
 if(report.tradeHandoff.url)lines.push('**If you want to trade**\n\n[Open '+report.tradeHandoff.assetSymbol+' on Bankr]('+report.tradeHandoff.url+'). Bankr checks your location and shows its current executable quote. You choose whether to buy or sell there. Dinn has not prepared or sent a trade.');
 else lines.push('**If you want to trade**\n\nThis stock is not on Bankr’s current trade list, so Dinn cannot open a trade for it.');
 lines.push('This is evidence from the linked sources, not a contract safety check or a promise that a trade will work.');
 return lines.join('\n\n');
}
