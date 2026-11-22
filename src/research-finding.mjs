import {baseLockRecordLine} from './base-lock-evidence.mjs';
import {hoodRecordLine} from './hoodlock-robinhood.mjs';
import {titanRecordLine} from './titan-robinhood.mjs';
import {uncxRecordLine} from './uncx-robinhood.mjs';

export function requestedLockFocus(text=''){
 const names=['titan','hoodlock','uncx','pinklock'].filter(name=>new RegExp('\\b'+name+'\\b','i').test(text));
 if(names.length===1)return names[0];
 if(names.length||/\b(?:locks?|locked|unlocks?|unlocking|vesting|vested|cliff)\b/i.test(text))return 'locks';
}

function robinhoodFinding(report,focus){
 const findings=[];
 const include=name=>focus==='locks'||focus===name;
 if(include('titan'))for(const m of report.titanLocks||[]){
  for(const r of m.records)findings.push('Titan '+titanRecordLine(m.version,r));
 }
 if(include('hoodlock'))for(const m of report.hoodLocks||[]){
  for(const r of m.records)findings.push('HoodLock '+hoodRecordLine(r)+' '+m.source);
 }
 if(include('uncx')&&report.uncxVesting){
  const m=report.uncxVesting;
  for(const r of m.records)findings.push('UNCX '+uncxRecordLine(r)+' '+m.source);
 }
 if(include('pinklock'))for(const r of report.pinkLock?.records||[]){
  if(r.kind!=='token')continue;
  findings.push('PinkLock #'+r.id+'. Remaining in the locker: '+(r.remaining??'unavailable')+'. Withdrawable: '+(r.currentlyWithdrawable??'unavailable')+'. First release or unlock: '+(r.tgeOrUnlockDate??'unavailable')+'. '+(r.pinkSaleUrl||r.sourceUrl||''));
 }
 const statuses=[];
 if(include('titan'))statuses.push(...(report.titanLocks||[]).map(m=>m.status));
 if(include('hoodlock'))statuses.push(...(report.hoodLocks||[]).map(m=>m.status));
 if(include('uncx'))statuses.push(report.uncxVesting?.status);
 if(include('pinklock'))statuses.push(report.pinkLock?.status);
 const lines=findings.slice(0,3);
 if(!lines.length)lines.push('No matching token-lock record was verified in the requested checks.');
 if(findings.length>3)lines.push('Showing 3 of '+findings.length+' verified records. The full report follows.');
 if(!statuses.length||statuses.some(s=>!s||/partial|unavailable|unknown/i.test(s)))lines.push('Some requested checks were incomplete.');
 lines.push('Robinhood Chain block '+report.blockNumber+'.');
 return lines;
}

export function lockFinding(report,focus){
 if(!focus)return '';
 const title=value=>String(value||'Token').replace(/[^a-zA-Z0-9 ._-]/g,'').slice(0,40)||'Token';
 if(report.chainId===4663){
  const targets=[report,...(report.stockInspection?[report.stockInspection]:[])];
  return targets.map(t=>'## '+title(t.symbol)+' lock findings\n\n'+robinhoodFinding(t,focus).join('\n\n')).join('\n\n');
 }
 const scans=[report.tokenLocks,report.stockLocks].filter(Boolean);
 return scans.map(scan=>{
  const sources=scan.sources||[];
  const matched=sources.filter(s=>s.records?.length&&(focus==='locks'||s.name.toLowerCase().includes(focus)));
  const lines=matched.slice(0,3).map(s=>s.name+' '+baseLockRecordLine(s.records[0])+' '+s.url);
  if(!lines.length&&focus==='locks'&&scan.index?.nextIndexedEvent)lines.push('Next indexed release '+scan.index.nextIndexedEvent.utc+'. '+scan.index.url);
  if(focus==='locks'&&scan===report.tokenLocks&&report.vesting?.status==='reported'){
   const v=report.vesting;
   lines.unshift('Bankr creator allocation: '+v.lockedAmount+' locked. Cliff '+v.cliffEndsAt+', schedule ends '+v.vestingEndsAt+'. '+v.url);
  }
  if(!lines.length)lines.push('See the detailed source checks below for schedule evidence and coverage.');
  return '## Lock findings for '+scan.token+'\n\n'+lines.join('\n\n')+'\n\nBase block '+(scan.block??'unavailable')+'.';
 }).join('\n\n');
}

export function leadWithLockFinding(report,focus,body){
 const finding=focus&&body?lockFinding(report,focus):'';
 return finding?finding+'\n\n'+body:body;
}
