import {ensureEmbeddedWallet,accountEmbeddedWallet} from '../src/embedded-wallet-session.mjs';
import PonsConnect from './pons-connect.jsx';
export {getAccessToken} from '@privy-io/react-auth';
import {base,arbitrum,optimism} from 'viem/chains';
import {walletKey,selectDeployer,connectDeployer} from '../src/deployer-wallet.mjs';
import {checkWalletSigning} from '../src/signing-probe.mjs';
﻿import React,{useEffect,useState,useRef,Component} from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {PrivyProvider,usePrivy,useWallets,useUser,useCreateWallet,useSignTransaction,useSendTransaction,useConnectWallet,useLoginWithOAuth} from '@privy-io/react-auth';
const oauthReturn=new URLSearchParams(window.location.search).has('privy_oauth_code');
const emit=detail=>window.dispatchEvent(new CustomEvent('launchflow:auth',{detail}));
function AuthRecovery({message='Sign-in could not connect. Your saved drafts are still here.'}){return <><p className="auth-error" role="alert">{message}</p><button className="social-login" onClick={()=>window.location.reload()}>Retry sign-in</button></>;}
class Boundary extends Component{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(){emit({state:'error',authenticated:false});}
 render(){return this.state.failed?<AuthRecovery/>:this.props.children;}
}
function Account({accountHost,networkName,networkId,walletConnectProjectId}){
 const {ready,authenticated,user,logout,linkGoogle,linkTwitter,exportWallet,error:privyError}=usePrivy();
 const {wallets,ready:walletsReady}=useWallets();
 const {sendTransaction}=useSendTransaction();const sendTransactionRef=useRef(sendTransaction);sendTransactionRef.current=sendTransaction;
 const {refreshUser}=useUser();const {createWallet}=useCreateWallet();
 const [walletBootstrap,setWalletBootstrap]=useState({error:''}),[bootstrapAttempt,setBootstrapAttempt]=useState(0),[walletReadyTimeout,setWalletReadyTimeout]=useState(false);
 const walletSnapshot=useRef(null);walletSnapshot.current={user,wallets,refreshUser,createWallet};
 const {signTransaction}=useSignTransaction();
 const [probeStatus,setProbeStatus]=useState('');
 const probeBusy=useRef(false),identityRef=useRef('');
 const diagnostic=networkId===99901&&['localhost','127.0.0.1'].includes(window.location.hostname)&&new URLSearchParams(window.location.search).get('wallet-check')==='1';
 const [error,setError]=useState(''),[working,setWorking]=useState(false),[copied,setCopied]=useState(false);
 const [initTimedOut,setInitTimedOut]=useState(false);
 const [oauthPending,setOAuthPending]=useState(oauthReturn);
 const {initOAuth,loading:oauthLoading}=useLoginWithOAuth({onError:()=>{setOAuthPending(false);setError('Sign-in did not complete. Please try again.');}});
 useEffect(()=>{if(authenticated)setOAuthPending(false);},[authenticated]);
 useEffect(()=>{if(!oauthPending)return;const timer=setTimeout(()=>{setOAuthPending(false);setError('Sign-in is taking longer than expected. Please try again.');},30000);return()=>clearTimeout(timer);},[oauthPending]);
 useEffect(()=>{if(ready||privyError){setInitTimedOut(false);return;}const timer=setTimeout(()=>setInitTimedOut(true),15000);return()=>clearTimeout(timer);},[ready,privyError]);
 const authPending=(!ready&&!initTimedOut)||(!authenticated&&(oauthPending||oauthLoading));
 const menuRef=useRef(null);
 useEffect(()=>{
  const close=e=>{const menu=menuRef.current;if(!menu?.open)return;if(e.type==='keydown'){if(e.key!=='Escape')return;menu.open=false;menu.querySelector('summary')?.focus();}else if(!menu.contains(e.target))menu.open=false;};
  document.addEventListener('pointerdown',close);document.addEventListener('keydown',close);
  return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',close);};
 },[]);
 useEffect(()=>{if(!copied)return;const timer=setTimeout(()=>setCopied(false),2000);return()=>clearTimeout(timer);},[copied]);
 useEffect(()=>setCopied(false),[user?.id]);
 const embeddedAccount=accountEmbeddedWallet(user),embedded=wallets.find(wallet=>wallet.walletClientType==='privy'&&wallet.address?.toLowerCase()===embeddedAccount?.address?.toLowerCase());
 const [selection,setSelection]=useState(null),[retry,setRetry]=useState(0),[walletStatus,setWalletStatus]=useState(''),[walletError,setWalletError]=useState('');
 useEffect(()=>{const restored=()=>setRetry(value=>value+1);window.addEventListener('dinn:wallet-network-restored',restored);return()=>window.removeEventListener('dinn:wallet-network-restored',restored);},[]);
 const connectionVersion=useRef(0),launchChoice=useRef(null),connectionRetries=useRef({key:'',count:0});
 const preference=selection&&selection.user===user?.id?selection.key:'';
 useEffect(()=>{if(!authenticated||walletsReady){setWalletReadyTimeout(false);return;}const timer=setTimeout(()=>setWalletReadyTimeout(true),25000);return()=>clearTimeout(timer);},[authenticated,walletsReady,bootstrapAttempt]);
 useEffect(()=>{setSelection(null);setWalletBootstrap({error:''});},[user?.id]);
 useEffect(()=>{
  if(!ready||authPending||!authenticated||!walletsReady||!user?.id)return;let current=true;const id=user.id;setWalletBootstrap({error:''});
  void ensureEmbeddedWallet({userId:id,getUser:()=>walletSnapshot.current.user,getWallets:()=>walletSnapshot.current.wallets,refreshUser:()=>walletSnapshot.current.refreshUser(),createWallet:()=>walletSnapshot.current.createWallet(),isCurrent:()=>current}).then(()=>{if(current)setWalletBootstrap({error:''});}).catch(()=>{if(current)setWalletBootstrap({error:'Your Dinn wallet could not finish connecting. Retry connecting.'});});
  return()=>{current=false;};
 },[ready,authPending,authenticated,walletsReady,user?.id,bootstrapAttempt]);
 const selected=preference?selectDeployer(wallets,preference):embedded,selectedKey=walletKey(selected);
 function chooseWallet(wallet){
  connectionVersion.current++;setWalletStatus('Connecting wallet...');setWalletError('');
  emit({state:'wallet-changing',authenticated:true,userId:user?.id});
  const key=walletKey(wallet);
  setSelection({user:user?.id,key});setRetry(value=>value+1);
 }
 function selectLaunchWallet(wallet){launchChoice.current={user:user?.id,key:walletKey(wallet)};chooseWallet(wallet);}
 useEffect(()=>{const useDinn=()=>{if(embedded)chooseWallet(embedded);};window.addEventListener('dinn:use-dinn-wallet',useDinn);return()=>window.removeEventListener('dinn:use-dinn-wallet',useDinn);},[embedded?.address,user?.id]);
 const walletPurpose=useRef('launch');
 const {connectWallet}=useConnectWallet({onSuccess:({wallet})=>{const purpose=walletPurpose.current;walletPurpose.current='launch';if(wallet.type==='ethereum'){if(purpose==='wallet')chooseWallet(wallet);else selectLaunchWallet(wallet);}},onError:()=>{walletPurpose.current='launch';setWalletError('External wallet connection did not complete. Your selected wallet has not changed.');}});
 function connectExternal(purpose='launch') { walletPurpose.current=purpose;setWalletError('');connectWallet({walletChainType:'ethereum-only',walletList:['detected_ethereum_wallets','metamask'],description:purpose==='wallet'?'Connect an external wallet for the Wallet page.':'Connect the wallet you want to use for your launch.'}); }
 const walletUiRef=useRef(null);
 async function connectDinn(){setWalletError('');setWalletReadyTimeout(false);if(embedded){chooseWallet(embedded);return;}setSelection(null);setWalletBootstrap({error:''});setBootstrapAttempt(value=>value+1);}
 walletUiRef.current={select:detail=>{if(detail?.type==='embedded')void connectDinn();else if(detail?.type==='external'){const wallet=wallets.find(item=>item.walletClientType!=='privy'&&item.address?.toLowerCase()===detail.address?.toLowerCase());if(wallet)chooseWallet(wallet);}},connect:()=>connectExternal('wallet')};
 useEffect(()=>{const select=e=>walletUiRef.current?.select(e.detail),connect=()=>walletUiRef.current?.connect();window.addEventListener('dinn:select-wallet',select);window.addEventListener('dinn:connect-external-wallet',connect);return()=>{window.removeEventListener('dinn:select-wallet',select);window.removeEventListener('dinn:connect-external-wallet',connect);};},[]);
 const walletOptionsKey=wallets.map(walletKey).join('|');
 useEffect(()=>{window.dispatchEvent(new CustomEvent('launchflow:wallet-options',{detail:{selectedAddress:selected?.address||null,options:authenticated?[{type:'embedded',label:'Connect Dinn wallet',address:embedded?.address||null},...wallets.filter(wallet=>wallet.walletClientType!=='privy').map(wallet=>({type:'external',label:wallet.meta?.name||'External wallet',address:wallet.address}))]:[],canConnectExternal:!!authenticated}}));},[authenticated,walletsReady,user?.id,selectedKey,walletOptionsKey,embedded?.address]);
 const identity=authenticated?user?.id+':'+embedded?.address:'';identityRef.current=identity;
 useEffect(()=>{identityRef.current=identity;setProbeStatus('');return()=>{identityRef.current='';};},[identity]);
 async function probe(){if(probeBusy.current)return;probeBusy.current=true;setWorking(true);setProbeStatus('Review the sign-only check in your wallet.');const started=identityRef.current;try{const result=await checkWalletSigning({address:embedded?.address,signTransaction,isCurrent:()=>identityRef.current===started});if(identityRef.current===started)setProbeStatus(result.message);}catch{if(identityRef.current===started)setProbeStatus('Signing was not verified. The request may have been declined or the wallet may reject this diagnostic. Nothing was broadcast.');}finally{probeBusy.current=false;setWorking(false);}} 
 useEffect(()=>{
  let cancelled=false,dispose,retryTimer;
  const version=++connectionVersion.current;
  const current=()=>!cancelled&&version===connectionVersion.current;
  if(privyError){emit({state:'error',authenticated:false});return;}
  if(initTimedOut){emit({state:'error',authenticated:false});return;}
  if(authPending){emit({state:'loading',authenticated:false});return;}
  if(!authenticated){emit({state:'signed-out',authenticated:false});return;}
  if(!walletsReady){const message=walletReadyTimeout?'Dinn wallet is taking too long to connect. Refresh the page to retry.':'Connecting your Dinn wallet...';setWalletStatus(message);emit({state:walletReadyTimeout?'wallet-needed':'wallet-changing',authenticated:true,userId:user?.id,walletStatus:message});return;}
  if(!selected){const message=preference?'The selected external wallet is disconnected. Choose Dinn wallet or reconnect your external wallet.':walletBootstrap.error||'Connecting your Dinn wallet...';setWalletStatus(message);emit({state:preference||walletBootstrap.error?'wallet-needed':'wallet-changing',authenticated:true,userId:user?.id,walletStatus:message,canUseEmbedded:!!embedded});return;}
  setWalletStatus('Connecting your selected wallet...');
  emit({state:'wallet-changing',authenticated:true,userId:user?.id,walletStatus:'Connecting your selected wallet...'});
  const invalidated=()=>{if(current()){const message='Your account is signed in, but the selected wallet connection was lost.';setWalletStatus(message);emit({state:'wallet-needed',authenticated:true,userId:user?.id,walletStatus:message,canUseEmbedded:!!embedded&&selected.walletClientType!=='privy'});}};
  connectDeployer(selected,networkId,invalidated).then(connection=>{
   if(!current()||!connection.isValid()){connection.dispose();return;}
   dispose=connection.dispose;setWalletStatus('');setWalletError('');
   connectionRetries.current={key:selectedKey,count:0};emit({state:'connected',authenticated:true,userId:user?.id,provider:connection.provider,address:selected.address,source:selected.walletClientType==='privy'?'embedded':'external',sendTransaction:selected.walletClientType==='privy'?sendTransactionRef.current:null});
   if(launchChoice.current?.user===user?.id&&launchChoice.current?.key===selectedKey){launchChoice.current=null;window.dispatchEvent(new CustomEvent('dinn:launch-wallet-selected',{detail:{userId:user.id,address:selected.address,label:selected.walletClientType==='privy'?'Dinn wallet':selected.meta?.name||'External wallet'}}));}
  }).catch(()=>{if(current()){if(selected.walletClientType==='privy'){if(connectionRetries.current.key!==selectedKey)connectionRetries.current={key:selectedKey,count:0};if(connectionRetries.current.count<2){const attempt=++connectionRetries.current.count;setWalletStatus('Connecting your Dinn wallet...');retryTimer=setTimeout(()=>{if(current())setRetry(value=>value+1);},attempt*1000);return;}}const message='Your wallet could not finish connecting. Retry connecting.';setWalletStatus(message);emit({state:'wallet-needed',authenticated:true,userId:user?.id,walletStatus:message,canUseEmbedded:!!embedded&&selected.walletClientType!=='privy'});}});
  return()=>{cancelled=true;clearTimeout(retryTimer);dispose?.();};
 },[ready,authPending,initTimedOut,walletsReady,authenticated,selectedKey,user?.id,privyError,networkId,retry,walletBootstrap.error,walletReadyTimeout]);
 async function run(fn){setError('');setWorking(true);try{await fn();}catch{setError('That action could not complete. Please try again.');}finally{setWorking(false);}}
 if(privyError)return <AuthRecovery/>;
 if(initTimedOut)return <AuthRecovery message="Sign-in could not finish loading. Reload to try again."/>;
 if(authPending)return null;
 if(!authenticated)return <><div className="signin-actions"><button className="social-login" disabled={!ready||working||oauthLoading} onClick={()=>run(()=>initOAuth({provider:'twitter'}))}><img className="social-symbol" src="/brand/x.svg" alt="" width="20" height="20"/>Continue with X</button><button className="social-login" disabled={!ready||working||oauthLoading} onClick={()=>run(()=>initOAuth({provider:'google'}))}><img className="social-symbol" src="/brand/google.svg" alt="" width="20" height="20"/>Continue with Google</button></div>{!ready&&<p className="auth-status" role="status">Preparing sign-in…</p>}{error&&<p className="auth-error" role="alert">{error}</p>}</>;
 const label=user?.twitter?.username?'@'+user.twitter.username:user?.google?.name||user?.google?.email||'My account';
 const menu=<details ref={menuRef} className="account-menu"><summary aria-label="Account menu"><span className="account-avatar">{label.replace('@','').slice(0,1).toUpperCase()}</span><span className="account-label">{label}</span><span aria-hidden="true">⌄</span></summary><div className="account-popover"><strong>{label}</strong>{embedded?<><p className="account-address">{embedded.address}</p><button className="subtle" disabled={working} onClick={()=>run(async()=>{await navigator.clipboard.writeText(embedded.address);setCopied(true);})}>{copied?'Address copied':'Copy wallet address'}</button><span className="sr" role="status">{copied?'Wallet address copied to clipboard.':''}</span><p>Dinn wallet &middot; {networkName}</p><button className="subtle" disabled={working} onClick={()=>run(()=>exportWallet({address:embedded.address}))}>Back up wallet</button></>:<div className="wallet-setup"><p>Reconnect your Dinn wallet to use wallet actions.</p><button className="subtle" disabled={working} onClick={()=>run(connectDinn)}>Connect Dinn wallet</button></div>}
 {!user?.google&&<button className="subtle" disabled={working} onClick={()=>run(()=>linkGoogle())}>Link Google account</button>}
 {!user?.twitter&&<button className="subtle" disabled={working} onClick={()=>run(()=>linkTwitter())}>Link X account</button>}
 {diagnostic&&embedded&&<section><p>Local signing check: zero value, to your own address, Elysium mainnet. The gas limit is deliberately too low to execute. No broadcast.</p><button className="subtle" disabled={working} onClick={probe}>Check transaction signing</button><p role="status">{probeStatus}</p></section>}<p>Link accounts here to keep the same wallet.</p><div className="signout"><button className="subtle" disabled={working} onClick={()=>run(async()=>{await logout();emit({state:'signed-out',authenticated:false});})}>Sign out</button></div>{error&&<p className="auth-error" role="alert">{error}</p>}</div></details>;
 const deployerHost=document.getElementById('deployer-controls');
 const short=address=>address.slice(0,6)+'...'+address.slice(-4);
 const picker=<div className="deployer-picker">
 {embedded&&<button id="use-dinn-wallet" className="primary" type="button" disabled={!walletsReady} onClick={()=>selectLaunchWallet(embedded)}>Dinn wallet <span>{short(embedded.address)}</span></button>}
 {wallets.filter(wallet=>wallet.walletClientType!=='privy').map(wallet=><button className="subtle" type="button" key={walletKey(wallet)} onClick={()=>selectLaunchWallet(wallet)}>{wallet.meta?.name||'External wallet'} <span>{short(wallet.address)}</span></button>)}
 <button id="connect-launch-wallet" className="subtle" type="button" onClick={()=>connectExternal('launch')}>Connect external wallet</button>
 {walletStatus&&<p role="status">{walletStatus} {selected&&<button className="subtle" type="button" onClick={()=>selectLaunchWallet(selected)}>Reconnect</button>}</p>}{walletError&&<p role="alert">{walletError}</p>}</div>;
 return <><PonsConnect projectId={walletConnectProjectId} userId={user?.id} wallet={embedded} launchWallet={selected}/>{createPortal(menu,accountHost)}{deployerHost&&createPortal(picker,deployerHost)}</>;

}
export function mountEmbeddedAuth(element,config,accountHost){
 const network={id:config.chainId,name:config.chainName,testnet:config.testnet,nativeCurrency:{name:config.nativeSymbol||'HYPE',symbol:config.nativeSymbol||'HYPE',decimals:18},rpcUrls:{default:{http:[config.rpcUrl]}}};
 const root=createRoot(element);
 root.render(<Boundary><PrivyProvider appId={config.appId} config={{
 loginMethods:['twitter','google'],appearance:{theme:'light',accentColor:'#344b3b',logo:'/favicon.svg',landingHeader:'Sign in to Dinn',loginMessage:'Access your account and embedded wallet.'},
 embeddedWallets:{showWalletUIs:true,ethereum:{createOnLogin:'off'}},defaultChain:network,supportedChains:[network,base,arbitrum]
 }}><Account accountHost={accountHost} networkName={config.chainName} networkId={config.chainId} walletConnectProjectId={config.walletConnectProjectId}/></PrivyProvider></Boundary>);
 return ()=>root.unmount();
}
