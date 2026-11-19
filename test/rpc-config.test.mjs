import test from 'node:test';
import assert from 'node:assert/strict';
import {serverRpcUrl} from '../src/rpc-config.mjs';
import {walletClient} from '../src/robinhood-wallet.mjs';
import {getClient} from '../src/pons.mjs';

test('server RPCs use documented public fallbacks when no dedicated endpoint is configured',()=>{
 assert.equal(serverRpcUrl(4663,{}),'https://rpc.mainnet.chain.robinhood.com/');
 assert.equal(serverRpcUrl(8453,{}),'https://mainnet.base.org/');
 assert.equal(serverRpcUrl(42161,{}),'https://arb1.arbitrum.io/rpc');
});

test('server RPC overrides stay network-specific and accept HTTPS provider URLs',()=>{
 const env={ROBINHOOD_RPC_URL:'https://rh.example/rpc?key=private',BASE_RPC_URL:'https://base.example/rpc/key',ARBITRUM_RPC_URL:'https://arb.example/rpc/key'};
 assert.equal(serverRpcUrl(4663,env),'https://rh.example/rpc?key=private');
 assert.equal(serverRpcUrl(8453,env),'https://base.example/rpc/key');
 assert.equal(serverRpcUrl(42161,env),'https://arb.example/rpc/key');
});

test('Pons and wallet clients use the matching configured server endpoint without making a request',()=>{
 const env={NODE_ENV:'production',ROBINHOOD_RPC_URL:'https://rh.example/rpc',BASE_RPC_URL:'https://base.example/rpc',ARBITRUM_RPC_URL:'https://arb.example/rpc'};
 assert.equal(getClient({env}).transport.url,env.ROBINHOOD_RPC_URL);
 assert.equal(walletClient(4663,{env}).transport.url,env.ROBINHOOD_RPC_URL);
 assert.equal(walletClient(8453,{env}).transport.url,env.BASE_RPC_URL);
 assert.equal(walletClient(42161,{env}).transport.url,env.ARBITRUM_RPC_URL);
});

test('production rejects insecure or credential-in-userinfo RPC URLs without echoing the configured value',()=>{
 for(const value of ['http://base.example/rpc','https://user:secret@base.example/rpc','not a URL']){
  assert.throws(()=>serverRpcUrl(8453,{NODE_ENV:'production',BASE_RPC_URL:value}),error=>!error.message.includes(value)&&!error.message.includes('secret'));
 }
});

test('local development permits only loopback HTTP RPCs',()=>{
 assert.equal(serverRpcUrl(8453,{NODE_ENV:'development',BASE_RPC_URL:'http://127.0.0.1:8545'}),'http://127.0.0.1:8545/');
 assert.throws(()=>serverRpcUrl(8453,{NODE_ENV:'development',BASE_RPC_URL:'http://rpc.example'}),/invalid/);
 assert.throws(()=>serverRpcUrl(1,{}),/No server RPC/);
});
