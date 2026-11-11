export function renderAssistantText(host,text){
 const doc=host.ownerDocument;host.replaceChildren();
 function inline(parent,value){
  const pattern=/(`[^`\n]+`|\*\*[^*\n]+\*\*|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\))/g;let offset=0;
  for(const match of value.matchAll(pattern)){
   parent.append(doc.createTextNode(value.slice(offset,match.index)));let node;
   if(match[0].startsWith('**')){node=doc.createElement('strong');node.textContent=match[0].slice(2,-2);}
   else if(match[0].startsWith('`')){node=doc.createElement('code');node.textContent=match[0].slice(1,-1);}
   else {let url;try{url=new URL(match[3]);}catch{}if(!url||url.username||url.password){parent.append(doc.createTextNode(match[0]));offset=match.index+match[0].length;continue;}node=doc.createElement('a');node.href=url.href;node.target='_blank';node.rel='noopener noreferrer';node.textContent=match[2];
    if(url.protocol==='https:'&&!url.port&&['assets.geckoterminal.com','cdn.dexscreener.com'].includes(url.hostname)&&/logo|image/i.test(match[2]+' '+value)){
     node=doc.createElement('span');node.className='chat-logo-download';const button=doc.createElement('button'),status=doc.createElement('small');button.type='button';button.className='subtle';button.textContent='↓ Download logo';button.setAttribute('aria-label','Download token logo');status.setAttribute('role','status');node.append(button,status);
     button.onclick=async()=>{button.disabled=true;status.textContent=' Downloading…';try{const response=await fetch('/api/dex/logo-download',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:url.href,name:String(text).match(/\(([A-Z0-9_-]{1,20})\)/)?.[1]||'token'})});if(!response.ok){const error=await response.json();throw Error(error.error||'Logo download failed.');}const blob=await response.blob();if(!button.isConnected)return;const objectUrl=URL.createObjectURL(blob),link=doc.createElement('a');link.href=objectUrl;link.download=response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]||'token-logo';doc.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);status.textContent=' Downloaded. Upload this file on DEX Screener.';}catch(error){if(button.isConnected)status.textContent=' '+error.message;}finally{button.disabled=false;}};
    }
   }
   parent.append(node);offset=match.index+match[0].length;
  }
  parent.append(doc.createTextNode(value.slice(offset)));
 }
 let list=null,paragraph=null,code=null;
 for(const line of String(text).split('\n')){
  if(/^\s*```/.test(line)){if(code){code=null;}else{const pre=doc.createElement('pre');code=doc.createElement('code');pre.append(code);host.append(pre);}list=paragraph=null;continue;}
  if(code){code.textContent+=(code.textContent?'\n':'')+line;continue;}
  if(!line.trim()){list=paragraph=null;continue;}
  const bullet=line.match(/^\s*(?:[-*]\s+|\d+[.)]\s+)(.*)$/);
  if(bullet){const ordered=/^\s*\d/.test(line);if(!list||list.tagName!==(ordered?'OL':'UL')){list=doc.createElement(ordered?'ol':'ul');host.append(list);}const li=doc.createElement('li');inline(li,bullet[1]);list.append(li);paragraph=null;continue;}
  list=null;if(!paragraph){paragraph=doc.createElement('p');host.append(paragraph);}else paragraph.append(doc.createElement('br'));inline(paragraph,line.replace(/^#{1,6}\s+/,''));
 }
}
