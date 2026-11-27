const address=value=>typeof value==='string'&&/^0x[0-9a-f]{40}$/i.test(value);
function imageSource(value){
 if(typeof value!=='string'||!value||value.length>2048)return null;
 try{
  const url=new URL(value);
  if(url.username||url.password)return null;
  if(url.origin==='https://dinn-pasy.onrender.com'&&/^\/media\/logos\/[a-f0-9-]{36}\.png$/i.test(url.pathname))return url.pathname;
  const gateway='https://gateway.pinata.cloud/ipfs/';
  if(url.protocol==='ipfs:')return gateway+value.slice(7).replace(/^ipfs\//,'');
  if(url.protocol!=='https:')return null;
  if(['ipfs.io','ipfs.filebase.io','gateway.pinata.cloud'].includes(url.hostname)&&url.pathname.startsWith('/ipfs/'))return gateway+url.pathname.slice(6);
  return url.href;
 }catch{return null;}
}
function formatUsd(value){const number=typeof value==='string'?Number(value):NaN;if(!Number.isFinite(number)||number<0)return 'Unavailable';return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:number>0&&number<0.01?8:2}).format(number);}
function ago(value){if(!value)return 'Launch date unavailable';const date=new Date(value);if(!Number.isFinite(date.getTime()))return 'Launch date unavailable';const seconds=Math.max(0,Math.floor((Date.now()-date.getTime())/1000));if(seconds<60)return 'just launched';if(seconds<3600)return `${Math.floor(seconds/60)}m ago`;if(seconds<86400)return `${Math.floor(seconds/3600)}h ago`;const days=Math.floor(seconds/86400);return days<30?`${days}d ago`:`${Math.floor(days/30)}mo ago`;}
function inPool(item){return Number(item.chainId)===8453?Boolean(item.curve):item.metrics?.phase===2;}

export function mountDinnLaunches({host,apiBase='/api/dinn/launches',getAccessToken,onStart=()=>{},onResearch=()=>{},interval=120000,doc=document}){
 const $=id=>doc.getElementById(id),list=$('dinn-launch-list'),search=$('dinn-launch-search'),status=$('dinn-launch-status'),pager=$('launch-pager'),previous=$('launch-previous'),next=$('launch-next'),pageNumber=$('launch-page-number'),filters=[...doc.querySelectorAll('[data-launch-filter]')];
 let active=false,ownerEpoch=0,controller=null,timer=null,debounce=null,query='',offset=0,total=0,items=[],filter='all';
 const node=(tag,cls,text)=>{const element=doc.createElement(tag);if(cls)element.className=cls;if(text!==undefined)element.textContent=text;return element;};
 function skeletons(){list.replaceChildren();for(let i=0;i<4;i++){const row=node('div','launch-row-skeleton');row.setAttribute('aria-hidden','true');row.append(node('span','launch-skeleton-avatar'),node('span','launch-skeleton-copy'),node('span','launch-skeleton-value'),node('span','launch-skeleton-value'));list.append(row);}}
 function trendCell(market){
  const cell=node('div','launch-trend'),change=market.change24h;
  const measured=typeof change==='number'&&Number.isFinite(change);
  const label=measured?(change>0?'+':'')+change.toLocaleString(undefined,{maximumFractionDigits:2})+'%':'Unavailable';
  const candles=market.candles||[];
  cell.setAttribute('aria-label','24-hour price change: '+label);
  if(candles.length>=2){
   const ns='http://www.w3.org/2000/svg',svg=doc.createElementNS(ns,'svg');
   svg.setAttribute('viewBox','0 0 96 28');svg.setAttribute('aria-hidden','true');
   const hi=Math.max(...candles.map(v=>v[2])),lo=Math.min(...candles.map(v=>v[3])),end=candles.at(-1)[0];
   const y=n=>hi===lo?14:2+(hi-n)*24/(hi-lo);
   for(const [t,o,h,l,c] of candles){
    const x=93-(end-t)/3600*4,wick=doc.createElementNS(ns,'path');
    wick.setAttribute('d','M'+x+' '+y(h)+'V'+y(l));wick.setAttribute('class',c>o?'up':c<o?'down':'flat');
    const body=wick.cloneNode();body.setAttribute('d','M'+x+' '+y(o)+'V'+(c===o?y(o)+0.7:y(c)));body.setAttribute('stroke-width','3');svg.append(wick,body);
   }
   cell.append(svg);
  }
  const text=node('span',measured?(change>0?'up':change<0?'down':'flat'):'',measured?label:candles.length>=2?'Hourly candles':'—');
  cell.append(text);cell.title=measured?'24-hour price change: '+label:candles.length>=2?'Available hourly trading history':'24-hour trend unavailable';
  return cell;
 }
 function card(item){
  const base=Number(item.chainId)===8453||item.origin==='bankr'||item.origin==='dinn-bankr';
  const platform=base?'Bankr':'Pons',m=item.metrics||{},market=m.market||{};
  const row=node('article','dinn-launch-row'),identity=node('div','dinn-launch-identity'),title=node('div','dinn-launch-title'),logo=node('span','dinn-launch-logo',(item.symbol||'D')[0]);
  const url=imageSource(item.logo);
  if(url){const img=node('img');img.src=url;img.alt='';img.loading='lazy';img.onerror=()=>logo.textContent=(item.symbol||'D')[0];logo.replaceChildren(img);}
  const pair=item.stockPair||m.pair?.symbol||item.pairSymbol||(item.pairToken==='0x'+'0'.repeat(40)?'ETH':null);
  title.append(node('strong','',item.name||item.symbol||'Unnamed token'),node('span','',[ [item.symbol,pair].filter(Boolean).join(' / '),platform,item.launchedAt&&ago(item.launchedAt)].filter(Boolean).join(' · ')));
  identity.append(logo,title);
  const details=node('details','dinn-launch-details'),summary=node('summary','','Details'),body=node('div','launch-details-body');details.append(summary,body);
  const detail=(label,value)=>{if(value)body.append(node('p','',label+' '+value));};
  if(market.liquidityUsd!=null)detail('Reported liquidity',formatUsd(String(market.liquidityUsd)));detail('Contract',item.token);detail('Network',base?'Base':'Robinhood Chain');
  const metric=(label,value,source)=>{const cell=node('div','dinn-launch-market');cell.append(node('span','metric-label',label),node('strong','',value||'Unavailable'));detail(label,source);return cell;};
  const fdv=market.fdvUsd||m.curveFdvUsd,fdvSource=market.fdvUsd?(market.fdvSource||(base?'DEX Screener':'GeckoTerminal')):m.curveFdvUsd?'Estimated from the curve and pair price':null;
  const fdvCell=metric('FDV',fdv?(market.fdvUsd?'':'≈ ')+formatUsd(fdv):null,fdvSource);
  const cap=m.launchCap,capValue=cap?.usd!=null?formatUsd(cap.usd):cap?.quote!=null?Number(cap.quote).toLocaleString(undefined,{maximumSignificantDigits:5})+' '+(pair||''):market.marketCapUsd?formatUsd(market.marketCapUsd):null;
  const capCell=metric('Market cap',capValue,cap?.usd!=null||cap?.quote!=null?'Pons':market.marketCapUsd?(market.marketCapSource||(base?'DEX Screener':'GeckoTerminal')):null);
  if(m.outsideValueUsd!=null)detail('Value outside curve',formatUsd(m.outsideValueUsd));
  else if(m.outsideValueQuote!=null)detail('Value outside curve',m.outsideValueQuote+' '+(pair||''));
  const phase=node('div','dinn-launch-phase'),onCurve=!base&&m.phase===0,pool=inPool(item);
  phase.append(node('span','launch-state '+(onCurve?'on-curve':pool?'graduated':'unknown'),onCurve?'On bonding curve':pool?'In pool':base?'Bankr launch':m.status||'Stage unavailable'));
  if(onCurve&&m.curve?.progressPercent!=null)detail('Curve progress',m.curve.progressPercent+'% of the quote-reserve target');
  if(market.priceUsd||m.curvePriceUsd)detail('Price',formatUsd(market.priceUsd||m.curvePriceUsd)+(m.curvePriceUsd&&!market.priceUsd?' (curve estimate)':''));
  const actions=node('div','dinn-launch-actions');
  if(!base||pair){const research=node('button','subtle','Research');research.type='button';research.setAttribute('aria-label','Research '+(item.name||item.symbol));research.onclick=()=>onResearch(item.token,base?8453:4663);actions.append(research);}
  const open=node('a','','Open on '+platform);open.href=(base?'https://bankr.bot/trade/':'https://ponsfamily.com/launchpad/')+item.token;open.target='_blank';open.rel='noopener noreferrer';body.append(open);
  details.dataset.token=(item.chainId||4663)+':'+item.token;
  row.append(identity,fdvCell,capCell,phase,trendCell(market),actions,details);return row;
 }
 function render(){const expanded=new Set([...list.querySelectorAll('details[open]')].map(el=>el.dataset.token));list.replaceChildren();if(!items.length){const empty=node('div','dinn-launch-empty');empty.append(node('h3','',filter==='trending'?'No trending launches right now':query||filter!=='all'?'No matching launches found':'No Dinn launches yet'),node('p','',filter==='trending'?'A launch appears here when its price rises over 24 hours with reported trading volume.':query||filter!=='all'?'Try another filter or search.':'Paste a Bankr or Pons contract address to find a launch.'));list.append(empty);}else for(const item of items){const row=card(item),details=row.querySelector('details');details.open=expanded.has(details.dataset.token);list.append(row);}pager.hidden=total<=10;previous.disabled=offset===0;next.disabled=offset+10>=total;pageNumber.textContent='Page '+(Math.floor(offset/10)+1)+' of '+Math.max(1,Math.ceil(total/10));}
 function schedule(){clearTimeout(timer);if(active&&!doc.hidden)timer=setTimeout(()=>void load({quiet:true}),interval);}
 async function load({start=offset,quiet=false}={}){
  if(!active)return;controller?.abort();const request=new AbortController();controller=request;const epoch=ownerEpoch;
  previous.disabled=true;next.disabled=true;
  if(!quiet){status.textContent='';if(!items.length)skeletons();}
  try{
   const token=await getAccessToken();if(request!==controller||epoch!==ownerEpoch||!active)return;
   if(!token)throw Error('Sign in again to view Dinn launches.');
   const response=await fetch(apiBase+'/list',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({query,filter,limit:10,offset:start}),signal:request.signal});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Launches could not be loaded.');
   if(request!==controller||epoch!==ownerEpoch||!active)return;
   if(start>0&&start>=data.total)return void load({start:Math.max(0,Math.floor((data.total-1)/10)*10)});
   items=[...new Map([...data.items,...(data.external||[])].map(row=>[(row.chainId||4663)+':'+row.token.toLowerCase(),row])).values()];
   offset=start;total=data.total;render();status.textContent=data.searchNotice||'';
  }catch(error){if(error.name!=='AbortError'&&request===controller&&epoch===ownerEpoch){if(!items.length)list.replaceChildren();status.textContent=error.message;}}
  finally{if(request===controller&&epoch===ownerEpoch){previous.disabled=offset===0;next.disabled=offset+10>=total;schedule();}}
 }
 function activate(){if(active)return;active=true;ownerEpoch++;void load();}
 function deactivate(){active=false;ownerEpoch++;controller?.abort();controller=null;clearTimeout(timer);}
 search.oninput=()=>{clearTimeout(debounce);controller?.abort();controller=null;clearTimeout(timer);items=[];offset=0;total=0;pager.hidden=true;status.textContent='';skeletons();query=search.value.trim();debounce=setTimeout(()=>void load(),250);};
 filters.forEach(button=>button.onclick=()=>{filter=button.dataset.launchFilter;filters.forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-pressed',String(item===button));});items=[];offset=0;pager.hidden=true;void load();});
 previous.onclick=()=>void load({start:Math.max(0,offset-10)});next.onclick=()=>void load({start:offset+10});
 doc.addEventListener('visibilitychange',()=>{if(doc.hidden)clearTimeout(timer);else if(active)void load({quiet:true});});
 window.addEventListener('focus',()=>{if(active)void load({quiet:true});});
 host.querySelector('#dinn-launch-create').onclick=onStart;
 return {activate,deactivate,reload:()=>void load({quiet:true}),notice:message=>{status.textContent=message;},recorded:()=>{items=[];offset=0;if(active)void load();},reset:()=>{deactivate();items=[];offset=0;total=0;query='';search.value='';status.textContent='';pager.hidden=true;list.replaceChildren();}};
}
