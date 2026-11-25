import {chatSwap,swapAmountPrompt} from './chat-swap.mjs';
import {comparisonMessage} from './base-stock-comparison.mjs';
import {discoverLaunchStories} from './launch-story-discovery.mjs';
import {asksForLaunchIdeas} from '../public/stock-watch.js';
import {equityContext,equityMessage,mentionedEquity} from './equity-context.mjs';
import {newChatTask} from '../public/flow.js';
import {leadWithLockFinding,requestedLockFocus} from './research-finding.mjs';
import {chatLockEvidence} from './base-lock-evidence.mjs';
import {discoveryStep,discoveryMessage,chosenCandidate,marketPrompt,metricPrompt} from './discovery-guide.mjs';
import {researchTarget,researchQuestion,chatResearchGuide} from './research-guide.mjs';
import {robinhoodBalances,prepareRobinhoodSend,walletAssetBalance} from './robinhood-wallet.mjs';
import {prepareRobinhoodRoute,robinhoodRouteQuote} from './robinhood-routes.mjs';
import {assets,networks,address as walletAddress,same,swapImpactMessage} from './robinhood-wallet-call.mjs';
import {ponsTokenState,tokenStateMessage} from './pons-token-state.mjs';
import {preparePonsBurn} from './pons-burn.mjs';
import {preparePonsTrade,ponsTradePair,quotePonsTrade} from './pons-trading.mjs';
import {manageLaunchDraft,draftIntent} from './launch-draft.mjs';
import {prepareDexProfile} from './dex-profile-preparation.mjs';
import {dexStatus} from './dex-services.mjs';
import {ponsReadiness,getClient,snapshot} from './pons.mjs';
import {serverRpcUrl} from './rpc-config.mjs';
import {inspectCachedToken} from './inspection-cache.mjs';
import {inspectionSummary} from './token-inspection.mjs';
import {productCapabilities,productTools,actionTitles} from './tool-catalog.mjs';
import {agentAccessRequest} from './agent-access.mjs';
import {discoverStockPairs,researchBaseStockPairedToken} from './base-stock-paired-research.mjs';
import {researchBaseStock,baseStockResearchMessage as baseStockAssetMessage} from './base-stock-research.mjs';
const addr=v=>typeof v==='string'&&/^0x[0-9a-f]{40}$/i.test(v)&&!/^0x0{40}$/i.test(v);
const statusLabel={'wallet-approval':'wallet approval','read-only':'read-only','unavailable':'unavailable','coming-soon':'coming soon','external-checkout':'external checkout'};
function baseStockResearchMessage(data){
 const market=data.market||{},number=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value)),usd=value=>number(value)?'$'+Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'not available';
 const amount=value=>{const raw=String(value??'not available'),match=raw.match(/^(-?)(\d+)(?:\.(\d+))?$/);if(!match)return raw;const integer=match[2].replace(/\B(?=(\d{3})+(?!\d))/g,','),fraction=(match[3]||'').replace(/0+$/,'');return match[1]+integer+(fraction?'.'+fraction:'');};
 const price=value=>{const n=Number(value);if(!Number.isFinite(n))return 'not available';const digits=Math.abs(n)>0&&Math.abs(n)<0.000001?Math.min(24,Math.ceil(-Math.log10(Math.abs(n)))+6):8;return n.toFixed(digits).replace(/\.?0+$/,'');};
 const date=value=>{const time=Date.parse(value||'');return Number.isFinite(time)?new Date(time).toISOString().slice(0,16).replace('T',' ')+' UTC':'date not available';};
 const addressLink=value=>/^0x[0-9a-f]{40}$/i.test(value||'')?'['+value.slice(0,6)+'…'+value.slice(-4)+'](https://basescan.org/address/'+value+')':'not available';
 const windows={m5:'last 5 minutes',h1:'last hour',h6:'last 6 hours',h24:'last 24 hours'},periods=Object.keys(windows);
 const activity=periods.filter(key=>number(market.transactions?.[key]?.buys)&&number(market.transactions?.[key]?.sells)).map(key=>{const trades=market.transactions[key],buys=Number(trades.buys),sells=Number(trades.sells);return windows[key]+': '+(buys===0&&sells===0?'no trades observed':amount(buys)+' '+(buys===1?'buy':'buys')+' and '+amount(sells)+' '+(sells===1?'sell':'sells'));});
 const volumes=periods.filter(key=>number(market.volumeUsd?.[key])).map(key=>windows[key]+': '+usd(market.volumeUsd[key]));
 const unavailable=periods.filter(key=>!number(market.volumeUsd?.[key])).map(key=>windows[key]);
 const identity=data.launch?.name||'This token',symbol=data.launch?.symbol||'token',stock=data.stock?.symbol||data.stock?.name||data.launch?.pairedStock?.symbol||'the listed stock';
 const launched=Date.parse(data.launch?.deployedAt||''),age=Number.isInteger(data.launch?.ageDays)?data.launch.ageDays===0?'less than a day':data.launch.ageDays+' days':'age not available';
 const launchLine=Number.isFinite(launched)?'Bankr lists this launch from '+date(data.launch.deployedAt)+' ('+age+' old as of '+date(data.checkedAt)+').':'Launch date not available.';
 const pairingLine=data.classification==='verified-bankr-stock-paired-token'?identity+' ('+symbol+') is confirmed as paired with '+stock+' on Base. The Bankr launch record, Base launch receipt, and Coinbase stock list agree.':'I could not confirm that '+identity+' ('+symbol+') is paired with a stock. The required records did not all match, so the result is inconclusive.';
 const marketLine=!data.market?'No market data was returned.':market.source==='GeckoTerminal'||market.matchesBankrPool?market.source+' found the same pool shown in Bankr’s launch record.':'DEX Screener found a market with the same token and stock, but it is not the exact pool shown in Bankr’s launch record.';
 const marketItems=[marketLine];
 if(number(market.liquidityUsd))marketItems.push((market.source==='GeckoTerminal'?'Reported pool reserves':'Money in the pool')+': '+usd(market.liquidityUsd)+'.');
 if(volumes.length)marketItems.push('Trading volume: '+volumes.join('; ')+(unavailable.length?'. '+unavailable.join(' and ')+' volume not available':'')+'. 7-day and 30-day totals are not provided by this source.');
 else marketItems.push('Trading volume is not available.');
 if(activity.length)marketItems.push('Buy and sell counts: '+activity.join('; ')+'.');
 else marketItems.push('Buy and sell counts are not available.');
 if(number(market.priceNative)&&market.quoteToken?.symbol&&market.baseToken?.symbol)marketItems.push('Pool price: '+price(market.priceNative)+' '+market.quoteToken.symbol+' per '+market.baseToken.symbol+'.');
 if(number(market.marketCapUsd))marketItems.push('Reported market cap (value of tokens in circulation): '+usd(market.marketCapUsd)+'.');
 if(number(market.fdvUsd))marketItems.push('Estimated value of all tokens at this price: '+usd(market.fdvUsd)+'.');
 if(number(data.stock?.referencePrice))marketItems.push('Coinbase stock reference value: '+usd(data.stock.referencePrice)+', updated '+date(data.stock.referencePriceUpdatedAt)+'. This is not a price you can trade at.');
 if(market.url)marketItems.push('[Open market details]('+market.url+').');
 const token0=data.fees?.token0Label||'token',token1=data.fees?.token1Label||'paired asset';
 const feeAmounts=value=>value&&typeof value==='object'?['token0','token1'].filter(key=>number(value[key])).map(key=>amount(value[key])+' '+(key==='token0'?token0:token1)).join(', ')||'not available':'not available';
 const lifetime=data.fees?.lifetime,lifetimeLine=lifetime?.status==='reported'?Number(lifetime.lifetimeEarnedWeth)===0?'Bankr reports no lifetime creator earnings yet.':'Bankr reports total past earnings of '+amount(lifetime.lifetimeEarnedWeth)+' WETH (wrapped ETH) over '+amount(lifetime.earningDays)+' days'+(lifetime.bestDay?'; best day: '+lifetime.bestDay.date+' with '+amount(lifetime.bestDay.weth)+' WETH':'')+'.':'Past earnings are not available from Bankr'+(lifetime?.reason?': '+lifetime.reason:'')+'.';
 const feeLine=data.fees?'Creator’s reported share of fees: '+(data.fees.share||'not available')+'. Fees ready to claim: '+feeAmounts(data.fees.claimable)+'. Fees already claimed: '+feeAmounts(data.fees.claimed)+'. '+lifetimeLine:'Bankr fee data is not available. '+lifetimeLine;
 const vesting=data.vesting,allocationShare=vesting?.allocationPercentOfSupply!=null?', about '+vesting.allocationPercentOfSupply+'% of the reported supply':'';
 const phase=vesting?.phase==='cliff'?'before the first release':vesting?.phase==='completed'?'schedule complete':vesting?.phase||'not available';
 const vestingLine=vesting?.status==='reported'?'Bankr reports a creator allocation of '+amount(vesting.totalAmount)+' '+vesting.tokenSymbol+allocationShare+': '+amount(vesting.lockedAmount)+' locked, '+amount(vesting.claimableAmount)+' ready to claim, and '+amount(vesting.releasedAmount)+' released ('+amount(vesting.unlockedPercent)+'% unlocked). Current stage: '+phase+'. First release date: '+String(vesting.cliffEndsAt||'date not available').slice(0,10)+'; final release date: '+String(vesting.vestingEndsAt||'date not available').slice(0,10)+'. This is only the creator allocation shown by Bankr.':vesting?.status==='no-eligible-schedule'?'Bankr reports no eligible vesting schedule. This does not prove the supply is unlocked.':'Bankr vesting data is not available'+(vesting?.reason?': '+vesting.reason:'')+'.';
 const find=label=>(data.contract?.checks||[]).find(item=>item.label===label),supply=find('Total supply (TS)'),owner=find('Reported owner'),source=find('Source verification'),proxy=find('Proxy indicators');
 const ownerAddress=owner?.detail?.match(/0x[0-9a-f]{40}/i)?.[0];
 const sourceText=source?.status==='verified'?'Published contract code matches the code on Base.':source?.status==='unknown'?'This source could not match published contract code; other sources were not checked.':'Published-code check not available.';
 const proxyText=proxy?.status==='attention'?'A proxy was detected. This contract may pass actions to another contract.':proxy?.status==='observed'?'This check did not find a common setup that hands control to another contract, but it cannot rule out every setup.':'Proxy check not available.';
 const contractLine=data.contract?'Base record #'+data.contract.blockNumber+': total supply '+amount(supply?.value||'not available')+(data.contract.symbol?' '+data.contract.symbol:'')+'. Owner address reported by the contract: '+(ownerAddress?addressLink(ownerAddress):'not available')+'. '+sourceText+' '+proxyText:'Base contract data is not available.';
 const holder=data.holders,leaders=holder?.largestBalancesInSample||[];
 const holderUnavailable=String(data.coverage?.holders||'').includes('free public preview')?'Holder data is not included in a free preview. Signed-in Dinn chat and paid NEAR hires can include it when configured.':/not configured|no base holder-data source|no goldrush or blockscout holder key/i.test(String(data.coverage?.holders||''))?'Holder data is not available because no Base holder-data source is set up.':String(data.coverage?.holders||'').includes('snapshot not returned')?'Holder data is unavailable from the configured source.':'Holder data could not be loaded.';
 const holderItems=[];
 if(holder){
  holderItems.push('Holders reported: '+(holder.holderCount??'not available')+'. '+(holder.hasMore?'This is a sample of '+(holder.sampleSize||'the returned set')+' holders, not the full list.':'The full holder list was returned.'));
  if(holder.sampleTop10SharePercent!=null)holderItems.push('The 10 largest in '+(holder.hasMore?'this sample':'the list')+' hold '+amount(holder.sampleTop10SharePercent)+'% of the supply.');
  for(const row of leaders.slice(0,3))holderItems.push(addressLink(row.address)+': '+(row.percentOfSupply==null?'share not available':amount(row.percentOfSupply)+'% of supply')+'.');
  const activity=data.holders.holderActivity||[];
  if(activity.length)holderItems.push('Recent activity: '+activity.map(row=>{const label=addressLink(row.address);if(row.status==='contract')return label+' is a contract, not a personal wallet.';if(row.accountCode==='unavailable')return label+' could not be checked.';if(row.status!=='available')return label+' activity is not available.';const recent=row.recentSwaps?.[0];return label+': '+amount(row.buys)+' buys and '+amount(row.sells)+' sells in '+amount(row.transactionsChecked)+' recent transactions'+(recent?.at?'; last observed '+row.side+' on '+date(recent.at):'')+'.';}).join(' '));
  if(holder.source==='GoldRush Token Holders API')holderItems.push('Recent activity only covers transactions returned by the provider. No recent trades in this sample does not mean there were none earlier.');
 }else holderItems.push(holderUnavailable);
 holderItems.push('Addresses are not identified as people or labeled as team, exchange, or pool wallets.');
 const bankrSource=data.coverage?.bankrLaunchFeed==='address-specific Bankr launch lookup'?'[Bankr launch record](https://api.bankr.bot/token-launches/'+data.address+')':'[Bankr launch list](https://api.bankr.bot/token-launches)';
 const sources=[bankrSource,'[Coinbase stock list](https://api.coinbase.com/v1/tokenized-stocks)'];
 if(data.fees)sources.push('[Bankr fee history](https://api.bankr.bot/token-launches/'+data.address+'/fees)');
 if(vesting?.url)sources.push('[Bankr vesting schedule]('+vesting.url+')');
 if(/^0x[0-9a-f]{64}$/i.test(data.launch?.transactionHash||''))sources.push('[Base launch receipt](https://basescan.org/tx/'+data.launch.transactionHash+')');
 try{const url=new URL(market.url);if(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&['www.geckoterminal.com','dexscreener.com','www.dexscreener.com'].includes(url.hostname))sources.push('['+market.source+' market](https://'+url.host+url.pathname+')');}catch{}
 return [
  '**Pairing**\n\n'+pairingLine+'\n\nToken address: '+data.address+'. '+launchLine,
  '**Market**\n\n'+marketItems[0]+(marketItems.length>1?'\n\n'+marketItems.slice(1).map(item=>'- '+item).join('\n'):''),
  '**Fees and vesting**\n\n'+feeLine+'\n\n'+vestingLine,
  ...[chatLockEvidence(data.tokenLocks,symbol),chatLockEvidence(data.stockLocks,stock)].filter(Boolean),
  '**Holders**\n\n'+holderItems.map(item=>'- '+item).join('\n'),
  '**Contract**\n\n'+contractLine+'\n\nThis is not a full safety check and does not confirm that a token can be sold.',
  data.classification==='verified-bankr-stock-paired-token'?'**If you want to trade**\n\nAsk Dinn for a buy or sell estimate. Dinn can show an estimate from the public Base market. For a real trade, Bankr must check the route and your location. Dinn will not send a trade.':'**Trade check**\n\nThis token pair could not be confirmed, so Dinn will not prepare a trade estimate.',
  '**Sources**\n\n'+sources.join(' · ')
 ].join('\n\n');
}
function latestBaseReportHistory(history=[]){
 const index=history.findLastIndex(m=>m?.role==='assistant' && /\*\*Pairing\*\*|\*\*Identity\*\*|Coinbase registry and onchain token identity match/i.test(m.content||''));
 return index<0?[]:history.slice(index);
}
function latestBaseResearch(history=[]){for(let i=history.length-1;i>=0;i--){const m=history[i];if(m?.role!=='assistant'||!m.content?.includes('**Pairing**'))continue;const address=m.content.match(/Token address:\s*(0x[0-9a-f]{40})/i)?.[1]||m.content.match(/Token contract:\s*`(0x[0-9a-f]{40})`/i)?.[1];if(address)return {index:i,address,verified:/is (?:confirmed|verified) as paired with/i.test(m.content)};}return null;}
function latestBaseCoinbaseStock(history=[]){for(let i=history.length-1;i>=0;i--){const m=history[i];if(m?.role!=='assistant')continue;const text=m.content||'',lower=text.toLowerCase(),confirmed=lower.includes('the ticker, name, and token-unit settings in coinbase’s stock list match what base reports for this token.')||lower.includes('the onchain name, ticker, and decimal places match.')||lower.includes('coinbase registry and onchain token identity match.');if(!confirmed && !text.includes('**Identity**'))continue;const address=text.match(/Token address:\s*(0x[0-9a-f]{40})/i)?.[1]||text.match(/^Contract:\s*(0x[0-9a-f]{40})\s*$/im)?.[1],symbol=text.match(/^\*\*.*?\(([A-Z][A-Za-z0-9.-]{0,11})\) on Base\*\*$/m)?.[1]||text.match(/^## .*?\(([A-Z][A-Za-z0-9.-]{0,11})\) on Base$/m)?.[1]||text.match(/^.*?\(([A-Z][A-Za-z0-9.-]{0,11})\).*Base\s*$/m)?.[1];if(address&&symbol)return {address,symbol,url:confirmed && text.toLowerCase().includes('(https://bankr.bot/trade/'+address.toLowerCase()+')') && !lower.includes('transfers are paused') ? `https://bankr.bot/trade/${address}` : null};}return null;}
async function baseStockTradeAction(args,context,dependencies={}){
 const kind=args.kind,history=latestBaseReportHistory(context.history||[]),found=latestBaseResearch(history),prefix=`To ${kind} this on Base, `,missing=text=>({message:prefix+text,actions:[]});
 if(!['buy','sell','availability'].includes(kind))throw Error('Choose buy or sell.');
 if(!found?.verified)return missing('research a verified Bankr stock-paired token first, then ask me to buy or sell it.');
 if(args.address&&!same(args.address,found.address))return missing('research the token you want to trade first.');
 const previousUsers=history.map((m,index)=>({m,index})).filter(({m,index})=>index>found.index&&m?.role==='user');
 const currentDirection=/\b(?:buy|sell)\b/i.test(context.message||'');
 const latestDirection=previousUsers.findLast(({m})=>/\b(?:buy|sell)\b/i.test(m.content||''));
 const flow=[...(currentDirection?[]:latestDirection?previousUsers.filter(({index})=>index>=latestDirection.index).map(({m})=>m.content||''):[]),context.message||''];
 const report=await (dependencies.baseStockResearch||researchBaseStockPairedToken)({address:found.address},{fetchImpl:dependencies.fetchImpl,env:context.env||process.env,holderSnapshotEnabled:false});
 if(!same(report?.address,found.address)||report.classification!=='verified-bankr-stock-paired-token'||report.verification?.status!=='verified'||report.market?.matchesBankrPool!==true||!same(report.stock?.address,report.launch?.pairedStock?.address))return {message:'I could not re-verify this Bankr stock pair, so I did not prepare a trade. Run the research check again.',actions:[]};
 if(kind==='availability'){
  if(!(Number(report.market.liquidityUsd)>0))return {message:'The stock pair is verified, but I could not confirm liquidity in its pool. I cannot confirm a trade route.',actions:[]};
  return {message:`The token you researched is ${report.launch.symbol}, paired with ${report.stock.symbol} on Base. [Check ${report.launch.symbol} on Bankr](https://bankr.bot/trade/${found.address}) for a current quote and location check. Dinn can estimate a buy or sell from the pool. The final price comes from Bankr.`,actions:[]};
 }
 const tokenSymbol=report.launch.symbol||'token',pairSymbol=report.stock.symbol||report.launch.pairedStock.symbol||'stock pair',amountLines=flow.filter(text=>/\d/.test(text)&&!/(?:verified|eligible|location check)/i.test(text)),source=amountLines.join('\n').replace(new RegExp(found.address,'ig'),' '),amounts=source.match(/(?<![\d.])\d+(?:\.\d+)?(?![\d.])/g)||[];
 if(amounts.length!==1)return missing(kind==='buy'?`how much ${pairSymbol} do you want to spend? Send one amount, for example 10 ${pairSymbol}.`:`how many ${tokenSymbol} do you want to sell? Send one amount, for example 100 ${tokenSymbol}.`);
 const amount=amounts[0],unitMatch=source.match(/\b\d+(?:\.\d+)?\s*([A-Za-z][A-Za-z0-9]{0,23})\b/),unit=unitMatch?.[1]?.toUpperCase(),expectedUnit=(kind==='buy'?pairSymbol:tokenSymbol).toUpperCase();
 if(unit&&unit!==expectedUnit)return missing(kind==='buy'?`use ${pairSymbol}, the token's paired asset, for the buy amount.`:`use ${tokenSymbol}, the token itself, for the sell amount.`);
 const input={kind:'swap',chainId:8453,...(addr(context.walletAccount)?{account:context.walletAccount}:{}),amount,asset:kind==='buy'?report.stock.address:found.address,outputAsset:kind==='buy'?found.address:report.stock.address};
 let quote;try{quote=await (dependencies.quoteRoute||robinhoodRouteQuote)(input,{env:context.env||process.env,baseResearchResult:report,fetcher:dependencies.fetchImpl});}catch(error){if(/No usable Base pool quote|No executable route is available/i.test(error?.message||''))return {message:`I could not get a current pool quote to ${kind} ${amount} ${kind==='buy'?pairSymbol:tokenSymbol}. No wallet approval or transaction was prepared.`,actions:[]};throw error;}
 const summary=kind==='buy'?`Spend ${quote.amount} ${quote.asset.symbol} to buy ${tokenSymbol}.`:`Sell ${quote.amount} ${tokenSymbol} for ${quote.outputAsset.symbol}.`;
 return {message:`${prefix}Dinn can show a read-only pool estimate: ${summary} Estimated output: ${quote.expectedAmount} ${quote.outputAsset.symbol}; estimated minimum at 1% tolerance: ${quote.minimumAmount} ${quote.outputAsset.symbol}. This is a reference quote from the verified Base pool, not Bankr's execution quote or a safety verdict. Dinn cannot place this stock-paired trade: Bankr must provide its executable quote and perform the required location check. [Open this token on Bankr](https://bankr.bot/trade/${found.address}). No wallet permission or transaction was prepared.`,actions:[]};
}
async function walletActionReview(args,context,dependencies){
 const swap=args.kind==='swap'?chatSwap(context):null;
 if(swap){
  const ask=note=>({message:'To swap this, '+(note?note+' ':'')+swapAmountPrompt(swap),actions:[]});
  if(!addr(context.walletAccount))return {message:'To swap this, connect your wallet first.',actions:[]};
  let amount=swap.amount;
  if(amount==='all'){
   if(swap.asset==='ETH')return ask('leave some ETH for the network fee.');
   try{amount=(await (dependencies.balance||walletAssetBalance)({account:context.walletAccount,chainId:swap.chainId,asset:swap.asset},{env:context.env||process.env})).balance;}
   catch{return ask('I could not check your balance.');}
   if(!/^\d+(?:\.\d+)?$/.test(amount)||!/[1-9]/.test(amount))return ask('your available '+swap.asset+' balance is zero.');
  }
  if(!amount||!/[1-9]/.test(amount))return ask('');
  args={kind:'swap',network:String(swap.chainId),asset:swap.asset,outputAsset:swap.outputAsset,amount};
  context={...context,history:[],message:'swap '+amount+' '+swap.asset+' for '+swap.outputAsset+' on '+networks[swap.chainId].name};
 }
 const kind=args.kind,chainId=Number(args.network),history=context.history||[],lastAssistant=history.at(-1)?.content||'',pending=/^To (send|bridge|swap) this,(?!\s*review:)/i.exec(lastAssistant);let sourceMessages=[context.message||''];
 if(pending&&pending[1].toLowerCase()===kind&&!newChatTask(context.message||'')){let assistantIndex=history.length-1;while(assistantIndex>=0){const m=history[assistantIndex],sameFlow=m?.role==='assistant'&&new RegExp('^To '+kind+' this,(?!\\s*review:)','i').test(m.content);if(!sameFlow)break;assistantIndex-=2;}const firstFlowAssistant=assistantIndex+2,start=Math.max(0,firstFlowAssistant-1);sourceMessages=[...history.slice(start).filter(m=>m.role==='user').map(m=>m.content),context.message||''];}
 const source=sourceMessages.join('\n');
 const prefix=kind==='send'?'To send this, ':kind==='bridge'?'To bridge this, ':'To swap this, ',missing=question=>({message:prefix+question,actions:[]});
 if(!addr(context.walletAccount))return missing('connect your wallet from the account menu first, then tell me to continue.');
 const networkOptions=[[4663,/(?:robinhood(?:\s+chain)?|\bon\s+(?:chain\s+)?4663\b)/i],[8453,/(?:\bbase\b|\bon\s+(?:chain\s+)?8453\b)/i],[42161,/(?:arbitrum|\bon\s+(?:chain\s+)?42161\b)/i]],selectableNetworks=kind==='bridge'?networkOptions.filter(([id])=>[8453,42161].includes(id)):networkOptions,currentNetworkMentions=selectableNetworks.filter(([,pattern])=>pattern.test(context.message||'')).map(([id])=>id),mentionedNetworks=currentNetworkMentions.length?currentNetworkMentions:selectableNetworks.filter(([,pattern])=>pattern.test(source)).map(([id])=>id);
 if(!args.network||!networks[chainId]||kind==='bridge'&&![8453,42161].includes(chainId)||mentionedNetworks.length!==1||mentionedNetworks[0]!==chainId)return missing(kind==='send'?'which network should I use: Robinhood Chain or Base?':kind==='bridge'?'which network should I bridge from: Base?':'which network should I use: Robinhood Chain or Base?');
 const knownAssets=assets[chainId].filter(a=>new RegExp('\\b'+a.symbol+'\\b','i').test(source)||a.symbol==='ETH'&&/\bether\b/i.test(source));
 if(kind==='send'&&(!addr(args.recipient)||!source.toLowerCase().includes(args.recipient.toLowerCase())))return missing('which address should receive '+(knownAssets.length===1?'your '+knownAssets[0].symbol:'the tokens')+' on '+networks[chainId].name+'?');
 const amountSource=source.replace(/0x[0-9a-f]{40}/gi,' ').replace(/\b(?:on\s+|chain\s+(?:id\s+)?)(?:4663|8453|42161)\b/gi,' '),explicitAmounts=amountSource.match(/(?<![\d.])\d+(?:\.\d+)?(?![\d.])/g)||[];if(!args.amount||!explicitAmounts.includes(args.amount))return missing(kind==='swap'&&args.asset&&args.outputAsset&&knownAssets.some(a=>a.symbol===args.asset)&&knownAssets.some(a=>a.symbol===args.outputAsset)?'how much '+args.asset+' would you like to swap for '+args.outputAsset+' on '+networks[chainId].name+'?':kind==='send'&&knownAssets.length===1?'how much '+knownAssets[0].symbol+' would you like to send on '+networks[chainId].name+'?':'what amount and asset should I use? For example, 0.1 ETH or 25 USDC.');
 const sourceAddresses=[...new Set((source.match(/0x[0-9a-f]{40}/gi)||[]).map(a=>a.toLowerCase()))],assetIsAddress=walletAddress(args.asset),assetContext=assetIsAddress&&(sourceAddresses.length>1||/\b(?:token|contract|asset)\b/i.test(source))&&!(kind==='send'&&args.recipient?.toLowerCase()===args.asset.toLowerCase());
 if(!args.asset||!(assetIsAddress?assetContext:new RegExp('\\b'+args.asset+'\\b','i').test(source)))return missing('which asset should I use? On Base, choose ETH, USDC, or USDT. On Robinhood Chain, choose ETH, USDG, WETH, or provide the token contract address.');
 if(kind!=='send'&&(!args.outputAsset||!context.message?.toLowerCase().includes(args.outputAsset.toLowerCase())&&!(walletAddress(args.outputAsset)&&new RegExp('\\b(?:to|receive|as|get)\\s+'+args.outputAsset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i').test(source))))return missing(kind==='bridge'?'which asset should arrive on Robinhood Chain?':'which asset should I receive from the swap?');
 const resolveAsset=value=>{if(walletAddress(value))return value;const found=assets[chainId].find(a=>a.symbol.toLowerCase()===value.toLowerCase());if(!found)throw Error(chainId===4663?'Use ETH, USDG, WETH, or provide the Robinhood token contract address.':'On Base, use ETH, USDC, or USDT.');return found.address;};
 const asset=resolveAsset(args.asset),input={account:context.walletAccount,chainId,asset,amount:args.amount};
 if(kind==='send')input.recipient=args.recipient;
 else input.outputAsset=resolveAsset(args.outputAsset);
 let review;
 try{review=await (kind==='send'?prepareRobinhoodSend(input,{env:context.env||process.env}):(dependencies.prepareRoute||prepareRobinhoodRoute)({...input,kind},{env:context.env||process.env}));}
 catch(error){if(!swap)throw error;return missing('I could not get a usable quote for '+args.amount+' '+swap.asset+'. '+swapAmountPrompt(swap));}
 const summary=kind==='send'?`${prefix}review: send ${review.amount} ${review.asset.symbol} on ${networks[review.chainId].name} to ${review.recipient}. Estimated network fee: ${review.networkFee} ETH.`:kind==='bridge'?`${prefix}review: bridge ${review.amount} ${review.asset.symbol} from ${networks[review.chainId].name} to ${networks[review.destinationChainId].name} as ${review.outputAsset.symbol}. Expected: ${review.expectedAmount}; minimum: ${review.minimumAmount}. Estimated network fee: ${review.networkFee} ETH${review.fee?`; relay fee: ${review.fee} ${review.asset.symbol}`:''}.`:`${prefix}review: swap ${review.amount} ${review.asset.symbol} on ${networks[review.chainId].name} for ${review.outputAsset.symbol}. Expected: ${review.expectedAmount}; minimum: ${review.minimumAmount}. Estimated network fee: ${review.networkFee} ETH${review.fee?`; relay fee: ${review.fee} ${review.asset.symbol}`:''}.`;
 return {message:[summary,kind==='swap'?swapImpactMessage(review.impactPercent):'',kind==='swap'?'Approve this quote or decline?':'No transaction has been sent.'].filter(Boolean).join(' '),data:{walletReview:review},actions:[{id:'wallet_approve',review}]};
}
async function burnActionReview(args,context,dependencies={}){
 const history=context.history||[],lastAssistant=history.at(-1)?.content||'',pending=/^To burn this,(?!\s*review:)/i.test(lastAssistant);let sourceMessages=[context.message||''];
 if(pending){let assistantIndex=history.length-1;while(assistantIndex>=0){const m=history[assistantIndex];if(!(m?.role==='assistant'&&/^To burn this,/i.test(m.content||'')))break;assistantIndex-=2;}const start=Math.max(0,assistantIndex+1);sourceMessages=[...history.slice(start).filter(m=>m.role==='user').map(m=>m.content),context.message||''];}
 const source=sourceMessages.join('\n'),prefix='To burn this, ',missing=question=>({message:prefix+question,actions:[]});
 if(!addr(context.walletAccount))return missing('connect the wallet that holds the tokens, then tell me to continue.');
 const sourceAddresses=[...new Set((source.match(/0x[0-9a-f]{40}(?![0-9a-f])/gi)||[]).map(a=>a.toLowerCase()))];if(sourceAddresses.length>1)return missing('send one Pons token address at a time.');
 const address=sourceAddresses[0]||(addr(context.tokenAddress)?context.tokenAddress:null);if(!address||args.address&&!source.toLowerCase().includes(args.address.toLowerCase())&&!(addr(context.tokenAddress)&&context.tokenAddress.toLowerCase()===args.address.toLowerCase()))return missing('which Pons token should I burn? Send its contract address.');
 const amountSource=source.replace(/0x[0-9a-f]{40}/gi,' '),amounts=amountSource.match(/(?<![\d.])\d+(?:\.\d+)?(?![\d.])/g)||[];if(amounts.length>1)return missing('what exact amount should I burn? Send one amount and its token address.');const amount=amounts[0];if(!amount||args.amount&&args.amount!==amount)return missing('what exact amount should I burn?');
 const review=await (dependencies.prepareBurn||preparePonsBurn)({account:context.walletAccount,address,amount},{env:context.env||process.env});
 const message=`To burn this, review: burn ${review.amount} ${review.asset.symbol} from ${review.account}. Token: ${review.asset.address} on Robinhood Chain. Supply at the checked block: ${review.supplyBefore} ${review.asset.symbol}. Estimated network fee: ${review.networkFee} ETH. This cannot be undone; no transaction has been sent.`;
 return {message,data:{walletReview:review},actions:[{id:'wallet_approve',review}]};
}
async function ponsTradeAction(args,context,dependencies={}){
 const kind=args.kind,history=context.history||[],lastAssistant=history.at(-1)?.content||'',pending=/^To (buy|sell) this,/i.exec(lastAssistant);let sourceMessages=[context.message||''];
 if(pending&&pending[1].toLowerCase()===kind&&!newChatTask(context.message||'')){let assistantIndex=history.length-1;while(assistantIndex>=0){const m=history[assistantIndex],sameFlow=m?.role==='assistant'&&new RegExp('^To '+kind+' this,','i').test(m.content||'');if(!sameFlow)break;assistantIndex-=2;}const start=Math.max(0,assistantIndex+1);sourceMessages=[...history.slice(start).filter(m=>m.role==='user').map(m=>m.content),context.message||''];}
 const source=sourceMessages.join('\n'),missing=text=>({message:`To ${kind} this, ${text}`,actions:[]});
 if(!['buy','sell'].includes(kind))throw Error('Choose buy or sell.');if(!addr(context.walletAccount))return missing('connect the wallet that will trade, then tell me to continue.');
 const addresses=[...new Set((source.match(/0x[0-9a-f]{40}(?![0-9a-f])/gi)||[]).map(a=>a.toLowerCase()))];if(addresses.length>1)return missing('send one Robinhood token address at a time.');const token=addresses[0]||(addr(args.token)?args.token:addr(context.tokenAddress)?context.tokenAddress:null);if(!token||args.token&&!source.toLowerCase().includes(args.token.toLowerCase())&&!(addr(context.tokenAddress)&&context.tokenAddress.toLowerCase()===args.token.toLowerCase()))return missing('which Pons token should I '+kind+'? Send its Robinhood contract address.');
 const amountSource=source.replace(/0x[0-9a-f]{40}/gi,' ').replace(/\b(?:on\s+|chain\s+(?:id\s+)?)?(?:4663|8453|42161)\b/gi,' ').replace(/\b\d+(?:\.\d+)?\s*%/g,' '),amounts=amountSource.match(/(?<![\d.])\d+(?:\.\d+)?(?![\d.])/g)||[];if(amounts.length>1)return missing('send one exact amount with the token address.');const amount=amounts[0];if(!amount||args.amount&&args.amount!==amount){const pair=await (dependencies.tradePair||ponsTradePair)({token,account:context.walletAccount},{env:context.env||process.env});return missing(kind==='buy'?`how much ${pair.pair.symbol} should I spend on ${pair.token.symbol}? Send an amount such as 0.1.`:`how many ${pair.token.symbol} tokens should I sell? Send one amount.`);}
 const pair=await (dependencies.tradePair||ponsTradePair)({token,account:context.walletAccount},{env:context.env||process.env}),unitMatch=source.match(/\b\d+(?:\.\d+)?\s*([A-Za-z][A-Za-z0-9]{0,23})\b/),candidateUnit=unitMatch?.[1]?.toUpperCase(),explicitSymbol=candidateUnit&&!['OF','IN','ON','FOR','TO','FROM','WITH','TOKEN','TOKENS','COIN','COINS','PAIR','ASSET','ASSETS'].includes(candidateUnit)?candidateUnit:null,expectedSymbol=(kind==='buy'?pair.pair:pair.token).symbol.toUpperCase();if(explicitSymbol&&explicitSymbol!==expectedSymbol)return missing(`this token uses ${expectedSymbol} for this ${kind}. Send the amount in ${expectedSymbol}.`);
 const review=await (dependencies.prepareTrade||preparePonsTrade)({kind,token,account:context.walletAccount,amount},{env:context.env||process.env});
 if(review.kind==='pons-approval')return {message:`This ${kind} needs a token approval first: allow the Pons curve ${review.curve} to spend exactly ${review.amount} ${review.asset.symbol}. This approval does not place the trade. Estimated network fee: ${review.networkFee} ETH. No transaction has been sent.`,data:{walletReview:review},actions:[{id:'wallet_approve',review}]};
 if(review.kind==='swap')return {message:`Pons has graduated this token to its pool. Relay found a route to ${kind} ${review.tokenSymbol} on Robinhood Chain. Spend ${review.amount} ${review.asset.symbol}; expected ${review.expectedAmount} ${review.outputAsset.symbol}, minimum ${review.minimumAmount} ${review.outputAsset.symbol}. ${swapImpactMessage(review.impactPercent)} Slippage limit: 1%. Estimated network fee: ${review.networkFee} ETH${review.fee?'; Relay fee: '+review.fee+' '+review.asset.symbol:''}. Approve this quote or decline?`,data:{walletReview:review},actions:[{id:'wallet_approve',review}]};
 const fees=Number(review.baseFeeBps)/100+Number(review.creatorTaxBps)/100+(Number(review.openingTaxBps)||0)/100;
 const amountText=kind==='buy'?`Spend ${review.amount} ${review.asset.symbol}${Number(review.refundAmount)>0?` (up to ${review.refundAmount} ${review.asset.symbol} may be returned if the curve fills early)`:''} to buy ${review.outputAsset.symbol}.`:`Sell ${review.amount} ${review.asset.symbol} for ${review.outputAsset.symbol}.`;
 return {message:`${amountText} Expected receive: ${review.outputAmount} ${review.outputAsset.symbol}; minimum: ${review.minimumOutput} ${review.outputAsset.symbol} (1% price movement limit). Pons fees: ${fees.toFixed(2)}% total${Number(review.openingTaxBps)>0?` including ${Number(review.openingTaxBps)/100}% opening tax`:''}. Estimated network fee: ${review.networkFee} ETH. Quote checked at block ${review.blockNumber}. No transaction has been sent.`,data:{walletReview:review},actions:[{id:'wallet_approve',review}]};
}
export async function transactionStatus({hash},o={}){
 if(!/^0x[0-9a-f]{64}$/i.test(hash||''))throw Error('Provide a full transaction hash.');const c=getClient(o);await snapshot(c,o.now);let tx,receipt;
 try{[tx,receipt]=await Promise.all([c.getTransaction({hash}),c.getTransactionReceipt({hash})]);}catch(e){if(['TransactionNotFoundError','TransactionReceiptNotFoundError'].includes(e.name))return {chainId:4663,hash,state:'pending-or-not-found',note:'No mined receipt was found. Do not resubmit automatically.'};throw e;}
 const b=await c.getBlock({blockNumber:receipt.blockNumber});if(receipt.blockHash!==b.hash||tx.blockHash!==b.hash||receipt.transactionHash?.toLowerCase()!==hash.toLowerCase())throw Error('Transaction snapshot changed. Check again.');
 return {chainId:4663,hash,state:receipt.status==='success'?'mined-success':'mined-reverted',from:tx.from,to:tx.to,blockNumber:String(b.number),checkedAt:new Date().toISOString(),note:'Chain receipt status only. This does not prove the intended launch or action was completed.'};
}
async function executeTool(name,args={},context={},dependencies={}){
 const def=productTools.find(t=>t.function.name===name)?.function;if(!def)throw Error('Unknown product tool.');if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!Object.hasOwn(def.parameters.properties,k)))throw Error('Unexpected tool arguments.');for(const key of def.parameters.required)if(args[key]===undefined)throw Error('Missing '+key+'.');
 if(name==='discover_launch_stories')return discoverLaunchStories();
 if(name==='equity_market_context'){const data=await equityContext(args.ticker,{env:context.env||process.env,fetchImpl:dependencies.fetchImpl});return {data,message:equityMessage(data),actions:[]};}
 if(name==='manage_launch_draft'){if(context.signal?.aborted)throw Error('Tool cancelled.');return manageLaunchDraft(args,context,dependencies);}
 for(const [key,v]of Object.entries(args)){const p=def.parameters.properties[key];if(typeof v!=='string'||p.pattern&&!new RegExp(p.pattern).test(v)||p.enum&&!p.enum.includes(v))throw Error('Invalid '+key+'.');}
 if(context.signal?.aborted)throw Error('Tool cancelled.');const account=args.account||context.walletAccount;
 if(name==='manage_launch_draft')return manageLaunchDraft(args,context,dependencies);
 if(name==='request_guidance'){const guidance=directProductIntent(context.message,context);return {message:guidance?.message||'Use supported tools or ask for the missing information.',data:{constraint:guidance?.message||'Use supported tools or ask for the missing information.',capabilities:productCapabilities},actions:guidance?.actions||[]};}
 if(name==='product_capabilities')return {message:Object.values(productCapabilities).map(c=>c.title+': '+(statusLabel[c.status]||'status unavailable')+'. '+c.description).join('\n\n'),actions:[],data:productCapabilities};
 if(name==='discover_base_pairs'){const data=await (dependencies.discoverStockPairs||discoverStockPairs)(args.metric,{env:context.env||process.env});return {message:discoveryMessage(data),data,actions:[]};}
 if(['research_pons_stock','research_pons_stock_pair'].includes(name)){
  const service=name==='research_pons_stock'?'pons.stock.research':'pons.stock-paired.research';
  const report=await agentAccessRequest({service,input:args},{...dependencies,env:context.env||process.env});
  const data=report.result;
  const price=data.reference.available?'Robinhood reference price $'+data.reference.unitPriceUsd+' at '+new Date(data.reference.asOf).toISOString()+'.':'A current Robinhood reference price is unavailable.';
  const title=data.stockInspection?data.symbol+' trades against '+data.stock.symbol+' on Pons.':data.stock.name+' ('+data.stock.symbol+') on Robinhood Chain.';
  const message=[title,price,equityMessage(data.equityContext),inspectionSummary(data,context.message||'overview'),'Robinhood stock contract: '+data.stock.address].join('\n\n');
  return {message,data,inspection:data,actions:[]};
 }
 if(name==='research_base_stock_paired_token'){const data=await (dependencies.baseStockResearch||researchBaseStockPairedToken)(args,{fetchImpl:dependencies.fetchImpl,env:context.env||process.env,holderSnapshotEnabled:context.holderSnapshotEnabled!==false});return {message:leadWithLockFinding(data,requestedLockFocus(context.message),[equityMessage(data.equityContext),baseStockResearchMessage(data)].filter(Boolean).join('\n\n')),data,actions:[]};}
 if(name==='research_base_stock'){const data=await (dependencies.baseStockAssetResearch||researchBaseStock)({query:args.query},{fetchImpl:dependencies.fetchImpl,env:context.env||process.env,holderSnapshotEnabled:context.holderSnapshotEnabled!==false});if(asksForStockComparison(context.message||''))return {message:comparisonMessage(data.comparison)||'I could not verify the token and stock prices for this comparison.',data,actions:[]};
  const first=data.holders?.largestBalancesInSample?.[0];
  let holderLead='';
  if(/\b(?:who holds|largest holder|top holder)\b/i.test(context.message||'')){
   const pool=first&&data.market?.pairs?.find(p=>same(p.pairAddress,first.address));
   holderLead=first?'Largest holder in the returned sample: '+first.address+' holds '+first.balance+' '+data.identity.symbol+(first.percentOfSupply==null?'':' ('+first.percentOfSupply+'% of supply)')+'. '+(pool?'This address matches the '+(pool.dex||'DEX')+' trading pool.':'I could not verify that this address is a trading pool.'):'I could not verify the largest holder from this sample.';
  }
  return {message:leadWithLockFinding(data,requestedLockFocus(context.message),[holderLead,comparisonMessage(data.comparison),equityMessage(data.equityContext),baseStockAssetMessage(data)].filter(Boolean).join('\n\n')),data,actions:[]};}
 if(name==='dex_service_status'){const data=await (dependencies.dexStatus||dexStatus)(args);return {message:(data.indexed?'Token is indexed. ':'No indexed token pair was found. ')+data.orders.length+' public profile orders returned'+(data.orders.length?': '+data.orders.map(o=>o.status||'unknown').join(', '):'')+'. '+data.note,data,actions:[{id:'dex',title:actionTitles.dex,address:args.address}]};}
 if(name==='open_dex_profile'){const address=args.address||context.tokenAddress;if(address&&!addr(address))throw Error('Use a nonzero token address.');if(!address)return {message:'I can help prepare your DEX Screener profile and checkout link. Send the token contract address on Robinhood Chain. I will look up its identity and available project information, then prepare a profile for your review. You will complete payment on DEX Screener.',data:{state:'needs-token-address',service:'DEX Screener Enhanced Token Info',chain:'Robinhood Chain',requiredField:'token contract address',checkout:'external',paymentAvailableInDinn:false},actions:[]};const preparation=await (dependencies.prepareDexProfile||prepareDexProfile)({address},{env:context.env||process.env});const p=preparation.profile;return {message:`I found ${p.name} (${p.symbol}) on Robinhood Chain. ${preparation.inference==='generated'?'I drafted':'I prepared'} a description from the available information${p.twitter?', and found its X profile':''}${p.logo?' and logo':''}.\n\n${p.description}\n\n${preparation.missing.length?'Still missing: '+preparation.missing.join(', ')+'. You can add these during review.':'Review the details before continuing.'} Checkout will prefill the network and address; copy the description and links on DEX Screener.`,data:preparation,actions:[{id:'dex',title:'Review '+p.name+' profile',address,preparation}]};}
 const action={open_launch_setup:'launch',open_launch_review:'review',open_wallet:'wallet',open_launchpads:'launchpads'}[name];if(action)return {message:'Use the '+actionTitles[action].toLowerCase()+' button to continue. No transaction was requested.',actions:[{id:action,title:actionTitles[action]}]};
 if(['pons_token_state','review_pons_claim'].includes(name)){
 if(name==='review_pons_claim'&&!addr(context.walletAccount))return {message:'Connect the wallet that owns the Pons fees before I check claimable fees.',actions:[{id:'wallet',title:actionTitles.wallet}]};
 const address=args.address||context.tokenAddress;if(!addr(address))return {message:'Which token should I check? Send its Robinhood contract address.',actions:[]};
 const data=await (dependencies.tokenState||ponsTokenState)({address,...(addr(context.walletAccount)?{account:context.walletAccount}:{})});
 const canClaim=addr(context.walletAccount)&&BigInt(data.claimableWei)>0n;
 return {message:tokenStateMessage(data,args.focus|| (name==='review_pons_claim'?'fees':'market')),tokenState:data,tokenAddress:address,data,actions:canClaim&&name==='review_pons_claim'?[{id:'claim',address,title:'Review fee claim'}]:[]};
 }
 if(name==='open_wallet_action')return walletActionReview(args,context,dependencies);
  if(name==='base_stock_trade')return baseStockTradeAction(args,context,dependencies);
 if(name==='pons_trade_quote'){
  const reply=message=>({message,actions:[]});
  const options={env:context.env||process.env};
  let info;
  try{info=await (dependencies.tradePair||ponsTradePair)({token:args.token,account},options);}
  catch{return reply('I could not verify this address as a Pons launch on Robinhood Chain. Try the exact launch contract again.');}
  const label=info.token.symbol+'/'+info.pair.symbol;
  if(![0,2].includes(info.phase))return reply(label+' is '+(info.phase===1?'moving from the curve to its pool.':'outside the supported trading stages.')+' I cannot quote it right now.');
  const stage=info.phase===2?'has graduated to its pool':'is on the Pons bonding curve';
  const prefix='Quote for '+label+' ('+args.token+')';
  if(!args.kind)return reply(prefix+'. '+label+' '+stage+'. Which side and amount should I check? For example, buy 0.001 '+info.pair.symbol+' or sell 100 '+info.token.symbol+'.');
  const symbol=args.kind==='buy'?info.pair.symbol:info.token.symbol;
  if(!args.amount||args.unit&&args.unit.toLowerCase()!==symbol.toLowerCase())return reply(prefix+'. '+args.kind+': enter the amount in '+symbol+'.');
  if(!addr(account))return reply('Connect your wallet so I can check a quote for that address.');
  try{
   const quote=await (dependencies.tradeQuote||quotePonsTrade)({...args,account},options);
   const output=Number(quote.output).toLocaleString('en-US',{maximumSignificantDigits:6});
   const estimate=args.amount+' '+symbol+' could get you about '+output+' '+quote.symbol+'.';
   let message=estimate+' '+(quote.reference?'I could not find an executable route for this estimate.':'The amount may change before you swap.');
   if(Number.isFinite(quote.impactPercent))message+=' '+swapImpactMessage(quote.impactPercent);
   const minimum=quote.minimum;
   if(minimum){
    const minimumText=Number(minimum).toLocaleString('en-US',{maximumSignificantDigits:7});
    message+='\n\nSlippage limit: 1%. If the swap completes, the minimum is about '+minimumText+' '+quote.symbol+'.';
   }
   if(quote.fees){
    const {creatorBps,baseBps,openingBps}=quote.fees;
    const tradingFee=baseBps==null?'Pons trading fee unavailable':baseBps/100+'% Pons trading fee';
    message+='\n\nToken fees: '+creatorBps/100+'% creator tax, '+tradingFee+(openingBps?', '+openingBps/100+'% opening tax':'')+'.';
   }
   const offer=(!quote.reference&&minimum)?{account,token:args.token,kind:args.kind,amount:args.amount,unit:symbol}:null;
   if(offer)message+='\n\nProceed to review the current terms, or decline?';
   return {...reply(message),...(offer?{tradeQuoteOffer:offer}:{}),data:{venue:quote.venue,block:quote.block,estimatedOutput:quote.output,symbol:quote.symbol,fees:quote.fees,impactPercent:quote.impactPercent}};
  }catch(error){
   if(error.message.startsWith('No executable route'))return reply('I could not find a way to swap '+args.amount+' '+symbol+' for '+(args.kind==='buy'?info.token.symbol:info.pair.symbol)+' through Dinn right now.');
   return reply('I could not check how much you would receive for '+args.amount+' '+symbol+'. You can ask me to check again in a moment.');}
 }
 if(name==='pons_trade')return ponsTradeAction(args,context,dependencies);
 if(name==='burn_token')return burnActionReview(args,context,dependencies);
 if(name==='wallet_portfolio'){if(!addr(account))return {message:'Connect or choose a wallet in the Wallet tab first.',actions:[]};const data=await (dependencies.portfolio||robinhoodBalances)({account,chainId:Number(args.network||4663)},{env:context.env||process.env});return {message:data.network+' balances:\n'+data.assets.map(a=>a.symbol+': '+(a.balance===null?'unavailable':a.balance)).join('\n')+'\nChecked at block '+data.blockNumber+'.'+(data.discovery==='unavailable'?' Token discovery was unavailable.':''),data,actions:[]};}
 if(name==='wallet_balance'){if(!addr(account))return {message:'Connect a wallet in the Wallet tab first, or provide a wallet address.',actions:[]};const chainId=Number(args.network||4663),asset=args.asset||'ETH',data=await (dependencies.balance||walletAssetBalance)({account,chainId,asset},{env:context.env||process.env});return {message:`${data.network} ${data.asset.symbol} balance: ${data.balance} ${data.asset.symbol}. Checked at block ${data.blockNumber}.`,data,actions:[]};}
 if(name==='launch_options'){const data=await (dependencies.readiness||ponsReadiness)(addr(account)?{account}:{},{env:context.env||process.env});return {message:`Pons has ${data.configs.length} enabled launch configurations. Launch fee: ${data.launchFee} ETH, plus gas. Creator tax cap: ${Number(data.maxCreatorTaxBps)/100}%. ${data.accountCanLaunch===false?'This wallet cannot currently launch. ':''}Checked on Robinhood Chain at block ${data.blockNumber}.`,data,actions:[]};}
 if(name==='inspect_token'){if(!args.address)return {message:'Which Robinhood token or contract should I check? Send its address.',data:{state:'needs-token-address',chainId:4663,requiredField:'token or contract address',focus:args.focus||'overview'},actions:[]};if(!addr(args.address))throw Error('Use one nonzero contract address.');const data=await (dependencies.inspect||inspectCachedToken)(args.address,{rpc:serverRpcUrl(4663,context.env||process.env),chainId:4663,signal:context.signal,fresh:true});let ponsState=null,ponsStateUnavailable=false;if(data.protocol?.name==='Pons v2'){try{const state=await (dependencies.tokenState||ponsTokenState)({address:args.address,...(addr(context.walletAccount)?{account:context.walletAccount}:{})},{blockNumber:BigInt(data.blockNumber),env:context.env||process.env});if(state.address.toLowerCase()!==data.address.toLowerCase()||state.blockNumber!==data.blockNumber||state.chainId!==4663)throw Error('Snapshot mismatch.');ponsState={...state,blockHash:data.blockHash};}catch{ponsStateUnavailable=true;}}const focus={source:'sc',supply:'ts',locks:'lock',owner:'owner',sellability:'sell'}[args.focus]||'';return {message:inspectionSummary({...data,ponsState,ponsStateUnavailable},context.message||focus),data:{...data,focus:args.focus||'overview',...(ponsState?{ponsState}:{}),...(ponsStateUnavailable?{ponsStateUnavailable:true}:{})},inspection:{...data,focus:args.focus||'overview',...(ponsState?{ponsState}:{}),...(ponsStateUnavailable?{ponsStateUnavailable:true}:{})},actions:[]};}
 if(name==='transaction_status'){const data=await (dependencies.transaction||transactionStatus)(args,{env:context.env||process.env});return {message:`Robinhood Chain transaction ${data.hash}: ${data.state}. ${data.blockNumber?'Block '+data.blockNumber+'. ':''}${data.note}`,data,actions:[]};}
}
function previousDexAddress(history=[]){for(let i=history.length-1;i>=0;i--){const m=history[i];if(m.role!=='user')continue;const found=m.content.match(/0x[0-9a-f]{40}(?![0-9a-f])/gi)||[];if(found.length){if(found.length!==1)return undefined;return /dex\s*screener|\bdex\b/i.test(m.content)||/^0x[0-9a-f]{40}$/i.test(m.content.trim())&&/DEX Screener/i.test(history[i-1]?.content||'')?found[0]:undefined;}}}
const conversationalQuestion=text=>/^(?:what|why|how|who|which|where|when|whether|can|could|would|will|do|does|did|is|are|should|explain|suggest|recommend)\b/i.test(text.trim());
function asksForStockComparison(text){return /\b(?:same (?:amount|move|percentage|way)|as much as|move (?:too|as much)|(?:follow|mirror|match|track)(?:ed|s)? (?:it|suit|that|the (?:move|stock|shares))|keep up with|(?:up|down) too)\b/i.test(text);}
export function directProductIntent(text,context={}){
 const lastAssistant=[...(context.history||[])].reverse().find(m=>m.role==='assistant')?.content||'';
 const t=text.trim(),addresses=t.match(/0x[0-9a-f]{40}(?![0-9a-f])/gi)||[],hash=t.match(/0x[0-9a-f]{64}(?![0-9a-f])/i)?.[0];
 if(/\b(?:arbitrum|42161)\b/i.test(t)&&(/\b(?:send|transfer|swap|bridge|balance|portfolio|wallet)\b/i.test(t)||/^To (?:send|swap|bridge) this,/i.test(lastAssistant)))return {message:'Arbitrum is paused in Dinn wallet. Choose Base or Robinhood Chain.',actions:[]};
 if(/^is (?:that|it|this)(?: address| holder)? a (?:trading )?pool[?.!]*$/i.test(t)&&lastAssistant.startsWith('Largest holder in the returned sample:'))return {message:lastAssistant.split('\n')[0],actions:[]};
 const lastEquity=lastAssistant.match(/\b([A-Z]{1,5}) was (?:up|down) [\d.]+% from its previous close/)?.[1];
 if(asksForLaunchIdeas(t)&&/\b(?:base|bankr)\b/i.test(t))return {message:'Dinn can research Base stocks and Bankr stock pairs. Launch discovery currently checks Pons on Robinhood Chain. Ask for Pons launch ideas or name a Base stock to research.',actions:[]};
 if(asksForLaunchIdeas(t))return {name:'discover_launch_stories',args:{}};
 const company=mentionedEquity(t);
 const comparison=asksForStockComparison(t);
 if(comparison&&(/\b(?:token|onchain|base|robinhood)\b/i.test(t)||lastEquity)){
  const ticker=company||(/\b(?:its? token|the token|that token|it|that move)\b/i.test(t)&&lastEquity);
  if(ticker&&!(lastAssistant.includes('on Robinhood Chain')&&!/\bbase\b/i.test(t))&&!/\b(?:robinhood|bankr|pons|ethereum|arbitrum|solana|paired|launch)\b/i.test(t))return {name:'research_base_stock',args:{query:ticker+'c'}};
  if(ticker)return {message:'I cannot verify whether the onchain token moved by the same percentage as '+ticker+'. This comparison needs token prices at both the previous U.S. close and the time of the stock quote.',actions:[]};
 }
 const asksAboutMove=/\b(?:surged?|rall(?:y|ied)|jump(?:ed)?|spik(?:e|ed)|drop(?:ped)?|crash(?:ed)?|fell|soar(?:ed)?|catalyst|price move|going (?:up|down)|stock news)\b/i.test(t)||/\b(?:why|what made|what caused|how much did)\b[^?!]{0,85}\b(?:mov(?:e|ed|ing|ement)|up|down|rise|fall|climb)\b/i.test(t);
 const nextCompany=company&&lastEquity&&!/\b(?:base|robinhood|token|holders?|trade|buy|sell)\b/i.test(t)&&/^(?:and\b|(?:how|what) about\b)/i.test(t)&&t.trim().split(/\s+/).length<=5;
 if(asksAboutMove||nextCompany){
  const ticker=company||(/\b(?:it|that move|this move)\b/i.test(t)&&lastEquity);
  if(ticker)return {name:'equity_market_context',args:{ticker}};
 }
 const task=newChatTask(t);
 if(task==='send'&&/\bwithdraw\b/i.test(t)&&!/\b(?:fees?|vesting|vault|staking|locker|locked|liquidity|pool)\b/i.test(t)){
  if(/\b(?:bank|cash|fiat|off.?ramp)\b/i.test(t))return {message:'Dinn supports onchain transfers. Are you sending to a wallet address or asking about a bank withdrawal?',actions:[]};
  if(/\b(?:arbitrum|42161)\b/i.test(t))return {message:'Arbitrum is paused in Dinn wallet. Choose Base or Robinhood Chain.',actions:[]};
  if(/\b(?:ethereum mainnet|solana|polygon|bsc|optimism|avalanche)\b/i.test(t))return {message:'Dinn sends on Base and Robinhood Chain. Which network would you like to use?',actions:[]};
  return {name:'open_wallet_action',args:{kind:'send'}};
 }
 if(task==='send'&&/^\s*(?:(?:actually|please)[, ]+)*move\b/i.test(t))return {name:'open_wallet_action',args:{kind:'send'}};
 const sendRecipientPrompt=lastAssistant.match(/^To send this, which address should receive your (\w+) on (Base|Robinhood Chain)\?$/i);
 if(sendRecipientPrompt&&/^0x[0-9a-f]{40}$/i.test(t))return {name:'open_wallet_action',args:{kind:'send',network:/^Base$/i.test(sendRecipientPrompt[2])?'8453':'4663',asset:sendRecipientPrompt[1],recipient:t}};
 const pendingQuote=/^Quote for .*? \((0x[0-9a-f]{40})\)\. (?:(buy|sell):\s*)?/i.exec(lastAssistant);
 const reportIndex=(context.history||[]).findLastIndex(m=>m.role==='assistant'&&/Robinhood Chain .*checked at block|\*\*(?:Pairing|Identity)\*\*/i.test(m.content));
 const rhReport=reportIndex>=0&&/Robinhood Chain .*checked at block/i.test(context.history[reportIndex].content);
 const previousRequest=rhReport?context.history[reportIndex-1]?.content||'':'';
 const rhToken=addresses[0]||pendingQuote?.[1]||context.tokenAddress||previousRequest.match(/0x[0-9a-f]{40}/i)?.[0];
 const tradability=/\b(?:trad[ae]able|buyable|sellable)\b|\bcan (?:i|we|you) (?:buy|sell|trade) (?:it|this(?: token)?)\b/i.test(t);
 const quoteReply=/^(?:(buy|sell)\s*)?(?:(\d+(?:\.\d+)?)\s*([a-z][\w.-]*)?)?[?.!]?$/i.exec(t);
 if(pendingQuote&&/^(?:cancel|stop|never ?mind)[.!]?$/i.test(t))return {message:'Quote check stopped.',actions:[]};
 if(!/\b(?:base|bankr|arbitrum)\b/i.test(t)&&(tradability&&(rhReport||reportIndex<0&&context.tokenAddress||/\bpons\b/i.test(t))||pendingQuote&&quoteReply)){
  if(!addr(rhToken)||addresses.length>1)return {message:'Which Pons token should I check? Send one Robinhood Chain contract address.',actions:[]};
  const kind=quoteReply?.[1]?.toLowerCase()||pendingQuote?.[2]||t.match(/\b(buy|sell)\b/i)?.[1]?.toLowerCase();
  return {name:'pons_trade_quote',args:{token:rhToken,...(kind?{kind}:{}),...(quoteReply?.[2]?{amount:quoteReply[2]}:{}),...(quoteReply?.[3]?{unit:quoteReply[3]}:{})}};
 }
 const stockPrompt='Which Robinhood stock token? Send its ticker or Robinhood Chain contract address.';
 const pairPrompt='Send the contract address of the Pons launch whose stock pair you want to check.';
 const rh=/\b(?:pons|robinhood|4663)\b/i.test(t)&&!/\b(?:base|bankr|8453)\b/i.test(t);
 const target=t.match(/^(?:research|check|inspect)\s+\$?([a-z][\w.-]{0,19})\s+on\s+(?:pons|robinhood(?: chain)?)\b/i)?.[1];
 if(rh&&/\b(?:research|check|inspect)\b/i.test(t)&&/\b(?:stock[- ]pair(?:ed)?|paired with (?:a )?(?:tokenized )?stock)\b/i.test(t)||lastAssistant===pairPrompt&&addresses.length===1)
  return addresses.length===1?{name:'research_pons_stock_pair',args:{address:addresses[0]}}:{message:pairPrompt,actions:[]};
 if(rh&&/\b(?:research|check|inspect)\b/i.test(t)&&(/\bstock\b/i.test(t)||target&&!/^(?:token|wallet|balance|contract|launch|fees)$/i.test(target))||lastAssistant===stockPrompt&&/^(?:0x[a-f0-9]{40}|\$?[a-z][\w.-]{0,19})$/i.test(t)){
  const query=addresses.length===1?addresses[0]:lastAssistant===stockPrompt?t.replace(/^\$/,''):target||t.match(/\b(?:stock(?: token)?|ticker)\s+\$?([A-Z][A-Z0-9.-]{0,14})\b/)?.[1];
  return query?{name:'research_pons_stock',args:{query}}:{message:stockPrompt,actions:[]};
 }
 if(lastAssistant.startsWith('Base stock-pair shortlist by ')){
  const rows=[...lastAssistant.matchAll(/^Contract: (0x[a-f0-9]{40})$/gim)].map(m=>({address:m[1]}));
  const address=chosenCandidate(t,rows);if(address)return {name:'research_base_stock_paired_token',args:{address}};
 }
 const discovery=discoveryStep(t,lastAssistant===marketPrompt?'market':lastAssistant===metricPrompt?'metric':null);
 if(discovery && !addresses.length)return discovery.metric?{name:'discover_base_pairs',args:{metric:discovery.metric}}:{message:discovery.message,actions:[]};
 const guided=chatResearchGuide(t,lastAssistant);
 if(guided)return guided;
 const initialTarget=researchTarget(t);
 if(initialTarget && (/^(?:please )?(?:research|inspect|check|look up) /i.test(t) || (!context.awaitingField && !context.ponsSetup?.active && !/(?:send|enter|provide|which|what)[^.!?]{0,100}(?:address|ticker|symbol|wallet|recipient)|(?:what|which)[^.!?]{0,80}stock token/i.test(lastAssistant.slice(-240)))))return {message:researchQuestion('chain',initialTarget),actions:[]};
 if(addresses.length===1&&/Base token contract address/i.test(lastAssistant))return {name:'research_base_stock_paired_token',args:{address:addresses[0]}};
 const pairedStockRequest=/\b(?:stock[\s-]*paired|paired stock|stock pair|paired with .{0,40}\bstock|bankr.{0,40}(?:launch|paired)|bankr token launch)\b/i.test(t);
 if(pairedStockRequest&&/\b(?:research|check|inspect|analy[sz]e|look up|buy|sell|trade)\b/i.test(t))return addresses.length===1?{name:'research_base_stock_paired_token',args:{address:addresses[0]}}:{message:'Send the Base token address. I will verify whether the Bankr launch is paired with a tokenized stock.',actions:[]};
 const stockTickerWords=new Set(['BASE','STOCK','TOKEN','RESEARCH','CHECK','INSPECT','ANALYZE','ANALYSE','LOOK','UP','COINBASE','TOKENIZED','TOKENISED','BUY','SELL','TRADE','TRADING','ON','THE','THIS','THAT','FOR','WITH','PRICE','MARKET','AND','A','IS','WHAT','ABOUT','INFO','INFORMATION','DETAILS','READ','ONLY','DO','NOT','NO','PLEASE','WITHOUT','PREPARE','SEND','EXECUTE','TRANSACTION','TRANSACTIONS']);
 const stockQueryText=t.replace(/0x[0-9a-f]{40}(?![0-9a-f])/gi,' ');
 const registryTickers=[...new Set(stockQueryText.match(/\b[A-Z]{1,5}c\b/g)||[])];
 if(registryTickers.length===1&&!addresses.length&&/\b(?:research|inspect|check|look up)\b/i.test(t))return {name:'research_base_stock',args:{query:registryTickers[0]}};
 const stockTickerCandidates=[...new Set((stockQueryText.match(/\b[A-Z][A-Za-z0-9.-]{0,11}\b/g)||[]).filter(value=>!stockTickerWords.has(value.toUpperCase())))];
 const coinbaseContext=/\b(?:coinbase|tokeni[sz]ed stock|stock token|stock on base|base stock)\b/i.test(t);
 const explicitCoinbaseTicker=stockTickerCandidates.length===1&&/^[A-Z]{1,5}c$/.test(stockTickerCandidates[0]);
 const explicitStockResearch=/\b(?:research|check|inspect|analy[sz]e|look up)\b/i.test(t)&&(coinbaseContext||explicitCoinbaseTicker);
 if(explicitStockResearch){const query=addresses.length===1?addresses[0]:stockTickerCandidates.length===1?stockTickerCandidates[0]:'';return query?{name:'research_base_stock',args:{query}}:{message:'Which Coinbase stock token should I research? Send its ticker, such as NVDAc, or its Base address.',actions:[]};}
 const coinbaseStockContext=latestBaseCoinbaseStock(latestBaseReportHistory(context.history||[])),negatedTrade=/\b(?:do not|don['’]?t|dont|never|without|no)\s+(?:buy|sell|trade)\b/i.test(t);
 if(coinbaseStockContext&&!addresses.length&&!negatedTrade&&/\b(?:buy|sell|trade)\b/i.test(t)&&(/\b(?:it|this|that|the stock|the token)\b/i.test(t)||new RegExp('\\b'+coinbaseStockContext.symbol+'\\b','i').test(t))){if(!coinbaseStockContext.url)return {name:'research_base_stock',args:{query:coinbaseStockContext.address}};return {message:`To trade ${coinbaseStockContext.symbol} on Base, [open it on Bankr](${coinbaseStockContext.url}). Bankr checks if trading is available where you are and shows a quote for you to review. Choose whether to buy or sell and the amount there. Dinn will not prepare or send the trade.`,actions:[]};}
 const stockResearchRequested=/\b(?:research|check|inspect|analy[sz]e|look up|buy|sell|trade|trading|quote|what is|tell me about)\b/i.test(t)&&(coinbaseContext||explicitCoinbaseTicker);
 if(stockResearchRequested){const query=addresses.length===1?addresses[0]:stockTickerCandidates.length===1?stockTickerCandidates[0]:'';return query?{name:'research_base_stock',args:{query}}:{message:'Which Coinbase stock token should I research? Send its ticker, such as NVDAc, or its Base address.',actions:[]};}
  const pendingBurn=/^To burn this,(?!\s*review:)/i.test(lastAssistant);if(pendingBurn&&!task){if(/^(?:cancel|stop|never mind|nevermind|forget it)[.!]?$/i.test(text.trim()))return {message:'Okay, I stopped the burn review. Nothing was sent.',actions:[]};if(conversationalQuestion(text))return null;return {name:'burn_token',args:{}};}
  const baseContext=latestBaseResearch(latestBaseReportHistory(context.history||[])),pendingBase=/^To (buy|sell) this on Base,(?!\s*review:)/i.exec(lastAssistant);if(pendingBase&&!task){if(/^(?:cancel|stop|never mind|nevermind|forget it)[.!]?$/i.test(t))return {message:'Okay, I stopped the Base trade. Nothing was sent.',actions:[]};if(conversationalQuestion(t))return null;const kind=/\bsell\b/i.test(t)?'sell':/\bbuy\b/i.test(t)?'buy':pendingBase[1].toLowerCase();return {name:'base_stock_trade',args:{kind,address:baseContext?.address}};}
 const pendingWallet=/^To (send|bridge|swap) this,(?!\s*review:)/i.exec(lastAssistant);if(pendingWallet&&(!task||['bridge','send','swap'].includes(task))){const pendingKind=pendingWallet[1].toLowerCase(),newKind=/\bbridge\b/i.test(text)?'bridge':/\bswap\b/i.test(text)?'swap':/\b(?:send|transfer)\b/i.test(text)?'send':null;if(/^(?:cancel|stop|never mind|nevermind|forget it)[.!]?$/i.test(text.trim()))return {message:'Okay, I stopped the wallet action. Nothing was sent.',actions:[]};if(conversationalQuestion(text))return null;if(newKind&&newKind!==pendingKind)return {name:'open_wallet_action',args:{kind:newKind}};return {name:'open_wallet_action',args:{kind:pendingKind}};}
 const pendingTrade=/^To (buy|sell) this,/i.exec(lastAssistant);if(pendingTrade&&(!task||['buy','sell'].includes(task))){const kind=pendingTrade[1].toLowerCase(),newKind=/\bbuy\b/i.test(text)?'buy':/\bsell\b/i.test(text)?'sell':null;if(/^(?:cancel|stop|never mind|nevermind|forget it)[.!]?$/i.test(t))return {message:'Okay, I stopped the trade review. Nothing was sent.',actions:[]};if(conversationalQuestion(text))return null;return {name:'pons_trade',args:{kind:newKind&&newKind!==kind?newKind:kind}};}
 if(/^(?:open )?wallet[.!]?$/i.test(text.trim()))return {name:'open_wallet',args:{}};
 if(/^(?:open )?(?:launch )?review[.!]?$/i.test(text.trim()))return {name:'open_launch_review',args:{}};
 if((/\b(?:bridge|swap)\b/i.test(text)||/^(?:send|transfer)[.!]?$/i.test(text.trim())||/\b(?:send|transfer)\b.*\b(?:token|crypto|coin|eth|usdc|usdt|wallet|address|money|funds)\b/i.test(text))&&!conversationalQuestion(text))return {name:'open_wallet_action',args:{kind:/\bbridge\b/i.test(text)?'bridge':/\bswap\b/i.test(text)?'swap':'send'}};
 if(/\b(?:create|make|set up|start)\b.{0,40}\b(?:pink\s*lock|pin\s*lock|token lock|vesting|vest(?:ing)? schedule)\b/i.test(t)){return {message:'Create a token lock or vesting schedule on PinkSale PinkLock. Dinn cannot create a lock for you. Afterward, send the token address and I can check matching PinkLock records; checks cover supported records only.',actions:[{id:'pinklock',title:'Create a lock or vesting schedule',url:'https://www.pinksale.finance/pinklock/create'}]};}
 if(/\b(?:buy|sell|trade)\b/i.test(t) && /\b(?:base|8453)\b/i.test(t) && addresses.length && (addresses.length!==1 || !same(addresses[0],baseContext?.address)))return addresses.length===1?{name:'research_base_stock_paired_token',args:{address:addresses[0]}}:{message:'Which Base token should I check? Send one contract address.',actions:[]};
 if(/\b(?:buy|sell|trade|tradable|tradeable)\b/i.test(t)&&/\b(?:base|8453)\b/i.test(t)&&!baseContext?.verified)return addresses.length===1?{name:'research_base_stock_paired_token',args:{address:addresses[0]}}:{message:'Send the Base token contract address. I will research it first, then you can ask for a buy or sell quote if its Bankr stock pair is verified.',actions:[]};
 if(/\b(?:research|check|inspect|analy[sz]e|look up)\b/i.test(t)&&/\b(?:bankr|stock[\s-]*paired|paired stock|paired with (?:a )?(?:tokeni[sz]ed )?stocks?)\b/i.test(t))return addresses.length===1?{name:'research_base_stock_paired_token',args:{address:addresses[0]}}:{message:'Send the Base token contract address and I will check its stock-pair evidence.',actions:[]};
 if(baseContext && !negatedTrade && !addresses.length && /\b(?:trade|tradable|tradeable)\b/i.test(t) && /\b(?:it|this|that)\b/i.test(t))return baseContext.verified?{name:'base_stock_trade',args:{kind:'availability',address:baseContext.address}}:{message:'I could not verify the stock pair for this token. I cannot confirm a trade route.',actions:[]};
  if(baseContext?.verified&&/^(?:yes|yeah|yep|sure|okay|ok)[.!]?$/i.test(t))return {message:'Would you like to buy or sell it? Include the amount in the stock pair for a buy, or the token amount for a sell.',actions:[]};
  if(!negatedTrade && (!addresses.length || addresses.length===1 && same(addresses[0],baseContext?.address)) && baseContext?.verified&&/\b(?:buy|purchase|sell)\b/i.test(t)&&!conversationalQuestion(t))return {name:'base_stock_trade',args:{kind:/\bsell\b/i.test(t)?'sell':'buy',address:baseContext.address}};
  if(/\b(?:buy|sell)\b/i.test(t)&&!conversationalQuestion(t)){const kind=/\bsell\b/i.test(t)?'sell':'buy';return {name:'pons_trade',args:{kind,...(context.tokenAddress?{token:context.tokenAddress}:{}),...(addresses.length===1?{token:addresses[0]}:{})}};}
 const network=/\b(?:arbitrum|42161)\b/i.test(t)?'42161':/\b(?:base|8453)\b/i.test(t)?'8453':/\b(?:robinhood(?:\s+chain)?|4663)\b/i.test(t)?'4663':null,asset=(t.match(/\b(ETH|USDG|WETH|USDC|USDT)\b/i)||[])[0]?.toUpperCase();
 if(network==='8453'&&/\b(?:research|check|inspect|analy[sz]e|look up)\b/i.test(t)&&!/\b(?:wallet|balance|portfolio|transaction|receipt|swap|bridge)\b/i.test(t)&&(/\b(?:stock|token|contract|launch|paired)\b/i.test(t)||/\b(?:research|check|inspect|analy[sz]e|look up)\b[\s\S]{0,80}\bon\s+(?:Base|8453)\b/i.test(t)))return addresses.length===1?{name:'research_base_stock_paired_token',args:{address:addresses[0]}}:{message:'Send the Base token contract address and I will check its stock-pair evidence.',actions:[]};
 if(/\b(?:ethereum|optimism|polygon|solana|avalanche|bsc|binance smart chain)\b/i.test(t)&&/\b(?:balance|portfolio|wallet assets|all assets)\b/i.test(t))return {message:'I can read wallet balances on Robinhood Chain and Base. Which of those networks should I check?',actions:[]};
 if(!/\bholders?\b/i.test(t)&&/\b(?:wallet assets|portfolio|all balances|all assets|wallet balances|balances on base|balances on arbitrum|balances on robinhood)\b/i.test(t))return network?{name:'wallet_portfolio',args:{network}}:{message:'Which network should I check: Robinhood Chain or Base?',actions:[]};
 if(!/\bholders?\b/i.test(t)&&(/\bbalance\b/i.test(t)||/\bhow much\b.*\b(?:eth|usdg|weth|usdc|usdt)\b/i.test(t))){if(!network)return {message:'Which network should I check: Robinhood Chain or Base?',actions:[]};if(asset){const supported=assets[Number(network)].map(a=>a.symbol.toUpperCase());if(!supported.includes(asset))return {message:`${asset} is not a supported balance asset on ${networks[Number(network)].name}. I can check ${supported.join(', ')} there.`,actions:[]};return {name:'wallet_balance',args:{network,asset,...(addresses.length===1?{account:addresses[0]}:{})}};}return {name:'wallet_portfolio',args:{network}};}
 if(draftIntent({...context,message:text}))return {name:'manage_launch_draft',args:{}};
 if((addresses.length||/\b(?:contract|dex)\b/i.test(t))&&/\b(?:on|chain|network)\s+(?:ethereum|base|solana|arbitrum|polygon|bsc|hyperliquid)\b/i.test(t)&&!/\b(?:wallet|balance|portfolio|send|transfer|swaps?|bridges?)\b/i.test(t))return {message:'Only Robinhood Chain (4663) is connected for token and contract checks. No read was performed on another network.',actions:[]};
 if(addresses.length>1)return {message:'Send one contract or wallet address at a time so the check uses the correct target.',actions:[]};
 if(/\b(?:elysium|ascend|montra)\b/i.test(t))return {message:'Ascend and Montra on Elysium are coming soon. Their actions are paused.',actions:[{id:'launchpads',title:actionTitles.launchpads}]};
 if(/dex\s*screener|dex services|enhanced token info|\b(?:pay|payment|checkout|profile|listing)\b.*\bdex\b|\bdex\b.*\b(?:pay|payment|checkout|profile|listing)\b/i.test(t)){const address=addresses[0]||context.tokenAddress||previousDexAddress(context.history);const question=/^(?:what|why|how|does|do|can|will|is|are|explain)\b/i.test(t);if(!question&&/\b(?:status|check|orders|published)\b/i.test(t))return address?{name:'dex_service_status',args:{address}}:{message:'Which Robinhood token should I check? Paste its contract address.',actions:[{id:'dex',title:actionTitles.dex}]};if(!question&&/prepare|open|create|start|get|link|profile|listing|list my|pay|checkout/i.test(t))return {name:'open_dex_profile',args:address?{address}:{}};return null;}
 if(addresses.length===1&&/^0x[0-9a-f]{40}$/i.test(t)&&/(?:prepare a profile for your review|DEX Screener)/i.test(context.history?.filter(m=>m.role==='assistant').at(-1)?.content||''))return {name:'open_dex_profile',args:{address:addresses[0]}};
 if(/\b(?:burn|destroy)\b/i.test(t)&&!/^\s*(?:what is|why|how does|explain)\b/i.test(t))return {name:'burn_token',args:{...(addresses[0]?{address:addresses[0]}:{})}};
 if(/\b(?:launch age|token age|how old (?:is|the)|when (?:was|did).{0,30}launch(?:ed)?|curve (?:trade|trading )?volume|trading volume|generated fees|fees generated|fees? (?:were )?(?:generated|collected)|(?:generated|collected) fees|curve fees|holder (?:flows?|wallet history|buy(?:ing|s)?|sell(?:ing|s)?)|top holders?.{0,24}(?:buy|sell|trade)|wallet history|strong hands|titan locker|hoodlock|uncx|unlock dates?|pinklock|pink lock|pinlock|pin lock|vesting schedule|vested|locked supply|supply locked|tokens? locked|lock schedule|token lock records)\b/i.test(t)){return {name:'inspect_token',args:{...(addresses[0]||context.tokenAddress?{address:addresses[0]||context.tokenAddress}:{}),focus:/titan locker|hoodlock|uncx|unlock dates?|pinklock|pink lock|pinlock|pin lock|vesting|vested|locked supply|supply locked|tokens? locked|lock schedule|token lock records/i.test(t)?'locks':/holder|wallet history|strong hands|buy(?:ing|s)?|sell(?:ing|s)?/i.test(t)?'holders':'overview'}};}
 if(/\b(?:claimable|claim|collect)\b.{0,40}\bfees?\b|\bfees?\b.{0,40}\b(?:claimable|claim|collect)\b/i.test(t)){const address=addresses[0]||context.tokenAddress;return {name:'review_pons_claim',args:{...(address?{address}:{})}};}
 if(/\b(?:bonding|bonded|graduat\w*|market cap|marketcap|fdv|token price|fees? earned|creator fees?|earnings)\b/i.test(t)){const address=addresses[0]||context.tokenAddress;return {name:'pons_token_state',args:{...(address?{address}:{}),focus:/fee|earn/i.test(t)?'fees':'market'}};}
 if(/\b(?:what can you do|available tools|capabilities|supported (?:tools|actions))\b/i.test(t))return {name:'product_capabilities',args:{}};
 if(/\b(?:lock|vest|burn|buy|sell|swap|claim|bridge|send tokens)\b/i.test(t)&&!addresses.length&&!/\b(?:why|what is|explain|how does)\b/i.test(t)){const key=/lock|vest/i.test(t)?'lock':/burn/i.test(t)?'burn':/claim/i.test(t)?'claim':/bridge/i.test(t)?'fund':/send tokens/i.test(t)?'transfer':/sell/i.test(t)?'sell':'buy';const c=productCapabilities[key];return {message:c.title+': '+c.status+'. '+c.description,actions:[]};}
 if(/\b(?:transaction|tx)\b.*\b(?:status|check|receipt)\b|\b(?:check|status|receipt)\b.*\b(?:transaction|tx)\b/i.test(t)&&!hash)return {message:'Send the full Robinhood Chain transaction hash (0x followed by 64 hexadecimal characters) and I’ll check its canonical receipt. A successful receipt alone does not prove a specific launch or payment.',actions:[]};
 if(hash&&/\b(?:tx|transaction|receipt|status|check)\b/i.test(t)){if(network&&network!=='4663')return {message:'I can verify transaction receipts only on Robinhood Chain. I cannot check a Base transaction from this tool.',actions:[]};return {name:'transaction_status',args:{hash}};}
 if(/\bholders?\b/i.test(t)&&!/^(?:what is|what are|explain)\b/i.test(t))return {name:'inspect_token',args:{...(addresses[0]||context.tokenAddress?{address:addresses[0]||context.tokenAddress}:{}),focus:'holders'}};
 if(/\b(?:launch fee|launch options|launch configs?|can (?:i|my wallet) launch)\b/i.test(t))return {name:'launch_options',args:{}};
 if(addresses.length===1||/\b(?:holders?|holder research|ts|sc|total supply|source verification|check (?:a |the |this )?(?:token|contract)|inspect)\b/i.test(t)){
 const address=addresses.length===1?addresses[0]:context.tokenAddress;if(!address)return {name:'inspect_token',args:{focus:/holder/i.test(t)?'holders':/\bts\b|supply/i.test(t)?'supply':/\bsc\b|source/i.test(t)?'source':'overview'}};
 return {name:'inspect_token',args:{address,focus:/\bts\b|supply/i.test(t)?'supply':/\bsc\b|source|verified/i.test(t)?'source':/lock|liquidity/i.test(t)?'locks':/owner/i.test(t)?'owner':/sell|honeypot/i.test(t)?'sellability':'overview'}};
 }
 return null;
}

export async function executeProductTool(...args){try{return await executeTool(...args);}catch(e){console.error('Product tool failure', {tool:args[0],kind:e.name,code:e.code,cause:e.cause?.name});throw Error(e.name==='Error'&&!/https?:|api.key|Bearer/i.test(e.message)?e.message:'The onchain tool could not complete. No finding was verified.');}}

