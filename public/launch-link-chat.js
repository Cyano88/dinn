export const launchLinkSteps=[{field:'twitter',label:'X',prompt:'What is your project’s X link? Paste the URL or @handle, or say skip.'},{field:'telegram',label:'Telegram',prompt:'What is your project’s Telegram link? Paste the t.me link or @handle, or say skip.'},{field:'website',label:'website',prompt:'What is your project’s website? Paste its URL, or say skip.'}];
export function parseLaunchLink(text,field){
 const value=text.trim();
 if(/^(skip all|skip all links|no links)$/i.test(value))return {action:'skip-all'};
 if(/^(skip|skip (?:x|twitter|tg|telegram|website|link))$/i.test(value))return {action:'skip',field};
 if(/^(keep|keep (?:it|current|link)|continue|next)$/i.test(value))return {action:'keep',field};
 const labelled=value.match(/^(x|twitter|tg|telegram|website)\s*:?\s+(.+)$/i);
 if(labelled){field=({x:'twitter',twitter:'twitter',tg:'telegram',telegram:'telegram',website:'website'})[labelled[1].toLowerCase()];}
 let url=labelled?labelled[2].trim():value;
 if(/^@[a-z0-9_]{1,32}$/i.test(url)&&['twitter','telegram'].includes(field))url='https://'+(field==='twitter'?'x.com/':'t.me/')+url.slice(1);
 else if(/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?$/i.test(url))url='https://'+url;
 else if(!/^https?:\/\//i.test(url))return labelled?{action:'error',message:'Paste a full HTTPS link or a valid @handle.'}:null;
 let u;try{u=new URL(url);}catch{return {action:'error',message:'That link looks incomplete. Paste the full HTTPS URL.'};}
 if(u.protocol!=='https:'||u.username||u.password||url.length>300)return {action:'error',message:'Use an HTTPS link without embedded credentials.'};
 const host=u.hostname.toLowerCase().replace(/^www\./,'');
 if(field==='twitter'&&!['x.com','twitter.com'].includes(host))return {action:'error',message:'Use an x.com or twitter.com project link, or say skip.'};
 if(field==='telegram'&&!['t.me','telegram.me'].includes(host))return {action:'error',message:'Use a t.me project link, or say skip.'};
 if(['twitter','telegram'].includes(field)&&u.pathname==='/')return {action:'error',message:'Include your project’s profile or group in the link.'};
 return {action:'set',field,url:u.href};
}
