const hash=v=>typeof v==='string'&&/^0x[0-9a-f]{64}$/i.test(v);const address=v=>typeof v==='string'&&/^0x[0-9a-f]{40}$/i.test(v)&&!/^0x0{40}$/i.test(v);
export function confirmedLaunchToken(result){return result?.state==='verified'&&result.chainId===4663&&hash(result.hash)&&address(result.token)&&address(result.curve)?result.token:null;}
export function mountLaunchActivity({getAccount,getEpoch,getRecord,setRecord,api,onResearch,onDex,onPonsWallet=()=>{},onStatus=()=>{},doc=document,interval=5000}){
 const $=id=>doc.getElementById(id);let timer=null,controller=null,revision=0,attempts=0,token=null;
 const identity=r=>JSON.stringify({hash:r?.hash,configuration:r?.configuration,quote:r?.quote});
 function hideActions(){token=null;$('launch-activity').className='';$('launch-next-actions').hidden=true;$('launched-contract').removeAttribute('href');$('launched-pons').removeAttribute('href');}
 function stop(){revision++;clearTimeout(timer);controller?.abort();controller=null;hideActions();}
 function schedule(){if(attempts>=12){$('launch-activity').textContent+=' Automatic checking paused. Use Check status to continue.';return;}timer=setTimeout(()=>refresh(false),interval);}
 async function refresh(manual=true){clearTimeout(timer);controller?.abort();const rev=++revision,epoch=getEpoch(),account=getAccount(),r=getRecord();hideActions();if(!r||!account)return;
  const txHash=manual?$('recover-hash').value.trim():r.hash;
  if(!hash(txHash)){if(manual)$('launch-activity').textContent='Enter the transaction hash from your wallet. No transaction will be sent.';return;}
  if(r.hash&&r.hash.toLowerCase()!==txHash.toLowerCase()){$('launch-activity').textContent='Use the saved launch transaction hash.';return;}
  if(r.configuration?.account?.toLowerCase()!==account.toLowerCase()||r.configuration?.chainId!==4663){$('launch-activity').textContent='Saved launch does not match the connected wallet and network.';return;}
  if(manual)attempts=0;attempts++;const before=identity(r);const request=new AbortController();controller=request;$('check-receipt').disabled=true;$('launch-activity').textContent='Checking the exact launch transaction…';
  try{const result=await api('/api/pons/receipt',{hash:txHash,configuration:r.configuration,quote:r.quote},request.signal);if(rev!==revision||epoch!==getEpoch()||account!==getAccount()||identity(getRecord())!==before)return;
   if(!['pending','confirming','verified','reverted'].includes(result.state)||result.hash?.toLowerCase()!==txHash.toLowerCase())throw Error('Unexpected receipt result.');
   const verifiedToken=confirmedLaunchToken(result);if(result.state==='verified'&&!verifiedToken)throw Error('Confirmed receipt did not include valid deployed contracts.');const next={...r,hash:txHash,phase:result.state==='pending'?'submitted':result.state,result};setRecord(next);$('recover-hash').value=txHash;
   const labels={pending:'Transaction pending or not yet found. Checking again automatically…',confirming:'Launch mined. Waiting for confirmation…',verified:'\u2713 Token deployed. Confirmed on Robinhood Chain.',reverted:'Launch transaction reverted. No successful token launch was verified.'};$('launch-activity').textContent=labels[result.state];
   token=verifiedToken;$('launch-activity').className=token?'operation-success':'';
   if(token){$('launch-activity').textContent+=' Token: '+token+'. Next: open View token, or explore its activity below.';$('launched-contract').href='https://robinhoodchain.blockscout.com/token/'+token;$('launched-pons').href='https://ponsfamily.com/launchpad/'+token;$('pons-handoff-note').textContent='On Pons, connect your launch wallet: '+account+'. Opening this page does not connect a wallet.';$('launch-next-actions').hidden=false;}
   onStatus({result,token,account,hash:txHash});
   if(['pending','confirming'].includes(result.state))schedule();
  }catch(e){if(rev===revision&&epoch===getEpoch()&&e.name!=='AbortError'){$('launch-activity').textContent=r.phase==='verified'?'Latest receipt recheck unavailable. The saved launch was previously verified.':'Status check incomplete: '+e.message+' No new transaction was sent.';if(r.phase!=='verified')onStatus({error:e.message,account,hash:txHash});if(!manual&&attempts<3)schedule();}}
  finally{if(rev===revision){controller=null;$('check-receipt').disabled=false;}}
 }
 function restore(){stop();attempts=0;$('check-receipt').disabled=false;const r=getRecord();$('launch-recovery').hidden=!r;$('recover-hash').value=hash(r?.hash)?r.hash:'';if(!r)return;
  const savedToken=r.phase==='verified'&&r.configuration?.chainId===4663&&r.configuration?.account?.toLowerCase()===getAccount()?.toLowerCase()&&r.result?.hash?.toLowerCase()===r.hash?.toLowerCase()?confirmedLaunchToken(r.result):null;
  if(savedToken){token=savedToken;$('launch-activity').textContent='✓ Previously verified launch on Robinhood Chain. Token: '+savedToken+'.';$('launch-activity').className='operation-success';$('launched-contract').href='https://robinhoodchain.blockscout.com/token/'+savedToken;$('launched-pons').href='https://ponsfamily.com/launchpad/'+savedToken;$('pons-handoff-note').textContent='On Pons, connect your launch wallet: '+getAccount()+'. Opening this page does not connect a wallet.';$('launch-next-actions').hidden=false;return;}
  $('launch-activity').textContent=({rejected:'Wallet request declined.',reverted:'Saved reverted transaction.',verified:'Rechecking the previously confirmed launch…',confirming:'Rechecking launch confirmation…',submitted:'Checking submitted launch…','awaiting-wallet':'Wallet outcome is unknown. Check wallet activity before retrying.',unknown:'Wallet outcome is unknown. Check wallet activity before retrying.'})[r.phase]||'Saved launch requires a receipt check.';
  if(hash(r.hash)&&!['rejected','reverted'].includes(r.phase))refresh(false);
 }
 $('connect-launched-pons').onclick=()=>{if(token)onPonsWallet();};
 $('check-receipt').onclick=()=>refresh(true);$('research-launched').onclick=()=>{if(token)onResearch(token);};$('dex-launched').onclick=()=>{if(token)onDex(token);};
 return {restore,stop,refresh};
}
