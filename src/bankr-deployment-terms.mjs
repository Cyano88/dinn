import {BANKR_V4_LAUNCH_ADDRESSES,bankrLaunchSettingsAbi,createLaunchClient,padTermsHash} from '@bankr/launch-sdk';
import {decodeFunctionResult,encodeFunctionData,formatUnits,parseAbi} from 'viem';

const escrowAbi=parseAbi(['function vestingStart() view returns (uint64)']);
const percent=bps=>Number(bps)/100;

export async function bankrDeploymentTerms(receipt,token,quote,poolId,rpc,fetchImpl){
 const sdk=createLaunchClient({chain:'base',rpcUrl:rpc});
 let launch,frozen;
 try{
  launch=sdk.parseLaunchReceipt(receipt,token);
  frozen=sdk.contracts().coinTerms.fromReceipt(receipt,token);
  if(receipt.status!=='0x1'||launch.poolId!==poolId||frozen.poolId!==poolId||launch.quote.toLowerCase()!==quote)return null;
 }catch{return null;}
 const terms=frozen.terms;
 async function read(address,abi,functionName,args=[]){
  const data=encodeFunctionData({abi,functionName,args});
  const response=await fetchImpl(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_call',params:[{to:address,data},receipt.blockNumber]}),signal:AbortSignal.timeout(4500)});
  if(!response.ok)throw Error('Contract read unavailable');
  return decodeFunctionResult({abi,functionName,data:(await response.json()).result});
 }
 const [pad,start]=await Promise.allSettled([
  read(BANKR_V4_LAUNCH_ADDRESSES.base.settings,bankrLaunchSettingsAbi,'padConfig',[launch.launchpadId]),
  launch.escrow?read(launch.escrow,escrowAbi,'vestingStart'):null
 ]);
 let operatorSplit=null;
 if(pad.status==='fulfilled'&&padTermsHash(pad.value.terms)===terms.padTermsHash){
  const {payees,steadySharesWad,decay}=pad.value.terms;
  operatorSplit=payees.map((recipient,i)=>({recipient,steadyPercent:formatUnits(steadySharesWad[i],16),openingPercent:formatUnits(decay.on?decay.sharesWad[i]:steadySharesWad[i],16)}));
 }
 const startSeconds=start.status==='fulfilled'&&start.value>0n?Number(start.value):null;
 return {transactionHash:receipt.transactionHash,operatorSplit,creatorRecipients:launch.feeRecipients,
  creatorVesting:{percentOfSupply:percent(launch.vestBps),recipient:launch.vestingRecipient,escrow:launch.escrow,
   cliffSeconds:Number(terms.vestCliffSecs),durationSeconds:Number(terms.vestSecs),
   cliffEndsAt:startSeconds?new Date((startSeconds+Number(terms.vestCliffSecs))*1000).toISOString():null}};
}

export function deploymentTermsText(data){
 if(!data)return {fees:'',vesting:''};
 const creators=data.creatorRecipients.map(row=>row.recipient+' ('+percent(row.shareBps)+'% of the creator share)').join(', ');
 const operator=(data.operatorSplit||[]).map(row=>'Launchpad fee wallet '+row.recipient+' receives '+(row.openingPercent===row.steadyPercent?row.steadyPercent+'%':row.openingPercent+'% at opening and '+row.steadyPercent+'% at the steady rate')+' of fees remaining after Bankr and referral fees.').join(' ');
 const v=data.creatorVesting;
 const vesting=v.percentOfSupply>0?'At launch, '+v.percentOfSupply+'% of the token supply was allocated to creator vesting for '+v.recipient+'.'+(v.cliffEndsAt?' First unlock: '+v.cliffEndsAt.slice(0,10)+' UTC.':'')+' Vesting duration: '+v.durationSeconds/86400+' days.':'The launch set the primary creator vesting allocation to 0%. Other locks are checked separately.';
 return {fees:[operator,creators?'Creator fee recipients at launch: '+creators+'.':''].filter(Boolean).join(' '),vesting};
}
