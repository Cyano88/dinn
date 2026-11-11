export {getAccessToken} from '@privy-io/react-auth';
import {base,arbitrum,optimism} from 'viem/chains';
import {walletKey,selectDeployer,connectDeployer} from '../src/deployer-wallet.mjs';
import {checkWalletSigning} from '../src/signing-probe.mjs';
﻿import React,{useEffect,useState,useRef,Component} from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {PrivyProvider,usePrivy,useWallets,useCreateWallet,useSignTransaction,useConnectWallet,useLoginWithOAuth} from '@privy-io/react-auth';
const oauthReturn=new URLSearchParams(window.location.search).has('privy_oauth_code');
const emit=detail=>window.dispatchEvent(new CustomEvent('launchflow:auth',{detail}));
class Boundary extends Component{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(){emit({state:'error',authenticated:false});}
 render(){return this.state.failed?<p className="auth-error" role="alert">Sign-in could not load. Reload this page to try again.</p>:this.props.children;}
}
function Account({accountHost,networkName,networkId}){
 const {ready,authenticated,user,logout,linkGoogle,linkTwitter,exportWallet,error:privyError}=usePrivy();
 const {wallets,ready:walletsReady}=useWallets();
 const {createWallet}=useCreateWallet();
 const {signTransaction}=useSignTransaction();
 const [probeStatus,setProbeStatus]=useState('');
 const probeBusy=useRef(false),identityRef=useRef('');
 const diagnostic=networkId===99901&&['localhost','127.0.0.1'].includes(window.location.hostname)&&new URLSearchParams(window.location.search).get('wallet-check')==='1';
 const [error,setError]=useState(''),[working,setWorking]=useState(false),[copied,setCopied]=useState(false);
 const [oauthPending,setOAuthPending]=useState(oauthReturn);
 const {initOAuth,loading:oauthLoading}=useLoginWithOAuth({onError:()=>{setOAuthPending(false);setError('Sign-in did not complete. Please try again.');}});
 useEffect(()=>{if(authenticated)setOAuthPending(false);},[authenticated]);
 useEffect(()=>{if(!oauthPending)return;const timer=setTimeout(()=>{setOAuthPending(false);setError('Sign-in is taking longer than expected. Please try again.');},30000);return()=>clearTimeout(timer);},[oauthPending]);
 const authPending=!ready||(!authenticated&&(oauthPending||oauthLoading));
 const menuRef=useRef(null);
 useEffect(()=>{
  const close=e=>{const menu=menuRef.current;if(!menu?.open)return;if(e.type==='keydown'){if(e.key!=='Escape')return;menu.open=false;menu.querySelector('summary')?.focus();}else if(!menu.contains(e.target))menu.open=false;};
  document.addEventListener('pointerdown',close);document.addEventListener('keydown',close);
  return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',close);};
 },[]);
 useEffect(()=>{if(!copied)return;const timer=setTimeout(()=>setCopied(false),2000);return()=>clearTimeout(timer);},[copied]);
 useEffect(()=>setCopied(false),[user?.id]);
 const embedded=wallets.find(wallet=>wallet.walletClientType==='privy');
 const [selection,setSelection]=useState(null),[retry,setRetry]=useState(0),[walletStatus,setWalletStatus]=useState('');
 const connectionVersion=useRef(0),launchChoice=useRef(null);
 const preferenceKey='dinn.deployer.v1:'+user?.id;
 let stored='';try{stored=localStorage.getItem(preferenceKey)||'';}catch{}
 const preference=selection&&selection.user===user?.id?selection.key:stored;
 const selected=selectDeployer(wallets,preference),selectedKey=walletKey(selected);
 function chooseWallet(wallet){
  connectionVersion.current++;setWalletStatus('Connecting wallet...');setError('');
  emit({state:'wallet-changing',authenticated:true,userId:user?.id});
  const key=walletKey(wallet);try{localStorage.setItem(preferenceKey,key);}catch{}
  setSelection({user:user?.id,key});setRetry(value=>value+1);
 }
 function selectLaunchWallet(wallet){launchChoice.current={user:user?.id,key:walletKey(wallet)};chooseWallet(wallet);}
 const {connectWallet}=useConnectWallet({onSuccess:({wallet})=>{if(wallet.type==='ethereum')selectLaunchWallet(wallet);},onError:()=>setError('Wallet connection did not complete. Try again when ready.')});
 const identity=authenticated?user?.id+':'+embedded?.address:'';identityRef.current=identity;
 useEffect(()=>{identityRef.current=identity;setProbeStatus('');return()=>{identityRef.current='';};},[identity]);
 async function probe(){if(probeBusy.current)return;probeBusy.current=true;setWorking(true);setProbeStatus('Review the sign-only check in your wallet.');const started=identityRef.current;try{const result=await checkWalletSigning({address:embedded?.address,signTransaction,isCurrent:()=>identityRef.current===started});if(identityRef.current===started)setProbeStatus(result.message);}catch{if(identityRef.current===started)setProbeStatus('Signing was not verified. The request may have been declined or the wallet may reject this diagnostic. Nothing was broadcast.');}finally{probeBusy.current=false;setWorking(false);}} 
 useEffect(()=>{
  let cancelled=false,dispose;
  const version=++connectionVersion.current;
  const current=()=>!cancelled&&version===connectionVersion.current;
  if(privyError){emit({state:'error',authenticated:false});return;}
  if(authPending){emit({state:'loading',authenticated:false});return;}
  if(!authenticated){emit({state:'signed-out',authenticated:false});return;}
  if(!walletsReady){emit({state:'loading',authenticated:true,userId:user?.id});return;}
  if(!selected){setWalletStatus(preference?'Reconnect your selected wallet or choose Dinn wallet.':'Your Dinn wallet is getting ready.');emit({state:'wallet-needed',authenticated:true,userId:user?.id});return;}
  setWalletStatus('Connecting wallet...');
  emit({state:'wallet-changing',authenticated:true,userId:user?.id});
  const invalidated=()=>{if(current()){setWalletStatus('Wallet changed or disconnected. Reconnect before continuing.');emit({state:'wallet-needed',authenticated:true,userId:user?.id});}};
  connectDeployer(selected,networkId,invalidated).then(connection=>{
   if(!current()||!connection.isValid()){connection.dispose();return;}
   dispose=connection.dispose;setWalletStatus('');
   emit({state:'connected',authenticated:true,userId:user?.id,provider:connection.provider,address:selected.address,source:selected.walletClientType==='privy'?'embedded':'external'});
   if(launchChoice.current?.user===user?.id&&launchChoice.current?.key===selectedKey){launchChoice.current=null;window.dispatchEvent(new CustomEvent('dinn:launch-wallet-selected',{detail:{userId:user.id,address:selected.address,label:selected.walletClientType==='privy'?'Dinn wallet':selected.meta?.name||'External wallet'}}));}
  }).catch(()=>{if(current()){setWalletStatus('Reconnect your wallet and approve the network connection to continue.');emit({state:'wallet-needed',authenticated:true,userId:user?.id});}});
  return()=>{cancelled=true;dispose?.();};
 },[ready,authPending,walletsReady,authenticated,selectedKey,user?.id,privyError,networkId,retry]);
 async function run(fn){setError('');setWorking(true);try{await fn();}catch{setError('That action could not complete. Please try again.');}finally{setWorking(false);}}
 if(privyError)return <p className="auth-error" role="alert">Sign-in could not load. Reload this page to try again.</p>;
 if(authPending)return null;
 if(!authenticated)return <><div className="signin-actions"><button className="social-login" disabled={!ready||working||oauthLoading} onClick={()=>run(()=>initOAuth({provider:'twitter'}))}><img className="social-symbol" src="/brand/x.svg" alt="" width="20" height="20"/>Continue with X</button><button className="social-login" disabled={!ready||working||oauthLoading} onClick={()=>run(()=>initOAuth({provider:'google'}))}><img className="social-symbol" src="/brand/google.svg" alt="" width="20" height="20"/>Continue with Google</button></div>{!ready&&<p className="auth-status" role="status">Preparing sign-in…</p>}{error&&<p className="auth-error" role="alert">{error}</p>}</>;
 const label=user?.twitter?.username?'@'+user.twitter.username:user?.google?.name||user?.google?.email||'My account';
 const menu=<details ref={menuRef} className="account-menu"><summary aria-label="Account menu"><span className="account-avatar">{label.replace('@','').slice(0,1).toUpperCase()}</span><span className="account-label">{label}</span><span aria-hidden="true">⌄</span></summary><div className="account-popover"><strong>{label}</strong>{embedded?<><p className="account-address">{embedded.address}</p><button className="subtle" disabled={working} onClick={()=>run(async()=>{await navigator.clipboard.writeText(embedded.address);setCopied(true);})}>{copied?'Address copied':'Copy wallet address'}</button><span className="sr" role="status">{copied?'Wallet address copied to clipboard.':''}</span><p>Embedded wallet &middot; {networkName}</p><button className="subtle" disabled={working} onClick={()=>run(()=>exportWallet({address:embedded.address}))}>Back up wallet</button></>:<div className="wallet-setup"><p>Create your wallet to use it for your launch.</p><button className="subtle" disabled={working||!walletsReady} onClick={()=>run(()=>createWallet())}>Create wallet</button></div>}
 {!user?.google&&<button className="subtle" disabled={working} onClick={()=>run(()=>linkGoogle())}>Link Google account</button>}
 {!user?.twitter&&<button className="subtle" disabled={working} onClick={()=>run(()=>linkTwitter())}>Link X account</button>}
 {diagnostic&&embedded&&<section><p>Local signing check: zero value, to your own address, Elysium mainnet. The gas limit is deliberately too low to execute. No broadcast.</p><button className="subtle" disabled={working} onClick={probe}>Check transaction signing</button><p role="status">{probeStatus}</p></section>}<p>Link accounts here to keep the same wallet.</p><div className="signout"><button className="subtle" disabled={working} onClick={()=>run(async()=>{await logout();emit({state:'signed-out',authenticated:false});})}>Sign out</button></div>{error&&<p className="auth-error" role="alert">{error}</p>}</div></details>;
 const deployerHost=document.getElementById('deployer-controls');
 const short=address=>address.slice(0,6)+'...'+address.slice(-4);
 const picker=<div className="deployer-picker">
 {embedded&&<button id="use-dinn-wallet" className="primary" type="button" disabled={!walletsReady} onClick={()=>selectLaunchWallet(embedded)}>Dinn wallet <span>{short(embedded.address)}</span></button>}
 {wallets.filter(wallet=>wallet.walletClientType!=='privy').map(wallet=><button className="subtle" type="button" key={walletKey(wallet)} onClick={()=>selectLaunchWallet(wallet)}>{wallet.meta?.name||'External wallet'} <span>{short(wallet.address)}</span></button>)}
 <button id="connect-launch-wallet" className="subtle" type="button" onClick={()=>connectWallet({walletChainType:'ethereum-only',walletList:['detected_ethereum_wallets','metamask'],description:'Connect the wallet you want to use for your launch.'})}>Connect external wallet</button>
 {walletStatus&&<p role="status">{walletStatus} {selected&&<button className="subtle" type="button" onClick={()=>selectLaunchWallet(selected)}>Reconnect</button>}</p>}{error&&<p role="alert">{error}</p>}</div>;
 return <>{createPortal(menu,accountHost)}{deployerHost&&createPortal(picker,deployerHost)}</>;

}
export function mountEmbeddedAuth(element,config,accountHost){
 const network={id:config.chainId,name:config.chainName,testnet:config.testnet,nativeCurrency:{name:config.nativeSymbol||'HYPE',symbol:config.nativeSymbol||'HYPE',decimals:18},rpcUrls:{default:{http:[config.rpcUrl]}}};
 const root=createRoot(element);
 root.render(<Boundary><PrivyProvider appId={config.appId} config={{
 loginMethods:['twitter','google'],appearance:{theme:'light',accentColor:'#344b3b',logo:'/favicon.svg',landingHeader:'Sign in to Dinn',loginMessage:'Access your account and embedded wallet.'},
 embeddedWallets:{showWalletUIs:true,ethereum:{createOnLogin:'all-users'}},defaultChain:network,supportedChains:[network]
 }}><Account accountHost={accountHost} networkName={config.chainName} networkId={config.chainId}/></PrivyProvider></Boundary>);
 return ()=>root.unmount();
}
