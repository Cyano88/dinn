import {parseAbi,encodeFunctionData,decodeFunctionResult,keccak256} from 'viem';
import {assertNoOtherPending} from './pending-actions.mjs';
import {feeIntent,feeTransaction,assertFeeReview,same} from './ascend-fee-call.mjs';
import {contracts} from './domain.mjs';
const HASH=/^0x[0-9a-f]{64}$/i;
const abi=parseAbi(['function escrowOf(bytes32) view returns(address)','function poolCreator(bytes32) view returns(address)']);
const terminal=r=>r&&['confirmed','reverted','rejected'].includes(r.state);
export function createFeeSubmitter({storage,lock,now=Date.now}){
 let busy=false;const memory=new Map();
 const key=account=>'dinn.fees.v1:99901:'+account.toLowerCase();
 function read(account){const k=key(account);if(memory.get(k)?.warning)return memory.get(k);const raw=storage.getItem(k);if(!raw)return null;try{const r=JSON.parse(raw);feeTransaction(r.review);if(!same(r.review.intent.account,account)||!['awaiting-wallet','unknown','submitted','confirming','confirmed','reverted','rejected','unverified'].includes(r.state)||(r.hash!==null&&!HASH.test(r.hash)))throw Error();return {...r,state:r.state==='awaiting-wallet'?'unknown':r.state};}catch{throw Error('Saved fee recovery is unreadable. Resolve it before sending again.');}}
 function write(r,required=false){const k=key(r.review.intent.account);memory.set(k,r);try{storage.setItem(k,JSON.stringify(r));}catch{if(required){memory.delete(k);throw Error('Cannot save fee recovery. No wallet request was made.');}r.warning='Keep this page open and copy the hash; recovery could not be saved.';}return r;}
 return {pending:read,
 recover(account,hash){if(busy)throw Error('Wait for the wallet request.');const r=read(account);if(r?.state!=='unknown'||!HASH.test(hash))throw Error('Enter the wallet hash for the unresolved fee action.');return write({...r,hash,state:'submitted'});},
 acknowledge(account,result){const r=read(account);if(busy||!r?.hash||!same(r.hash,result.hash)||result.chainId!==99901||!same(result.escrow,r.review.escrow)||!same(result.inputHash,keccak256(feeTransaction(r.review).data)))throw Error('Receipt does not match the saved fee action.');if(!['confirmed','confirming','reverted','unverified'].includes(result.state))throw Error('Unexpected fee receipt state.');return write({...r,state:result.state});},
 async submit(prepared,expected,provider,isCurrent=()=>true){
 if(busy||!lock)throw Error('A safe wallet request is not available.');busy=true;
 try{return await lock(async()=>{
 const i=feeIntent(expected),r=structuredClone(prepared.review);if(prepared.executionEnabled!==true)throw Error('Fee execution is disabled.');
 assertNoOtherPending(storage,i,'dinn.fees.v1:');const old=read(i.account);if(old&&!terminal(old))throw Error('Resolve the previous fee action first.');
 const tx=assertFeeReview(r,i,now());
 async function ready(){const [accounts,chain]=await Promise.all([provider.request({method:'eth_accounts'}),provider.request({method:'eth_chainId'})]);if(!isCurrent()||!same(accounts[0],i.account)||Number(chain)!==99901)throw Error('Wallet changed. Review again.');assertFeeReview(r,i,now());}
 await ready();
 for(const [address,functionName] of [[contracts.factory,'escrowOf'],[contracts.launchpad,'poolCreator']]){const data=await provider.request({method:'eth_call',params:[{to:address,data:encodeFunctionData({abi,functionName,args:[r.poolId]})},'latest']});if(!same(decodeFunctionResult({abi,functionName,data}),r.escrow))throw Error('Creator escrow changed. Check fees again.');}
 await provider.request({method:'eth_call',params:[{from:tx.from,to:tx.to,data:tx.data,value:'0x0'},'latest']});await ready();
 const record=write({review:r,state:'awaiting-wallet',hash:null,createdAt:now()},true);
 try{const hash=await provider.request({method:'eth_sendTransaction',params:[tx]});if(!HASH.test(hash))throw Error();return write({...record,hash,state:'submitted'});}catch(e){return write({...record,state:e.code===4001||e.code==='ACTION_REJECTED'?'rejected':'unknown'});}
 });}finally{busy=false;}
 }};
}
