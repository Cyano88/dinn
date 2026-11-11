import {tradingCapability} from './trading-venues.mjs';
// Read-only mainnet markets. This module never prepares a transaction.
import {createPublicClient,http,parseAbi,stringToHex,zeroAddress,keccak256,encodeAbiParameters,parseAbiParameters,parseUnits,formatUnits,ContractFunctionRevertedError} from 'viem';
import lensAbi from './abis/montra-LaunchLens.json' with {type:'json'};
import routerAbi from './abis/montra-LaunchRouter.json' with {type:'json'};
import {contracts,pairs} from './domain.mjs';
import {swapPool,tokenAbi,quoterAbi,keyType} from './swap-call.mjs';
import {validAddress} from './wallet-actions.mjs';
const registry='0xF1E2FA75422F889e565F3142bdbf60B28dce2aa7',same=(a,b)=>a.toLowerCase()===b.toLowerCase();
const regAbi=parseAbi(['function get(bytes32) view returns (address)','function isKnownHook(address) view returns (bool)']);
const ascAbi=parseAbi(['function poolLaunchedAt(bytes32) view returns (uint40)','function currentFee(bytes32) view returns (uint24)']);
export async function snapshot({client,now=Date.now,env=process.env}={}){
 const c=client||createPublicClient({transport:http(env.ELYSIUM_MARKET_RPC_URL||'https://rpc.montramarkets.xyz',{timeout:10000,retryCount:0})});
 if(await c.getChainId()!==99901)throw Error('Market connection is not Elysium mainnet.');
 const block=await c.getBlock();if(!block.hash||now()-Number(block.timestamp)*1000>120000||Number(block.timestamp)*1000>now()+30000)throw Error('Market data is stale. Try again shortly.');
 return {c,block,now,read:(address,abi,functionName,args=[])=>c.readContract({address,abi,functionName,args,blockNumber:block.number}),finish:async()=>{if((await c.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('Market block changed. Try again.');}};
}
export async function poolsFor(token,s){
 if(!validAddress(token))throw Error('Paste a nonzero Elysium token address.');
 const code=await s.c.getCode({address:token,blockNumber:s.block.number});if(!code||code==='0x')throw Error('No contract exists at this address on Elysium mainnet.');
 const pools=[],[lens,router]=await Promise.all(['lens','router'].map(n=>s.read(registry,regAbi,'get',[stringToHex(n,{size:32})])));
 if([lens,router].some(a=>same(a,zeroAddress)||same(a,registry)))throw Error('Montra registry is unavailable.');
 let v;try{v=await s.read(lens,lensAbi,'tokenView',[token]);}catch(e){if(!e.walk?.(x=>x instanceof ContractFunctionRevertedError))throw Error('Venue verification could not complete.');}
 if(v){const key=v.key,quote=v.config.quoteIsCurrency0?key.currency0:key.currency1;
  if(!v.config.exists||!v.config.seeded||![key.currency0,key.currency1].some(a=>same(a,token))||same(quote,token)||BigInt(key.currency0)>=BigInt(key.currency1)||!await s.read(registry,regAbi,'isKnownHook',[key.hooks]))throw Error('Pool evidence does not match this token.');
  const pair=quote===zeroAddress?'HYPE':Object.entries(pairs).find(([,p])=>same(p.address,quote))?.[0];
  if(!pair)throw Error('This Montra pool uses an unsupported quote asset.');
  pools.push({venue:'Montra',key,poolId:keccak256(encodeAbiParameters(parseAbiParameters(keyType),[key])),pair,quote,pairSymbol:pair==='HYPE'&&quote!==zeroAddress?'WHYPE':pair,router,direction:v.config.quoteIsCurrency0,feeBuy:Number(v.buyEffectiveTotalFee),feeSell:Number(v.effectiveTotalFee),evidence:['Registry-recognized hook','Token matched to seeded pool']});
 }
 for(const pair of Object.keys(pairs)){if(same(token,pairs[pair].address))continue;const {poolKey:key,poolId}=swapPool({token,pair,side:'buy'});if(await s.read(contracts.launchpad,ascAbi,'poolLaunchedAt',[poolId])){const fee=Number(await s.read(contracts.launchpad,ascAbi,'currentFee',[poolId]));pools.push({venue:'Ascend',key,poolId,pair,quote:pairs[pair].address,pairSymbol:pair==='HYPE'?'WHYPE':pair,router:contracts.router,direction:same(key.currency0,pairs[pair].address),feeBuy:fee,feeSell:fee,evidence:['Ascend launch record','Pool ID binds token and quote']});}}
 return pools;
}
const publicPool=p=>({venue:p.venue,poolId:p.poolId,route:p.venue+':'+p.poolId,pairSymbol:p.pairSymbol,evidence:p.evidence});
const stamp=s=>({chainId:99901,network:'Elysium mainnet',blockNumber:String(s.block.number),blockHash:s.block.hash,checkedAt:new Date(s.now()).toISOString()});
export async function detectMarket(input,options={}){if(!validAddress(input?.token))throw Error('Paste a nonzero Elysium token address.');const s=await snapshot(options),pools=await poolsFor(input.token,s);let asset;try{const symbol=await s.read(input.token,tokenAbi,'symbol');if(typeof symbol==='string'&&symbol.length<=32)asset={address:input.token.toLowerCase(),symbol:symbol.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,''),name:symbol};}catch{}await s.finish();return {...stamp(s),token:input.token,asset,pools:pools.map(p=>({...publicPool(p),...tradingCapability(p,options.env||process.env)})),message:pools.length?'Pool identity verified. This is not a safety rating.':'No supported Montra or Ascend pool was found.'};}
export async function marketQuote(input,options={}){
 if(!input||!validAddress(input.token)||!['buy','sell'].includes(input.side)||typeof input.amount!=='string'||!/^\d+(\.\d+)?$/.test(input.amount)||input.amount.length>80||!Number.isInteger(input.slippageBps)||input.slippageBps<10||input.slippageBps>300)throw Error('Enter a token, positive amount and slippage between 0.1% and 3%.');
 if(input.account!==undefined&&!validAddress(input.account))throw Error('Invalid wallet address.');
 const s=await snapshot(options),pools=await poolsFor(input.token,s),pool=input.route?pools.find(p=>p.venue+':'+p.poolId===input.route):pools.length===1?pools[0]:null;
 if(!pool)throw Error(pools.length>1?'Choose one of the verified pools.':'No supported pool matches this token.');
 const [decimals,rawSymbol]=await Promise.all(['decimals','symbol'].map(n=>s.read(input.token,tokenAbi,n)));
 if(!Number.isInteger(decimals)||decimals>36||typeof rawSymbol!=='string'||rawSymbol.length>32)throw Error('Unsupported token metadata.');
 const symbol=rawSymbol.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,'')||'Token',qd=pool.quote===zeroAddress?18:pairs[pool.pair].decimals,di=input.side==='buy'?qd:decimals,dout=input.side==='buy'?decimals:qd;
 if((input.amount.split('.')[1]?.length||0)>di)throw Error('Too many decimal places.');
 const units=parseUnits(input.amount,di);if(units<=0n||units>=2n**128n)throw Error('Amount is outside the supported range.');
 const dir=input.side==='buy'?pool.direction:!pool.direction;
 const call=pool.venue==='Montra'?{address:pool.router,abi:routerAbi,functionName:'quoteExactIn',args:[pool.key,dir,units]}:{address:contracts.quoter,abi:quoterAbi,functionName:'quoteExactInputSingle',args:[{poolKey:pool.key,zeroForOne:dir,exactAmount:units,hookData:'0x'}]};
 const {result}=await s.c.simulateContract({...call,blockNumber:s.block.number}),out=pool.venue==='Montra'?result:result[0],min=out*BigInt(10000-input.slippageBps)/10000n;if(min<=0n)throw Error('No usable quote for this amount.');
 let funding={state:'unknown',message:'Connect a wallet to check its Elysium mainnet balance.'};
 if(input.account){try{const asset=input.side==='buy'?pool.quote:input.token,balance=asset===zeroAddress?await s.c.getBalance({address:input.account,blockNumber:s.block.number}):await s.read(asset,tokenAbi,'balanceOf',[input.account]);funding={state:balance<units?'insufficient':'amount-covered',balance:formatUnits(balance,di),message:balance<units?'Insufficient input balance on Elysium mainnet.':'Input amount covered. Network fees and approvals still need checking.'};}catch{funding={state:'unknown',message:'Wallet balance could not be verified.'};}}
 await s.finish();return {...stamp(s),...publicPool(pool),mode:'read-only-quote',executionEnabled:false,token:input.token,side:input.side,amount:input.amount,inputSymbol:input.side==='buy'?pool.pairSymbol:symbol,outputSymbol:input.side==='buy'?symbol:pool.pairSymbol,expectedOutput:formatUnits(out,dout),minimumOutput:formatUnits(min,dout),feePips:input.side==='buy'?pool.feeBuy:pool.feeSell,slippageBps:input.slippageBps,funding,expiresAt:s.now()+30000};
}
