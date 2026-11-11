export function mountSwap({api,getContext,showWallet,onConfirmed}){
 const dialog=document.createElement('dialog');dialog.id='swap-dialog';dialog.setAttribute('aria-labelledby','swap-title');
 dialog.innerHTML=`<div class="swap-heading"><h2 id="swap-title">Swap tokens</h2><button type="button" id="swap-close" class="subtle" aria-label="Close swap">×</button></div><p id="swap-network"></p><p id="swap-availability" role="status"></p><form id="swap-form"><div class="swap-fields"><label>Action<select name="side"><option value="buy">Buy</option><option value="sell">Sell</option></select></label><label>Pair<select name="pair"><option value="HYPE">WHYPE / HYPE</option><option value="USDC">USDC</option><option value="KNTQ">KNTQ</option></select></label></div><label>Token contract<input name="token" placeholder="0x…" maxlength="42" required autocomplete="off"></label><label><span id="swap-amount-label">Amount to spend</span><input name="amount" placeholder="0.0" inputmode="decimal" required autocomplete="off"></label><label>Slippage<select name="slippage"><option value="50">0.5%</option><option value="100" selected>1%</option><option value="200">2%</option><option value="300">3%</option></select></label><button type="submit" class="primary" id="swap-quote">Get quote</button></form><div id="swap-review"></div><p id="swap-error" role="alert"></p><section id="swap-activity" aria-label="Swap activity"></section>`;
 document.body.append(dialog);const $=s=>dialog.querySelector(s),form=$('#swap-form'),reviewBox=$('#swap-review'),activityBox=$('#swap-activity');
 let version=0,busy=false,quoting=false,timer,submitter;
 const initialized=import('/execution/entry.js').then(({createSwapSubmitter})=>submitter=createSwapSubmitter({storage:localStorage,lock:navigator.locks?fn=>navigator.locks.request('launchflow-submit',{mode:'exclusive',ifAvailable:true},l=>{if(!l)throw Error('Another wallet request is in progress.');return fn();}):null}));initialized.catch(()=>{});
 const el=(tag,value)=>{const node=document.createElement(tag);node.textContent=value;return node;};
 const button=(label,fn)=>{const b=el('button',label);b.type='button';b.className='subtle';b.onclick=fn;return b;};
 const context=()=>{const c=getContext();if(!c.signedIn||!c.wallet.account)throw Error('Set up your wallet from the account menu first.');if(c.wallet.chainId!==99901||c.status.authChainId!==99901)throw Error('Swaps require Elysium mainnet. Your current connection is testnet.');if(!c.status.swapPreviewEnabled)throw Error('Swaps are not live yet.');return c;};
 const intent=()=>{const c=context();return {account:c.wallet.account,chainId:99901,token:form.elements.token.value.trim(),side:form.elements.side.value,pair:form.elements.pair.value,amount:form.elements.amount.value.trim(),slippageBps:Number(form.elements.slippage.value)};};
 const enabled=()=>{const c=getContext();return c.status.swapPreviewEnabled&&c.wallet.chainId===99901&&c.status.authChainId===99901;};
 function controls(){for(const node of form.elements)node.disabled=busy;$('#swap-quote').disabled=busy||quoting||!enabled();$('#swap-close').disabled=busy;}
 function clear(){version++;form.hidden=false;reviewBox.replaceChildren();$('#swap-error').textContent='';}
 form.addEventListener('input',()=>{clear();$('#swap-amount-label').textContent=form.elements.side.value==='buy'?'Pair asset to spend':'Tokens to sell';});
 function changed(){clearTimeout(timer);clear();dialog.close();activityBox.replaceChildren();form.reset();}
 function close(){if(busy)return;clearTimeout(timer);clear();dialog.close();}
 $('#swap-close').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 async function activity(check=false,attempt=0){
  clearTimeout(timer);const stamp=version;try{await initialized;const c=context(),key={account:c.wallet.account,chainId:99901},record=submitter.pending(key);if(stamp!==version)return;activityBox.replaceChildren();if(!record)return;
   activityBox.append(el('h3',record.review.step==='swap'?'Swap activity':'Wallet step'),el('p',record.state));if(record.hash)activityBox.append(el('code',record.hash));if(record.warning)activityBox.append(el('p',record.warning));
   if(record.state==='unknown'){activityBox.append(el('p','Check wallet activity before trying again.'));const input=el('input','');input.placeholder='Transaction hash';input.setAttribute('aria-label','Swap transaction hash');activityBox.append(input,button('Recover transaction',()=>{try{submitter.recover(key,input.value.trim());activity(true);}catch(e){$('#swap-error').textContent=e.message;}}));return;}
   if(record.hash&&!['confirmed','reverted'].includes(record.state)){
    activityBox.append(button('Check status',()=>activity(true)));
    if(check){const result=await api('/api/swap/receipt',{hash:record.hash,review:record.review});if(stamp!==version)return;
     if(['confirmed','reverted'].includes(result.state)){submitter.settle(key,result.state);activityBox.replaceChildren(el('h3',record.review.step==='swap'?'Swap activity':'Wallet step'),el('code',record.hash));form.hidden=false;activityBox.append(el('p',result.state==='confirmed'?(record.review.step==='swap'?'Swap confirmed.':'Step confirmed. Get a fresh quote to continue.'):'Transaction reverted. Get a fresh quote before retrying.'));reviewBox.replaceChildren();await onConfirmed();}
     else {activityBox.append(el('p',result.state==='unverified'?'Receipt needs verification. Do not repeat this transaction.':'Waiting for confirmation…'));if(attempt<18&&['pending','confirming'].includes(result.state))timer=setTimeout(()=>activity(true,attempt+1),5000);}
    }
   }
  }catch(e){if(stamp===version)$('#swap-error').textContent=e.message;}
 }
 form.onsubmit=async e=>{e.preventDefault();if(quoting||busy)return;clear();const stamp=version;quoting=true;controls();
  try{const expected=intent(),review=await api('/api/swap/quote',expected);if(stamp!==version||!dialog.open)return;await initialized;
   const titles={wrap:'Wrap HYPE',reset:'Reset token allowance',approve:'Approve token access',permit:'Allow the Ascend router',swap:'Review swap'};
   form.hidden=true;dialog.scrollTop=0;reviewBox.append(el('h3',titles[review.step]||'Review wallet step'));
   const details=document.createElement('dl');const row=(label,value)=>details.append(el('dt',label),el('dd',value));
   row('You pay',expected.amount+' '+review.inputSymbol);row('Expected receive',review.expectedOutput+' '+review.outputSymbol);row('Minimum receive',review.minimumOutput+' '+review.outputSymbol);row('Pool fee (included)',(review.feePips/10000)+'%');row('Slippage',(expected.slippageBps/100)+'%');row('Estimated step fee',review.estimatedFee+' HYPE');reviewBox.append(details);
   if(review.step!=='swap')reviewBox.append(el('p','This approves a preparation step only. You will review a fresh quote before swapping.'));
   if(review.step==='wrap')reviewBox.append(el('p','HYPE will be wrapped into WHYPE for this pool.'));
   if(expected.side==='sell'&&expected.pair==='HYPE')reviewBox.append(el('p','You receive WHYPE. Unwrapping to HYPE is a separate action.'));
   const expiry=el('p','Quote valid for 60 seconds.');reviewBox.append(expiry);
   const approve=button('Approve in wallet',async()=>{if(busy||stamp!==version)return;busy=true;approve.disabled=true;controls();
    try{const c=context();await submitter.submit(review,expected,c.getProvider(),()=>stamp===version&&dialog.open&&enabled());if(stamp===version){reviewBox.replaceChildren();form.hidden=false;await activity(true);}}
    catch(error){if(stamp===version){$('#swap-error').textContent=error.message;await activity(false);}}
    finally{busy=false;controls();approve.disabled=true;}
   });approve.className='primary';reviewBox.append(approve,button('Edit trade',()=>{if(!busy){clear();controls();}}));
   setTimeout(()=>{if(stamp===version){approve.disabled=true;expiry.textContent='Quote expired. Get a fresh quote.';}},Math.max(0,review.expiresAt-Date.now()));
  }catch(error){if(stamp===version)$('#swap-error').textContent=error.message;}finally{quoting=false;controls();}
 };
 return {changed,open(){showWallet();clear();const c=getContext();$('#swap-network').textContent=c.status.authChainId===99801?'Elysium testnet':'Elysium';$('#swap-availability').textContent=enabled()?'Local fork testing · no real funds':c.status.authChainId===99801?'Swaps are not available on testnet. Mainnet trading is coming next.':'Trading is not live yet. Quotes and wallet approvals will be available after verification.';controls();dialog.showModal();if(enabled())activity(true);}};
}
