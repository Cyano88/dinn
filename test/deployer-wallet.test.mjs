import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {walletKey,selectDeployer,connectDeployer} from '../src/deployer-wallet.mjs';
const address='0x1111111111111111111111111111111111111111';
function fixture(){
 const provider=new EventEmitter();let chain=4663,accounts=[address];
 provider.request=async({method})=>{if(method==='eth_chainId')return chain;if(method==='eth_accounts')return accounts;throw Error('Unexpected signing request');};
 const wallet={address,walletClientType:'metamask',connectorType:'injected',getEthereumProvider:async()=>provider,switchChain:async value=>{chain=value;}};
 return {provider,wallet,setAccounts:value=>accounts=value,setChain:value=>chain=value};
}
test('default is Dinn; saved external preference never falls back silently',()=>{
 const external=fixture().wallet,embedded={...external,walletClientType:'privy',connectorType:'embedded'};
 assert.equal(selectDeployer([external,embedded],''),embedded);
 assert.equal(selectDeployer([external,embedded],walletKey(external)),external);
 assert.equal(selectDeployer([embedded],walletKey(external)),undefined);
 assert.notEqual(walletKey(external),walletKey(embedded));
});
test('connect validates network and active address without requesting signatures',async()=>{
 const f=fixture();f.setChain(1);const connection=await connectDeployer(f.wallet,4663,()=>{});
 assert.equal(connection.provider,f.provider);connection.dispose();
 f.setAccounts([]);await assert.rejects(connectDeployer(f.wallet,4663,()=>{}),/Reconnect/);
 assert.equal(f.provider.listenerCount('accountsChanged'),0);
});
for(const event of ['accountsChanged','chainChanged','disconnect'])test(event+' invalidates once and disposes listeners',async()=>{
 const f=fixture();let invalidations=0;
 const connection=await connectDeployer(f.wallet,4663,()=>invalidations++);
 f.provider.emit(event,[]);f.provider.emit(event,[]);assert.equal(invalidations,1);
 connection.dispose();assert.equal(f.provider.listenerCount(event),0);
});
test('account change while checking cannot produce a connected provider',async()=>{
 const f=fixture(),request=f.provider.request;
 f.provider.request=async args=>{if(args.method==='eth_accounts')f.provider.emit('accountsChanged',[]);return request(args);};
 let invalidations=0;await assert.rejects(connectDeployer(f.wallet,4663,()=>invalidations++),/Reconnect/);
 assert.equal(invalidations,1);assert.equal(f.provider.listenerCount('disconnect'),0);
});
