export const socialFields=['website','twitter','telegram','discord','farcaster'];
export const socialLabels={website:'Website',twitter:'X',telegram:'Telegram',discord:'Discord',farcaster:'Farcaster'};
export function cleanSocials(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!socialFields.includes(k)))throw Error('Invalid social links.');
 return Object.fromEntries(socialFields.map(k=>{const raw=value[k]??'';if(typeof raw!=='string')throw Error('Invalid '+socialLabels[k]+' link.');const v=raw.trim();if(v){let u;try{u=new URL(v);}catch{throw Error('Use a full HTTPS URL for '+socialLabels[k]+'.');}if(v.length>300||u.protocol!=='https:'||u.username||u.password||/[\x00-\x20\x7f]/.test(v))throw Error('Use a full HTTPS URL for '+socialLabels[k]+', without credentials or spaces.');}return [k,v];}));
}
export function metadataEdit(text){const match=text.trim().match(/^(?:set|add|update|change) (?:my |the )?(website|x|twitter|telegram|discord|farcaster)(?: link)?(?: to| is|:)\s+(.+)$/i);if(!match)return null;const field=match[1].toLowerCase()==='x'?'twitter':match[1].toLowerCase();return {field,value:cleanSocials({[field]:match[2]})[field]};}
