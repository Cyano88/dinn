const BASE='https://market.near.ai';
export const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function createNearMarketClient({token,fetcher=fetch}={}){
 if(typeof token!=='string'||!/^aat_[A-Za-z0-9_-]{12,}$/.test(token))throw Error('Configure the server-side NEAR_AGENT_TOKEN.');
 async function request(path,{method='GET',body,text=false}={}){
  if(!/^\/v1\/agents\/me\/assignments\?status=all&limit=100&offset=\d+$/.test(path)&&!/^\/v1\/jobs\/[0-9a-f-]{36}$/.test(path)&&!/^\/v1\/assignments\/[0-9a-f-]{36}\/(start|submit|deliverable\/raw|messages)$/.test(path)&&!/^\/v1\/bids\/[0-9a-f-]{36}\/messages$/.test(path))throw Error('Unsupported marketplace path.');
  if(method!=='GET'&&!/^\/v1\/assignments\/[0-9a-f-]{36}\/(start|submit)$/.test(path))throw Error('Unsupported marketplace write.');
  let r;try{r=await fetcher(BASE+path,{method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000),redirect:'error'});}catch{throw Object.assign(Error('NEAR marketplace response unavailable.'),{code:'NETWORK_UNCERTAIN'});}
  if(!r.ok)throw Object.assign(Error('NEAR marketplace request failed ('+r.status+').'),{code:'MARKET_HTTP',status:r.status});
  const value=await r.text();if(value.length>2000000)throw Error('Marketplace response exceeds the limit.');if(text)return value;try{return JSON.parse(value);}catch{throw Error('Marketplace returned invalid JSON.');}
 }
 async function assignments(){const rows=[];for(let offset=0;offset<1000;offset+=100){const r=await request('/v1/agents/me/assignments?status=all&limit=100&offset='+offset);if(!Array.isArray(r.assignments)||r.assignments.length>100)throw Error('Invalid assignment list.');rows.push(...r.assignments);if(r.assignments.length<100)return rows;}throw Error('Assignment queue exceeds the supported pagination limit.');}
 const path=(id,suffix)=>{if(!uuid(id))throw Error('Invalid assignment identifier.');return '/v1/assignments/'+id+'/'+suffix;};
 return {assignments,async assignment(id){if(!uuid(id))throw Error('Invalid assignment identifier.');const matches=(await assignments()).filter(r=>r.assignment?.assignmentId===id);if(matches.length>1)throw Error('Duplicate assignment identity.');return matches[0]||null;},job:id=>{if(!uuid(id))throw Error('Invalid job identifier.');return request('/v1/jobs/'+id);},messages:id=>request(path(id,'messages')),bidMessages:id=>{if(!uuid(id))throw Error('Invalid bid identifier.');return request('/v1/bids/'+id+'/messages');},start:id=>request(path(id,'start'),{method:'POST'}),submit:(id,markdown)=>request(path(id,'submit'),{method:'POST',body:{deliverableMarkdown:markdown,files:[]}}),delivered:id=>request(path(id,'deliverable/raw'),{text:true})};
}
