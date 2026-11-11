import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {PONS_CHAIN,PONS_METHODS,verifiedPons,pairingUri,ponsRequest,describePonsRequest} from '../src/pons-wallet-session.mjs';
const clients=new Map();
async function getClient(projectId,owner){
 const key=projectId+':'+owner;
 if(!clients.has(key))clients.set(key,(async()=>{
  const [{Core},{WalletKit}]=await Promise.all([import('@walletconnect/core'),import('@reown/walletkit')]);
  return WalletKit.init({core:new Core({projectId,customStoragePrefix:'dinn-pons-'+owner}),metadata:{name:'Dinn',description:'Your Dinn wallet on Pons',url:location.origin,icons:[location.origin+'/favicon.svg']}});
 })().catch(e=>{clients.delete(key);throw e;}));
 return clients.get(key);
}
export default function PonsConnect({projectId,userId,wallet,launchWallet}){
 const [uri,setUri]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[active,setActive]=useState(false),[review,setReview]=useState(null),[sessions,setSessions]=useState([]);
 const client=useRef(null),reviewRef=useRef(null),generation=useRef(0),dialog=useRef(null),signing=useRef(false);
 const identity=userId+':'+wallet?.address?.toLowerCase(),current=useRef(identity);current.current=identity;
 const host=document.getElementById('pons-wallet-connect');
 function ask(value){return new Promise(resolve=>{if(reviewRef.current){resolve(false);return;}reviewRef.current={resolve};setReview(value);});}
 function answer(ok){reviewRef.current?.resolve(ok);reviewRef.current=null;setReview(null);}
 useEffect(()=>{if(review)dialog.current?.scrollIntoView({block:'nearest'});},[review]);
 useEffect(()=>{
  if(!active||!projectId||!wallet||!userId)return;
  signing.current=false;setBusy(false);
  let disposed=false,kit,handlers;const version=++generation.current,owner=identity;
  const valid=()=>!disposed&&version===generation.current&&current.current===owner;
  const update=()=>{if(valid())setSessions(Object.values(kit.getActiveSessions()).filter(s=>s.namespaces?.eip155?.accounts?.some(a=>a.toLowerCase()===(PONS_CHAIN+':'+wallet.address).toLowerCase())));};
  const respond=(event,payload)=>kit.respondSessionRequest({topic:event.topic,response:{jsonrpc:'2.0',id:event.id,...payload}});
  (async()=>{
   kit=await getClient(projectId,owner);if(!valid())return;client.current=kit;
   const proposal=async event=>{
    try{
     const origin=verifiedPons(event.params?.proposer?.metadata,event.verifyContext);
     const {buildApprovedNamespaces}=await import('@walletconnect/utils');
     const namespaces=buildApprovedNamespaces({proposal:event.params,supportedNamespaces:{eip155:{chains:[PONS_CHAIN],methods:PONS_METHODS,events:['accountsChanged','chainChanged'],accounts:[PONS_CHAIN+':'+wallet.address]}}});
     if(!valid()||!await ask({title:'Connect your Dinn wallet to Pons?',details:origin+'\n'+wallet.address+'\nRobinhood Chain\nPons can request signatures and transactions. Each request needs your approval.'})||!valid())throw Error('Connection declined.');
     await kit.approveSession({id:event.id,namespaces});update();if(valid())setStatus('Connected. Keep Dinn open to review requests from Pons.');
    }catch(e){await kit.rejectSession({id:event.id,reason:{code:5000,message:'Connection declined'}}).catch(()=>{});if(valid())setStatus(e.message);}
   };
   const request=async event=>{
    if(!valid())return;let ownsSigning=false;
    try{
     const session=kit.getActiveSessions()[event.topic];const req=ponsRequest(event,session,wallet.address);
     if(signing.current||reviewRef.current)throw Error('Finish the current wallet request first.');
     const key='dinn.pons-request.v1:'+owner+':'+event.topic+':'+event.id;
     const saved=localStorage.getItem(key);
     if(saved){const previous=JSON.parse(saved);if(previous.result!==undefined){await respond(event,{result:previous.result});return;}throw Error('This request may already have reached your wallet. Check wallet activity; Dinn will not send it again.');}
     if(!await ask({title:req.method==='eth_sendTransaction'?'Review Pons transaction':req.method==='personal_sign'?'Review Pons message':'Review Pons request',details:describePonsRequest(req),wallet:wallet.address,method:req.method})||!valid())throw Error('Request declined.');
     ponsRequest(event,kit.getActiveSessions()[event.topic],wallet.address);
     signing.current=true;ownsSigning=true;setBusy(true);
     const provider=await wallet.getEthereumProvider();
     const [accounts,chain]=await Promise.all([provider.request({method:'eth_accounts'}),provider.request({method:'eth_chainId'})]);
     if(!valid()||!accounts?.some(a=>a.toLowerCase()===wallet.address.toLowerCase())||Number(chain)!==4663)throw Error('Wallet or network changed. Reconnect on Robinhood Chain.');
     if(!navigator.locks)throw Error('This browser cannot safely coordinate wallet requests. Use a current Chrome browser.');
     await navigator.locks.request(key,async()=>{
      if(!valid())throw Error('Wallet session changed.');
      ponsRequest(event,kit.getActiveSessions()[event.topic],wallet.address);
      const existing=localStorage.getItem(key);
      if(existing){const previous=JSON.parse(existing);if(previous.result!==undefined){await respond(event,{result:previous.result});return;}throw Error('Check wallet activity before retrying this request.');}
      localStorage.setItem(key,JSON.stringify({startedAt:Date.now(),method:req.method}));
      let result;
      try{result=await provider.request(req);}catch(e){if(e.code===4001||e.code==='4001')localStorage.removeItem(key);throw e;}
      localStorage.setItem(key,JSON.stringify({result}));
      if(!valid())return;
      await respond(event,{result});
     });
     if(!valid())return;
     setStatus(req.method==='eth_sendTransaction'?'Transaction submitted. Check its status on Pons.':'Request completed. Return to Pons.');
    }catch(e){await respond(event,{error:{code:4001,message:e.message||'Request declined'}}).catch(()=>{});if(valid())setStatus(e.message||'Request did not complete.');}
    finally{if(valid()&&ownsSigning){signing.current=false;setBusy(false);}}
   };
   const expired=()=>{answer(false);update();};
   handlers={session_proposal:proposal,session_request:request,session_delete:expired,proposal_expire:expired,session_request_expire:expired};
   for(const [name,fn] of Object.entries(handlers))kit.on(name,fn);
   update();setStatus('Ready. Copy a fresh WalletConnect link from Pons.');
  })().catch(()=>{if(valid()){setStatus('Wallet connection service could not start. Try again.');setActive(false);}});
  return()=>{disposed=true;generation.current++;answer(false);client.current=null;if(kit&&handlers)for(const [name,fn] of Object.entries(handlers))kit.off(name,fn);setSessions([]);};
 },[active,projectId,identity]);
 async function pair(){setBusy(true);try{const value=pairingUri(uri);if(!client.current)throw Error('Enable the connection service first.');setUri('');await client.current.pair({uri:value});setStatus('Waiting for Pons to request a connection…');}catch(e){setStatus(e.message);}finally{setBusy(false);}}
 async function disconnect(){setBusy(true);answer(false);try{const kit=client.current;if(kit)for(const session of Object.values(kit.getActiveSessions()))await kit.disconnectSession({topic:session.topic,reason:{code:6000,message:'Disconnected by user'}});setActive(false);setStatus('Disconnected from Pons.');}catch{setStatus('Disconnection could not be confirmed. Try again.');}finally{setBusy(false);}}
 if(!host||!wallet)return null;
 return <>{createPortal(<section className="pons-connect"><h3>Use your Dinn wallet on Pons</h3><p className="address">Dinn wallet: {wallet.address}</p>{launchWallet&&launchWallet.walletClientType!=='privy'&&<p>Your selected launch wallet is external: {launchWallet.address}. To manage that launch, connect that same external wallet directly on Pons.</p>}<p>Connect the same wallet you use in Dinn. Keep this tab open to approve Pons requests.</p>{!projectId?<p>Wallet connection setup is in progress.</p>:<><a href="https://ponsfamily.com/launchpad" target="_blank" rel="noopener noreferrer">Open Pons</a><p>On Pons, choose Sign in → Use a wallet → WalletConnect, then copy the connection link.</p>{!active?<button className="subtle" onClick={()=>setActive(true)}>Enable Pons connection</button>:<><label htmlFor="pons-pairing-uri">WalletConnect link from Pons</label><input id="pons-pairing-uri" value={uri} onChange={e=>setUri(e.target.value)} autoComplete="off" spellCheck="false" placeholder="wc:…"/><button className="primary" disabled={busy||!uri} onClick={pair}>Connect to Pons</button><button className="subtle" disabled={busy} onClick={disconnect}>Disconnect</button></>}{sessions.length>0&&<p>Connected wallet: {wallet.address}</p>}</>}<p role="status">{status}</p></section>,host)}{review&&createPortal(<section ref={dialog} className="pons-request"><h3>{review.title}</h3>{review.wallet&&<p>Wallet: {review.wallet}<br/>Robinhood Chain</p>}<pre>{review.details}</pre>{review.method==='eth_sendTransaction'&&<p>Approving can spend assets and ETH for gas. Check the recipient, value and contract data.</p>}<button className="subtle" onClick={()=>answer(false)}>Reject</button><button className="primary" onClick={()=>answer(true)}>{review.method?'Continue in wallet':'Connect wallet'}</button></section>,host)}</>;
}
