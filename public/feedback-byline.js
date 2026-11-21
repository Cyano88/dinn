export function publicChatByline(value){
 const dots='\u2026';
 if(typeof value!=='string')return 'Dinn member';
 if(/^@[a-z0-9_]{0,3}\u2026[a-z0-9_]{0,4}$/i.test(value) || /^[a-z0-9._+-]{0,5}\u2026@(?:gmail|outlook|hotmail|icloud|yahoo|email)$/i.test(value))return value;
 if(/^@[a-z0-9_]{1,15}$/i.test(value)){
  const handle=value.slice(1),prefix=Math.min(3,Math.floor(handle.length/2));
  const suffix=Math.min(4,Math.floor((handle.length-prefix)/2));
  return '@'+handle.slice(0,prefix)+dots+(suffix?handle.slice(-suffix):'');
 }
 const email=/^([a-z0-9._+-]+)@([^@\s]+)$/i.exec(value);
 if(email){
  const provider=/^(gmail|outlook|hotmail|icloud|yahoo)\.com$/i.exec(email[2])?.[1].toLowerCase()||'email';
  return email[1].slice(0,Math.min(5,Math.floor(email[1].length/2)))+dots+'@'+provider;
 }
 return 'Dinn member';
}
export function publicAgentByline(value){
 return typeof value==='string' && (value.startsWith('@') || /^[^\s@]+@[^\s@]+$/.test(value))?publicChatByline(value):value;
}
