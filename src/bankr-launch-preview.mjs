import {createLaunchClient} from '@bankr/launch-sdk';
import {encodeFunctionData,erc20Abi,formatUnits,formatEther,isAddress,keccak256,parseUnits,zeroAddress} from 'viem';
import {readContract,estimateGas,getGasPrice} from 'viem/actions';
import {valuationQuestion} from '../public/stock-watch.js';
import {firstBuySimulation} from './bankr-first-buy-simulation.mjs';
import {marketSnapshot} from './base-stock-research.mjs';
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

export function purchaseUsdEstimate(stock,amount,market,now=Date.now()){
 const checked=Date.parse(market?.checkedAt);
 const pool=market?.pairs?.find(pair=>pair.tokenIsBase&&pair.baseToken.address.toLowerCase()===stock.address.toLowerCase()&&pair.tokenPriceUsd>0&&pair.volume1hUsd>0&&pair.liquidityUsd>0);
 if(!pool||!Number.isFinite(checked)||checked>now||now-checked>120000)return 'USD estimate unavailable.';
 const dollars=Number(amount)*pool.tokenPriceUsd;
 if(!Number.isFinite(dollars)||dollars<=0)return 'USD estimate unavailable.';
 const value=dollars<0.01?'less than $0.01':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(dollars);
 const date=new Date(checked).toISOString().slice(0,19).replace('T',' ');
 return 'Estimated purchase value: '+value+' USD. [DEX Screener](https://dexscreener.com/base/'+pool.pairAddress+'), checked '+date+' UTC. Gas is separate.';
}

export async function bankrLaunchPreview({ticker,name,symbol,launcher,startFdv,expectedPair,assets,openingPurchase},{readMarket=marketSnapshot,readBalance=async(client,address,owner)=>readContract(client,{address,abi:erc20Abi,functionName:'balanceOf',args:[owner]}),publishMetadata,env=process.env,lookup=baseStockLookup,client}={}){
 if(typeof ticker!=='string'||!/^[A-Z][A-Z0-9.-]{0,12}$/.test(ticker)||typeof name!=='string'||!name.trim()||name.length>40||typeof symbol!=='string'||!/^[A-Z0-9]{1,12}$/.test(symbol))throw Error('Invalid creator brief');
 const providedClient=client;
 let simulatedPermission=false;
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
 const askBuy='Would you like to buy some $'+symbol+' for your wallet at launch? Enter how much '+stock.symbol+' to spend, or say "skip purchase". Gas is paid separately in ETH.';
 const buying=openingPurchase!==undefined&&openingPurchase!=='skip';
 let usdEstimate='';
 if(buying){
  if(typeof openingPurchase!=='string'||!/^\d{1,18}(?:\.\d+)?$/.test(openingPurchase)||!Number.isInteger(stock.decimals)||(openingPurchase.split('.')[1]?.length||0)>stock.decimals)return {status:'purchase',message:'Enter a positive amount with up to '+stock.decimals+' decimal places. '+askBuy};
  const amount=parseUnits(openingPurchase,stock.decimals);
  if(amount<=0n)return {status:'purchase',message:askBuy};
  const [balance,market]=await Promise.all([readBalance(client.publicClient,stock.address,launcher),readMarket(stock.address.toLowerCase(),{fetchImpl:fetch,signal:AbortSignal.timeout(3000)}).catch(()=>null)]);
  usdEstimate=purchaseUsdEstimate(stock,openingPurchase,market);
  if(balance<amount)return {status:'purchase',message:openingPurchase+' '+stock.symbol+'. '+usdEstimate+'\n\nYour Base wallet holds '+formatUnits(balance,stock.decimals)+' '+stock.symbol+'. '+(balance===0n?'Fund your wallet with '+stock.symbol+' and retry,':'Enter a smaller amount')+' or say "skip purchase".'};
  input.devBuy={amount,slippageBps:100};
  if(!providedClient){
   const simulated=await firstBuySimulation(client,launcher,stock.address,amount);
   simulatedPermission=simulated!==client;client=simulated;
  }
 }
 let metadata;
 if(assets){
  metadata=await publishMetadata({description:assets.description,image:assets.image,website:assets.website,name,symbol});
  input.metadataUri=metadata.metadataUri;
 }
 let plan;
 try{
  if(startFdv!==undefined){
   if(typeof startFdv!=='string'||!/^\d{1,18}(?:\.\d{1,18})?$/.test(startFdv)||!Number.isInteger(stock.decimals)||(startFdv.split('.')[1]?.length||0)>stock.decimals)throw Error('Invalid starting value.');
   input.startFdv=parseUnits(startFdv,stock.decimals);if(input.startFdv<=0n)throw Error('Invalid starting value.');
   input.autoLpBps=0;
  }
  if(startFdv!==undefined&&openingPurchase===undefined)return {status:'purchase',message:askBuy};
  plan=await client.plan(input);
 }catch(e){
  if(startFdv===undefined&&e?.code==='INVALID_PARAMS'&&e.detail?.includes('set startFdv'))return {status:'valuation',message:'Your token would trade against '+stock.symbol+' on Base through Bankr. The starting value sets the opening price for your token. You can try a value here without spending funds.\n\n'+valuationQuestion(stock.symbol)};
  if(buying&&simulatedPermission)return {status:'purchase',message:'Bankr could not verify a first-buy quote for this amount. Try another amount or say "skip purchase". No spending permission has been requested.'};
  if(buying&&['CREATOR_CAP_EXCEEDED','DEV_BUY_UNAVAILABLE'].includes(e?.code))return {status:'purchase',message:e.code==='CREATOR_CAP_EXCEEDED'?'That purchase exceeds the permitted size. Try a smaller amount or say "skip purchase".':'Bankr could not include this purchase in the launch. Say "skip purchase" to review a launch without it.'};
  throw e;
 }
 if(!matchesDinnFee(plan.resolved?.padTerms,treasury))return {status:'fee-mismatch',message:'The launchpad fee terms differ from the approved Dinn split. This launch preview is unavailable.'};
 if(openingPurchase===undefined)return {status:'purchase',message:askBuy};
 const sim=await client.simulate(plan);
 let buyText='No opening purchase.';
 if(buying){
  const minimum=plan.params.devBuyMinOut;
  if(plan.value!==0n||plan.params.devBuyAmountIn!==input.devBuy.amount||minimum<=0n||sim.devBuyOut<minimum)throw Error('Opening purchase simulation mismatch.');
  buyText='Your wallet spends '+openingPurchase+' '+stock.symbol+' for an estimated '+formatUnits(sim.devBuyOut,18)+' '+symbol+'. Minimum received: '+formatUnits(minimum,18)+' '+symbol+' (1% price protection). '+usdEstimate;
  if(plan.approvals.length){
   const approval=plan.approvals[0],expected=encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[plan.factory,input.devBuy.amount]});
   if(plan.approvals.length!==1||approval.chainId!==8453||approval.value!==0n||approval.from.toLowerCase()!==launcher.toLowerCase()||approval.to.toLowerCase()!==stock.address.toLowerCase()||approval.data.toLowerCase()!==expected.toLowerCase())throw Error('Unexpected purchase permission.');
   const gas=await estimateGas(client.publicClient,{account:launcher,to:stock.address,data:expected});
   const price=await getGasPrice(client.publicClient);
   return {status:'approval',launcher,approval:{to:stock.address,data:expected,from:launcher,expiry:Date.now()+180000},message:buyText+'\n\nAllow Bankr to spend exactly '+openingPurchase+' '+stock.symbol+' for this purchase? This permission is a separate transaction. Estimated execution fee: '+formatEther(gas*price)+' ETH plus Base data fees. You will review the launch separately.'};
  }
 }

 if(simulatedPermission)return {status:'purchase',message:'Your spending permission changed during the check. Enter the amount again for a fresh launch review.'};
 if(sim.assumedApprovals||!isAddress(sim.token)||!/^0x[a-f0-9]{64}$/i.test(sim.poolId))throw Error('Incomplete launch simulation');
 let feeSummary='',execution;
 const percent=pips=>Number((pips/10000).toFixed(6));
 const split=plan.volumeSplit;
 if(split){
  const {buy,sell}=plan.economics;
  if(buy.steadyPips===sell.steadyPips&&buy.steadyPips===split.feePips){
   feeSummary=' Once opening fees end, each $100 traded costs $'+percent(split.feePips)+' in pool fees. Your fee wallet earns the equivalent of $'+percent(split.creatorPips)+'.';
   for(const [side,schedule] of [['Buy',buy],['Sell',sell]]){
    if(schedule.startPips!==schedule.steadyPips)feeSummary+=' '+side+' fees start at '+percent(schedule.startPips)+'% and reach '+percent(schedule.steadyPips)+'% after '+schedule.decaySecs+' seconds.';
   }
   if(plan.extension==null&&plan.value===0n&&plan.approvals.length===0&&plan.predictedToken.toLowerCase()===sim.token.toLowerCase()&&plan.poolId===sim.poolId){
    const tx=client.buildLaunchTx(plan);
    const expiry=Math.min(Number(plan.params.deadline)*1000,Date.now()+180000);
    if(tx.chainId!==8453||tx.from.toLowerCase()!==launcher.toLowerCase()||tx.to.toLowerCase()!==plan.factory.toLowerCase()||tx.value!==0n)throw Error('Unexpected launch transaction');
    if(Number.isSafeInteger(expiry)&&expiry>Date.now()&&tx.gas){
     const price=await getGasPrice(client.publicClient);
     execution={from:launcher,to:tx.to,data:tx.data,gas:'0x'+tx.gas.toString(16),callHash:keccak256(tx.data),expiry};
     feeSummary+=' Estimated Base execution gas allowance: '+formatEther(tx.gas*price)+' ETH, plus the Base data fee.';
    }
   }
  }
 }
 return {status:'simulated',execution,chainId:8453,launchpadId:pad,quote:stock.address,launcher,predictedToken:sim.token,poolId:sim.poolId,creatorFeeRecipient:launcher,dinnFeeRecipient:treasury,dinnShareBps,creatorSideShareBps:10000-dinnShareBps,message:'Launch on Base with Dinn, powered by Bankr.\n\nBankr simulated '+name+' ($'+symbol+') paired with '+stock.symbol+' on Base. '+(startFdv?'Starting value for the full supply: '+startFdv+' '+stock.symbol+'. Automatic liquidity additions: off. ':'')+'After Bankr and any referral fee, Dinn receives 10% of the remaining trading fees. The other 90% goes to creator-side allocations. Creator fee wallet: '+launcher+'.'+(metadata?'\n\nLogo: '+(metadata.doc.image||'Skipped')+'\n\nWebsite: '+(metadata.doc.external_url||'Skipped')+'\n\n':'')+'\n\n'+buyText+feeSummary+(execution?' Approve this launch in your wallet?':' This is a preview; nothing was signed or sent.')};
}
