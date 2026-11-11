export function validateProfile(input={}){
 const profile={description:String(input.description||'').trim()};
 if(profile.description.length>500)throw Error('Keep the description under 500 characters.');
 for(const key of ['website','twitter','telegram']){
  const raw=String(input[key]||'').trim();if(!raw){profile[key]='';continue;}
  let url;try{url=new URL(raw);}catch{throw Error('Enter a full HTTPS link for '+key+'.');}
  if(url.protocol!=='https:'||url.username||url.password||raw.length>500)throw Error('Use a public HTTPS link for '+key+'.');
  const host=url.hostname.toLowerCase();
  if(key==='twitter'&&!['x.com','www.x.com','twitter.com','www.twitter.com'].includes(host))throw Error('Use an x.com or twitter.com profile link.');
  if(key==='telegram'&&!['t.me','www.t.me'].includes(host))throw Error('Use a t.me link for Telegram.');
  profile[key]=url.href;
 }
 if(input.image){if(typeof input.image!=='string'||input.image.length>500000||!/^data:image\/(?:png|webp);base64,[A-Za-z0-9+/]+=*$/.test(input.image))throw Error('Choose a valid token logo again.');profile.image=input.image;}
 return profile;
}
export function restoreProfile(raw){try{return validateProfile(JSON.parse(raw));}catch{return validateProfile();}}
export function mountProfile({getDraft,getProfile,onSave}){
 const $=s=>document.querySelector(s),dialog=$('#profile-dialog');let image='',bitmap=null,epoch=0;
 const fields=['description','website','twitter','telegram'];
 function release(){bitmap?.close();bitmap=null;}
 function draw(){
  if(!bitmap)return;
  const zoom=Number($('#crop-zoom').value),size=Math.min(bitmap.width,bitmap.height)/zoom;
  const x=(bitmap.width-size)*Number($('#crop-x').value)/100,y=(bitmap.height-size)*Number($('#crop-y').value)/100;
  const canvas=$('#profile-canvas'),context=canvas.getContext('2d');context.clearRect(0,0,512,512);context.drawImage(bitmap,x,y,size,size,0,0,512,512);
  image=canvas.toDataURL('image/webp',.86);preview();
 }
 function preview(){
  const draft=getDraft();$('#profile-preview-name').textContent=draft.name||'Your token';$('#profile-preview-symbol').textContent=draft.symbol?'$'+draft.symbol:'Ticker';
  $('#profile-preview-description').textContent=$('#profile-description').value||'Your project description will appear here.';
  const img=$('#profile-preview-image');img.hidden=!image;if(image)img.src=image;else img.removeAttribute('src');$('#profile-preview-initial').hidden=!!image;
  $('#profile-preview-initial').textContent=(draft.symbol||'D').slice(0,2);$('#remove-profile-image').hidden=!image;
  const links=$('#profile-preview-links');links.replaceChildren();
  for(const key of ['website','twitter','telegram'])if($('#profile-'+key).value.trim()){const span=document.createElement('span');span.textContent=key==='twitter'?'X':key==='telegram'?'Telegram':'Website';links.append(span);}
 }
 function open(){epoch++;release();const p=getProfile();image=p.image||'';for(const key of fields)$('#profile-'+key).value=p[key]||'';$('#profile-error').textContent='';$('#profile-file').value='';$('#crop-controls').hidden=true;preview();if(!dialog.open)dialog.showModal();}
 async function load(file){
  if(!file)return;const token=++epoch;$('#profile-error').textContent='';$('#profile-save').disabled=true;
  try{
   if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>4*1024*1024)throw Error('Choose a PNG, JPEG or WebP image under 4 MB.');
   const next=await createImageBitmap(file);
   if(next.width<64||next.height<64||next.width>8192||next.height>8192||next.width*next.height>16000000){next.close();throw Error('Use an image at least 64 px across and no larger than 16 megapixels.');}
   if(token!==epoch||!dialog.open){next.close();return;}
   release();bitmap=next;$('#crop-zoom').value='1';$('#crop-x').value='50';$('#crop-y').value='50';$('#crop-controls').hidden=false;draw();
  }catch(error){if(token===epoch)$('#profile-error').textContent=error.message||'This image could not be opened.';}
  finally{if(token===epoch)$('#profile-save').disabled=false;}
 }
 $('#profile-file').onchange=e=>load(e.target.files[0]);
 $('#choose-profile-image').onclick=()=>$('#profile-file').click();
 $('#remove-profile-image').onclick=()=>{epoch++;release();image='';$('#crop-controls').hidden=true;$('#profile-save').disabled=false;preview();};
 for(const key of fields)$('#profile-'+key).oninput=preview;
 for(const key of ['zoom','x','y'])$('#crop-'+key).oninput=draw;
 $('#profile-form').onsubmit=e=>{e.preventDefault();try{const profile=validateProfile(Object.fromEntries([...fields.map(key=>[key,$('#profile-'+key).value]),['image',image]]));onSave(profile);dialog.close();}catch(error){$('#profile-error').textContent=error.message;}};
 $('#profile-cancel').onclick=()=>dialog.close();$('#profile-close').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{epoch++;release();$('#profile-save').disabled=false;});
 return {open,attach(file){open();load(file);},close(){epoch++;release();if(dialog.open)dialog.close();}};
}
