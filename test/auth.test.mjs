import test from 'node:test';
import assert from 'node:assert/strict';
import {embeddedAuthConfig,contentSecurityPolicy} from '../src/auth-config.mjs';
test('embedded sign-in uses public Robinhood RPC and requires app; never exposes server secrets',()=>{
 const disabled=embeddedAuthConfig({PRIVY_APP_ID:'public-app-123',ELYSIUM_RPC_URL:'https://private.example/SECRET',PRIVY_APP_SECRET:'SECRET'});
 assert.equal(disabled.enabled,true);assert.equal(disabled.rpcUrl,'https://rpc.mainnet.chain.robinhood.com/');assert.ok(!JSON.stringify(disabled).includes('SECRET'));
 const enabled=embeddedAuthConfig({PRIVY_APP_ID:'public-app-123',ROBINHOOD_PUBLIC_RPC_URL:'https://rpc.example.org/'});
 assert.equal(enabled.enabled,true);assert.deepEqual(enabled.loginMethods,['twitter','google']);assert.equal(enabled.chainId,4663);
});
test('public RPC cannot add CSP directives or embedded credentials',()=>{
 for(const url of ['javascript:alert(1)','https://user:password@rpc.example','http://rpc.example','https://rpc.example/#secret'])assert.throws(()=>embeddedAuthConfig({ROBINHOOD_PUBLIC_RPC_URL:url}));
 const config=embeddedAuthConfig({PRIVY_APP_ID:'public-app-123',ROBINHOOD_PUBLIC_RPC_URL:'https://rpc.example/path?param=value'});
 const csp=contentSecurityPolicy(config);assert.match(csp,/https:\/\/rpc.example/);assert.ok(!csp.includes('param=value'));assert.ok(!csp.includes('unsafe-eval'));
 assert.ok(!contentSecurityPolicy(embeddedAuthConfig({})).includes('privy.io'));
});

test('testnet onboarding is explicit and does not expose the private RPC',()=>{
 const config=embeddedAuthConfig({PRIVY_APP_ID:'public-app-123',ELYSIUM_AUTH_CHAIN_ID:'99801',ELYSIUM_PUBLIC_RPC_URL:'https://public.example',ELYSIUM_RPC_URL:'https://private.example/SECRET'});
 assert.equal(config.chainId,99801);assert.equal(config.chainName,'Elysium Testnet');assert.equal(config.testnet,true);assert.equal(config.enabled,true);
 assert.ok(!JSON.stringify(config).includes('SECRET'));
 for(const chain of ['1','1338','998','NaN'])assert.throws(()=>embeddedAuthConfig({ELYSIUM_AUTH_CHAIN_ID:chain}));
});
