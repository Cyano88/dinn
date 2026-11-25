const publishers={
 'reuters.com':'Reuters','bloomberg.com':'Bloomberg','ft.com':'Financial Times','wsj.com':'The Wall Street Journal',
 'cnbc.com':'CNBC','marketwatch.com':'MarketWatch','barrons.com':"Barron's",'apnews.com':'Associated Press',
 'bbc.com':'BBC','bbc.co.uk':'BBC','finance.yahoo.com':'Yahoo Finance','investors.com':"Investor's Business Daily"
};
const cik={TSLA:1318605,NVDA:1045810,AAPL:320193,MSFT:789019,AMZN:1018724,META:1326801,GOOGL:1652044};
export const filingsUrl=ticker=>'https://data.sec.gov/submissions/CIK'+String(cik[ticker]).padStart(10,'0')+'.json';
export function filingsArticles(data,ticker,now){
 if(Number(data?.cik)!==cik[ticker]||!data.tickers?.includes(ticker)||!Array.isArray(data.filings?.recent?.form))throw Error('Unexpected company filings response');
 const rows=data.filings.recent,articles=[];
 for(const [i,form] of rows.form.slice(0,100).entries()){
  if(!['8-K','10-Q','10-K','8-K/A','10-Q/A','10-K/A'].includes(form))continue;
  const publishedAt=rows.acceptanceDateTime?.[i],time=Date.parse(publishedAt);
  const accession=rows.accessionNumber?.[i],document=rows.primaryDocument?.[i];
  if(!Number.isFinite(time)||time>now||now-time>4*86400000||!/^\d{10}-\d{2}-\d{6}$/.test(accession)||!/^[-\w.]+\.htm[l]?$/i.test(document))continue;
  articles.push({kind:'regulatory-filing',source:'SEC EDGAR',title:ticker+' filed Form '+form,excerpt:'',publishedAt:new Date(time).toISOString(),url:'https://www.sec.gov/Archives/edgar/data/'+cik[ticker]+'/'+accession.replaceAll('-','')+'/'+document});
 }
 return articles;
}
export function newsFeeds(ticker,company){
 const q=encodeURIComponent('('+company+' OR '+ticker+') when:4d');
 return [
  ['Financial Times','https://www.ft.com/rss/home'],
  ['MarketWatch','https://feeds.content.dowjones.io/public/rss/mw_topstories'],
  ['The Wall Street Journal','https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml'],
  ['BBC','https://feeds.bbci.co.uk/news/business/rss.xml'],
  ['Google News','https://news.google.com/rss/search?q='+q+'&hl=en-US&gl=US&ceid=US:en']
 ];
}
export function outlet(url){
 let host;try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)return null;host=u.hostname;}catch{return null;}
 const domain=Object.keys(publishers).find(d=>host===d||host.endsWith('.'+d));
 return publishers[domain]||null;
}
