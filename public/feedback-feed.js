const element=id=>document.getElementById(id);
let timer, generation=0;
export async function showFeedbackFeed(visible){
 const current=++generation;
 clearTimeout(timer);
 if(!visible)return;
 const slide=element('feed-slide'), controls=element('feed-controls'), status=element('feed-status');
 slide.hidden=controls.hidden=true;
 status.textContent='Loading feedback…';
 try{
  const response=await fetch('/api/feedback/feed');
  if(!response.ok)throw Error();
  const {entries}=await response.json();
  if(current!==generation)return;
  status.textContent=entries.length?'':'Public feedback will appear here.';
  if(!entries.length)return;
  let index=0,paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const render=()=>{
   clearTimeout(timer);
   const entry=entries[index];
   slide.querySelector('blockquote').textContent=entry.reply;
   const chat=entry.source==='chat';
   const icon=document.createElement('img');
   icon.alt='';icon.width=16;icon.height=16;
   icon.src=chat?'/brand/dinn-mark-dark.svg':'/brand/near.png';
   const source=document.createElement('span');
   source.className='feedback-source';source.append(icon,chat?'Dinn chat':'NEAR Marketplace');
   slide.querySelector('figcaption').replaceChildren(document.createTextNode(entry.byline),source);
   slide.hidden=false;
   controls.hidden=entries.length<2;
   if(!matchMedia('(prefers-reduced-motion: reduce)').matches)slide.animate([{opacity:0,transform:'translateX(-12px)'},{opacity:1,transform:'none'}],{duration:320,easing:'ease-out'});
   element('feed-pause').textContent=paused?'Play':'Pause';
   if(!paused && entries.length>1)timer=setTimeout(()=>move(1),Math.max(8500,entry.reply.length*65));
  };
  const move=offset=>{index=(index+offset+entries.length)%entries.length;render();};
  element('feed-prev').onclick=()=>{paused=true;move(-1);};
  element('feed-next').onclick=()=>{paused=true;move(1);};
  element('feed-pause').onclick=()=>{paused=!paused;render();};
  render();
 }catch{if(current===generation)status.textContent='Feedback could not load. Open Feedback again to retry.';}
}

if(document.body.dataset.page==='public-feedback')void showFeedbackFeed(true);
