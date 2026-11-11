import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createWalletSession,walletReadiness,workspaceWalletReadiness} from '../public/wallet.js';
const account='0x1111111111111111111111111111111111111111';
function provider(){
 const p=new EventEmitter();p.calls=[];p.request=async({method})=>{p.calls.push(method);if((method==='eth_requestAccounts'||method==='eth_accounts'))return [account];if(method==='eth_chainId')return '0x1863d';throw Error('Unexpected wallet action');};return p;
}
test('wallet connection only requests account access and chain; never signs',async()=>{
 const p=provider(),changes=[],session=createWalletSession(p,s=>changes.push(s));
 assert.deepEqual(await session.connect(),{account,chainId:99901});
 assert.deepEqual(p.calls,['eth_requestAccounts','eth_accounts','eth_chainId']);
 p.emit('chainChanged','0x1');assert.equal(session.snapshot().chainId,1);
 p.emit('accountsChanged',[]);assert.equal(session.snapshot().account,null);
 session.close();assert.equal(p.listenerCount('accountsChanged'),0);assert.equal(p.listenerCount('chainChanged'),0);
});
test('wallet readiness distinguishes disconnected, wrong chain and mismatched account',()=>{
 assert.equal(walletReadiness({account:null},account).kind,'optional');
 assert.equal(walletReadiness({account,chainId:1},account).kind,'wrong-chain');
 assert.equal(walletReadiness({account,chainId:99901},'0x2222222222222222222222222222222222222222').kind,'mismatch');
 assert.equal(walletReadiness({account,chainId:99901},account).kind,'ready');
});
test('connection cannot publish a stale account after a wallet event',async()=>{
 const p=provider();let release;p.request=async({method})=>method==='eth_accounts'?new Promise(r=>release=r):method==='eth_requestAccounts'?[account]:'0x1863d';
 const session=createWalletSession(p,()=>{}),pending=session.connect();
 await new Promise(resolve=>setImmediate(resolve));
 p.emit('accountsChanged',['0x2222222222222222222222222222222222222222']);
 release([account]);await assert.rejects(pending,/changed during connection/);
 assert.equal(session.snapshot().account,'0x2222222222222222222222222222222222222222');session.close();
});
test('rejected or malformed wallet responses cannot become connected',async()=>{
 const p=provider();p.request=async()=>{throw Object.assign(Error('Rejected'),{code:4001});};
 const session=createWalletSession(p,()=>{});await assert.rejects(session.connect(),{code:4001});assert.equal(session.snapshot().account,null);session.close();
 assert.throws(()=>createWalletSession(null,()=>{}),/installed/);
});

test('embedded provider is read without a second account authorization request',async()=>{
 const p=provider(),session=createWalletSession(p,()=>{});
 await session.connect({requestAccess:false});
 assert.deepEqual(p.calls,['eth_accounts','eth_chainId']);
 session.close();
});

 test('testnet onboarding never permits mainnet execution and still detects account mismatch',()=>{
 const wallet={account,chainId:99801},status={onboardingOnly:true,authChainId:99801};
 assert.equal(workspaceWalletReadiness(wallet,account,status).kind,'testnet');
 assert.equal(walletReadiness(wallet,account).kind,'wrong-chain');
 assert.equal(workspaceWalletReadiness(wallet,'0x2222222222222222222222222222222222222222',status).kind,'mismatch');
 assert.match(workspaceWalletReadiness({...wallet,chainId:1},account,status).message,/99801/);
 assert.equal(workspaceWalletReadiness({account,chainId:99901},account,{}).kind,'ready');
 });
