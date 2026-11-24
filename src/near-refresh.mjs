const address = value => typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value);
const utc = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const usd = value => value.toLocaleString('en-US', {style:'currency', currency:'USD', maximumFractionDigits:2});
const positive = value => /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(String(value)) && /[1-9]/.test(String(value));

function upcomingSchedule(report, checkedAt) {
 const groups = [...(report.tokenLocks?.sources || []), report.pinkLock, ...(report.hoodLocks || []), ...(report.titanLocks || []), report.uncxVesting];
 const dates = [];
 for (const group of groups) for (const row of group?.records || []) {
  if (row.conditionContract || row.cancelled || row.soft || row.kind === 'liquidity-position' || row.status === 'withdrawn') continue;
  if (!positive(row.lockedRaw ?? row.remainingRaw ?? row.remainingShares ?? row.scheduledUnvested ?? row.locked ?? row.remaining)) continue;
  for (const field of ['nextScheduleDate','unlockDate','tgeOrUnlockDate','cliff','cliffUtc','firstReleaseUtc','vestingEndUtc','scheduledEndUtc','scheduleEnd','end']) {
   const date = utc(row[field]);
   if (date && date > checkedAt) dates.push(date);
  }
 }
 return dates.sort()[0] || null;
}

export function researchSnapshot(report) {
 const checkedAt = utc(report?.checkedAt);
 if (!checkedAt || !address(report.address) || ![8453,4663].includes(report.chainId)) return null;
 const pools = [];
 for (const pool of report.market?.pairs || [report.market]) {
  if (!/^0x(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(pool?.pairAddress || '') || !Number.isFinite(pool.liquidityUsd) || pool.liquidityUsd < 0) continue;
  pools.push({id:pool.pairAddress.toLowerCase(), usd:pool.liquidityUsd, source:pool.source || report.market?.source});
 }
 const wallets = [];
 for (const row of report.holders?.holderActivity || report.holders?.behavior?.rows || []) {
  if (!address(row.address) || !['available','partial'].includes(row.status) || !Array.isArray(row.recentSwaps)) continue;
  const trades = [];
  for (const swap of row.recentSwaps) {
   const side = swap.side || ({'target-token buy candidate':'buy','target-token sell candidate':'sell'})[swap.targetTokenAction];
   const at = utc(swap.at || swap.timestamp);
   if (at && ['buy','sell'].includes(side) && /^0x[a-f0-9]{64}$/i.test(swap.transactionHash || '')) trades.push({side,at,hash:swap.transactionHash.toLowerCase()});
  }
  wallets.push({address:row.address.toLowerCase(),trades});
 }
 const progress = report.ponsState?.curve?.progressPercent;
 return {address:report.address.toLowerCase(),chain:report.chainId,checkedAt,pools,wallets,
  progress:Number.isFinite(progress)?progress:null,phase:report.ponsState?.phase ?? null,
  schedule:upcomingSchedule(report,checkedAt)};
}

export function refreshSummary(first, current) {
 const lines = ['## Since your first report'];
 if (!first || !current || first.chain !== current.chain || first.address !== current.address || current.checkedAt <= first.checkedAt)
  return [...lines,'A comparable pair of dated snapshots is unavailable. The refreshed findings follow below.'].join('\n');
 lines.push('First check '+first.checkedAt+' · refreshed '+current.checkedAt+'.');
 const original = first.pools[0];
 if (original) {
  const pool = current.pools.find(p=>p.id===original.id && p.source===original.source);
  lines.push(pool ? 'Liquidity in pool '+pool.id+' went from '+usd(original.usd)+' to '+usd(pool.usd)+'.' : 'The original pool’s liquidity could not be rechecked from the same source.');
 } else if (current.pools.length) lines.push('Pool liquidity is available now. The first report had no comparable figure.');
 if (first.progress!==null) {
  if (current.phase===2) lines.push('The launch moved from the bonding curve to its pool.');
  else if (current.progress!==null) lines.push('Bonding curve progress went from '+first.progress+'% to '+current.progress+'%.');
  else lines.push('The original curve measurement could not be rechecked.');
 }
 const overlap = current.wallets.filter(row=>first.wallets.some(old=>old.address===row.address));
 if (overlap.length) {
  const trades = overlap.flatMap(row=>row.trades.filter(t=>t.at>first.checkedAt && t.at<=current.checkedAt).map(t=>({...t,wallet:row.address})));
  const count = side=>new Set(trades.filter(t=>t.side===side).map(t=>t.wallet+t.hash)).size;
  lines.push('Across '+overlap.length+' overlapping sampled holder wallet(s), the available history shows '+count('buy')+' buy and '+count('sell')+' sell candidate transactions since the first check. Activity outside the sample can be missed.');
  if (overlap.length<first.wallets.length) lines.push('Some wallets from the first sample could not be compared.');
 } else lines.push('Holder activity could not be compared across the same sampled wallets.');
 if (first.schedule && first.schedule<=current.checkedAt) lines.push('The previously reported schedule date ('+first.schedule+') has passed. A withdrawal still needs separate evidence.');
 if (current.schedule) {
  const days=(Date.parse(current.schedule)-Date.parse(current.checkedAt))/86400000;
  lines.push('Earliest upcoming date in the checked token lock schedules: '+current.schedule+' ('+(days<1?'under one day':Math.ceil(days)+' days away')+').');
 } else if (first.schedule) lines.push('The refresh yielded no upcoming date in the checked schedules. A release could not be confirmed.');
 return lines.join('\n');
}
