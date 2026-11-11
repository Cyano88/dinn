import {assertNoOtherPending} from './pending-actions.mjs';
﻿import {assertPreparedTransfer,transferIntent} from './wallet-actions.mjs';
const HASH=/^0x[0-9a-f]{64}$/i;
export function createTransferSubmitter({storage,lock,now=Date.now}){
 let busy=false,memory=new Map();
 const key=intent=>'dinn.transfer.v1:'+intent.chainId+':'+intent.account.toLowerCase();
 function read(intent){const name=key(intent);if(memory.get(name)?.warning)return memory.get(name);const raw=storage.getItem(name);if(!raw)return null;let item;try{item=JSON.parse(raw);transferIntent(item.intent);if(key(item.intent)!==name||!['awaiting-wallet','unknown','submitted','confirmed','reverted','rejected'].includes(item.state)||(item.hash&&!HASH.test(item.hash)))throw Error();}catch{throw Error('Saved transfer recovery is unreadable. Resolve it before sending again.');}return {...item,state:item.state==='awaiting-wallet'?'unknown':item.state};}
 function write(record,required=false){memory.set(key(record.intent),record);try{storage.setItem(key(record.intent),JSON.stringify(record));}catch{if(required){memory.delete(key(record.intent));throw Error('Cannot save transfer recovery data. No wallet request was made.');}record.warning='Recovery could not be saved. Keep this page open and copy the hash.';}return record;}
 return {pending:read,
  recover(intent,hash){if(!HASH.test(hash))throw Error('Enter a full transaction hash.');const record=read(intent);if(!record||record.state!=='unknown')throw Error('No unknown transfer to recover.');return write({...record,hash,state:'submitted'});},
  settle(intent,state){if(!['confirmed','reverted'].includes(state))return;const record=read(intent);if(record)write({...record,state});},
  async submit(prepared,expected,provider,isCurrent){
   if(busy)throw Error('A transfer is already in progress.');if(!lock)throw Error('This browser cannot safely lock wallet requests.');busy=true;
   try{return await lock(async()=>{
    assertNoOtherPending(storage,expected,'dinn.transfer.v1:');const existing=read(expected);if(existing&&!['confirmed','reverted','rejected'].includes(existing.state))throw Error('Resolve the previous transfer before sending again.');
    const frozen=JSON.parse(JSON.stringify(prepared)),intent=transferIntent(expected).intent;
    const tx=assertPreparedTransfer(frozen,intent,now());
    async function ready(){const [accounts,chain]=await Promise.all([provider.request({method:'eth_accounts'}),provider.request({method:'eth_chainId'})]);if(!isCurrent()||accounts[0]?.toLowerCase()!==intent.account.toLowerCase()||Number(chain)!==intent.chainId)throw Error('Wallet or network changed. Review again.');assertPreparedTransfer(frozen,intent,now());}
    await ready();
    const result=await provider.request({method:'eth_call',params:[{from:tx.from,to:tx.to,value:tx.value,data:tx.data},'latest']});
    if(intent.asset!=='native'&&result!=='0x'&&BigInt(result)!==1n)throw Error('Transfer simulation failed.');
    await ready();let record=write({state:'awaiting-wallet',intent,hash:null,createdAt:now()},true);
    try{const hash=await provider.request({method:'eth_sendTransaction',params:[tx]});if(!HASH.test(hash))throw Error('Wallet returned no valid hash.');return write({...record,state:'submitted',hash});}
    catch(error){const rejected=error.code===4001||error.code==='ACTION_REJECTED';record=write({...record,state:rejected?'rejected':'unknown'});throw Error(rejected?'Transfer declined in your wallet.':'The wallet result is unknown. Check wallet activity before sending again.');}
   });}finally{busy=false;}
  }
 };
}
