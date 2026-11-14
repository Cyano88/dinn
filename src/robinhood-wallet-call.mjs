import {encodeFunctionData,parseAbi,parseUnits,toHex,zeroAddress} from 'viem';
export const ZERO=zeroAddress;
export const networks={4663:{name:'Robinhood Chain',slug:'robinhood',rpc:'https://rpc.mainnet.chain.robinhood.com',explorer:'https://robinhoodchain.blockscout.com'},8453:{name:'Base',slug:'base',rpc:'https://mainnet.base.org',explorer:'https://basescan.org'},42161:{name:'Arbitrum',slug:'arbitrum',rpc:'https://arb1.arbitrum.io/rpc',explorer:'https://arbiscan.io'}};
export const assets={4663:[{address:ZERO,symbol:'ETH',decimals:18},{address:'0x5fc5360d0400a0fd4f2af552add042d716f1d168',symbol:'USDG',decimals:6},{address:'0x0bd7d308f8e1639fab988df18a8011f41eacad73',symbol:'WETH',decimals:18}],8453:[{address:ZERO,symbol:'ETH',decimals:18},{address:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',symbol:'USDC',decimals:6},{address:'0xfde4c96c8593536e31f229ea8f37b2ada2699bb2',symbol:'USDT',decimals:6}],42161:[{address:ZERO,symbol:'ETH',decimals:18},{address:'0xaf88d065e77c8cc2239327c5edb3a432268e5831',symbol:'USDC',decimals:6},{address:'0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',symbol:'USDT',decimals:6}]};
export const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
export const address=a=>typeof a==='string'&&/^0x[0-9a-f]{40}$/i.test(a)&&!same(a,ZERO);
export const hash=h=>typeof h==='string'&&/^0x[0-9a-f]{64}$/i.test(h);
export const erc20=parseAbi(['function balanceOf(address) view returns(uint256)','function decimals() view returns(uint8)','function symbol() view returns(string)','function name() view returns(string)','function transfer(address,uint256) returns(bool)','event Transfer(address indexed from,address indexed to,uint256 value)']);
const burnAbi=parseAbi(['function burn(uint256)']);
export function units(amount,decimals){if(!Number.isInteger(decimals)||decimals<0||decimals>36||typeof amount!=='string'||!/^\d+(\.\d+)?$/.test(amount)||amount.length>78||(amount.split('.')[1]?.length||0)>decimals)throw Error('Enter an amount within the token precision.');const n=parseUnits(amount,decimals);if(n<=0n||n>=2n**256n)throw Error('Enter a positive supported amount.');return n;}
export function walletTransaction(q){
 if(!['send','bridge','swap','burn'].includes(q?.kind)||!networks[q.chainId]||!address(q.account)||!address(q.recipient)||!/^0x[0-9a-f]{40}$/i.test(q.asset?.address||''))throw Error('Invalid wallet review.');
 if(q.kind==='burn'){
  if(q.chainId!==4663||q.burnAdapter!=='pons-v2-self-burn'||q.sourceProfile!=='pons-v2-fixed-supply'||!same(q.account,q.recipient)||same(q.asset.address,ZERO)||!Number.isInteger(q.asset.decimals)||q.asset.decimals<0||q.asset.decimals>36||typeof q.asset.symbol!=='string'||!q.asset.symbol||q.asset.symbol.length>24||/[\x00-\x1f\x7f]/.test(q.asset.symbol)||typeof q.amountRaw!=='string'||!/^\d+$/.test(q.amountRaw)||typeof q.supplyBeforeRaw!=='string'||!/^\d+$/.test(q.supplyBeforeRaw)||typeof q.balanceBeforeRaw!=='string'||!/^\d+$/.test(q.balanceBeforeRaw)||typeof q.blockNumber!=='string'||!/^\d+$/.test(q.blockNumber)||!hash(q.blockHash))throw Error('Invalid Pons burn review.');
  const n=units(q.amount,q.asset.decimals);if(n.toString()!==q.amountRaw||n>BigInt(q.supplyBeforeRaw)||n>BigInt(q.balanceBeforeRaw))throw Error('Burn amount differs from the reviewed balance or supply.');
  return {from:q.account,to:q.asset.address,chainId:toHex(4663),value:'0x0',data:encodeFunctionData({abi:burnAbi,functionName:'burn',args:[n]})};
 }
 if(q.kind==='bridge'&&![8453,42161].includes(q.chainId))throw Error('Bridge is available from Base or Arbitrum.');
 if(q.kind==='send'&&q.chainId!==4663&&!assets[q.chainId].some(a=>same(a.address,q.asset.address)&&a.decimals===q.asset.decimals))throw Error('On Base and Arbitrum, send ETH, USDC or USDT.');
 const n=units(q.amount,q.asset.decimals);
 if(q.kind!=='send'&&(!hash(q.requestId)||!address(q.depositAddress)||q.destinationChainId!==(q.kind==='swap'?q.chainId:4663)||!same(q.account,q.recipient)))throw Error('Invalid route destination.');
 if(q.kind!=='send'&&q.chainId!==4663&&!assets[q.chainId].some(a=>same(a.address,q.asset.address)&&a.decimals===q.asset.decimals))throw Error('Unsupported source asset.');
 if(q.kind==='swap'&&q.chainId!==4663&&!assets[q.chainId].some(a=>same(a.address,q.outputAsset?.address)&&a.decimals===q.outputAsset?.decimals))throw Error('Unsupported swap receive asset.');
 const to=q.kind==='send'?q.recipient:q.depositAddress;
 return {from:q.account,to:same(q.asset.address,ZERO)?to:q.asset.address,chainId:toHex(q.chainId),value:toHex(same(q.asset.address,ZERO)?n:0n),data:same(q.asset.address,ZERO)?'0x':encodeFunctionData({abi:erc20,functionName:'transfer',args:[to,n]})};
}
export function validatedWalletReview(q,now=Date.now()){const tx=walletTransaction(q);if(q.simulated!==true||!Number.isFinite(q.expiresAt)||q.expiresAt<=now||q.expiresAt>now+125000)throw Error('Review expired. Check again.');if(Object.keys(q.transaction||{}).some(k=>!Object.hasOwn(tx,k)))throw Error('Unexpected transaction fields.');for(const k of Object.keys(tx))if(!same(tx[k],q.transaction?.[k]))throw Error('Transaction differs from the review.');return tx;}
