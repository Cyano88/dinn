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
 const holders=holderResult.status==='fulfilled'?holderResult.value:null;
 const checkedAt=new Date().toISOString(),bankrSupported=stock.bankrPairSupported===true;
 return {address:token,chainId:8453,network:'Base',checkedAt,classification:identityVerified?'coinbase-registry-match':'onchain-registry-mismatch',identity:{status:identityVerified?'matched':'mismatch',name:stock.name,symbol:stock.symbol,registryAddress:token,decimals:stock.decimals,isin:stock.isin||null,source:'Coinbase tokenized-stock registry',sourceUrl:COINBASE_URL,checks:contract.registryComparison},stock:{referenceNav:stock.referencePrice,referenceNavUpdatedAt:stock.referencePriceUpdatedAt,multiplier:stock.multiplier,firstMintAt:stock.firstMintAt,ageDaysSinceFirstMint:ageDays(stock.firstMintAt,now),bankrPairSupported:bankrSupported,bankrLiquidityAdvisory:stock.liquidityAdvisory||null},contract,market,holders,tradeHandoff:identityVerified&&bankrSupported?{status:'open-bankr-for-current-quote',url:'https://bankr.bot',assetSymbol:stock.symbol,chain:'Base',checkedAt,execution:'Ask Bankr for a current Base quote for this ticker. Bankr determines availability and checks location eligibility. Dinn did not select a side or amount and did not prepare or send a trade.'}:{status:'not-listed-for-bankr-stock-trading',url:null,checkedAt,execution:'No Bankr handoff is offered because this stock is absent from its current Base stock list.'},coverage:{coinbaseRegistry:'Matched by exact Base token address; onchain name, ticker and decimals compared.',onchain:'B20 reads pinned to Base block '+contract.blockNumber+'.',market:market.status==='available'?'Exact token-address pairs from DEX Screener, ranked by reported liquidity.':market.status==='no-matching-pairs'?'DEX Screener returned no matching Base pair.':'DEX Screener data unavailable.',holders:holderCoverage(holders,holderSnapshotEnabled,env),contractControls:'B20 policy IDs and paused features are read when supported; role-holder identities and wallet-specific policy authorization are not checked.',trade:'Bankr list membership is a handoff hint, not proof of a current executable quote, eligibility or route.'},sources:[{label:'Coinbase tokenized-stock registry',url:COINBASE_URL},{label:'Base B20 specification',url:'https://docs.base.org/upgrades/beryl/b20'},{label:'DEX Screener pairs API',url:'https://docs.dexscreener.com/api/reference'},{label:'Bankr tokenized-stock trading and location checks',url:'https://docs.bankr.bot/features/trading/tokenized-stocks/'},...(holders?.url?[{label:'Blockscout holder list',url:holders.url}]:[])]};
}

export function baseStockResearchMessage(report){
 const money=value=>value===null||value===undefined?'unavailable':'$'+Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const items=[report.market?.pairs?.[0]],market=items[0];
 const lines=[`${report.identity.name} (${report.identity.symbol}) · Base`,report.identity.status==='matched'?'Coinbase registry and onchain token identity match.':'The registry and onchain token fields do not fully match; treat identity as unresolved.',`Registry: [Coinbase tokenized stocks](${report.identity.sourceUrl}) · [BaseScan contract](https://basescan.org/address/${report.address})`,`Contract: ${report.address}`,`Reference NAV: ${report.stock.referenceNav===null?'unavailable':money(report.stock.referenceNav)}${report.stock.referenceNavUpdatedAt?' · updated '+report.stock.referenceNavUpdatedAt:''}. First mint: ${report.stock.firstMintAt||'unavailable'}${Number.isInteger(report.stock.ageDaysSinceFirstMint)?` (${report.stock.ageDaysSinceFirstMint} days ago)`:''}.`,
  `Onchain B20 check · Base block ${report.contract.blockNumber}: ${report.contract.name} (${report.contract.symbol}), ${report.contract.decimals} decimals, supply ${report.contract.totalSupply}; multiplier ${report.contract.multiplier}.`,
  `Transfer state: ${report.contract.pausedFeatures.includes('TRANSFER')?'paused':'not reported paused'}. Policy IDs — sender ${report.contract.transferPolicies.find(row=>row.scope==='TRANSFER_SENDER_POLICY')?.id??'unavailable'}, receiver ${report.contract.transferPolicies.find(row=>row.scope==='TRANSFER_RECEIVER_POLICY')?.id??'unavailable'}, executor ${report.contract.transferPolicies.find(row=>row.scope==='TRANSFER_EXECUTOR_POLICY')?.id??'unavailable'}. A nonzero policy can restrict transfers; wallet eligibility was not checked.`];
 if(market)lines.push(`Market · DEX Screener, checked ${report.market.checkedAt}: ${market.dex||'DEX pair'} ${market.baseToken.symbol}/${market.quoteToken.symbol}; liquidity ${money(market.liquidityUsd)}, 24h volume ${money(market.volume24hUsd)}, buys/sells ${market.transactions24h?`${market.transactions24h.buys}/${market.transactions24h.sells}`:'unavailable'}, token price ${money(market.tokenPriceUsd)}${market.tokenIsBase?'':' (not reported for the quote side)'}. [Open pair](${market.url})`);
 else lines.push(`Market data: ${report.market.status==='no-matching-pairs'?'no matching Base pairs were returned':'temporarily unavailable'}; no market values are inferred.`);
 if(report.holders){const share=report.holders.sampleTop10SharePercent;lines.push(`Holders · ${report.holders.source||'Provider'} snapshot${report.holders.blockNumber?` at block ${report.holders.blockNumber}`:''}: ${report.holders.holderCount??'unavailable'} reported holders; largest 10 in ${report.holders.hasMore?'the returned sample':'the returned list'} hold ${share===null?'an unavailable share':Number(share).toFixed(2)+'%'} of supply. ${report.holders.coverage}`);for(const row of (report.holders.holderActivity||[]).slice(0,3))lines.push(`Largest sampled holder ${row.address}: ${row.status==='available'?`${row.buys} classified buys and ${row.sells} sells in the latest ${row.transactionsChecked} transaction page.`:row.status==='contract'?'Contract address; wallet buy/sell classification not applied.':row.reason||'Recent flow unavailable.'}`);}
 else lines.push(`Holder evidence: unavailable (${report.coverage.holders}).`);
 if(report.holders?.url)lines.push(`[Open holder source](${report.holders.url})`);
 if(report.tradeHandoff.url)lines.push(`Want to trade? [Open Bankr](${report.tradeHandoff.url}) and ask for ${report.tradeHandoff.assetSymbol} on Base. Bankr must show its current executable quote and check location eligibility; Dinn did not choose a side or amount and did not prepare a transaction.`);
 else lines.push('This ticker is not in the current Bankr stock-pair list, so Dinn cannot offer a Bankr trade handoff.');
 lines.push('This is a sourced snapshot, not a contract audit, eligibility decision or safe-to-trade verdict.');
 return lines.map((line,index)=>{
  if(index===2)return '\n'+line;
  if(line.startsWith('Onchain B20 check'))return '\n**Token checks**\n'+line.replace(/^Onchain B20 check\s*[·-]\s*/, '');
  if(line.startsWith('Market ·'))return '\n**Market activity**\n'+line.replace(/^Market\s*[·-]\s*/, '');
  if(line.startsWith('Market data:'))return '\n**Market activity**\n'+line;
  if(line.startsWith('Holders ·'))return '\n**Holder evidence**\n'+line.replace(/^Holders\s*[·-]\s*/, '');
  if(line.startsWith('Holder evidence:'))return '\n**Holder evidence**\n'+line;
  if(line.startsWith('Want to trade?'))return '\n**Bankr trade step**\n'+line.replace(/^Want to trade\?\s*/, '');
  if(line.startsWith('This ticker is not in the current Bankr stock-pair list'))return '\n**Bankr trade step**\n'+line;
  if(line.startsWith('This is a sourced snapshot'))return '\n'+line;
  return line;
 }).join('\n');
}
