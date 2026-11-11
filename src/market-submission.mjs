import {assertMarketReview as assertSwapReview,marketIntent as swapIntent,marketTransaction as swapTransaction} from './market-call.mjs';
import {assertNoOtherPending} from './pending-actions.mjs';
const HASH=/^0x[0-9a-f]{64}$/i;
export function createMarketSubmitter({storage,lock,now=Date.now}){
 let busy=false;const memory=new Map();const key=i=>'dinn.market.v1:'+i.chainId+':'+i.account.toLowerCase();
 function read(intent){const k=key(intent);if(memory.get(k)?.warning)return memory.get(k);const raw=storage.getItem(k);if(!raw)return null;try{const r=JSON.parse(raw);swapTransaction(r.review);if(key(r.review.intent)!==k||!['awaiting-wallet','unknown','submitted','confirmed','reverted','rejected'].includes(r.state)||(r.hash&&!HASH.test(r.hash)))throw Error();return {...r,state:r.state==='awaiting-wallet'?'unknown':r.state};}catch{throw Error('Saved swap recovery is unreadable. Resolve it before another wallet request.');}}
 function write(r,required=false){try{storage.setItem(key(r.review.intent),JSON.stringify(r));memory.delete(key(r.review.intent));}catch{if(required)throw Error('Cannot save recovery. No wallet request was made.');r.warning='Copy this hash and keep this page open. Recovery could not be saved.';memory.set(key(r.review.intent),r);}return r;}
 return {pending:read,recover(intent,hash){const r=read(intent);if(!HASH.test(hash)||r?.state!=='unknown')throw Error('Enter the hash for the unresolved wallet request.');return write({...r,hash,state:'submitted'});},settle(intent,state){if(!['confirmed','reverted'].includes(state))return;const r=read(intent);if(r)write({...r,state});},
 async submit(review,expected,provider,isCurrent){if(busy)throw Error('A wallet request is already in progress.');if(!lock)throw Error('This browser cannot safely lock wallet requests.');busy=true;
 try{return await lock(async()=>{assertNoOtherPending(storage,expected,'dinn.market.v1:');const old=read(expected);if(old&&!['confirmed','reverted','rejected'].includes(old.state))throw Error('Resolve the previous swap step first.');const frozen=JSON.parse(JSON.stringify(review)),intent=swapIntent(expected),tx=assertSwapReview(frozen,intent,now());
 const ready=async()=>{const [accounts,chain]=await Promise.all([provider.request({method:'eth_accounts'}),provider.request({method:'eth_chainId'})]);if(!isCurrent()||accounts[0]?.toLowerCase()!==intent.account.toLowerCase()||Number(chain)!==intent.chainId)throw Error('Wallet or network changed. Review again.');assertSwapReview(frozen,intent,now());};
 await ready();const result=await provider.request({method:'eth_call',params:[{from:tx.from,to:tx.to,data:tx.data,value:tx.value},'latest']});if(['approve','reset'].includes(frozen.step)&&result!=='0x'&&BigInt(result)!==1n)throw Error('Token approval simulation failed.');await ready();
 const r=write({review:frozen,state:'awaiting-wallet',hash:null},true);
 try{const hash=await provider.request({method:'eth_sendTransaction',params:[tx]});if(!HASH.test(hash))throw Error('No transaction hash');return write({...r,state:'submitted',hash});}catch(e){const rejected=e.code===4001||e.code==='ACTION_REJECTED';write({...r,state:rejected?'rejected':'unknown'});throw Error(rejected?'Declined in your wallet.':'Wallet result unknown. Check wallet activity before trying again.');}
 });}finally{busy=false;}}
 };
}
