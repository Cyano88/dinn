import test from 'node:test';
import assert from 'node:assert/strict';
import {bankrLaunchPreview} from '../src/bankr-launch-preview.mjs';
const address='0x'+'1'.repeat(40),quote='0x'+'2'.repeat(40);
const input={name:'Rack Cadets',symbol:'RACK',ticker:'SPCX',launcher:address};
const state={deployed:true,gated:false,paused:false,fork:false};
test('closed factory and missing Dinn pad stop before planning',async()=>{
 for(const [s,expected] of [[{...state,gated:true},'gated'],[{...state,paused:true},'paused'],[state,'setup']]){
  assert.equal((await bankrLaunchPreview(input,{env:{},client:{status:async()=>s}})).status,expected);
 }
});
test('simulation pins the Base stock contract, Dinn pad and creator wallet',async()=>{
 const stock={address:quote,symbol:'SPCXc',bankrPairSupported:true};
 const treasury='0x'+'3'.repeat(40),share=100000000000000000n;
 const terms={payees:[treasury],steadySharesWad:[share],decay:{on:false}};
 let planned=0,simulated=0;
 const client={status:async()=>state,contracts:()=>({settings:{padQuote:async(id,token)=>({launches:id===7n&&token===quote})}}),plan:async p=>{planned++;assert.deepEqual(p,{launcher:address,feeRecipient:address,launchpadId:7n,quote,name:'Rack Cadets',symbol:'RACK'});return {resolved:{padTerms:terms}};},simulate:async()=>{simulated++;return {token:address,poolId:'0x'+'a'.repeat(64),assumedApprovals:false};}};
 const options={env:{DINN_BANKR_BASE_LAUNCHPAD_ID:'7',DINN_BANKR_BASE_FEE_RECIPIENT:treasury},client,lookup:async()=>({stocks:[stock]})};
 assert.equal((await bankrLaunchPreview(input,options)).status,'simulated');
 stock.bankrPairSupported=false;
 assert.equal((await bankrLaunchPreview(input,options)).status,'unsupported');
 assert.equal(planned,1);
 stock.bankrPairSupported=true;
 terms.steadySharesWad=[share+1n];assert.equal((await bankrLaunchPreview(input,options)).status,'fee-mismatch');
 terms.steadySharesWad=[share];terms.payees=[address];assert.equal((await bankrLaunchPreview(input,options)).status,'fee-mismatch');
 terms.payees=[treasury];terms.decay={on:true,sharesWad:[share/2n]};assert.equal((await bankrLaunchPreview(input,options)).status,'fee-mismatch');
 assert.equal(simulated,1);
 terms.decay.sharesWad=[share];assert.equal((await bankrLaunchPreview(input,options)).dinnShareBps,1000);
 delete options.env.DINN_BANKR_BASE_FEE_RECIPIENT;assert.equal((await bankrLaunchPreview(input,options)).status,'setup');
});
