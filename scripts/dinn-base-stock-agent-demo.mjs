import {createHash} from 'node:crypto';

const baseUrl=(process.env.DINN_AGENT_URL||'https://dinn-pasy.onrender.com').replace(/\/+$/,'');
const tokenAddress=process.argv[2];
const isAddress=value=>typeof value==='string'&&/^0x[0-9a-f]{40}$/i.test(value)&&!/^0x0{40}$/i.test(value);
const same=(a,b)=>isAddress(a)&&isAddress(b)&&a.toLowerCase()===b.toLowerCase();
const finitePositive=value=>Number.isFinite(Number(value))&&Number(value)>0;
const available=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))&&Number(value)>=0;
const shown=value=>value===null||value===undefined||value===''?'unavailable':String(value);
function sourceHosts(markdown=''){
 const urls=markdown.match(/https:\/\/[^\s)]+/g)||[];
 return [...new Set(urls.map(value=>{try{return new URL(value.replace(/[.,]+$/,'')).hostname.replace(/^www\./,'');}catch{return null;}}).filter(Boolean))].slice(0,8);
}

function usage(){
 if(!isAddress(tokenAddress))throw Error('Usage: npm run demo:base-agent -- <Base-token-address>');
}

function verify(payload){
 if(payload?.status!=='completed'||typeof payload.evidence?.content!=='string'||typeof payload.evidence?.sha256!=='string')throw Error(payload?.error||'Dinn did not return a complete research report.');
 const digest=createHash('sha256').update(payload.evidence.content).digest('hex');
 if(digest!==payload.evidence.sha256)throw Error('Dinn evidence hash did not match the returned report.');
 let evidence;try{evidence=JSON.parse(payload.evidence.content);}catch{throw Error('Dinn evidence was not valid JSON.');}
 const report=evidence?.result,handoff=report?.tradeHandoff;
 if(evidence?.service!=='base.stock-paired.research'||!same(evidence.input?.address,tokenAddress)||!same(report?.address,tokenAddress)||report?.chainId!==8453||!Number.isFinite(Date.parse(report?.checkedAt)))throw Error('The report did not match the requested token, Base network, and checked time.');
 if(!handoff||handoff.chainId!==8453||!same(handoff.tokenAddress,tokenAddress)||handoff.quote?.status!=='not_requested'||handoff.quote?.executable!==false||handoff.orderIntent!==null||handoff.transaction?.prepared!==false||handoff.transaction?.signed!==false||handoff.transaction?.broadcast!==false)throw Error('The report did not preserve the read-only trade-handoff boundary.');
 if(!['request_external_quote','review_first'].includes(handoff.status)||!Array.isArray(handoff.reasonCodes))throw Error('Dinn returned an unknown trade-handoff state.');
 if(handoff.status==='request_external_quote'){
  if(report.classification!=='verified-bankr-stock-paired-token'||report.verification?.status!=='verified'||!same(handoff.stockAddress,report.stock?.address)||!same(handoff.stockAddress,report.launch?.pairedStock?.address)||handoff.market?.matchesBankrPool!==true||handoff.bankrPoolId!==report.launch?.poolId||handoff.market?.poolId!==handoff.bankrPoolId||!finitePositive(handoff.market?.reportedLiquidityUsd))throw Error('Dinn’s quote handoff failed independent pair, pool, or liquidity checks.');
 }
 return {report,handoff};
}

try{
 usage();
 const response=await fetch(baseUrl+'/api/agent/request',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({service:'base.stock-paired.research',input:{address:tokenAddress}}),signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw Error(`Dinn request failed with HTTP ${response.status}.`);
 const payload=await response.json();
 const {report,handoff}=verify(payload);
 const evidence=JSON.parse(payload.evidence.content),markdown=evidence.deliverableMarkdown||'';
 const market=report.market||{},volume=market.volumeUsd?.h24,counts=market.transactions?.h24;
 const vesting=report.vesting,fees=report.fees,contractChecks=report.contract?.checks||[];
 console.log('Dinn Base stock research / independent consumer-agent check');
 console.log(`Token: ${report.launch?.name||report.address} (${report.launch?.symbol||'unknown'})`);
 console.log(`Stock pair: ${report.stock?.name||'unverified'} (${report.stock?.symbol||'unknown'})`);
 console.log(`Pairing: ${report.classification==='verified-bankr-stock-paired-token'?'verified against Bankr launch, Base receipt, and Coinbase registry':'insufficient evidence'}`);
 console.log(`Pool: ${handoff.market?.matchesBankrPool?'exact Bankr pool matched':'not verified'} / reported liquidity $${shown(handoff.market?.reportedLiquidityUsd)}`);
 console.log(`Market activity: 24h volume ${available(volume)?`$${volume}`:'unavailable'} / buys ${available(counts?.buys)?counts.buys:'unavailable'} / sells ${available(counts?.sells)?counts.sells:'unavailable'}`);
 if(fees)console.log(`Bankr fees: ${fees.share||'share unavailable'} share / lifetime ${fees.lifetime?.status==='reported'?`${shown(fees.lifetime.lifetimeEarnedWeth)} WETH earned`:'history unavailable'} / claimable ${fees.claimable?`${shown(fees.claimable.token0)} ${fees.token0Label||'token0'}, ${shown(fees.claimable.token1)} ${fees.token1Label||'token1'}`:'unavailable'}`);
 if(vesting)console.log(`Creator vesting: ${vesting.status==='reported'?`${shown(vesting.lockedAmount)} ${vesting.tokenSymbol||report.launch?.symbol||'tokens'} reported locked (${shown(vesting.allocationPercentOfSupply)}% of supply); ends ${shown(vesting.vestingEndsAt)}`:vesting.status}`);
 console.log(`Contract checks: Base block ${report.contract?.blockNumber??'unavailable'} / ${contractChecks.map(check=>`${check.label}: ${check.status}`).join('; ')||'unavailable'}`);
 console.log(`Holders: ${report.coverage?.holders||'coverage unavailable'}`);
 console.log(`Sources: ${sourceHosts(markdown).join(', ')||'see evidence report'}`);
 console.log(`Evidence: SHA-256 verified / checked ${report.checkedAt}`);
 console.log(`Agent decision: ${handoff.status==='request_external_quote'?'REQUEST A FRESH QUOTE':'REVIEW EVIDENCE FIRST'}`);
 if(handoff.reasonCodes.length)console.log(`Why: ${handoff.reasonCodes.join(', ')}`);
 console.log(`Next step: ${handoff.nextAction}`);
 console.log(`Execution boundary: quote ${handoff.quote.status}; transaction prepared ${handoff.transaction.prepared}; signed ${handoff.transaction.signed}; broadcast ${handoff.transaction.broadcast}.`);
 console.log('No side or amount was selected. No wallet was connected and no trade was placed.');
}catch(error){
 console.error(error.message||'Dinn Base consumer-agent check failed.');
 process.exitCode=1;
}
