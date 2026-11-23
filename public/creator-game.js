const game=document.querySelector('[data-memory-game]');
if(game){
 const board=game.querySelector('[data-board]');
 const status=game.querySelector('[role=status]');
 const start=game.querySelector('[data-start]');
 const symbols=['Moon','Star','Sun','Wave'];
 let first=null,matched=0,moves=0,delay=null;
 function reset(){
  clearTimeout(delay);delay=null;first=null;matched=0;moves=0;
  const deck=[...symbols,...symbols];
  for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
  board.replaceChildren();
  for(const [i,symbol] of deck.entries()){
   const tile=document.createElement('button');
   tile.type='button';
   function hide(){tile.textContent='?';tile.setAttribute('aria-label','Reveal tile '+(i+1));}
   hide();
   tile.onclick=()=>{
    if(delay!==null||tile===first?.tile||tile.disabled)return;
    tile.textContent=symbol;tile.setAttribute('aria-label',symbol);
    if(!first){first={tile,symbol,hide};return;}
    moves++;const other=first;first=null;
    if(other.symbol===symbol){
     tile.disabled=true;other.tile.disabled=true;matched++;
     status.textContent=matched===symbols.length?'All pairs found in '+moves+' moves.':'Matched '+matched+' of '+symbols.length+' pairs.';
    }else{
     status.textContent='Try another pair.';
     delay=setTimeout(()=>{hide();other.hide();delay=null;},900);
    }
   };
   board.append(tile);
  }
  start.textContent='Play again';status.textContent='Find the four matching pairs.';board.firstElementChild.focus();
 }
 start.addEventListener('click',reset);
}
