const element=id=>document.getElementById(id);
const examples=[
 {source:'marketplace',reply:'Tell my agent when a top holder sells. Include the transaction so it can check the sale.'},
 {source:'chat',reply:'I want a heads-up a week before the next token unlock, with the amount due to unlock.'},
 {source:'marketplace',reply:'When my agent checks a stock pair on Base, show how much liquidity is in the pool and when you checked it.'}
];
let timer, refreshTimer, generation=0;
export async function showFeedbackFeed(visible){
 const current=++generation;
 clearTimeout(timer);clearTimeout(refreshTimer);
 if(!visible)return;
 const slide=element('feed-slide'), controls=element('feed-controls'), status=element('feed-status');
 slide.hidden=controls.hidden=true;
 const skeleton=element('feed-skeleton');
 skeleton.hidden=false;status.classList.add('feed-sr-only');
 status.textContent='Loading research feedback';
 try{
  const response=await fetch('/api/feedback/feed',{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error();
  const result=await response.json();
  if(current!==generation)return;
  if(!Array.isArray(result.entries))throw Error();
  let preview=result.entries.length===0,entries=preview?examples:result.entries;
  skeleton.hidden=true;status.textContent='';
  let index=0,paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const render=()=>{
   clearTimeout(timer);
   const entry=entries[index];
   const label=element('feed-example');
   label.hidden=!preview;
   if(preview)label.textContent='Example '+(index+1)+' of '+examples.length;
   slide.querySelector('blockquote').textContent=entry.reply;
   const chat=entry.source==='chat';
   const icon=document.createElement('img');
   icon.alt='';icon.width=16;icon.height=16;
   icon.src=chat?'/brand/dinn-mark-dark.svg':'/brand/near.png';
   const source=document.createElement('span');
   source.className='feedback-source';source.append(icon,chat?'Dinn chat':'NEAR Marketplace');
   slide.querySelector('figcaption').replaceChildren(...(preview?[source]:[document.createTextNode(entry.byline),source]));
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
  async function checkForFirstReply(){
   if(current!==generation)return;
   try{
    const response=await fetch('/api/feedback/feed',{signal:AbortSignal.timeout(10000)});
    if(response.ok){
     const result=await response.json();
     if(current!==generation)return;
     if(result.entries?.length){entries=result.entries;preview=false;index=0;render();return;}
    }
   }catch{/* Keep the labeled examples visible during a temporary outage. */}
   if(current===generation)refreshTimer=setTimeout(checkForFirstReply,30000);
  }
  if(preview)refreshTimer=setTimeout(checkForFirstReply,30000);
 }catch{if(current===generation){skeleton.hidden=true;status.classList.remove('feed-sr-only');status.textContent='Research feedback could not load. Please try again.';}}
}

if(document.body.dataset.page==='public-feedback')void showFeedbackFeed(true);
