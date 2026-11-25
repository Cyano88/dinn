// Company ticker and SEC CIK matched to active Robinhood Chain deployments and Nasdaq non-ETF listings, 2026-11-25.
// Sources: https://api.robinhood.com/rhj/assets and https://www.sec.gov/files/company_tickers.json
// Listing type: https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt and otherlisted.txt in the same directory.
export const issuerIds={
  "NVDA": 1045810,
  "SPCX": 1181412,
  "GOOGL": 1652044,
  "TSLA": 1318605,
  "GME": 1326380,
  "AAPL": 320193,
  "SNDK": 2023554,
  "AMD": 2488,
  "AMZN": 1018724,
  "MSFT": 789019,
  "META": 1326801,
  "CRCL": 1876042,
  "COIN": 1679788,
  "MU": 723125,
  "PLTR": 1321655,
  "TTWO": 946581,
  "RIVN": 1874178,
  "COST": 909832,
  "DJT": 1849635,
  "MSTR": 1050446,
  "RDDT": 1713445,
  "HIMS": 1773751,
  "BB": 1070235,
  "LLY": 59478,
  "WYFI": 2042022,
  "TSM": 1046179,
  "RBLX": 1315098,
  "DELL": 1571996,
  "SNAP": 1564408,
  "LULU": 1397187,
  "FIG": 1579878,
  "MRNA": 1682852,
  "PFE": 78003,
  "MRVL": 1835632,
  "JNJ": 200406,
  "AMC": 1411579,
  "BABA": 1577552,
  "IBM": 51143,
  "NFLX": 1065280,
  "BULL": 1866364,
  "NU": 1691493,
  "SHOP": 1594805,
  "BE": 1664703,
  "F": 37996,
  "UPS": 1090727,
  "INTC": 50863,
  "SNOW": 1640147,
  "BA": 12927,
  "LMT": 936468,
  "CEG": 1868275,
  "RCAT": 748268,
  "RKLB": 1819994,
  "QUBT": 1758009,
  "NET": 1477333,
  "AVGO": 1730168,
  "ORCL": 1341439,
  "NBIS": 1513845,
  "DDOG": 1561550,
  "PENG": 1616533,
  "P": 1474432,
  "BMNR": 1829311,
  "UBER": 1543151,
  "MCD": 63908,
  "JPM": 19617,
  "DIS": 1744489,
  "PYPL": 1633917,
  "V": 1403161
};
export const nonEquities=["SPY","QQQ","GLD","USO","SGOV","INDA","SLV","EWY","SOXX","GDX","cbBTC","USDG","TAO"];
import {pairCandidates} from './pons-assets.js';

const aliases={GOOGL:['Alphabet','Google'],SPCX:['SpaceX'],META:['Meta Platforms'],TSM:['Taiwan Semiconductor','TSMC'],RIVN:['Rivian'],F:['Ford Motor','Ford'],PLTR:['Palantir'],MSTR:['Strategy Inc','MicroStrategy'],QUBT:['Quantum Computing Inc'],SNAP:['Snap Inc','Snapchat']};
const ambiguous=new Set(['P','V','F','BE','BA','NET','SHOP','SNOW','SNAP','BULL','COST','FIG','NU','MU','BB','COIN','META']);
export const equityNames=Object.fromEntries(pairCandidates.filter(p=>Object.hasOwn(issuerIds,p.symbol)).map(p=>[p.symbol,aliases[p.symbol]||[p.name]]));
export function mentionsStock(text,ticker){
 const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const exact=ambiguous.has(ticker)?new RegExp('(?:\\$|NASDAQ:|NYSE:)'+ticker+'\\b|^'+ticker+'$'):new RegExp('\\b'+ticker+'c?\\b','i');
 const explicit=new RegExp('(?:stock news for |ticker |stock )'+ticker+'c?\\b','i');
 return explicit.test(text)||exact.test(text)||equityNames[ticker].some(n=>new RegExp('\\b'+escape(n)+'\\b','i').test(text));
}
