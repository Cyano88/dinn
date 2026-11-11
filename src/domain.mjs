export const CHAIN_ID = 99901;
export const contracts = {
  factory: '0x63f6a8A8d0257c0363251a50cdE8A8b1046e4d19',
  launchpad: '0xe0dEF4221b9840a610D4e7d55812a79A6431a8eC',
  router: '0x1B341FDD55d56F8E08409A2C25DDFad93Eb03C1a',
  quoter: '0x379F556c5a748BD7Cc9baF0F7A344094Ac1814f5',
  permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
};
export const pairs = {
  USDC: {address:'0xb47c4C8F73F009CC0C0d3f92B388d13E293F0B65', decimals:6},
  HYPE: {address:'0xbA876237B0F021A6c6D852d6c26E107997cC5E81', decimals:18},
  KNTQ: {address:'0xe45a355d9e9cAd2aD85F2d03E3eE3102A036acF0', decimals:18}
};
export const capabilities = {
 launch: {title:'Launch a token', status:'adapter', description:'Vanilla launch; fixed 1 billion supply. Live simulation requires a verified Elysium RPC.'},
 buy: {title:'Buy tokens', status:'planned', description:'Ascend V4Quoter and Permit2 router integration documented; execution adapter pending.'},
 sell: {title:'Sell tokens', status:'planned', description:'Exact-input sale with a fresh quote, minimum received, allowance and expiry.'},
 lock: {title:'Lock holdings', status:'blocked', description:'A verified token locker and beneficiary/unlock-date rules are required. Launch liquidity is already permanently locked.'},
 burn: {title:'Remove tokens from circulation', status:'blocked', description:'BurnSink is documented. A transfer to a sink is not proof that totalSupply decreases. Token-specific support must be verified.'},
 claim: {title:'Claim creator fees', status:'planned', description:'Read claimable fees and validate the token escrow before preparing claim(account).'},
 fund: {title:'Fund through NEAR', status:'blocked', description:'NEAR Intents funding route into Elysium has not been verified. No deposit addresses are generated.'},
 dex: {title:'Pay for DEX services', status:'blocked', description:'Provider and product must be selected: listing, profile, ads and liquidity are different actions.'}
};
export function inferActions(text) {
 if (typeof text !== 'string' || !text.trim() || text.length > 6000) throw new Error('Enter a request of 1–6000 characters.');
 const rules = {launch:/\b(launch|deploy|create.*token)\b/i,buy:/\bbuy\b/i,sell:/\bsell\b/i,lock:/\b(lock|vest)\b/i,burn:/\bburn\b/i,claim:/\bclaim\b/i,fund:/\b(bridge|fund|near)\b/i,dex:/\b(dex|listing|advert|promotion|liquidity)\b/i};
 return Object.entries(rules).filter(([,re])=>re.test(text)).map(([id])=>id);
}
export function validateLaunch(input) {
 if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid launch configuration.');
 const allowed = ['name','symbol','pair','feePercent','recipient','account','cto'];
 if (Object.keys(input).some(k=>!allowed.includes(k))) throw new Error('Unsupported launch setting. Custom supply, dev buys and builder fees are not enabled.');
 const name = String(input.name ?? '').trim(), symbol = String(input.symbol ?? '').trim();
 if (!name || [...name].length > 40 || /[\x00-\x1f\x7f]/.test(name)) throw new Error('Name must contain 1–40 characters without control characters.');
 if (!/^[A-Za-z0-9]{1,12}$/.test(symbol)) throw new Error('This preview supports 1–12 alphanumeric ticker characters.');
 if (!Object.hasOwn(pairs,input.pair)) throw new Error('Choose USDC, HYPE or KNTQ.');
 const fee = String(input.feePercent ?? '');
 if (!/^\d+(\.\d{1,2})?$/.test(fee) || Number(fee)<1 || Number(fee)>10) throw new Error('Trading fee must be 1–10%, with at most two decimal places.');
 for (const key of ['recipient','account']) if (!/^0x[0-9a-fA-F]{40}$/.test(input[key] ?? '') || /^0x0{40}$/i.test(input[key])) throw new Error(`A nonzero EVM ${key} address is required.`);
 if (typeof input.cto !== 'boolean') throw new Error('Choose whether to allow community takeovers.');
 return {name,symbol,pair:input.pair,feePips:Math.round(Number(fee)*10000),recipient:input.recipient,account:input.account,cto:input.cto,supply:'1000000000',devBuy:'0',builderFee:0};
}
export function draftPlan(text) {
 const ids = inferActions(text);
 return {mode:'guided', message:ids.length ? 'Here is the action queue. Each action has its own terms and approval. Nothing has been signed or sent.' : 'Try launching a token, buying, selling, locking holdings, burning tokens, claiming fees or funding a launch.', actions:ids.map(id=>({id,...capabilities[id]}))};
}
