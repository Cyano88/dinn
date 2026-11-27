import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bankrDeploymentTerms,deploymentTermsText} from '../src/bankr-deployment-terms.mjs';

const {token,quote,pool,receipt,calls}=JSON.parse(readFileSync(new URL('./fixtures/bankr-frozen-terms.json',import.meta.url)));
const rpc='https://mainnet.base.org';
function blockRead(url,options){
 const request=JSON.parse(options.body);
 assert.equal(request.method,'eth_call');
 assert.equal(request.params[1],receipt.blockNumber);
 const result=calls[request.params[0].to.toLowerCase()];
 assert.ok(result);
 return Response.json({result});
}
test('launch receipt confirms fee recipients and creator vesting without the public Bankr index',async()=>{
 const terms=await bankrDeploymentTerms(receipt,token,quote,pool,rpc,blockRead);
 assert.equal(terms.operatorSplit[0].steadyPercent,'10');
 assert.equal(terms.creatorRecipients[0].shareBps,10000);
 assert.equal(terms.creatorVesting.percentOfSupply,15);
 assert.equal(terms.creatorVesting.cliffEndsAt.slice(0,10),'2026-12-27');
 assert.match(deploymentTermsText(terms).vesting,/365 days/);
});
test('unavailable historical reads preserve only receipt-backed terms',async()=>{
 const terms=await bankrDeploymentTerms(receipt,token,quote,pool,rpc,()=>{throw Error('Archive unavailable');});
 assert.equal(terms.operatorSplit,null);
 assert.equal(terms.creatorVesting.cliffEndsAt,null);
 assert.equal(terms.creatorVesting.percentOfSupply,15);
});
test('a mismatched pool or unsuccessful receipt never supplies launch terms',async()=>{
 assert.equal(await bankrDeploymentTerms(receipt,token,quote,'wrong',rpc,blockRead),null);
 assert.equal(await bankrDeploymentTerms({...receipt,status:'0x0'},token,quote,pool,rpc,blockRead),null);
});
