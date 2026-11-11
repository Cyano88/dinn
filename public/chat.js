export const HISTORY_LIMIT=12,HISTORY_CHARS=12000;
export function validateHistory(value=[]){
 if(!Array.isArray(value)||value.length>HISTORY_LIMIT||value.length%2)throw Error('Invalid conversation history.');
 let size=0;
 const history=value.map((m,i)=>{
  if(!m||Object.keys(m).some(k=>!['role','content'].includes(k))||m.role!==(i%2?'assistant':'user')||typeof m.content!=='string'||!m.content.trim()||m.content.length>6000)throw Error('Invalid conversation history.');
  size+=m.content.length;return {role:m.role,content:m.content};
 });
 if(size>HISTORY_CHARS)throw Error('Conversation history is too long.');
 return history;
}
export function appendExchange(history,user,assistant){
 const next=[...history,{role:'user',content:user},{role:'assistant',content:assistant}];
 while(next.length>HISTORY_LIMIT||next.reduce((n,m)=>n+m.content.length,0)>HISTORY_CHARS)next.splice(0,2);
 return validateHistory(next);
}
export function restoreConversation(raw){try{return validateHistory(JSON.parse(raw).messages);}catch{return [];}}
export async function* readLines(body){
 if(!body)throw Error('Response stream is unavailable.');
 const reader=body.getReader(),decoder=new TextDecoder();let buffer='';
 try{while(true){const {value,done}=await reader.read();buffer+=done?decoder.decode():decoder.decode(value,{stream:true});
  let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).replace(/\r$/,'');if(line.length>65536)throw Error('Response event is too large.');buffer=buffer.slice(end+1);yield line;}
  if(buffer.length>65536)throw Error('Response event is too large.');
  if(done){if(buffer)yield buffer.replace(/\r$/,'');break;}
 }}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function receiveChat(response,onDelta){
 if(!response.ok){const data=await response.json();throw Error(data.error||'Dinn could not respond. Please try again.');}
 let text='';
 for await(const line of readLines(response.body)){
  if(!line.trim())continue;const event=JSON.parse(line);
  if(event.type==='error')throw Error(event.message||'The reply was interrupted.');
  if(event.type==='delta'){
   if(typeof event.text!=='string'||text.length+event.text.length>6000)throw Error('The reply exceeded its limit.');
   text+=event.text;if(event.text)onDelta(event.text);
  }
  if(event.type==='done'){
   if(!text.trim()||event.result?.message!==text||!Array.isArray(event.result.actions))throw Error('The reply could not be verified as complete.');
   return event.result;
  }
 }
 throw Error('The connection ended before Dinn finished. Please try again.');
}
