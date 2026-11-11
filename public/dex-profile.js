export const dexCheckout='https://marketplace.dexscreener.com/product/token-info';
export const profileFields=['address','name','symbol','description','logo','website','twitter','telegram'];
export function cleanDexProfile(input){
 const p={};for(const key of profileFields){if(typeof input?.[key]!=='string')throw Error('Missing '+key+'.');p[key]=input[key].trim();}
 if(!/^0x[0-9a-f]{40}$/i.test(p.address)||/^0x0{40}$/i.test(p.address))throw Error('Enter the deployed token address on Robinhood Chain.');
 if(p.name.length>80||p.symbol.length>20||p.description.length>1000)throw Error('Keep name under 80, ticker under 20 and description under 1,000 characters.');
 for(const key of ['logo','website','twitter','telegram']){if(!p[key])continue;let u;try{u=new URL(p[key]);}catch{throw Error('Use a full HTTPS URL for '+key+'.');}if(u.protocol!=='https:'||u.username||u.password||p[key].length>500)throw Error('Use a public HTTPS URL for '+key+'.');if(key==='twitter'&&!['x.com','twitter.com','www.x.com','www.twitter.com'].includes(u.hostname))throw Error('Use an X or Twitter profile URL.');if(key==='telegram'&&!['t.me','telegram.me'].includes(u.hostname))throw Error('Use a t.me or telegram.me URL.');}
 return p;
}
export function profileText(p){return ['DEX Screener Enhanced Token Info','Network: Robinhood Chain (4663)',...profileFields.filter(k=>p[k]).map(k=>k+': '+p[k])].join('\n');}

export function dexCheckoutFor(address){if(!/^0x[0-9a-f]{40}$/i.test(address)||/^0x0{40}$/i.test(address))throw Error('Invalid token address.');const u=new URL(dexCheckout+'/order');u.searchParams.set('chainId','robinhood');u.searchParams.set('tokenAddress',address);return u.href;}

export function dexDraftFor(saved={},address='',brief={}){const same=address&&typeof saved.address==='string'&&saved.address.toLowerCase()===address.toLowerCase();const source=address&&!same?{}:saved.address?saved:brief;return Object.fromEntries(profileFields.map(k=>[k,k==='address'?(address||saved.address||''):typeof source[k]==='string'?source[k]:'']));}
