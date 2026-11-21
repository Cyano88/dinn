const params=new URLSearchParams(location.hash.slice(1)),id=params.get('job'),code=params.get('code');
const form=document.querySelector('form'),button=form.querySelector('button'),status=document.querySelector('[role=status]');
async function send(reply){
 const response=await fetch('/api/feedback/market',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,code,...(reply?{reply}:{})})});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Feedback is unavailable.');
}
try{await send();button.disabled=false;status.textContent='Optional. Your reply goes to the Dinn team.';}catch(e){status.textContent=e.message;}
form.onsubmit=async e=>{e.preventDefault();button.disabled=true;try{const reply=document.querySelector('#reply').value.trim();if(!reply)throw Error('Enter your feedback first.');await send(reply);form.hidden=true;status.textContent='Feedback saved. Thank you.';}catch(e){status.textContent=e.message;button.disabled=false;}};
