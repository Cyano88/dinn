export const intakePrompt='I can help with the research step. Do you have a token to check, or should I look for stock-paired launches on Base? Send a ticker, contract address, or say "find a pair".';
export const marketPrompt='I can compare Bankr launches paired with Coinbase stocks on Base. Is that the market you want to search?';
export const metricPrompt='Which matters more for your Base shortlist: pool liquidity or trading volume over the last 24 hours? Say "no preference" to use liquidity.';
export function discoveryStep(text,stage){
 const t=String(text||'').trim();
 if(!t||/\b(?:do not|don't|never|stop|cancel)\s+(?:find|search|rank|compare|research)|\b(?:top holders?|wallet balance|best route|swap quote)\b/i.test(t))return null;
 const find=/\b(find|discover|rank|compare|search|best|deepest|highest|top|most liquid|most active|look for)\b/i.test(t)&&/\b(pairs?|tokens?|launches?|candidates?)\b/i.test(t);
 if(!stage&&!find)return null;
 if(/\b(solana|arbitrum|robinhood|pons|ethereum|polygon)\b/i.test(t))return {message:'Pair discovery currently covers Bankr stock-paired launches on Base. For a Pons token, send its Robinhood Chain contract address.'};
 const base=/\b(base|bankr)\b/i.test(t)||stage==='metric'||stage==='market'&&/^yes[.!]?$/i.test(t);
 const volume=/\bvolume\b/i.test(t),liquidity=/\bliquidity\b|\bmost liquid\b|no preference/i.test(t);
 if(!base)return find?{stage:'market',message:marketPrompt}:null;
 if(stage==='metric'&&!find&&!volume&&!liquidity)return null;
 if(volume===liquidity)return {stage:'metric',message:metricPrompt};
 return {metric:volume?'volume':'liquidity'};
}
export function chosenCandidate(text,rows){
 const m=/^(?:(?:please )?(?:research|check|inspect|select|choose)\s+)?(?:the\s+)?(first|second|third|[123])(?:\s+(?:one|pair|token))?[.!]?$/i.exec(String(text||'').trim());
 if(!m)return null;
 const index=['first','second','third'].indexOf(m[1].toLowerCase());
 return rows[index>=0?index:Number(m[1])-1]?.address||null;
}
export function discoveryMessage(r){
 const label=r.metric==='volume'?'24-hour volume':'pool liquidity';
 const lines=['Base stock-pair shortlist by '+label+' | '+r.checkedAt,
  'Checked '+r.checked+' of '+r.eligible+' stock-paired candidates in '+r.listed+' recent Bankr launch records. '+r.comparable+' had a verified pool and a positive reported value for this comparison.'];
 for(const [i,c] of r.candidates.entries())lines.push((i+1)+'. '+c.symbol+' / '+c.stock+' - '+Number(c[r.metric]).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2})+' '+label+'\nContract: '+c.address+'\nPool: '+(c[r.metric+'Source']||c.source)+'\nLaunch: '+c.receipt);
 lines.push('Launch feed: '+r.feedUrl);
 if(!r.candidates.length)lines.push('There is too little verified market data for a shortlist. Send a token contract address if you want an individual report.');
 else lines.push('Choose a result by number for its full report.');
 return lines.join('\n\n');
}
