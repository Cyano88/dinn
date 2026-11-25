import {createLaunchClient} from '@bankr/launch-sdk';
import {isAddress} from 'viem';
import {baseStockLookup} from './base-stock-data.mjs';
import {serverRpcUrl} from './rpc-config.mjs';

export async function bankrLaunchPreview({ticker,name,symbol,launcher},{env=process.env,lookup=baseStockLookup,client}={}){
 if(typeof ticker!=='string'||!/^[A-Z][A-Z0-9.-]{0,12}$/.test(ticker)||typeof name!=='string'||!name.trim()||name.length>40||typeof symbol!=='string'||!/^[A-Z0-9]{1,12}$/.test(symbol))throw Error('Invalid creator brief');
 client??=createLaunchClient({chain:'base',rpcUrl:serverRpcUrl(8453,env)});
 const state=await client.status();
 if(!state.deployed||state.fork)return {status:'unavailable',message:'Bankr launch contracts could not be verified on Base.'};
 if(state.paused)return {status:'paused',message:'Bankr has paused new Base launches. Your creator brief is ready to keep.'};
 if(state.gated)return {status:'gated',message:'Bankr currently restricts Base launches to its own launchpad. Your creator brief is ready to keep.'};
 const pad=env.DINN_BANKR_BASE_LAUNCHPAD_ID;
 if(!pad||!/^([1-9]\d{0,76})$/.test(pad))return {status:'setup',message:'You can keep this idea and its research. Launching a token on Base through Dinn is not available yet.'};
 const stock=(await lookup({query:ticker+'c'})).stocks.find(row=>row.symbol.toUpperCase()===ticker+'C'&&row.bankrPairSupported);
 if(!stock)return {status:'unsupported',message:'Dinn could not verify a Base stock pair for '+ticker+' in both the Coinbase and Bankr lists.'};
 const launchpadId=BigInt(pad);
 if(!(await client.contracts().settings.padQuote(launchpadId,stock.address)).launches)return {status:'unsupported',message:'This launchpad does not currently allow '+stock.symbol+' as the pairing asset.'};
 if(!isAddress(launcher||''))return {status:'wallet',message:'Select your Base launch wallet to check this launch.'};
 const plan=await client.plan({launchpadId,launcher,feeRecipient:launcher,name,symbol,quote:stock.address});
 const sim=await client.simulate(plan);
 if(sim.assumedApprovals||!isAddress(sim.token)||!/^0x[a-f0-9]{64}$/i.test(sim.poolId))throw Error('Incomplete launch simulation');
 return {status:'simulated',chainId:8453,launchpadId:pad,quote:stock.address,launcher,predictedToken:sim.token,poolId:sim.poolId,creatorFeeRecipient:launcher,message:'Launch on Base with Dinn, powered by Bankr.\nBankr simulated '+name+' ($'+symbol+') paired with '+stock.symbol+' on Base. Creator fee wallet: '+launcher+'. This is a preview; nothing was signed or sent.'};
}
