import test from 'node:test';
import assert from 'node:assert/strict';
import {agentAccessRequest} from '../src/agent-access.mjs';

const address='0x'+'1'.repeat(40);

test('GoldRush holder reads are disabled for public previews and enabled for paid marketplace hires only',async()=>{
 const observed=[];
 const baseStockResearch=async(_input,options)=>{
  observed.push(options.holderSnapshotEnabled);
  return {address,classification:'insufficient-evidence',checkedAt:'2026-11-19T12:00:00Z',coverage:{holders:options.holderSnapshotEnabled?'not configured':'not requested for the free public preview'},verification:{status:'unavailable'}};
 };
 await agentAccessRequest({service:'base.stock-paired.research',input:{address}},{baseStockResearch});
 await agentAccessRequest({service:'base.stock-paired.research',input:{address}},{baseStockResearch,paidMarketplaceHire:true});
 assert.deepEqual(observed,[false,true]);
});
