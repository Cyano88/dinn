import {createLaunchClient} from '@bankr/launch-sdk';
import {isAddress,parseUnits,zeroAddress} from 'viem';
import {valuationQuestion} from '../public/stock-watch.js';
import {baseStockLookup} from './base-stock-data.mjs';
import {serverRpcUrl} from './rpc-config.mjs';

// Bankr stores each launchpad payee's share of the remaining fee as a WAD.
const dinnShareBps=1000;
const dinnShareWad=BigInt(dinnShareBps)*10n**14n;
function matchesDinnFee(terms,treasury){
 const matches=shares=>shares?.length===1&&shares[0]===dinnShareWad;
 return terms?.payees?.length===1&&terms.payees[0]?.toLowerCase()===treasury.toLowerCase()
  &&matches(terms.steadySharesWad)&&(terms.decay?.on===false||terms.decay?.on===true&&matches(terms.decay.sharesWad));
}

export async function bankrLaunchPreview({ticker,name,symbol,launcher,startFdv,expectedPair},{env=process.env,lookup=baseStockLookup,client}={}){
 if(typeof ticker!=='string'||!/^[A-Z][A-Z0-9.-]{0,12}$/.test(ticker)||typeof name!=='string'||!name.trim()||name.length>40||typeof symbol!=='string'||!/^[A-Z0-9]{1,12}$/.test(symbol))throw Error('Invalid creator brief');
 client??=createLaunchClient({chain:'base',rpcUrl:serverRpcUrl(8453,env)});
 const state=await client.status();
 if(!state.deployed||state.fork)return {status:'unavailable',message:'Bankr launch contracts could not be verified on Base.'};
 if(state.paused)return {status:'paused',message:'Bankr has paused new Base launches. Your creator brief is ready to keep.'};
 if(state.gated)return {status:'gated',message:'Bankr currently restricts Base launches to its own launchpad. Your creator brief is ready to keep.'};
 const pad=env.DINN_BANKR_BASE_LAUNCHPAD_ID;
 if(!pad||!/^([1-9]\d{0,76})$/.test(pad))return {status:'setup',message:'You can keep this idea and its research. Launching a token on Base through Dinn is not available yet.'};
 const treasury=env.DINN_BANKR_BASE_FEE_RECIPIENT;
 if(!isAddress(treasury||'')||treasury.toLowerCase()===zeroAddress)return {status:'setup',message:'The Dinn Base fee wallet has not been configured.'};
 if(expectedPair!==undefined&&!isAddress(expectedPair))throw Error('Invalid Base pair address.');
 const stock=(await lookup(expectedPair?{address:expectedPair}:{query:ticker+'c'})).stocks.find(row=>row.symbol.toUpperCase()===ticker+'C'&&row.bankrPairSupported&&(!expectedPair||row.address.toLowerCase()===expectedPair.toLowerCase()));
 if(!stock)return {status:'unsupported',message:'Dinn could not verify a Base stock pair for '+ticker+' in both the Coinbase and Bankr lists.'};
 const launchpadId=BigInt(pad);
 if(!(await client.contracts().settings.padQuote(launchpadId,stock.address)).launches)return {status:'unsupported',message:'This launchpad does not currently allow '+stock.symbol+' as the pairing asset.'};
 if(!isAddress(launcher||''))return {status:'wallet',message:'Select your Base launch wallet to check this launch.'};
 const input={launchpadId,launcher,feeRecipient:launcher,name,symbol,quote:stock.address};
 let plan;
 try{
  if(startFdv!==undefined){
   if(typeof startFdv!=='string'||!/^\d{1,18}(?:\.\d{1,18})?$/.test(startFdv)||!Number.isInteger(stock.decimals)||(startFdv.split('.')[1]?.length||0)>stock.decimals)throw Error('Invalid starting value.');
   input.startFdv=parseUnits(startFdv,stock.decimals);if(input.startFdv<=0n)throw Error('Invalid starting value.');
   input.autoLpBps=0;
  }
  plan=await client.plan(input);
 }catch(e){
  if(startFdv===undefined&&e?.code==='INVALID_PARAMS'&&e.detail?.includes('set startFdv'))return {status:'valuation',message:'Your token would trade against '+stock.symbol+' on Base through Bankr. The starting value sets the opening price for your token. You can try a value here without spending funds.\n\n'+valuationQuestion(stock.symbol)};
  throw e;
 }
 if(!matchesDinnFee(plan.resolved?.padTerms,treasury))return {status:'fee-mismatch',message:'The launchpad fee terms differ from the approved Dinn split. This launch preview is unavailable.'};
 const sim=await client.simulate(plan);
 if(sim.assumedApprovals||!isAddress(sim.token)||!/^0x[a-f0-9]{64}$/i.test(sim.poolId))throw Error('Incomplete launch simulation');
 return {status:'simulated',chainId:8453,launchpadId:pad,quote:stock.address,launcher,predictedToken:sim.token,poolId:sim.poolId,creatorFeeRecipient:launcher,dinnFeeRecipient:treasury,dinnShareBps,creatorSideShareBps:10000-dinnShareBps,message:'Launch on Base with Dinn, powered by Bankr.\nBankr simulated '+name+' ($'+symbol+') paired with '+stock.symbol+' on Base. '+(startFdv?'Starting value for the full supply: '+startFdv+' '+stock.symbol+'. Automatic liquidity additions: off. ':'')+'After Bankr and any referral fee, Dinn receives 10% of the remaining trading fees. The other 90% goes to creator-side allocations. Creator fee wallet: '+launcher+'. This is a preview; nothing was signed or sent.'};
}
