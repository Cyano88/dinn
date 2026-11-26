import test from 'node:test';
import assert from 'node:assert/strict';
import {createBaseAssets,assetCommand} from '../public/base-creator-assets.js';
import {publishProjectMetadata} from '../src/bankr-project-metadata.mjs';

function harness(){
 const rows=new Map(),messages=[];
 const records={getItem:k=>rows.get(k),setItem:async(k,v)=>rows.set(k,v)};
 const flow=createBaseAssets({records,context:()=>({owner:'tester',epoch:1}),say:t=>messages.push(t),reply:(q,t)=>messages.push(t)});
 const project={owner:'tester',epoch:1,ticker:'NFLX',name:'Test token',symbol:'TEST',source:'https://news.example/story',description:'A test launch.'};
 flow.bind(project);return {flow,messages,project};
}
test('Base takes explicit project assets and keeps another idea empty',async()=>{
 const {flow,project}=harness();
 assert.equal(await flow.handle('Bankr',true),true);
 await flow.handle('https://test.example/art.png',false);
 await flow.handle('https://test.example/game',false);
 assert.equal(await flow.handle('check Base launch terms',true),false);
 assert.deepEqual(flow.assets(),{description:project.description,image:'https://test.example/art.png',website:'https://test.example/game'});
 flow.bind({...project,symbol:'NEXT'});
 await flow.handle('Bankr',true);await flow.handle('skip logo',false);await flow.handle('skip website',false);
 assert.equal(flow.assets().image,'');assert.equal(flow.assets().website,'');
});
test('accepted design commands stay scoped to the current step',()=>{
 assert.deepEqual(assetCommand('logo','create a logo: a turkey'),{kind:'generate',style:'a turkey'});
 assert.equal(assetCommand('website','create a website').kind,'preview');
 assert.equal(assetCommand('website','use this website').kind,'publish');
 assert.equal(assetCommand('logo','skip website'),null);
});
test('metadata links are immutable by content and omitted fields remain absent',async()=>{
 const rows=new Map(),store={putMetadata:(id,doc)=>rows.set(id,doc)},env={DINN_PUBLIC_URL:'https://host.example'};
 const fields={name:'Test',symbol:'TEST',image:'https://assets.example/test.png',website:'https://project.example'};
 const first=await publishProjectMetadata(store,env,fields);
 assert.equal(first.doc.external_url,fields.website);
 assert.equal(first.metadataUri,(await publishProjectMetadata(store,env,fields)).metadataUri);
 const skipped=await publishProjectMetadata(store,env,{...fields,image:'',website:''});
 assert.notEqual(first.metadataUri,skipped.metadataUri);assert.deepEqual(skipped.doc,{name:'Test',symbol:'TEST'});
 await assert.rejects(()=>publishProjectMetadata(store,env,{...fields,image:'javascript:alert(1)'}));
});
test('Bankr plan receives the published metadata URI for this token',async()=>{
 const {bankrLaunchPreview}=await import('../src/bankr-launch-preview.mjs');
 const launcher='0x'+'1'.repeat(40),quote='0x'+'2'.repeat(40),treasury='0x'+'3'.repeat(40);
 const share=100000000000000000n,uri='https://assets.example/token-metadata/test.json';
 const assets={image:'https://assets.example/test.png',website:'https://test.example',description:'Test only'};
 const client={status:async()=>({deployed:true}),contracts:()=>({settings:{padQuote:async()=>({launches:true})}}),
  plan:async input=>{assert.equal(input.metadataUri,uri);return {resolved:{padTerms:{payees:[treasury],steadySharesWad:[share],decay:{on:false}}}};},
  simulate:async()=>({token:launcher,poolId:'0x'+'a'.repeat(64)})};
 const result=await bankrLaunchPreview({ticker:'NFLX',name:'Test',symbol:'TEST',launcher,assets},{
  client,env:{DINN_BANKR_BASE_LAUNCHPAD_ID:'7',DINN_BANKR_BASE_FEE_RECIPIENT:treasury},
  lookup:async()=>({stocks:[{address:quote,symbol:'NFLXc',bankrPairSupported:true}]}),
  publishMetadata:async fields=>{assert.equal(fields.image,assets.image);assert.equal(fields.website,assets.website);return {metadataUri:uri,doc:{image:fields.image,external_url:fields.website}};}
 });
 assert.ok(result.message.includes(assets.image));assert.ok(result.message.includes(assets.website));
});
