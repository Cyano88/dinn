const minute=60;
const iso=seconds=>new Date(seconds*1000).toISOString();
const address=value=>/^0x[\da-f]{40}$/i.test(value||'');
const positive=value=>Number.isFinite(value)&&value>0;

async function readJson(url,fetchImpl){
 const response=await fetchImpl(url,{signal:AbortSignal.timeout(7500),headers:{'user-agent':'Mozilla/5.0 (compatible; Dinn research)'}});
 if(!response.ok)throw Error('Source unavailable');
 return response.json();
}

const recent=new Map();
export async function compareBaseStock(input,fetchImpl=fetch){
 if(fetchImpl!==fetch||!input.equity?.quote)return readComparison(input,fetchImpl);
 const key=JSON.stringify([input.token,input.equity.quote.asOf,input.equity.quote.priceUsd,input.market?.pairs?.[0]?.pairAddress]);
 const now=Date.now();
 for(const [id,entry] of recent)if(entry.expires<=now)recent.delete(id);
 if(!recent.has(key)){
  const work=readComparison(input,fetchImpl).then(result=>{
   if(result.status!=='available')recent.delete(key);
   return result;
  },error=>{recent.delete(key);throw error;});
  recent.set(key,{expires:now+60000,work});
 }
 return recent.get(key).work;
}
async function readComparison({token,symbol,equity,market},fetchImpl){
 const quote=equity?.quote;
 const base={network:'Base',token,symbol,ticker:equity?.ticker,checkedAt:new Date().toISOString()};
 const unavailable=reason=>({...base,status:'unavailable',reason});
 if(!quote||!positive(quote.previousCloseUsd)||!positive(quote.priceUsd))return unavailable('The U.S. stock quote or previous close is missing.');
 const end=Date.parse(quote.asOf)/1000;
 const pair=market?.pairs?.find(p=>address(p.pairAddress)&&positive(p.liquidityUsd)&&[p.baseToken?.address,p.quoteToken?.address].some(a=>a?.toLowerCase()===token));
 if(!pair)return unavailable('No matching Base pool with reported liquidity was found.');
 const chartUrl='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(equity.ticker)+'?range=5d&interval=5m';
 let start;
 try{
  const chart=(await readJson(chartUrl,fetchImpl)).chart?.result?.[0];
  const sessions=chart?.meta?.tradingPeriods;
  if(chart?.meta?.symbol===equity.ticker&&Array.isArray(sessions)){
   const periods=sessions.flat().filter(s=>Number.isInteger(s?.start)&&Number.isInteger(s?.end)&&s.end>s.start).sort((a,b)=>a.start-b.start);
   const current=periods.findIndex(s=>s.start<=end&&end<=s.end+60);
   if(current>0&&periods[current-1].end<periods[current].start)start=periods[current-1].end;
  }
 }catch{}
 if(!start)return unavailable('The time of the previous U.S. market close could not be verified.');
 const pool=pair.pairAddress.toLowerCase();
 async function sample(at){
  const cutoff=Math.floor(at/minute)*minute;
  const url='https://api.geckoterminal.com/api/v2/networks/base/pools/'+pool+'/ohlcv/minute?aggregate=1&currency=usd&include_empty_intervals=false&limit=6&before_timestamp='+cutoff+'&token='+token;
  const data=await readJson(url,fetchImpl);
  if(![data.meta?.base?.address,data.meta?.quote?.address].some(a=>a?.toLowerCase()===token))throw Error('Token mismatch');
  const rows=data.data?.attributes?.ohlcv_list;
  if(!Array.isArray(rows))throw Error('Missing candles');
  const row=rows.filter(r=>Array.isArray(r)&&Number.isInteger(r[0])&&r[0]%60===0&&r[0]+minute<=at&&at-(r[0]+minute)<=240&&positive(r[4])&&positive(r[5])).sort((a,b)=>b[0]-a[0])[0];
  return row?{closeUsd:row[4],volumeUsd:row[5],minuteStart:iso(row[0]),minuteEnd:iso(row[0]+minute),source:url}:null;
 }
 const window={from:iso(start),to:quote.asOf};
 const details={window,pool,liquidityUsd:pair.liquidityUsd,liquidityCheckedAt:market.checkedAt,poolUrl:'https://www.geckoterminal.com/base/pools/'+pool,stockSource:quote.url,sessionSource:chartUrl};
 try{
  const [opening,latest]=await Promise.all([sample(start),sample(end)]);
  if(!opening||!latest)return {...unavailable('No completed minute with reported trades was available within five minutes of '+(!opening?'the previous U.S. close.':'the stock quote.')), ...details,opening,latest};
  return {...base,...details,status:'available',opening,latest,stockChangePercent:(quote.priceUsd/quote.previousCloseUsd-1)*100,tokenChangePercent:(latest.closeUsd/opening.closeUsd-1)*100};
 }catch{return {...unavailable('The historical Base pool prices could not be verified.'),...details};}
}

export function comparisonMessage(result){
 if(!result)return '';
 if(result.status!=='available')return 'Base token comparison unavailable. '+result.reason;
 const change=n=>(n>=0?'+':'')+n.toFixed(2)+'%';
 const time=s=>s.slice(0,16).replace('T',' ');
 return result.ticker+' '+change(result.stockChangePercent)+' since the previous U.S. close. '+result.symbol+' on Base '+change(result.tokenChangePercent)+' over approximately the same hours.\n\n'+time(result.window.from)+' to '+time(result.window.to)+' UTC. Token prices use the last completed one-minute candles with trades near each endpoint ($'+result.opening.closeUsd.toFixed(4)+' to $'+result.latest.closeUsd.toFixed(4)+'). Reported pool liquidity: $'+Math.round(result.liquidityUsd).toLocaleString('en-US')+'. [Base pool]('+result.poolUrl+') | [Stock quote]('+result.stockSource+')';
}
