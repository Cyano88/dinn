const element=id=>document.getElementById(id);
const examples=[
 {source:'marketplace',byline:'Atlas (demo agent)',reply:'Tell my agent when a top holder sells. Include the transaction so it can check the sale.'},
 {source:'chat',byline:'@mir\u2026ra (demo user)',reply:'I want a heads-up a week before the next token unlock, with the amount due to unlock.'},
 {source:'marketplace',byline:'Scout (demo agent)',reply:'When my agent checks a stock pair on Base, show how much liquidity is in the pool and when you checked it.'}
];
let timer, refreshTimer, listeners, generation=0;
async function showReviews(visible){
 const current=++generation;
 clearTimeout(timer);clearTimeout(refreshTimer);listeners?.abort();
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
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  listeners=new AbortController();
  const options={signal:listeners.signal};
  let index=0,hovered=false,held=null;
  function schedule(){
   clearTimeout(timer);
   if(entries.length>1 && !motion.matches && !hovered && held===null && !slide.matches(':focus-visible') && !controls.querySelector(':focus-visible')){
    timer=setTimeout(()=>move(1),Math.max(8500,entries[index].reply.length*65));
   }
  }
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
   const author=document.createElement('strong');author.textContent=entry.byline;
   slide.querySelector('figcaption').replaceChildren(author,source);
   slide.hidden=false;
   controls.hidden=entries.length<2;
   if(!matchMedia('(prefers-reduced-motion: reduce)').matches)slide.animate([{opacity:0,transform:'translateX(-12px)'},{opacity:1,transform:'none'}],{duration:320,easing:'ease-out'});
   schedule();
  };
  const move=offset=>{index=(index+offset+entries.length)%entries.length;render();};
  element('feed-prev').onclick=()=>move(-1);
  element('feed-next').onclick=()=>move(1);
  slide.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'){hovered=true;schedule();}},options);
  slide.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse'){hovered=false;schedule();}},options);
  slide.addEventListener('pointerdown',event=>{if(event.isPrimary && event.pointerType!=='mouse'){held=event.pointerId;schedule();}},options);
  const release=event=>{if(event.pointerId===held){held=null;schedule();}};
  window.addEventListener('pointerup',release,options);
  window.addEventListener('pointercancel',release,options);
  const region=element('feedback-feed-view');
  region.addEventListener('focusin',schedule,options);
  region.addEventListener('focusout',()=>queueMicrotask(()=>{if(current===generation)schedule();}),options);
  motion.addEventListener('change',schedule,options);
  render();
  hovered=matchMedia('(hover: hover)').matches && slide.matches(':hover');schedule();
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

let tab='stock',feedRun=0,visibleNow=false;
async function renderStockEntries(){
 const host=element('stock-entries'),run=++feedRun;
 host.textContent='Loading stock questions...';
 const id=location.hash.match(/^#stock-([a-f0-9-]{36})$/i)?.[1];
 try{
  const res=await fetch('/api/feedback/findings'+(id?'?id='+id:''),{signal:AbortSignal.timeout(10000)});
  if(!res.ok)throw Error();const {entries}=await res.json();if(run!==feedRun)return;
  host.replaceChildren();
  if(!entries.length)host.textContent=id?'This entry is unavailable.':'Shared stock questions will appear here.';
  for(const {entry,id} of entries){
   const article=document.createElement('article');
   const row=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;article.append(el);return el;};
   row('h3',entry.question);row('p',entry.finding);
   const link=row('a',entry.source+' \u00b7 '+entry.publishedAt.slice(0,10));link.href=entry.url;link.target='_blank';link.rel='noopener noreferrer';
   row('h4',entry.idea);row('p',entry.activity);row('p',entry.followUp);
   row('a','Link to this entry').href='/feedback#stock-'+id;host.append(article);
  }
  if(id){const all=document.createElement('a');all.href='/feedback';all.textContent='All stock questions';host.append(all);}
 }catch{if(run===feedRun)host.textContent='Stock questions could not load. Please try again.';}
}
export function showFeedbackFeed(visible){
 visibleNow=visible;feedRun++;
 if(!visible){void showReviews(false);return;}
 const stock=tab==='stock';
 element('stock-tab').setAttribute('aria-pressed',String(stock));element('feedback-tab').setAttribute('aria-pressed',String(!stock));
 element('stock-entries').hidden=!stock;element('feedback-entries').hidden=stock;
 element('stock-tab').onclick=()=>{tab='stock';showFeedbackFeed(true);};
 element('feedback-tab').onclick=()=>{tab='feedback';showFeedbackFeed(true);};
 void showReviews(!stock);if(stock)void renderStockEntries();
}
window.addEventListener('hashchange',()=>{if(visibleNow){tab='stock';showFeedbackFeed(true);}});
if(document.body.dataset.page==='public-feedback')void showFeedbackFeed(true);
