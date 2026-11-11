import {parseAbi,parseUnits,formatUnits,encodeFunctionData,toHex,zeroAddress} from 'viem';
export const PONS_BUY_ROUTER='0xe33E9E479dF8802cb0866d5d05258bEc4cF62948';
export const erc20Abi=parseAbi(['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)','event Transfer(address indexed from,address indexed to,uint256 value)']);
export function purchaseConfig(value){
 if(value===undefined)return null;
 if(!value||Object.keys(value).some(k=>!['amount','slippageBps'].includes(k))||typeof value.amount!=='string'||!/^\d{1,40}(\.\d{1,36})?$/.test(value.amount)||!Number.isInteger(value.slippageBps)||value.slippageBps<1||value.slippageBps>500)throw Error('Enter a purchase amount and slippage between 0.01% and 5%.');
 return value;
}
export function purchaseQuote(c,q){
 const buy=purchaseConfig(c.purchase);if(!buy)return null;
 const decimals=q.pairAsset.decimals;
 if(!Number.isInteger(decimals)||decimals<0||decimals>36||(buy.amount.split('.')[1]||'').length>decimals)throw Error('Purchase amount has too many decimal places for this asset.');
 const amount=parseUnits(buy.amount,decimals),supply=BigInt(q.config.supply),phantom=BigInt(q.config.phantomQuote),threshold=BigInt(q.config.graduationThreshold),fee=BigInt(q.config.curveFeeBps),tax=BigInt(c.creatorTaxBps);
 if(amount<=0n||amount>=2n**256n||phantom<=0n||threshold<=0n||fee+tax>=10000n)throw Error('Purchase amount or launch economics are invalid.');
 const net=amount-amount*fee/10000n-amount*tax/10000n;
 const tokens=net*supply/(phantom+net),sellable=supply-supply*phantom/(phantom+threshold);
 // Keep the opening purchase below graduation; partial-fill execution is not enabled here.
 if(tokens>=sellable)throw Error('Choose a smaller opening purchase; this amount would complete the bonding curve.');
 const minimum=tokens*BigInt(10000-buy.slippageBps)/10000n;
 if(minimum<=0n)throw Error('Purchase amount is too small.');
 return {amountWei:String(amount),amount:formatUnits(amount,decimals),tokensOutWei:String(tokens),tokensOut:formatUnits(tokens,18),minTokensOutWei:String(minimum),minTokensOut:formatUnits(minimum,18),slippageBps:buy.slippageBps,recipient:c.account,asset:q.pair,router:PONS_BUY_ROUTER};
}
export function approvalTransaction(c,amount){
 if(!c.purchase||c.pairToken===zeroAddress||!/^\d+$/.test(String(amount)))throw Error('Invalid purchase approval.');
 return {from:c.account,to:c.pairToken,chainId:'0x1237',value:'0x0',data:encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[PONS_BUY_ROUTER,BigInt(amount)]})};
}
