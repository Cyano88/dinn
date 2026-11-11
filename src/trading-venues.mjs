import {MONTRA_ROUTER,MONTRA_HOOK} from './market-call.mjs';
import {montraSwapsEnabled} from './execution-policy.mjs';
const same=(a,b)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase();
export function tradingCapability(pool,env=process.env){
 const supported=pool?.venue==='Montra'&&same(pool.quote,'0x0000000000000000000000000000000000000000')&&same(pool.router,MONTRA_ROUTER)&&same(pool.key?.hooks,MONTRA_HOOK);
 return {adapter:supported?'montra-native':null,canExecute:supported&&montraSwapsEnabled(env),reason:!supported?'This pool is available for inspection only.':!montraSwapsEnabled(env)?'Trading is not enabled.':null};
}
