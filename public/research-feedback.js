const params=new URLSearchParams(location.hash.slice(1)),id=params.get('job'),code=params.get('code');
const form=document.querySelector('form'),button=form.querySelector('button'),status=document.querySelector('[role=status]'),remove=document.querySelector('#remove');
let byline;
async function send(fields={}){
 const response=await fetch('/api/feedback/market',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,code,publicFeed:true,...fields})});
 const result=await response.json();
 if(!response.ok)throw Error(result.error||'Feedback is unavailable.');
 return result;
}
try{
 const state=await send();
 byline=state.byline;form.hidden=state.answered;remove.hidden=!state.published;
 document.querySelector('#notice').textContent=state.test?'This is an internal test. Your reply stays private.':'Your reply will appear on Dinn’s public feed as '+byline+'.';
 if(state.test)button.textContent='Send test feedback';
 status.textContent=state.answered?(state.published?'Published to Feedback.':'Feedback already received.'):'';
}catch(e){status.textContent=e.message;}
form.onsubmit=async e=>{
 e.preventDefault();button.disabled=true;
 try{
  const result=await send({byline,reply:document.querySelector('#reply').value.trim()});
  form.hidden=true;remove.hidden=!result.published;status.textContent=result.published?'Published to Feedback.':'Feedback saved.';
 }catch(e){status.textContent=e.message;}finally{button.disabled=false;}
};
remove.onclick=async()=>{
 remove.disabled=true;
 try{await send({action:'remove'});remove.hidden=true;status.textContent='Removed from the public feed.';}
 catch(e){status.textContent=e.message;}finally{remove.disabled=false;}
};
