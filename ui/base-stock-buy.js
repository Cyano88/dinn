import {createPublicClient,decodeAbiParameters,encodeFunctionData,toEventSelector,erc20Abi,formatUnits,http,parseAbiParameters,parseAbi,parseUnits,zeroAddress} from 'viem';
import {base} from 'viem/chains';

const rpc=createPublicClient({chain:base,transport:http('https://mainnet.base.org')});
const holder='0x0000000000001ff3684f28c67538d4d072c22734';
const usdc='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const native='0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const registry='0x00000000000004533fe15556b1e086bb1a72ceae';
const registryAbi=parseAbi(['function ownerOf(uint256) view returns (address)','function prev(uint128) view returns (address)']);
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const ensure=ok=>{if(!ok)throw Error('Dinn could not verify this stock quote. Request a fresh one.');};
const key=account=>'dinn.multi.stock-buy.v1:'+account.toLowerCase();
const decode=(types,data)=>decodeAbiParameters(parseAbiParameters(types),'0x'+data.slice(10));

export function stockBudget(text){
 const m=text.trim().match(/^(?:spend|use|pay)?\s*(\d+(?:\.\d+)?|\.\d+)\s*(USDC|ETH)[.!]?$/i);
 return m?{amount:m[1],asset:m[2].toUpperCase()}:null;
}

export async function stockQuote({symbol,budget,account,expectedPair}, {read=fetch,client=rpc}={}){
 const decimals=budget.asset==='ETH'?18:6;
 ensure(['ETH','USDC'].includes(budget.asset)&&/^\d{0,18}(?:\.\d+)?$/.test(budget.amount)&& (budget.amount.split('.')[1]?.length||0)<=decimals);
 const amount=parseUnits(budget.amount,decimals);ensure(amount>0n);
 const reg=await read('/api/base/stocks?q='+encodeURIComponent(symbol));
 if(!reg.ok)throw Error('Stock lookup is unavailable. Try again shortly.');
 const stock=(await reg.json()).stocks.find(row=>row.chainId===8453&&same(row.symbol,symbol));
 ensure(stock&&(!expectedPair||same(stock.address,expectedPair)));
 const response=await read('https://basestocks.finance/api/v1/trade',{method:'POST',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(25000),headers:{'Content-Type':'application/json'},body:JSON.stringify({stock:stock.address,side:'buy',account,recipient:account,payWith:budget.asset,amount:String(amount),slippageBps:100})});
 if(response.status===451)throw Error('Stock purchases are restricted for this location. Your launch is saved.');
 const payload=await response.json();
 if(!response.ok)throw Error(payload.error?.code==='AMOUNT_TOO_SMALL'?'The minimum purchase is $1. Choose a new spending amount in ETH or USDC.':'A stock quote is unavailable. Try again shortly.');
 const d=payload.data,q=d?.quote,eth=budget.asset==='ETH',expiry=Date.parse(d?.expiresAt);
 ensure(d?.side==='buy'&&same(d.account,account)&&same(d.recipient,account)&&same(stock.address,d.stock.address)&&same(q.buyToken,stock.address)&&same(q.sellToken,eth?native:usdc)&&BigInt(q.sellAmount)===amount&&BigInt(q.minBuyAmount)>0n&&BigInt(q.buyAmount)>=BigInt(q.minBuyAmount)&&BigInt(q.minBuyAmount)*10000n>=BigInt(q.buyAmount)*9900n-10000n&&expiry>Date.now());
 const qty=n=>formatUnits(BigInt(n),stock.decimals);
 const dollars=eth?Number(qty(q.buyAmount))*q.priceUsd:Number(budget.amount);
 const approx=Number.isFinite(dollars)&&dollars>0?' (about $'+dollars.toFixed(2)+')':'';
 const summary='Spend '+budget.amount+' '+budget.asset+approx+' for about '+qty(q.buyAmount)+' '+stock.symbol+' on Base. Minimum received: '+qty(q.minBuyAmount)+' '+stock.symbol+'. Estimated network fee: '+(Number.isFinite(q.networkFeeUsd)?'$'+q.networkFeeUsd.toFixed(4):'unavailable')+'.';
 if(q.balanceInsufficient===true)return {message:summary+' Your wallet needs more '+budget.asset+' for this trade.'};
 ensure(q.balanceInsufficient===false&&d.provider==='zeroX'&&Array.isArray(d.calls)&&d.calls.length===(d.approval?2:1));
 const call=d.calls.at(-1);
 ensure(same(call.to,holder)&&BigInt(call.value)===(eth?amount:0n)&&call.data.startsWith('0x2213bc0b'));
 const [operator,input,size,target,inner]=decode('address,address,uint256,address,bytes',call.data);
 ensure(same(operator,target)&&same(input,eth?zeroAddress:usdc)&&size===amount&&inner.startsWith('0x1fff991f'));
 const contract={address:registry,abi:registryAbi,args:[2n]};
 const active=await client.readContract({...contract,functionName:'ownerOf'});
 ensure(same(active,target)||same(await client.readContract({...contract,functionName:'prev'}),target));
 const [,steps]=decode('(address,address,uint256),bytes[],bytes32',inner);
 const last=steps.at(-1);ensure(last?.startsWith('0x8d68a156'));
 const [recipient,,path,min]=decode('address,uint256,bytes,uint256',last);
 ensure(same(recipient,account)&&path.toLowerCase().endsWith(stock.address.slice(2).toLowerCase())&&min>=BigInt(q.minBuyAmount));
 const allowance=d.approval;
 if(allowance)ensure(!eth&&same(allowance.token,usdc)&&same(allowance.spender,holder)&&BigInt(allowance.amount)===amount);
 const swap={to:holder,value:BigInt(call.value),data:call.data};
 const tx=allowance?{to:usdc,value:0n,data:encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[holder,amount]})}:swap;
 let gas;
 try{
  const calls=(allowance?[tx,swap]:[swap]).map(c=>({...c,from:account,value:'0x'+c.value.toString(16)}));
  const [block]=await client.request({method:'eth_simulateV1',params:[{blockStateCalls:[{calls}],validation:false},'latest']});
  ensure(block.calls?.length===calls.length&&block.calls.every(c=>c.status==='0x1'));
  ensure(received(block.calls.at(-1).logs,stock.address,account)>=BigInt(q.minBuyAmount));
  gas=block.calls.reduce((sum,c)=>sum+BigInt(c.gasUsed),0n);
 }catch{throw Error('The purchase did not pass the Base simulation for this wallet. Request a new quote.');}
 if(await client.getBalance({address:account})<swap.value+gas*await client.getGasPrice())throw Error('Your Base wallet needs more ETH to cover the purchase and network fee.');
 const message=summary+(allowance?' Allow Dinn to request permission for exactly '+budget.amount+' USDC? You will review the purchase separately.':' If you are eligible to trade tokenized stocks in your jurisdiction and are not a US person, approve this purchase?');
 return {message,tx,gas,expiry,account,token:stock.address,minimum:q.minBuyAmount,permission:!!allowance,spend:String(amount),symbol:stock.symbol};
}

export async function sendStockBuy(review,{provider,embedded,storage,current},client=rpc){
 const {account,tx,expiry}=review,recordKey=key(account);
 const valid=()=>current()&&Date.now()<expiry;
 if(!valid())throw Error('Request a fresh stock quote.');
 const previous=JSON.parse(storage.getItem(recordKey)||'null');
 if(previous&&!previous.result)throw Error('Say "check stock purchase" before trying again.');
 await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x2105'}]});
 ensure(same((await provider.request({method:'eth_accounts'}))[0],account)&&BigInt(await provider.request({method:'eth_chainId'}))===8453n);
 let gas;
 try{await client.call({account,...tx});gas=await client.estimateGas({account,...tx});}
 catch{throw Error('This wallet can no longer complete the reviewed transaction. Request a fresh quote.');}
 if(!valid())throw Error('Request a fresh stock quote.');
 const record={account,token:review.token,symbol:review.symbol,minimum:review.minimum,permission:review.permission,spend:review.spend};
 await storage.setItem(recordKey,JSON.stringify(record));
 if(!valid()){await storage.removeItem(recordKey);throw Error('Request a fresh stock quote.');}
 let result;
 try{result=embedded?await embedded({from:account,...tx,chainId:8453,gas},{address:account,uiOptions:{showWalletUIs:true}}):await provider.request({method:'eth_sendTransaction',params:[{...tx,from:account,chainId:'0x2105',value:'0x'+tx.value.toString(16),gas:'0x'+gas.toString(16)}]});}
 catch(e){if(Number(e.code)===4001||e.code==='ACTION_REJECTED'){await storage.removeItem(recordKey);throw Error('Wallet approval declined.');}throw Error('Submission is uncertain. Check wallet activity before retrying.');}
 const hash=result?.hash||result;ensure(/^0x[0-9a-f]{64}$/i.test(hash));
 try{await storage.setItem(recordKey,JSON.stringify({...record,hash}));}catch{throw Error('Save this Base transaction ID: '+hash);}
 return hash;
}

function received(logs,token,account){
  const topic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const address=account.slice(2).toLowerCase().padStart(64,'0');
  return logs.filter(l=>same(l.address,token)&&l.topics[0]===topic&&l.topics.length===3).reduce((n,l)=>n+(l.topics[2].slice(2).toLowerCase()===address?BigInt(l.data):0n)-(l.topics[1].slice(2).toLowerCase()===address?BigInt(l.data):0n),0n);
}

export async function stockReceipt(account,storage,client=rpc){
 const record=JSON.parse(storage.getItem(key(account))||'null');
 if(!record)return 'There is no pending stock purchase for this wallet.';
 if(record.result)return record.result;
 if(!record.hash)return 'The submission result is unknown. Check your wallet activity before trying another purchase.';
 const link='[View Base transaction](https://basescan.org/tx/'+record.hash+')';
 let receipt;try{receipt=await client.getTransactionReceipt({hash:record.hash});}catch(e){if(e.name==='TransactionReceiptNotFoundError')return 'Pending on Base. '+link;throw e;}
 ensure(same(receipt.from,account)&&same(receipt.transactionHash,record.hash));
 if(receipt.status==='success'&&record.permission){
  ensure(same(receipt.to,usdc));
  const topic=toEventSelector('Approval(address,address,uint256)');
  ensure(receipt.logs.some(l=>same(l.address,usdc)&&l.topics[0]===topic&&l.topics.length===3&&same('0x'+l.topics[1].slice(-40),account)&&same('0x'+l.topics[2].slice(-40),holder)&&BigInt(l.data)===BigInt(record.spend)));
 }
 if(receipt.status==='success'&&!record.permission){
  ensure(same(receipt.to,holder));
  const net=received(receipt.logs,record.token,account);
  ensure(net>=BigInt(record.minimum));
 }
 const result=(receipt.status!=='success'?'The transaction reverted.':record.permission?'USDC permission confirmed. Request a fresh purchase quote.':'✓ '+record.symbol+' received in your Base wallet.')+' '+link;
 await storage.setItem(key(account),JSON.stringify({...record,result}));
 return result;
}
