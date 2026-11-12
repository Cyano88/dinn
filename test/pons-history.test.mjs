import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters,parseAbiItem,toEventSelector} from 'viem';
import {researchPonsHistory} from '../src/pons-history.mjs';
import {PONS_FACTORY} from '../src/pons.mjs';

const token='0x'+'1'.repeat(40),curve='0x'+'2'.repeat(40),buyer='0x'+'3'.repeat(40),seller='0x'+'4'.repeat(40),hash='0x'+'a'.repeat(64);
const launchBlock=10n,checkedBlock=20n,wei=n=>BigInt(n)*10n**18n;
const launched=parseAbiItem('event TokenLaunched(address indexed token,address indexed curve,address indexed deployer,address pairToken,uint256 launchConfigId,uint256 graduationThreshold)');
const buy=parseAbiItem('event CurveBuy(address indexed buyer,address indexed recipient,uint256 quoteIn,uint256 tokensOut,uint256 fee,uint256 tax)');
const sell=parseAbiItem('event CurveSell(address indexed seller,address indexed recipient,uint256 tokensIn,uint256 quoteOut,uint256 fee,uint256 tax)');
const topicAddress=value=>'0x'+value.slice(2).toLowerCase().padStart(64,'0');
const makeLog=(event,indexed,types,values,block,transactionHash,addressValue)=>({address:{hash:addressValue},topics:[toEventSelector(event),...indexed.map(topicAddress)],data:encodeAbiParameters(types.map(type=>({type})),values),block_number:String(block),transaction_hash:transactionHash});
const launchLog=curveValue=>({...makeLog(launched,[token,curveValue,seller],['address','uint256','uint256'],['0x'+'0'.repeat(40),0n,wei(41)],10n,hash,PONS_FACTORY),topics:[toEventSelector(launched),topicAddress(token),topicAddress(curveValue),topicAddress(seller)]});
function fixture({phase=0,logs}={}){
 const calls=[],tradeLogs=logs||[
  makeLog(buy,[buyer,buyer],['uint256','uint256','uint256','uint256'],[wei(5),wei(100),wei(1)/10n,wei(1)/5n],12n,hash,curve),
  makeLog(sell,[seller,seller],['uint256','uint256','uint256','uint256'],[wei(1),wei(2),wei(1)/20n,wei(1)/10n],15n,'0x'+'b'.repeat(64),curve)
 ];
 const client={getBlock:async({blockNumber})=>({timestamp:blockNumber===launchBlock?1_800_000_000n:1_800_172_800n})};
 const read=async(path)=>{calls.push(path);if(path==='addresses/'+token)return {hash:token,creation_transaction_hash:hash,creation_status:'success'};if(path==='transactions/'+hash+'/logs')return {items:[launchLog(curve)],next_page_params:null};if(path==='blocks/10')return {height:'10',timestamp:'2027-01-15T08:00:00.000000Z'};return {items:path.toLowerCase().includes(PONS_FACTORY.toLowerCase())?[launchLog(curve)]:tradeLogs,next_page_params:null};};
 return {client,read,calls,phase,tradeLogs};
}

test('Pons event report binds launch token and curve and totals curve volume, fees and top holder flows',async()=>{
 const f=fixture(),checkedAt='2027-01-22T00:00:00.000Z';
 const report=await researchPonsHistory({address:token,curve,phase:0,tokenDecimals:18,pairDecimals:18,pairSymbol:'ETH',blockNumber:checkedBlock,checkedAt,client:f.client,read:f.read,holders:[{address:buyer},{address:seller}]});
 assert.equal(f.calls.length,4);assert.equal(f.calls[0],'addresses/'+token);assert.equal(f.calls[1],'transactions/'+hash+'/logs');assert.equal(f.calls[2],'blocks/10');assert.equal(f.calls[3],'addresses/'+curve+'/logs');assert.equal(report.status,'available');assert.equal(report.launchTransactionHash,hash);assert.equal(report.launchedAt,'2027-01-15T08:00:00.000Z');assert.equal(report.curve.buyCount,1);assert.equal(report.curve.sellCount,1);assert.equal(report.curve.totalVolume,'7');assert.equal(report.curve.baseAndSnipeFees,'0.15');assert.equal(report.curve.creatorTax,'0.3');assert.equal(report.curve.totalFees,'0.45');
 assert.deepEqual(report.holderActivity.map(x=>[x.address,x.buys,x.sells,x.buyTokens,x.sellTokens]),[[buyer,1,0,'100','0'],[seller,0,1,'0','1']]);assert.equal(report.holderEventSummary.addressesWithBuys,1);assert.equal(report.holderEventSummary.addressesWithSells,1);assert.match(report.coverage,/Complete Pons curve history/);
});

test('Pons launch mismatch is unknown, complete curve totals survive graduation, and bounded scans stay partial',async()=>{
 const mismatch=fixture();mismatch.read=async path=>path==='addresses/'+token?{hash:token,creation_transaction_hash:hash,creation_status:'success'}:path==='transactions/'+hash+'/logs'?{items:[launchLog(seller)],next_page_params:null}:path.toLowerCase().includes(PONS_FACTORY.toLowerCase())?{items:[launchLog(seller)],next_page_params:null}:{items:[],next_page_params:null};
 assert.match((await researchPonsHistory({address:token,curve,phase:0,tokenDecimals:18,pairDecimals:18,pairSymbol:'ETH',blockNumber:checkedBlock,client:mismatch.client,read:mismatch.read})).reason,/matching both/);
 const graduatedFixture=fixture(),graduated=await researchPonsHistory({address:token,curve,phase:2,tokenDecimals:18,pairDecimals:18,pairSymbol:'ETH',blockNumber:checkedBlock,checkedAt:'2027-01-22T00:00:00Z',client:graduatedFixture.client,read:graduatedFixture.read});assert.equal(graduated.status,'available');assert.equal(graduated.curve.totalVolume,'7');assert.equal(graduated.curve.tradeCount,2);assert.match(graduated.coverage,/post-graduation Uniswap v4/i);
 const incomplete=fixture();let curvePages=0;const normalRead=incomplete.read;incomplete.read=async path=>{if(path==='addresses/'+curve+'/logs'){curvePages++;return {items:curvePages===1?incomplete.tradeLogs:[],next_page_params:{block_number:'12',index:0,items_count:'100'}};}return normalRead(path);};const partial=await researchPonsHistory({address:token,curve,phase:0,tokenDecimals:18,pairDecimals:18,pairSymbol:'ETH',blockNumber:checkedBlock,checkedAt:'2027-01-22T00:00:00Z',client:incomplete.client,read:incomplete.read});assert.equal(partial.status,'partial');assert.equal(partial.curve.totalVolume,null);assert.equal(partial.curve.scannedVolume,'7');assert.equal(partial.curve.scannedTradeCount,2);assert.equal(curvePages,80);
});
