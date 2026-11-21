const COINBASE_STOCKS='https://api.coinbase.com/v1/tokenized-stocks';
const BANKR_QUOTES='https://api.bankr.bot/token-launches/quote-tokens?chain=base';
const addressPattern=/^0x[0-9a-fA-F]{40}$/;
const timeoutMs=10000;

function validAddress(value){return typeof value==='string'&&addressPattern.test(value);}
function cleanStock(row){
 if(!row||!validAddress(row.contract_address)||typeof row.symbol!=='string'||typeof row.name!=='string'||!Number.isInteger(row.decimals)||row.decimals<0||row.decimals>36) return null;
 const number=(value)=>value===undefined||value===null||typeof value==='boolean'||typeof value==='string'&&!value.trim()?null:Number.isFinite(Number(value))?String(value):null;
 const date=(value)=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
 return {chainId:8453,address:row.contract_address.toLowerCase(),symbol:row.symbol,name:row.name,decimals:row.decimals,totalSupply:number(row.total_supply),multiplier:number(row.multiplier),referencePrice:number(row.nav_price),referencePriceUpdatedAt:date(row.nav_price_updated_at),firstMintAt:date(row.first_mint_date),isin:typeof row.isin==='string'?row.isin:null,pausedFeatures:Array.isArray(row.paused_features)?row.paused_features.filter(x=>typeof x==='string').slice(0,30):null};
}
async function fetchJson(url,fetchImpl,signal){
 const response=await fetchImpl(url,{headers:{accept:'application/json'},signal});
 if(!response.ok)throw new Error('A Base stock data source is temporarily unavailable.');
 return response.json();
}
async function fetchAllStocks(fetchImpl,signal){
 const tokens=[],seen=new Set();let pageToken=null;
 for(let page=0;page<20;page++){
  const url=new URL(COINBASE_STOCKS);url.searchParams.set('page_size','500');if(pageToken)url.searchParams.set('page_token',pageToken);
  const data=await fetchJson(url,fetchImpl,signal);if(!Array.isArray(data?.tokens))throw new Error('Base stock registry returned an unexpected response.');tokens.push(...data.tokens);
  const next=data.next_page_token;if(typeof next!=='string'||!next)return tokens;if(seen.has(next))throw new Error('Base stock registry pagination repeated a page.');seen.add(next);pageToken=next;
 }
 throw new Error('Base stock registry has more pages than expected.');
}
export async function baseStockOptions({fetchImpl=fetch,signal}={}){
 const timeout=AbortSignal.timeout(timeoutMs),combined=signal?AbortSignal.any([signal,timeout]):timeout;
 const [stocksResult,quotesResult]=await Promise.allSettled([fetchAllStocks(fetchImpl,combined),fetchJson(BANKR_QUOTES,fetchImpl,combined)]);
 if(stocksResult.status==='rejected'&&quotesResult.status==='rejected')throw new Error('Base stock references could not be loaded. Try again shortly.');
 const stockRows=stocksResult.status==='fulfilled'&&Array.isArray(stocksResult.value)?stocksResult.value.map(cleanStock).filter(Boolean):[];
 const quoteRows=quotesResult.status==='fulfilled'&&quotesResult.value?.chain==='base'&&Array.isArray(quotesResult.value?.quoteTokens)?quotesResult.value.quoteTokens.filter(row=>row?.kind==='stock'&&row?.deployField==='pairedStockAddress'&&validAddress(row.address)):[];
 const stockByAddress=new Map(stockRows.map(row=>[row.address,row]));
 const quotes=quoteRows.map(row=>{const stock=stockByAddress.get(row.address.toLowerCase());return {address:row.address.toLowerCase(),symbol:row.symbol,name:row.name,bankrPairSupported:true,deployField:'pairedStockAddress',liquidityAdvisory:typeof row.illiquid==='boolean'?{illiquid:row.illiquid,source:'Bankr quote-token API'}:null,coinbase:stock||null};});
 return {chainId:8453,network:'Base',checkedAt:new Date().toISOString(),sources:{coinbase:{url:COINBASE_STOCKS,status:stocksResult.status==='fulfilled'?'available':'unavailable',scope:'Token identity, supply, multiplier, reference NAV and first-mint date.'},bankr:{url:'https://api.bankr.bot/token-launches/quote-tokens?chain=base',status:quotesResult.status==='fulfilled'?'available':'unavailable',scope:'Current launch quote-token list and advisory stock-pair liquidity flag.'}},stocks:quotes,coinbaseRegistry:stockRows,coverage:{coinbaseStockCount:stockRows.length,bankrPairCount:quoteRows.length,matchedCount:quotes.filter(row=>row.coinbase).length,notes:['Reference NAV is not an executable market quote.','Bankr illiquidity is an advisory, not a safety or execution guarantee.','Only addresses currently listed by Bankr as Base stock quote tokens are marked launch-pairable.']}};
}
export async function baseStockLookup(input,{fetchImpl=fetch,signal}={}){
 const address=typeof input?.address==='string'?input.address.trim().toLowerCase():'';
 const query=typeof input?.query==='string'?input.query.trim().toLowerCase():'';
 if(!address&&!query)throw new Error('Provide a Base stock symbol or contract address.');
 if(address&&!validAddress(address))throw new Error('Enter a valid Base contract address.');
 if(query.length>40||/[^a-z0-9 ._-]/i.test(query))throw new Error('Enter a stock symbol or name.');
 const data=await baseStockOptions({fetchImpl,signal});
 // Stock research targets the full Coinbase registry. `stocks` above remains
 // the narrower Bankr quote-token list for existing launch-pair consumers.
 const bankrByAddress=new Map(data.stocks.map(stock=>[stock.address,stock]));
 let matches=data.coinbaseRegistry.filter(stock=>address?stock.address===address:stock.symbol.toLowerCase()===query||stock.name.toLowerCase()===query);
 if(!matches.length&&!address)matches=data.coinbaseRegistry.filter(stock=>stock.symbol.toLowerCase().startsWith(query)||stock.name.toLowerCase().includes(query));
 matches=matches.map(stock=>{const bankr=bankrByAddress.get(stock.address);return {...stock,bankrPairSupported:!!bankr,liquidityAdvisory:bankr?.liquidityAdvisory||null};});
 return {...data,stocks:matches};
}
