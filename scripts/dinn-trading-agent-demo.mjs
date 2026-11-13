import {createHash} from 'node:crypto';

const baseUrl=(process.env.DINN_AGENT_URL||'https://dinn-pasy.onrender.com').replace(/\/+$/,'');
const tokenAddress=process.argv[2];
const isAddress=value=>typeof value==='string'&&/^0x[0-9a-f]{40}$/i.test(value)&&!/^0x0{40}$/i.test(value);
const same=(a,b)=>isAddress(a)&&isAddress(b)&&a.toLowerCase()===b.toLowerCase();
const clean=value=>String(value??'').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').slice(0,500);

function amountUnits(value,decimals){
 if(typeof value!=='string'||value.length>120||!Number.isInteger(decimals)||decimals<0||decimals>36||!/^\d+(?:\.\d+)?$/.test(value))return null;
 const [whole,fraction='']=value.split('.');if(fraction.length>decimals)return null;
 return BigInt(whole)*10n**BigInt(decimals)+BigInt((fraction+'0'.repeat(decimals)).slice(0,decimals)||'0');
}
function formatUnits(value,decimals){
 const scale=10n**BigInt(decimals),whole=value/scale,fraction=(value%scale).toString().padStart(decimals,'0').replace(/0+$/,'');
 return fraction?`${whole}.${fraction}`:String(whole);
}
function decimalProductUsd(amount,unitPrice,places=2){
 const parse=value=>{const match=/^(\d{1,80})(?:\.(\d{1,36}))?$/.exec(String(value));return match?{coefficient:BigInt(match[1]+(match[2]||'')),scale:(match[2]||'').length}:null;};
 const a=parse(amount),p=parse(unitPrice);if(!a||!p||!Number.isInteger(places)||places<0||places>8)return null;
 const denominator=10n**BigInt(a.scale+p.scale),factor=10n**BigInt(places),rounded=(a.coefficient*p.coefficient*factor+denominator/2n)/denominator;
 return `$${rounded/factor}.${String(rounded%factor).padStart(places,'0')}`;
}
function supplyPercent(rawAmount,rawSupply){
 if(!/^\d{1,78}$/.test(String(rawAmount))||!/^\d{1,78}$/.test(String(rawSupply))||BigInt(rawSupply)<=0n)return null;
 const scaled=BigInt(rawAmount)*1000000n/BigInt(rawSupply);return `${scaled/10000n}.${String(scaled%10000n).padStart(4,'0')}`;
}
function referenceTime(value){const ms=typeof value==='number'?value:Date.parse(String(value));return Number.isFinite(ms)?new Date(ms).toISOString():'unknown';}

function assess(report){
 const checks=Array.isArray(report.checks)?report.checks:[];
 const required=['Contract code','Total supply (TS)','Source verification','Proxy indicators','Control functions','Can I sell?'];
 const byLabel=new Map(),duplicateLabels=new Set();for(const check of checks)if(typeof check?.label==='string'){if(byLabel.has(check.label))duplicateLabels.add(check.label);else byLabel.set(check.label,check);}
 const core=new Set(['Contract code','Control functions','Proxy indicators','Can I sell?']);
 const blockers=checks.filter(check=>core.has(check?.label)&&['not-found','attention'].includes(check?.status));
 if(blockers.length)return {decision:'ABSTAIN',reasons:blockers.map(check=>`${clean(check.label)}: ${clean(check.detail)}`)};
 const unresolved=required.filter(label=>{
  const check=byLabel.get(label);if(duplicateLabels.has(label)||!check||!['observed','verified'].includes(check.status))return true;
  return label==='Source verification'?check.status!=='verified':false;
 });
 if(unresolved.length)return {decision:'REVIEW',reasons:unresolved.map(label=>`${label} is missing or unresolved.`)};
 const behavior=report.holders?.behavior,summary=behavior?.summary;
 const rows=behavior?.rows,decimals=report.decimals;
 if(behavior?.status!=='available'||!Array.isArray(rows)||!rows.length||rows.some(row=>row?.status!=='available'||!isAddress(row?.address))||!Number.isInteger(decimals)||decimals<0||decimals>36)return {decision:'REVIEW',reasons:[clean(summary?.holderSignal||behavior?.reason||'Holder history is incomplete or inconclusive.')]};
 let buyAmount=0n,sellAmount=0n;const buyWallets=new Set(),sellWallets=new Set();
 for(const row of rows){
  if(!Array.isArray(row.recentSwaps))return {decision:'REVIEW',reasons:['A sampled wallet history is missing its swap evidence list.']};
  for(const trade of row.recentSwaps){
   if(trade?.classification!=='two-sided swap candidate')continue;
   if(trade.targetTokenAction==='target-token buy candidate'){
    const amount=amountUnits(trade.targetTokenReceived,decimals);if(amount===null)return {decision:'REVIEW',reasons:['A target-token buy candidate has an invalid amount.']};
    buyAmount+=amount;if(amount>0n)buyWallets.add(row.address.toLowerCase());
   }else if(trade.targetTokenAction==='target-token sell candidate'){
    const amount=amountUnits(trade.targetTokenSent,decimals);if(amount===null)return {decision:'REVIEW',reasons:['A target-token sell candidate has an invalid amount.']};
    sellAmount+=amount;if(amount>0n)sellWallets.add(row.address.toLowerCase());
   }
  }
 }
 const unit=clean(report.symbol||'tokens'),buyDisplay=`${formatUnits(buyAmount,decimals)} ${unit}`,sellDisplay=`${formatUnits(sellAmount,decimals)} ${unit}`;
 if(sellAmount>buyAmount&&sellWallets.size>=2)return {decision:'ABSTAIN',reasons:[`Sampled holders show ${sellWallets.size} distinct seller addresses and greater target-token sell-candidate flow (${sellDisplay}) than buy-candidate flow (${buyDisplay}).`,'This is adverse sampled evidence, not a forecast.']};
 if(buyAmount>sellAmount&&buyWallets.size>=3)return {decision:'PROCEED TO SIMULATION',reasons:[`Sampled holders show ${buyWallets.size} distinct buyer addresses and greater target-token buy-candidate flow (${buyDisplay}) than sell-candidate flow (${sellDisplay}).`,'This only clears the holder-flow triage gate; it is not a buy recommendation.']};
 return {decision:'REVIEW',reasons:[clean(summary?.holderSignal||'Holder-flow evidence is mixed, low coverage, or below the configured address threshold.'),'No trade was placed.']};
}

function requireUsage(){
 if(!isAddress(tokenAddress))throw Error('Usage: node scripts/dinn-trading-agent-demo.mjs <Robinhood-token-address>');
}

try{
 requireUsage();
 const response=await fetch(baseUrl+'/api/agent/request',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({service:'token.research',input:{address:tokenAddress}}),signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw Error(`Dinn request failed with HTTP ${response.status}.`);
 const payload=await response.json();
 if(payload.status!=='completed'||typeof payload.evidence?.content!=='string'||typeof payload.evidence?.sha256!=='string')throw Error(payload.error||'Dinn did not return a complete inspection report.');
 const actualHash=createHash('sha256').update(payload.evidence.content).digest('hex');
 if(actualHash!==payload.evidence.sha256)throw Error('Dinn evidence hash did not match the returned report.');
 const evidence=JSON.parse(payload.evidence.content);
 if(evidence.service!=='token.research'||!same(evidence.input?.address,tokenAddress)||!same(evidence.result?.address,tokenAddress)||evidence.result?.chainId!==4663||typeof evidence.result?.blockNumber!=='string'||!/^\d{1,30}$/.test(evidence.result.blockNumber)||typeof evidence.result?.blockHash!=='string'||!/^0x[0-9a-f]{64}$/i.test(evidence.result.blockHash)||!Number.isFinite(Date.parse(evidence.result?.checkedAt)))throw Error('The report did not match the requested token and checked Robinhood Chain snapshot.');
 const result=evidence.result,behavior=result.holders?.behavior,summary=behavior?.summary,decision=assess(result);
 const pons=result.ponsState,market=pons?.market,holderRows=Array.isArray(result.holders?.rows)?result.holders.rows:[];
 const history=result.ponsHistory,curveHistory=history?.curve,lockReport=result.pinkLock;
 const check=label=>Array.isArray(result.checks)?result.checks.find(item=>item?.label===label):null;
 const abbreviated=value=>clean(value).slice(0,210);
 const money=value=>value===null||value===undefined?'unavailable':`$${clean(value)}`;
 const marketRef=market?`${money(market.priceUsd)} price / ${money(market.marketCapUsd)} market cap / ${money(market.fdvUsd)} FDV (${clean(market.source||'reference unavailable')})`:'unavailable';
 const concentration=result.holders?.topSharePercent===null||result.holders?.topSharePercent===undefined?'unavailable':`${clean(result.holders.topSharePercent)}% of reported supply in top indexed candidates`;
 const hasContracts=holderRows.some(row=>/contract/i.test(String(row.kind||''))&&!row.infrastructure);
 const hasSink=holderRows.some(row=>row.sink);
 const holderCaveat=hasContracts||hasSink?' (partial index; includes contract or sink addresses)':' (partial index)';
 console.log('Dinn reference trading agent / live read-only request');
 console.log(`Token: ${clean(result.tokenName||'Unknown')} (${clean(result.symbol||'Unknown')}) ${tokenAddress}`);
 console.log(`Evidence: SHA-256 verified / Robinhood Chain / block ${clean(result.blockNumber)}`);
 console.log(`Launch: ${clean(pons?.status||result.protocol?.name||'Pons status unavailable')} / ${clean(pons?.pair?.symbol||result.protocol?.pairSymbol||'pair unavailable')}`);
 console.log(`Token age: ${clean(history?.age||'unavailable')} / launched ${clean(history?.launchedAt||'unavailable')}`);
 console.log(`Reported total supply: ${abbreviated(check('Total supply (TS)')?.detail||'unavailable')}`);
 console.log(`Bonding curve: ${abbreviated(check('Curve reserves')?.detail||'curve metrics unavailable')}`);
 if(pons?.curve){
  const c=pons.curve,pair=pons.pair?.symbol||result.protocol?.pairSymbol||'pair asset';
  console.log(`Curve snapshot: ${clean(c.progressPercent)}% of quote-reserve graduation target (${clean(c.raised)} / ${clean(c.threshold)} ${clean(pair)}); spot ${clean(c.priceQuote)} ${clean(pair)} / token; curve-implied FDV ${clean(c.fdvQuote)} ${clean(pair)}.`);
  console.log(`Curve sell capacity: sellableTokens() reports ${clean(c.sellable)} ${clean(result.symbol||'tokens')} at the checked block; this is not a wallet-specific quote or guaranteed fill.`);
  const rawCurve=result.protocol?.knownBalances?.curve,rawSupply=result.rawSupply,decimals=result.decimals;
  if(typeof rawCurve==='string'&&/^\d+$/.test(rawCurve)&&typeof rawSupply==='string'&&/^\d+$/.test(rawSupply)&&BigInt(rawSupply)>0n&&Number.isInteger(decimals)&&decimals>=0&&decimals<=36){
   const share=BigInt(rawCurve)*1000000n/BigInt(rawSupply),whole=share/10000n,fraction=String(share%10000n).padStart(4,'0');
   console.log(`Curve contract inventory: ${formatUnits(BigInt(rawCurve),decimals)} ${clean(result.symbol||'tokens')} (${whole}.${fraction}% of reported total supply); this is distinct from graduation progress and sellableTokens().`);
  }
  const usd=pons.quoteUsd;
  if(usd?.available&&c.fdvQuote){
   const usdFdv=decimalProductUsd(c.fdvQuote,usd.unitPriceUsd,2);
   console.log(`Pair-asset USD reference: ${clean(usd.symbol)} ≈ $${clean(usd.unitPriceUsd)} (${clean(usd.basis||'provider reference')}, as of ${clean(referenceTime(usd.asOf))}); curve-implied FDV ${usdFdv||'unavailable'}. This is not circulating market cap or an executable quote.`);
  }
 }
 console.log(`Circulating market cap: ${market?.marketCapUsd?money(market.marketCapUsd):'unavailable'}${market?.source?` (${clean(market.source)})`:''}. FDV remains a separate metric.`);
 if(curveHistory?.totalVolume!==null&&curveHistory?.totalVolume!==undefined){
  console.log(`Curve history: ${clean(curveHistory.status)} / ${clean(curveHistory.tradeCount)} trades (${clean(curveHistory.buyCount)} buys, ${clean(curveHistory.sellCount)} sells)`);
  console.log(`Curve quote volume: ${clean(curveHistory.totalVolume)} ${clean(curveHistory.pairSymbol)} (through the checked block; excludes post-graduation pool trading)`);
  console.log(`Event fees and creator tax: ${clean(curveHistory.totalFees)} ${clean(curveHistory.pairSymbol)} (${clean(curveHistory.baseAndSnipeFees)} base and snipe fees + ${clean(curveHistory.creatorTax)} creator tax; not creator earnings)`);
 }else if(curveHistory?.scannedVolume!==null&&curveHistory?.scannedVolume!==undefined){
  console.log(`Curve history: partial lower bound / ${clean(curveHistory.scannedTradeCount)} scanned trades; ${clean(curveHistory.scannedVolume)} ${clean(curveHistory.pairSymbol)} volume / ${clean(curveHistory.scannedFees)} ${clean(curveHistory.pairSymbol)} fees`);
 }else console.log(`Curve history: ${clean(curveHistory?.status||'unavailable')} / volume and fees not verified`);
 console.log(`Market reference: ${marketRef}`);
 console.log(`Holders: ${holderRows.length} indexed candidates / ${concentration}${holderCaveat}`);
 const holderEvents=history?.holderEventSummary;
 if(holderEvents){
  console.log(`Pons trades by sampled top holders: ${clean(holderEvents.addressesWithBuys)} of ${clean(holderEvents.indexedAddresses)} had buys / ${clean(holderEvents.addressesWithSells)} had sells (${clean(holderEvents.buyEvents)} buy ${Number(holderEvents.buyEvents)===1?'event':'events'} / ${clean(holderEvents.sellEvents)} sell ${Number(holderEvents.sellEvents)===1?'event':'events'}; cumulative since launch through checked block, not the 30-day sample).`);
  for(const row of (Array.isArray(history?.holderActivity)?history.holderActivity.filter(x=>Number(x.buys)>0||Number(x.sells)>0).slice(0,5):[]))console.log(`  ${clean(row.address)}: ${clean(row.buys)} buys / ${clean(row.buyTokens)} ${clean(result.symbol||'tokens')} (${clean(row.buyQuote)} ${clean(curveHistory?.pairSymbol||'pair')}); ${clean(row.sells)} sells / ${clean(row.sellTokens)} ${clean(result.symbol||'tokens')} (${clean(row.sellQuote)} ${clean(curveHistory?.pairSymbol||'pair')})`);
 }
 console.log(`Holder signal: ${clean(summary?.holderSignal||behavior?.reason||'insufficient evidence')}`);
 console.log(`Recent 30-day target-token swap candidates: ${clean(summary?.targetTokenBuyCandidates??'unknown')} buy / ${clean(summary?.targetTokenSellCandidates??'unknown')} sell`);
 console.log(`Recent-history sample: ${clean(summary?.walletsAnalyzed??0)} holder addresses / ${clean(summary?.completeWalletHistories??0)} complete 30-day histories`);
 if(Array.isArray(lockReport?.records)&&lockReport.records.length){
  for(const lock of lockReport.records.slice(0,3)){
   const share=supplyPercent(amountUnits(lock.remaining,result.decimals)?.toString()||'',result.rawSupply);
   console.log(`PinkLock: ${clean(lock.remaining)} ${clean(result.symbol||'tokens')} remains locked${share?` (${share}% of reported total supply)`:''} / ${clean(lock.currentlyWithdrawable??'unknown')} currently withdrawable / unlock ${clean(lock.tgeOrUnlockDate||'unknown')} / ${clean(lock.pinkSaleUrl||'PinkSale record unavailable')}`);
  }
 }else console.log(`PinkLock: ${clean(lockReport?.status||'unavailable')} / ${clean(lockReport?.reason||'No matching record was verified in the bounded lock checks; this does not prove supply is unlocked.')}`);
 console.log(`Tradeability: ${abbreviated(check('Can I sell?')?.detail||'not established')}`);
 console.log(`Contract controls: ${clean(check('Control functions')?.status||'not reported')}`);
 const lpCheck=check('LP lock');if(lpCheck)console.log(`Pool/LP status: ${clean(lpCheck.status)} — ${clean(lpCheck.detail)}`);
 console.log(`Vesting: ${Array.isArray(lockReport?.records)&&lockReport.records.some(lock=>lock.cycleDays||lock.tgeReleasePercent!==undefined)?'schedule reported':'not reported in checked sources'}`);
 console.log(`Decision: ${decision.decision}`);
 for(const reason of decision.reasons)console.log(`Reason: ${clean(reason)}`);
 console.log('No wallet was connected. No trade was placed.');
}catch(error){
 console.error(error.message||'Dinn reference agent failed.');
 process.exitCode=1;
}
