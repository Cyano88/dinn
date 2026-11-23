import test from 'node:test';
import assert from 'node:assert/strict';
import {equityContext,equityMessage} from '../src/equity-context.mjs';
import {directProductIntent} from '../src/product-tools.mjs';

const now=Date.UTC(2026,10,23,16);
const article=(title,time,url)=>'<item><title>'+title+'</title><link>'+url+'</link><pubDate>'+new Date(time).toUTCString()+'</pubDate></item>';
async function run(choice,priceTime=now){
 let packet;
 const fetchImpl=async(url,options)=>{
  if(url.includes('/chart/'))return Response.json({chart:{result:[{meta:{symbol:'NVDA',instrumentType:'EQUITY',currency:'USD',regularMarketPrice:120,chartPreviousClose:100,regularMarketTime:priceTime/1000}}]}});
  if(url.includes('chat/completions')){packet=JSON.parse(JSON.parse(options.body).messages[1].content);return Response.json({choices:[{message:{content:JSON.stringify(choice)}}]});}
  if(url.includes('nvidianews'))return new Response(article('NVIDIA announces leadership change',now-3600000,'https://nvidianews.nvidia.com/news/ceo')+article('Later news',now+86400000,'https://nvidianews.nvidia.com/news/later'));
  return new Response(article('Nvidia jumps after leadership change',now-300000,'https://finance.yahoo.com/news/rally'));
 };
 const result=await equityContext('NVDAc',{fetchImpl,now,env:{OG_API_KEY:'test',OG_MODEL:'test'}});
 return {result,packet};
}
test('inference receives dated links, distinct source types and a separate stock quote',async()=>{
 const {result,packet}=await run({event:'S1',report:'S2',attributionQuote:'Nvidia jumps after leadership change'});
 assert.equal(packet.evidence.length,2);
 assert.equal(packet.evidence[0].kind,'issuer-announcement');
 assert.equal(result.report.url,packet.evidence[1].url);
 assert.equal(result.attribution,'reported-link');
 assert.match(equityMessage(result),/20.00%/);
});
test('future headlines, stale prices and invented references cannot establish a catalyst',async()=>{
 const {result}=await run({event:'S90',report:'S91'});
 assert.equal(result.attribution,'unconfirmed');
 assert.ok(result.evidence.every(e=>Date.parse(e.publishedAt)<=now));
 const stale=await run({},now-8*86400000);
 assert.equal(stale.result.quote,null);
 assert.equal(stale.packet,undefined);
});
test('a direct move question resolves the stock without inventing a blockchain',()=>{
 assert.deepEqual(directProductIntent('Why did NVIDIA surge?'),{name:'equity_market_context',args:{ticker:'NVDA'}});
});

test('a token comparison cannot borrow the underlying stock percentage',()=>{
 const result=directProductIntent('Did NVDAc on Base move by the same amount?');
 assert.match(result.message,/needs token prices at both/);
 assert.deepEqual(result.actions,[]);
});
