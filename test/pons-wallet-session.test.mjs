import test from 'node:test';
import assert from 'node:assert/strict';
import {buildApprovedNamespaces} from '@walletconnect/utils';
import {PONS_CHAIN,PONS_METHODS,ponsOrigin,verifiedPons,pairingUri,ponsRequest,describePonsRequest} from '../src/pons-wallet-session.mjs';
const account='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40);
const verification={verified:{validation:'VALID',origin:'https://ponsfamily.com',isScam:false}};
const session=()=>({expiry:Math.floor(Date.now()/1000)+3600,peer:{metadata:{url:'https://ponsfamily.com'}},namespaces:{eip155:{accounts:[PONS_CHAIN+':'+account],methods:PONS_METHODS}}});
const event=(method='personal_sign',params=['0x6869',account])=>({id:7,topic:'test',verifyContext:structuredClone(verification),params:{chainId:PONS_CHAIN,request:{method,params}}});
test('Pons origin requires official HTTPS domains and verified domain match',()=>{
 assert.equal(ponsOrigin('https://ponsfamily.com/launchpad'),'https://ponsfamily.com');
 for(const url of ['http://ponsfamily.com','https://ponsfamily.com.attacker.test','https://user:pass@ponsfamily.com','https://ponsfamily.com:444'])assert.throws(()=>ponsOrigin(url));
 assert.equal(verifiedPons({url:'https://ponsfamily.com'},verification),'https://ponsfamily.com');
 for(const validation of ['UNKNOWN','INVALID',undefined])assert.throws(()=>verifiedPons({url:'https://ponsfamily.com'},{verified:{...verification.verified,validation}}));
 assert.throws(()=>verifiedPons({url:'https://ponsfamily.com'},{verified:{...verification.verified,isScam:true}}));
 assert.throws(()=>verifiedPons({url:'https://ponsfamily.com'},{verified:{...verification.verified,origin:'https://attacker.test'}}));
});
test('pairing parser accepts only WalletConnect v2 relay links',()=>{
 const uri='wc:'+'a'.repeat(64)+'@2?relay-protocol=irn&symKey='+'b'.repeat(64);
 assert.equal(pairingUri(' '+uri+' '),uri);
 for(const bad of ['javascript:alert(1)',uri.replace('@2','@1'),uri.replace('irn','attacker'),uri.replace('symKey','key')])assert.throws(()=>pairingUri(bad));
});
test('only current Dinn signer and approved Robinhood session can authorize a request',()=>{
 assert.deepEqual(ponsRequest(event(),session(),account),{method:'personal_sign',params:['0x6869',account]});
 assert.equal(describePonsRequest(ponsRequest(event(),session(),account)),'hi');
 assert.throws(()=>ponsRequest(event(),session(),other));
 const expired=session();expired.expiry=0;assert.throws(()=>ponsRequest(event(),expired,account));
 const chain=event();chain.params.chainId='eip155:1';assert.throws(()=>ponsRequest(chain,session(),account));
 const denied=session();denied.namespaces.eip155.methods=[];assert.throws(()=>ponsRequest(event(),denied,account));
 assert.throws(()=>ponsRequest(event('eth_sign',[account,'0x6869']),session(),account));
 const old=event();old.params.request.expiryTimestamp=1;assert.throws(()=>ponsRequest(old,session(),account));
});
test('transaction and typed data cannot substitute signer or network',()=>{
 const tx={from:account,to:other,value:'0x0',data:'0x'};
 assert.equal(ponsRequest(event('eth_sendTransaction',[tx]),session(),account).params[0].from,account);
 for(const patch of [{from:other},{chainId:'0x1'},{to:'bad'},{value:'-1'},{data:'0xz'},{authorizationList:[]}])assert.throws(()=>ponsRequest(event('eth_sendTransaction',[{...tx,...patch}]),session(),account));
 const typed={domain:{chainId:4663},types:{},primaryType:'Test',message:{}};
 assert.equal(ponsRequest(event('eth_signTypedData_v4',[account,JSON.stringify(typed)]),session(),account).method,'eth_signTypedData_v4');
 assert.throws(()=>ponsRequest(event('eth_signTypedData_v4',[other,typed]),session(),account));
 assert.throws(()=>ponsRequest(event('eth_signTypedData_v4',[account,{...typed,domain:{chainId:1}}]),session(),account));
 assert.throws(()=>ponsRequest(event('wallet_switchEthereumChain',[{chainId:'0x1'}]),session(),account));
});
test('SDK namespace negotiation cannot grant unsupported required methods or chains',()=>{
 const supportedNamespaces={eip155:{chains:[PONS_CHAIN],methods:PONS_METHODS,events:['accountsChanged','chainChanged'],accounts:[PONS_CHAIN+':'+account]}};
 const proposal={requiredNamespaces:{eip155:{chains:[PONS_CHAIN],methods:['personal_sign'],events:[]}},optionalNamespaces:{eip155:{chains:['eip155:1'],methods:['eth_sign'],events:[]}}};
 const result=buildApprovedNamespaces({proposal,supportedNamespaces});
 assert.deepEqual(result.eip155.accounts,[PONS_CHAIN+':'+account]);assert.ok(!result.eip155.methods.includes('eth_sign'));
 proposal.requiredNamespaces.eip155.chains=['eip155:1'];assert.throws(()=>buildApprovedNamespaces({proposal,supportedNamespaces}));
});
