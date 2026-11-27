import test from 'node:test';
import assert from 'node:assert/strict';
import {stockBudget,stockQuote,sendStockBuy,stockReceipt} from '../ui/base-stock-buy.js';
import {encodeAbiParameters,parseAbiParameters,zeroAddress} from 'viem';
const stock={chainId:8453,symbol:'NFLXc',decimals:8,address:'0xb20000000000000000000058b8c947e44011dfe6'};
const account='0x'+'12'.repeat(20),settler='0x'+'34'.repeat(20),holder='0x0000000000001ff3684f28c67538d4d072c22734',hash='0x'+'11'.repeat(32);
const args={account,symbol:stock.symbol,budget:{amount:'0.001',asset:'ETH'}},amount=1000000000000000n;
const enc=(selector,types,values)=>selector+encodeAbiParameters(parseAbiParameters(types),values).slice(2);
function sample(){
 const last=enc('0x8d68a156','address,uint256,bytes,uint256',[account,1000000n,stock.address,99000n]);
 const inner=enc('0x1fff991f','(address,address,uint256),bytes[],bytes32',[[zeroAddress,zeroAddress,0n],[last],hash]);
 const data=enc('0x2213bc0b','address,address,uint256,address,bytes',[settler,zeroAddress,amount,settler,inner]);
 return {account,recipient:account,side:'buy',stock,provider:'zeroX',quote:{buyToken:stock.address,sellToken:'0x'+'ee'.repeat(20),sellAmount:String(amount),buyAmount:'100000',minBuyAmount:'99000',balanceInsufficient:false},calls:[{to:holder,data,value:String(amount)}],expiresAt:new Date(Date.now()+60000).toISOString()};
}
const receivedLog={address:stock.address,topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',hash,'0x'+account.slice(2).padStart(64,'0')],data:'0x186a0'};
const client={request:async()=>[{calls:[{status:'0x1',gasUsed:'0x64',logs:[receivedLog]}]}],call:async()=>{},estimateGas:async()=>100n,getGasPrice:async()=>1n,getBalance:async()=>2n*amount,readContract:async()=>settler};
const mock=(body,status=200)=>({client,read:async url=>url.startsWith('/')?Response.json({stocks:[stock]}):Response.json(body,{status})});
test('budget parsing preserves units',()=>{assert.deepEqual(stockBudget('spend .05 ETH'),{amount:'.05',asset:'ETH'});assert.equal(stockBudget('0.01 NFLXc'),null);});
test('rejects blocked regions and exposes the minimum without increasing the budget',async()=>{
 await assert.rejects(stockQuote(args,mock({},451)),/restricted/);
 await assert.rejects(stockQuote(args,mock({error:{code:'AMOUNT_TOO_SMALL'}},400)),/minimum purchase/);
 const data=sample();data.quote.balanceInsufficient=true;
 const review=await stockQuote(args,mock({data}));assert.equal(review.tx,undefined);assert.match(review.message,/needs more ETH/);
});
test('checks the wallet, registry, output minimum and expiry before approving',async()=>{
 for(const alter of [d=>d.recipient=settler,d=>d.quote.buyToken=settler,d=>d.calls[0].to=settler,d=>d.quote.minBuyAmount='99999',d=>d.expiresAt='1970-01-01']){
  const data=sample();alter(data);await assert.rejects(stockQuote(args,mock({data})));
 }
});
test('review, approval, pending protection and verified stock receipt',async()=>{
 const review=await stockQuote(args,mock({data:sample()})),rows=new Map();
 const storage={getItem:k=>rows.get(k),setItem:(k,v)=>rows.set(k,v),removeItem:k=>rows.delete(k)};
 const provider={request:async({method})=>({eth_accounts:[account],eth_chainId:'0x2105',eth_sendTransaction:hash}[method])};
 const opts={storage,provider,current:()=>true};
 assert.equal(await sendStockBuy(review,opts,client),hash);
 await assert.rejects(sendStockBuy(review,opts,client),/before trying/);
 const topic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
 const receipt={transactionHash:hash,to:holder,from:account,status:'success',logs:[]};
 const reading={getTransactionReceipt:async()=>receipt};
 await assert.rejects(stockReceipt(account,storage,reading));assert.equal(rows.size,1);
 receipt.logs=[{address:stock.address,topics:[topic,hash,'0x'+account.slice(2).padStart(64,'0')],data:'0x186a0'}];
 assert.match(await stockReceipt(account,storage,reading),/NFLXc received/);assert.match(await stockReceipt(account,storage,reading),/NFLXc received/);
});

test('wallet stays selected across the temporary Base switch and returns to its original chain',async()=>{
 const review=await stockQuote(args,mock({data:sample()}));
 let chain='0x1237',guard=false;
 const provider={request:async({method,params})=>{
  if(method==='eth_chainId')return chain;
  if(method==='wallet_switchEthereumChain'){assert.ok(guard);chain=params[0].chainId;return;}
  if(method==='eth_accounts')return [account];
  if(method==='eth_sendTransaction'){assert.equal(chain,'0x2105');return hash;}
 }};
 const storage={getItem:()=>null,setItem:async()=>{}};
 assert.equal(await sendStockBuy(review,{storage,provider,current:()=>guard,onSwitch:value=>{guard=value;}},client),hash);
 assert.equal(chain,'0x1237');assert.equal(guard,false);
});
