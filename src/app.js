(()=>{
'use strict';
const Q=new URLSearchParams(location.search);
const FAST=Q.has('fast'), AUTO=Q.has('auto');
const R=ms=>FAST?Math.max(40,ms/10):ms;           // delays & reading time (debug fast-forward)
const READ_BUZZ_MS=7000, ANSWER_MS=15000, FINAL_MS=30000, LOCKOUT_MS=250;
const $=s=>document.querySelector(s);
const stage=$('#stage'), hud=$('#hud'), lights=$('#lights'), appEl=$('#app');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>(n<0?'-':'')+'$'+Math.abs(n).toLocaleString('en-US');
const YOU='You';
const CATALOG=EPISODES;
const epParam=Q.get('ep');
let SHOW=CATALOG.find(e=>e.gameId===epParam)||CATALOG[+epParam]||CATALOG[0];
let pick=Math.max(0,CATALOG.findIndex(e=>e.gameId===SHOW.gameId));
const G={score:0,state:'intro',round:'J',used:new Set(),curCol:-1,stay:0,timers:[],stateAt:0,
 roundScores:{},clue:null,lockedUntil:0,openAt:0,sound:true,history:[],skipped:null};
function readPlayed(){try{return JSON.parse(localStorage.getItem('jr-played')||'{}')}catch(e){return{}}}
function savePlayed(id,score){
  if(AUTO||FAST)return;
  try{
    const all=readPlayed(),prev=all[id]||{},best=prev.best!=null?Math.max(prev.best,score):score;
    all[id]={last:score,best,date:new Date().toISOString(),finished:true};
    localStorage.setItem('jr-played',JSON.stringify(all));
  }catch(e){}
}
function loadShow(id){
  const meta=CATALOG.find(e=>e.gameId===id)||CATALOG[0];
  return fetch('episodes/'+meta.gameId+'.json').then(r=>{if(!r.ok)throw new Error('episode '+r.status);return r.json()}).then(d=>{SHOW=Object.assign({},meta,d);return SHOW});
}

/* ---------- sound (tiny WebAudio blips) ---------- */
let AC=null;
function tone(f,d,type='sine',v=.12,delay=0){ if(!G.sound)return; try{
  AC=AC||new (window.AudioContext||window.webkitAudioContext)();
  const t=AC.currentTime+delay,o=AC.createOscillator(),g=AC.createGain();
  o.type=type;o.frequency.setValueAtTime(f,t);g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);
  o.connect(g);g.connect(AC.destination);o.start(t);o.stop(t+d+.02);}catch(e){} }
const sfx={
 open(){tone(880,.08,'square',.06)},
 buzz(){tone(520,.12,'triangle',.15)},
 good(){tone(660,.15,'sine',.15);tone(880,.25,'sine',.15,.12)},
 bad(){tone(130,.5,'sawtooth',.12)},
 lock(){tone(110,.25,'square',.08)},
 dd(){[392,523,659,784,1047].forEach((f,i)=>tone(f,.2,'triangle',.12,i*.09))},
 tick(){tone(1200,.03,'square',.04)}
};
hud.addEventListener('click',e=>{const m=e.target.closest('#mute');if(m){G.sound=!G.sound;m.innerHTML=G.sound?ICON.snd:ICON.mute;m.blur()}
  if(e.target.closest('#ff'))fastForward();if(e.target.closest('#rskip'))skipRound();if(e.target.closest('#home'))askLeave()});

/* ---------- timers ---------- */
function later(fn,ms){const t=setTimeout(fn,ms);G.timers.push(t);return t}
function clearTimers(){G.timers.forEach(t=>{clearTimeout(t);clearInterval(t)});G.timers=[]}
function setState(s){G.state=s;document.body.dataset.st=s;G.stateAt=performance.now();if(s!=='answer')document.body.classList.remove('typing')}
function runTimer(ms,onTick,onDone){
  const end=performance.now()+ms;
  const iv=setInterval(()=>{
    const left=end-performance.now();
    if(left<=0){clearInterval(iv);onTick(0,0);onDone();return}
    onTick(left/ms,Math.ceil(left/1000));
  },50);
  G.timers.push(iv);onTick(1,Math.ceil(ms/1000));
}
function setLights(mode){lights.className='lights'+(mode?' show':'')+(mode==='on'?' on':'')+(mode==='bad'?' bad':'')}

/* ---------- HUD ---------- */
const ICON={
 snd:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
 mute:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
 ff:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6l9 6-9 6zM12 6l9 6-9 6z" fill="currentColor"/></svg>',
 next:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6l8.5 6L4 18zM12 6l8.5 6L12 18z" fill="currentColor"/><rect x="20" y="6" width="2" height="12" rx="1" fill="currentColor"/></svg>',
 home:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" fill="currentColor"/></svg>'};
function renderHud(){
  hud.classList.remove('hide');
  const rs=G.round==='J'||G.round==='DJ';
  const real=G.skipped&&SHOW.scores[G.skipped]?`<div class="realstrip" aria-label="Real scores at the jump">${SHOW.contestants.map(c=>`${esc(c.short)} ${money(SHOW.scores[G.skipped][c.short])}`).join(' · ')}</div>`:'';
  const atEnd=G.state==='end';
  hud.innerHTML=`${real}<div class="corner l"><button id="ff" class="ic" type="button" aria-label="Skip the wait">${ICON.ff}</button><button id="home" class="ic" type="button" aria-label="Back to episodes">${ICON.home}</button></div><div class="scorebox ${G.score<0?'neg':'pos'}">${money(G.score)}</div><div class="corner r"><button id="mute" class="ic" type="button" aria-label="Toggle sound">${G.sound?ICON.snd:ICON.mute}</button><button id="rskip" class="ic" type="button" aria-label="${G.round==='J'?'Skip to Double Jeopardy':'Skip to Final Jeopardy'}" ${rs&&!atEnd?'':'hidden'}>${ICON.next}</button></div>`;
}
function askLeave(){
  if(G.state==='end'){intro();return}
  if($('.leave'))return;
  const box=document.createElement('div');box.className='leave';box.setAttribute('role','dialog');box.setAttribute('aria-label','Leave game?');
  box.innerHTML='<div class="leavecard"><div class="leaveq">Leave game?</div><div class="leaverow"><button type="button" class="btn" id="leavey">Yes</button><button type="button" class="btn ghost" id="leaven">No</button></div></div>';
  appEl.appendChild(box);
  $('#leavey').onclick=()=>{box.remove();clearTimers();setLights(null);G.pending=null;G.clue=null;G.skipped=null;intro()};
  $('#leaven').onclick=()=>box.remove();
}

const S=(html)=>{stage.innerHTML=html;appEl.classList.toggle('dark',html.indexOf('class="bw"')>=0);ro.disconnect();const cl=stage.querySelector('.clue');if(cl)ro.observe(cl);const bd=stage.querySelector('.body');if(bd)ro.observe(bd);requestAnimationFrame(fitAll)};
const ro=window.ResizeObserver?new ResizeObserver(()=>requestAnimationFrame(fitAll)):{observe(){},disconnect(){}};
/* ---------- fit-to-box text sizing ---------- */
function fit(box,el,max,min=9){
  if(!box||!el||!box.clientWidth)return;
  const cs=getComputedStyle(box);
  const w=box.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
  const h=box.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
  let lo=min,hi=max;
  el.style.fontSize=hi+'px';
  if(el.scrollWidth<=el.clientWidth+1.5&&el.offsetHeight<=h){return}
  while(hi-lo>.5){const mid=(lo+hi)/2;el.style.fontSize=mid+'px';(el.scrollWidth<=el.clientWidth+1.5&&el.offsetHeight<=h)?lo=mid:hi=mid}
  el.style.fontSize=lo+'px';
}
/* TV-set layout: every rect is in "design pixels" of a reference screenshot (landscape 1024x577) or a compact phone variant */
const LAYOUT={
 land:{W:1024,H:564,gap:5,hdr:.8,
  band:[28,0,962,66],strip:[40,41,938,12],sl:[0,0,70,564],sr:[954,0,70,564],pl:[72,84,58,433],pr:[890,84,58,433],
  bezel:[138,78,746,449],board:[171,101,680,389.43],glow:[40,535,940,29]},
 port:{W:400,H:322,gap:3,hdr:1.7,
  band:[4,0,392,26],strip:[10,15,380,6],sl:[0,0,0,0],sr:[0,0,0,0],pl:[2,40,12,248],pr:[386,40,12,248],
  bezel:[14,34,372,260],board:[19,40,362,248.08],glow:[10,304,380,12]}
};
function sizeBoard(){
  const set=document.getElementById('set');if(!set)return;
  const portrait=innerWidth<innerHeight,L=portrait?LAYOUT.port:LAYOUT.land;
  const availW=stage.clientWidth-(portrait?4:16),availH=stage.clientHeight-6;
  const s=Math.max(.2,Math.min(availW/L.W,availH/L.H));
  set.style.width=L.W*s+'px';set.style.height=L.H*s+'px';set.style.setProperty('--s',s+'px');
  const put=(sel,r)=>{const e=set.querySelector(sel);if(!e)return;e.style.left=r[0]*s+'px';e.style.top=r[1]*s+'px';e.style.width=r[2]*s+'px';e.style.height=r[3]*s+'px';e.style.display=r[2]?'':'none'};
  put('.band',L.band);put('.strip',L.strip);put('.sl',L.sl);put('.sr',L.sr);put('.pl',L.pl);put('.pr',L.pr);put('.bezel',L.bezel);put('.board',L.board);put('.glow',L.glow);
  const [bx,by,bw,bh]=L.board,gap=L.gap*s,cw=(bw*s-5*gap)/6,ch=(bh*s-5*gap)/(5+L.hdr),hh=ch*L.hdr;
  const b=set.querySelector('.board');b.style.gap=gap+'px';b.style.gridTemplateRows=`${hh}px repeat(5,${ch}px)`;
  const sr=set.getBoundingClientRect(),ar=appEl.getBoundingClientRect();
  appEl.style.setProperty('--top',(sr.top-ar.top)+'px');appEl.style.setProperty('--bot',(sr.bottom-ar.top)+'px');appEl.style.setProperty('--s',s+'px');
  return {cw,ch,hh,s};
}
function fitAll(){
  const vm=Math.min(innerWidth,innerHeight),portrait=innerWidth<innerHeight;
  const clue=document.querySelector('.clue:not(.ans)');
  if(clue)fit(clue,clue.firstElementChild,portrait?Math.min(22,vm*.06):Math.min(34,vm*.05),12);
  const cc=document.querySelector('.banner .cc');
  if(cc)fit(cc.parentElement,cc,Math.min(vm*.11,84),14);
  const bd=document.querySelector('.board');
  if(bd){
    const g=sizeBoard();if(!g)return;
    const probe=document.createElement('span');probe.style.cssText='position:absolute;visibility:hidden;white-space:nowrap;left:-9999px;font-size:100px';document.body.appendChild(probe);
    const wid=(txt,cls)=>{probe.className=cls;probe.innerHTML=txt;return probe.getBoundingClientRect().width};
    // ONE shared category size (Swiss-style bold condensed, white)
    let maxW=1;
    SHOW.rounds[G.round].cats.forEach(t=>t.split(/\s+/).forEach(w=>{maxW=Math.max(maxW,wid(w,'pr-cat'))}));
    const cats=[...bd.querySelectorAll('.cat')],spans=cats.map(c=>c.firstElementChild);
    const c0=cats[0],pcs=getComputedStyle(c0),inner=c0.clientWidth-parseFloat(pcs.paddingLeft)-parseFloat(pcs.paddingRight);   // real cell inner width
    let f=Math.max(8,Math.min(g.hh*.275,inner*.96/maxW*100));
    const apply=()=>spans.forEach(sp=>sp.style.fontSize=f+'px');apply();
    const availH=g.hh-4*g.s;
    while(f>8&&spans.some(sp=>sp.offsetHeight>availH)){f-=.25;apply()}
    // verify with the real rendered words (guards against probe/rounding drift): no word may exceed the cell
    const widest=()=>{let m=0;spans.forEach(sp=>{const tn=sp.firstChild;if(!tn)return;const t=tn.textContent,r=document.createRange();let i=0;
      for(const w of t.split(/[\s-]+/)){if(!w)continue;const st=t.indexOf(w,i);i=st+w.length;r.setStart(tn,st);r.setEnd(tn,st+w.length);m=Math.max(m,r.getBoundingClientRect().width)}});return m};
    for(let k=0;k<6;k++){const wm=widest();if(wm<=inner-.5)break;f=Math.max(6,f*(inner-1)/wm);apply()}
    // ONE shared value size: widest label must fit with padding
    const vw=wid('<i class="dl">$</i>'+(G.round==='J'?'1000':'2000'),'pr-val');
    const vf=Math.max(8,Math.min(g.ch*.68,(g.cw*.84)/vw*100));
    bd.style.setProperty('--vf',vf+'px');
    probe.remove();
  }
}
addEventListener('resize',()=>requestAnimationFrame(fitAll));
if(document.fonts&&document.fonts.load){Promise.all([document.fonts.load('600 20px Oswald'),document.fonts.load('20px Anton'),document.fonts.load('700 20px "Libre Baskerville"')]).then(()=>{fitAll();setTimeout(fitAll,100)}).catch(()=>{})}
function syncVV(){
  const v=window.visualViewport;if(!v)return;
  appEl.style.height=v.height+'px';appEl.style.top=v.offsetTop+'px';
  document.body.classList.toggle('kb',v.height<innerHeight-100);   // on-screen keyboard is up
  window.scrollTo(0,0);requestAnimationFrame(fitAll);
}
if(window.visualViewport){visualViewport.addEventListener('resize',syncVV);visualViewport.addEventListener('scroll',syncVV);syncVV()}

/* ---------- intro ---------- */
function intro(){
  clearTimers();setState('intro');setLights(null);hud.classList.add('hide');
  const played=readPlayed();
  const fmt=e=>new Date(e.aired+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
  const seasons=[...new Set(CATALOG.map(e=>e.season))].sort((a,b)=>b-a);
  if(pick==null || pick>=CATALOG.length) pick=0;
  let season=CATALOG[pick].season;
  function rowsFor(s){
    return CATALOG.map((e,i)=>[e,i]).filter(([e])=>e.season===s);
  }
  function mark(s){
    const rows=rowsFor(s), n=rows.filter(([e])=>played[e.gameId]&&played[e.gameId].finished).length;
    return n?`✓ ${n}/${rows.length}`:`${rows.length}`;
  }
  function cardsHtml(){
    const rows=rowsFor(season);
    return rows.map(([e,i])=>{
      const p=played[e.gameId], did=p&&p.finished;
      const badge=did?`<span class="played" aria-label="Played, best ${money(p.best)}">✓ ${money(p.best)}</span>`:'';
      return `<button type="button" class="ep${i===pick?' sel':''}${did?' did':''}" data-i="${i}">
        <span class="ed">${esc(e.show)} · ${fmt(e)}</span>
        <span class="en">${e.contestants.map(c=>esc(c.short)).join(' · ')}</span>${badge}</button>`;
    }).join('');
  }
  function menuHtml(){
    return seasons.map(s=>{
      const meta=CATALOG.find(e=>e.season===s);
      return `<button type="button" class="sitem${s===season?' on':''}" data-s="${s}"><span>Season ${s} · ${meta.seasonYears}</span><span class="scount">${mark(s)}</span></button>`;
    }).join('');
  }
  function headerLabel(){
    const meta=CATALOG.find(e=>e.season===season);
    return `Season ${season} · ${meta.seasonYears}`;
  }
  S(`<div class="panel intro">
    <div class="logo">Jeopardy!</div>
    <div class="sbar">
      <button type="button" class="ssel" id="ssel" aria-haspopup="listbox" aria-expanded="false"><span id="slabel">${headerLabel()}</span><span class="scount" id="smeta">${mark(season)}</span><span class="chev" aria-hidden="true">▾</span></button>
      <div class="smenu hide" id="smenu" role="listbox">${menuHtml()}</div>
    </div>
    <div class="eps" id="epgrid">${cardsHtml()}</div>
    <button class="btn" id="go">Start</button></div>`);
  const menu=$('#smenu'), sel=$('#ssel');
  function bindCards(){
    document.querySelectorAll('.ep').forEach(b=>b.onclick=()=>{pick=+b.dataset.i;SHOW=CATALOG[pick];document.querySelectorAll('.ep').forEach(x=>x.classList.toggle('sel',x===b))});
  }
  bindCards();
  sel.onclick=e=>{e.stopPropagation();const open=menu.classList.toggle('hide');sel.setAttribute('aria-expanded',open?'false':'true')};
  menu.querySelectorAll('.sitem').forEach(b=>b.onclick=e=>{
    e.stopPropagation();
    season=+b.dataset.s;
    const first=CATALOG.findIndex(e=>e.season===season);
    pick=first;SHOW=CATALOG[pick];
    $('#slabel').textContent=headerLabel();$('#smeta').textContent=mark(season);
    $('#epgrid').innerHTML=cardsHtml();bindCards();
    menu.querySelectorAll('.sitem').forEach(x=>x.classList.toggle('on',+x.dataset.s===season));
    menu.classList.add('hide');sel.setAttribute('aria-expanded','false');
  });
  if(!intro._close){intro._close=ev=>{const m=document.querySelector('#smenu'),s=document.querySelector('#ssel');if(!m||!s)return;if(!ev.target.closest('.sbar')){m.classList.add('hide');s.setAttribute('aria-expanded','false')}};document.addEventListener('pointerdown',intro._close);}
  $('#go').onclick=()=>{G.skipped=null;const go=$('#go');go.disabled=true;loadShow(CATALOG[pick].gameId).then(()=>startRound('J')).catch(()=>{go.disabled=false})};
}

/* ---------- rounds & board ---------- */
function startRound(r){
  clearTimers();G.round=r;G.used=new Set();G.curCol=-1;G.stay=0;
  renderBoard();renderHud();setState('board');
  later(pickNext,R(3600));
}
function renderBoard(flashKey){
  const rd=SHOW.rounds[G.round];
  let h='<div class="board">'+rd.cats.map(c=>`<div class="cat"><span>${esc(c)}</span></div>`).join('');
  for(let r=0;r<5;r++)for(let c=0;c<6;c++){
    const k=c+','+r,used=G.used.has(k),mult=G.round==='J'?200:400;
    h+=`<div class="cell${used?' used':''}${flashKey===k?' flash':''}" data-k="${k}" data-r="${r}"><span>${used?'':`<i class="dl">$</i>${(r+1)*mult}`}</span></div>`;
  }
  h+='</div>';
  S(`<div class="bw"><div class="set" id="set">
    <div class="p sl"></div><div class="p sr"></div>
    <div class="p band"></div><div class="p strip"></div>
    <div class="p pillar pl"><b></b></div><div class="p pillar pr"><b></b></div>
    <div class="p bezel"></div>
    ${h.replace('class="board"','class="board p"')}
    <div class="p glow"></div></div></div>`);
  fitAll();
}
function clueAt(c,r){return SHOW.rounds[G.round].clues.find(x=>x.c===c&&x.r===r)}

/* semi-random, human-ish selection: favours high values, tends to stay in the category, sometimes jumps */
function choose(){
  const avail=SHOW.rounds[G.round].clues.filter(c=>!G.used.has(c.c+','+c.r));
  const inCol=avail.filter(c=>c.c===G.curCol);
  let jump=G.curCol<0||inCol.length===0||Math.random()<0.14||G.stay>=5&&Math.random()<0.5;
  const pool=jump?avail.filter(c=>c.c!==G.curCol||avail.length===inCol.length):avail;
  const w=c=>{
    let x=Math.pow(c.r+1,1.6);                         // higher value → heavier
    if(!jump&&c.c===G.curCol) x*=4.5;                   // stay in the same category
    return x*(0.6+Math.random()*0.8);                   // noise: no tidy top-to-bottom runs
  };
  const ws=pool.map(w),tot=ws.reduce((a,b)=>a+b,0);
  let t=Math.random()*tot;for(let i=0;i<pool.length;i++){t-=ws[i];if(t<=0)return {clue:pool[i],jump}}
  return {clue:pool[pool.length-1],jump};
}
function skipRound(){
  if(G.round!=='J'&&G.round!=='DJ')return;
  const from=G.round;clearTimers();setLights(null);G.pending=null;G.clue=null;
  if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();
  G.roundScores[from]=G.score;G.skipped=from;
  from==='J'?startRound('DJ'):finalIntro();
}
function fastForward(){
  if(G.state==='board'){clearTimers();pickNext()}
  else if(G.state==='picking'||G.state==='ddsplash'){clearTimers();const f=G.pending;G.pending=null;f&&f()}
}
function pickNext(){
  if(G.used.size>=30)return roundEnd();
  const {clue,jump}=choose();
  G.stay=(!jump&&clue.c===G.curCol)?G.stay+1:1;G.curCol=clue.c;
  G.used.add(clue.c+','+clue.r);G.clue=clue;
  renderBoard(clue.c+','+clue.r);renderHud();setState('picking');
  G.pending=()=>clue.dd?ddSplash(clue):showClue(clue);
  later(G.pending,R(1000));
}

/* ---------- clue card ---------- */
const catName=()=>SHOW.rounds[G.round].cats[G.clue.c];
function cardHtml(c,opts={}){
  const val=opts.noValue?'':`<span class="cv">${money(opts.wager!==undefined?opts.wager:c.v)}</span>`;
  return `<div class="card"><div class="banner"><div class="ccbox"><span class="cc">${esc(opts.cat||catName())}</span></div>${val}</div>
   <div class="body${c.img?' hasimg':''}">${c.img?`<div class="pic"><img src="${esc(c.img)}" alt="" draggable="false"></div>`:''}<div class="clue"><span class="ct">${esc(c.q)}</span></div></div>
   <div class="foot" id="foot"></div></div>`;
}
const foot=h=>{$('#foot').innerHTML=h};

function showClue(c){
  setState('reading');G.lockedUntil=0;
  S(cardHtml(c));setLights('armed');renderHud();
  const words=c.q.split(/\s+/).length;
  const readMs=R(1300+words*230);
  footReading();
  later(openBuzzers,readMs);
  if(AUTO){/* driver below handles it */}
}
function footReading(){
  foot(`<button class="buzz" id="bz">BUZZ</button><div class="bar" style="visibility:hidden"></div><button class="skip" id="skip" type="button">Don’t know · skip</button>`);
  $('#bz').addEventListener('pointerdown',e=>{e.preventDefault();buzz()});
  $('#skip').onclick=skipClue;
}
function openBuzzers(){
  if(G.state!=='reading')return;
  setState('open');G.openAt=performance.now();setLights('on');sfx.open();
  foot(`<button class="buzz live" id="bz">BUZZ!</button><div class="bar"><i id="bar"></i></div><button class="skip" id="skip" type="button">Don’t know · skip</button>`);
  $('#bz').addEventListener('pointerdown',e=>{e.preventDefault();buzz()});
  $('#skip').onclick=skipClue;
  runTimer(READ_BUZZ_MS,f=>{const b=$('#bar');if(b){b.style.transform=`scaleX(${f})`;b.className=f<.3?'warn':''}},()=>{
    if(G.state==='open')noBuzz();
  });
}
function buzz(){
  const now=performance.now();
  if(G.state==='reading'){
    if(now<G.lockedUntil)return;
    G.lockedUntil=now+LOCKOUT_MS;sfx.lock();setLights('bad');
    $('#foot').insertAdjacentHTML('afterbegin','<div class="hint"><span class="lock">TOO EARLY! Locked out</span></div>');
    later(()=>{if(G.state==='reading'){setLights('armed');footReading()}},LOCKOUT_MS+30);
    return;
  }
  if(G.state==='open'){
    if(now<G.lockedUntil)return;
    const rt=Math.round(now-G.openAt);
    G.reaction=rt;clearTimers();setState('answer');setLights(null);sfx.buzz();
    askAnswer(G.clue,{ms:ANSWER_MS,prefix:`You buzzed in <b>${rt} ms</b> after the lights. `,cb:(txt,to)=>finishClue(G.clue,txt,'buzz',to)});
  }
}
function askAnswer(c,o){
  const rowHtml=`
   <div class="answer-row"><input id="ans" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" placeholder="What is …?"><button class="btn" id="sub">Go</button></div>
   <div class="bar"><i id="bar"></i></div><div class="hint" id="secs"></div>`;
  foot(rowHtml);
  const inp=$('#ans');inp.focus({preventScroll:true});
  document.body.classList.add('typing');
  inp.addEventListener('focus',()=>{setTimeout(syncVV,60);setTimeout(syncVV,350)});
  let done=false;
  const submit=()=>{if(done)return;done=true;clearTimers();o.cb(inp.value)};
  inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();submit()}});
  $('#sub').onclick=submit;
  runTimer(o.ms,(f,s)=>{const b=$('#bar');if(b){b.style.transform=`scaleX(${f})`;b.className=f<.3?'warn':''}const e=$('#secs');if(e)e.textContent=s+' s'},()=>{if(!done){done=true;o.cb(inp.value,true)}});
  G.submitAnswer=submit;
}
function skipClue(){
  if(G.state!=='reading'&&G.state!=='open')return;
  clearTimers();setState('nobuzz');setLights(null);
  finishClue(G.clue,null,'skip');
}
function noBuzz(){
  clearTimers();setState('nobuzz');setLights(null);
  finishClue(G.clue,null,'nobuzz');
}

/* ---------- daily double ---------- */
function ddSplash(c){
  setState('ddsplash');setLights(null);sfx.dd();
  S(`<div class="panel flashbg"><div class="dd">Daily<br>Double!</div><div class="sub">${esc(catName())}</div></div>`);
  G.pending=()=>ddWager(c);
  later(G.pending,R(2600));
}
function ddWager(c){
  setState('wager');
  const top=G.round==='J'?1000:2000,max=Math.max(G.score,top);
  S(`<div class="panel"><div class="sub">Daily Double · ${esc(catName())}</div>
   <div class="h1">Make your wager</div>
   <div class="sub">You have <span class="gold">${money(G.score)}</span> · you may wager <span class="gold">$5</span> to <span class="gold">${money(max)}</span></div>
   <div class="answer-row" style="max-width:70vmin"><input id="wg" type="text" inputmode="numeric" autocomplete="off" placeholder="$ amount"><button class="btn" id="wgo">Lock in</button></div>
   <div class="contestants" style="gap:1vmin"><button class="btn ghost" data-w="${Math.min(1000,max)}">$1,000</button><button class="btn ghost" data-w="${Math.round(max/2)}">Half</button><button class="btn ghost" data-w="${max}">True Daily Double (max)</button></div>
   <div class="hint" id="wmsg">&nbsp;</div></div>`);
  const inp=$('#wg');inp.focus({preventScroll:true});
  const go=()=>{
    const n=parseInt(inp.value.replace(/[^\d]/g,''),10);
    if(!(n>=5&&n<=max)){$('#wmsg').innerHTML=`<span class="lock">Wager must be between $5 and ${money(max)}</span>`;return}
    G.wager=n;ddClue(c);
  };
  $('#wgo').onclick=go;inp.addEventListener('keydown',e=>{if(e.key==='Enter')go()});
  document.querySelectorAll('[data-w]').forEach(b=>b.onclick=()=>{inp.value=b.dataset.w;go()});
  G.wagerGo=go;
}
function ddClue(c){
  setState('answer');
  S(cardHtml(c,{wager:G.wager}));setLights(null);renderHud();
  askAnswer(c,{ms:ANSWER_MS,prefix:'',cb:(t,to)=>finishClue(c,t,'dd',to)});
}

/* ---------- judging ---------- */
const NUMW=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];
function norm(s){
  s=String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
   .replace(/&/g,' and ').replace(/[’‘`']/g,'').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
  s=s.replace(/^(what|whats|who|whos|where|wheres|when|whens|how)( (is|are|was|were|s))?\b\s*/,'');
  s=s.replace(/^(is|are|was|were)\s+(?=(a|an|the)\b)/,'');
  s=s.replace(/^(a|an|the)\s+/,'');
  return s.split(' ').map(t=>/^\d+$/.test(t)&&+t<=20?NUMW[+t]:t).join(' ').trim();
}
function variants(ans){
  const out=new Set();
  const base=[ans.replace(/\s*\([^)]*\)/g,' '),ans.replace(/[()]/g,' ')];
  for(const b of base){
    out.add(b);
    b.split(/\s+or\s+|\s*\/\s*|;\s*/i).forEach(p=>out.add(p));
  }
  for(const v of [...out]){const m=v.split(/\s+(?:&|and)\s+/);if(m.length===2)out.add(m[1]+' and '+m[0])}
  return [...out].map(norm).filter(Boolean);
}
function lev(a,b){
  const m=a.length,n=b.length;if(!m)return n;if(!n)return m;
  let p=Array.from({length:n+1},(_,j)=>j);
  for(let i=1;i<=m;i++){const c=[i];for(let j=1;j<=n;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c}
  return p[n];
}
function judge(user,ans){
  const u=norm(user);if(!u)return false;
  const us=u.replace(/ /g,'');
  for(const v of variants(ans)){
    if(u===v)return true;
    const vs=v.replace(/ /g,'');
    if(us===vs)return true;
    const d=lev(us,vs),L=Math.max(us.length,vs.length);
    if(L>=4&&d<=Math.max(1,Math.floor(L*0.2))&&1-d/L>=0.8)return true;
    if(vs.length>=5&&(' '+u+' ').includes(' '+v+' ')&&u.split(' ').length<=v.split(' ').length+1)return true;
  }
  return false;
}
window.__judge=judge;

/* ---------- results ---------- */
function realNote(c){
  const bits=[];
  if(c.dd){
    const who=(c.right[0]||c.wrong[0]||'The contestant');
    return `On the show, <b>${esc(who)}</b> found the Daily Double, wagered <b>${money(c.ddWager)}</b> and ${c.right.length?'got it <b>right</b>':'<b>missed</b>'}.`;
  }
  if(c.stumper)return 'On the show: <b>triple stumper</b> — nobody got it.';
  if(c.right.length)bits.push(`<b>${c.right.map(esc).join(', ')}</b> got it right`);
  if(c.wrong.length)bits.push(`<b>${c.wrong.map(esc).join(', ')}</b> missed`);
  return 'On the show: '+bits.join('; ')+'.';
}
function finishClue(c,txt,mode,timedOut){
  clearTimers();setLights(null);
  const value=mode==='dd'?G.wager:c.v;
  let verdict,cls,delta=0;
  if(mode==='nobuzz'){verdict='Time’s up — no one buzzed';cls='meh';}
  else if(mode==='skip'){verdict='Skipped';cls='meh';}
  else{
    const ok=txt&&judge(txt,c.a);
    delta=ok?value:-value;
    verdict=ok?'Correct!':(timedOut&&!(txt||'').trim()?'Time’s up!':'Incorrect');cls=ok?'good':'bad';
    G.score+=delta;(ok?sfx.good:sfx.bad)();
  }
  G.last={c,delta,value,txt,mode,cls};
  const wasRight=cls==='good';
  setState('result');
  renderHud();
  S(`<div class="panel">
    <div class="sub">${esc(catName())} · ${money(mode==='dd'?G.wager:c.v)}${mode==='dd'?' · Daily Double':''}</div>
    <div class="verdict ${cls}">${verdict}</div>
    ${delta?`<div class="h1 ${delta>0?'gold':''}" style="font-size:min(7vw,10vh)">${delta>0?'+':'−'}${money(Math.abs(delta)).replace('-','')}</div>`:''}
    ${txt!==null&&txt!==undefined?`<div class="typed">You answered: <b>${esc(txt.trim()||'(nothing)')}</b></div>`:''}
    <div class="sub">Correct response</div>
    <div class="serif" style="font-size:max(20px,5vmin);color:var(--gold-b);text-shadow:.3vmin .35vmin 0 #000">${esc(c.a)}</div>
    <div class="note">${realNote(c)}</div>
    <div class="contestants" style="gap:2vmin">
     ${cls==='bad'?'<button class="btn ghost" id="override">I was right (override)</button>':''}
     <button class="btn" id="next">Next ▸</button></div>
    </div>`);
  $('#next').onclick=nextAfterResult;
  const ov=$('#override');
  if(ov)ov.onclick=()=>{
    G.score+=2*value;G.last.cls='good';G.last.delta=value;
    ov.remove();renderHud();
    const v=$('.verdict');v.className='verdict good';v.textContent='Overruled — correct!';sfx.good();
  };
}
function nextAfterResult(){
  if(G.state!=='result')return;
  clearTimers();
  if(G.last.mode==='final')return endScreen();
  setState('board');renderBoard();renderHud();later(pickNext,R(2900));
}

/* ---------- round end / final ---------- */
function roundEnd(){
  clearTimers();setState('roundend');
  G.roundScores[G.round]=G.score;
  const r=G.round,real=SHOW.scores[r];
  const rows=[[YOU,G.score,true],...SHOW.contestants.map(c=>[c.name,real[c.short],false])].sort((a,b)=>b[1]-a[1]);
  S(`<div class="panel"><div class="h1">${r==='J'?'Jeopardy! Round':'Double Jeopardy! Round'}</div>
   <table class="cmp"><tr><th>Contestant</th><th>Score</th></tr>
   ${rows.map(x=>`<tr class="${x[2]?'me':''}"><td>${esc(x[0])}</td><td class="${x[1]<0?'neg':''}">${money(x[1])}</td></tr>`).join('')}</table>
   <button class="btn" id="cont">${r==='J'?'On to Double Jeopardy!':'On to Final Jeopardy!'}</button></div>`);
  $('#cont').onclick=()=>r==='J'?startRound('DJ'):finalIntro();
  renderHud();
}
function finalIntro(){
  clearTimers();G.round='F';setLights(null);setState('finalwager');renderHud();
  const F=SHOW.final;
  if(G.score<=0){
    S(`<div class="panel"><div class="logo" style="font-size:min(9vw,14vh)">Final Jeopardy!</div><div class="h1 gold">${esc(F.cat)}</div>
      <div class="note">With ${money(G.score)}, you don't qualify to play Final Jeopardy — just like on the show.</div>
      <button class="btn" id="cont">See the results</button></div>`);
    G.wager=0;G.last={mode:'final',skip:true};
    $('#cont').onclick=()=>{G.final={played:false,delta:0};endScreen()};
    return;
  }
  S(`<div class="panel"><div class="logo" style="font-size:min(9vw,14vh)">Final Jeopardy!</div><div class="h1 gold">${esc(F.cat)}</div>
    <div class="sub">You have <span class="gold">${money(G.score)}</span> · wager <span class="gold">$0</span> to <span class="gold">${money(G.score)}</span></div>
    <div class="answer-row" style="max-width:70vmin"><input id="wg" type="text" inputmode="numeric" autocomplete="off" placeholder="$ amount"><button class="btn" id="wgo">Lock in</button></div>
    <div class="contestants" style="gap:1vmin"><button class="btn ghost" data-w="0">$0</button><button class="btn ghost" data-w="${Math.round(G.score/2)}">Half</button><button class="btn ghost" data-w="${G.score}">Everything</button></div>
    <div class="hint" id="wmsg">&nbsp;</div></div>`);
  const inp=$('#wg');inp.focus({preventScroll:true});
  const go=()=>{
    const raw=inp.value.replace(/[^\d]/g,'');const n=raw===''?NaN:parseInt(raw,10);
    if(!(n>=0&&n<=G.score)){$('#wmsg').innerHTML=`<span class="lock">Wager must be between $0 and ${money(G.score)}</span>`;return}
    G.wager=n;finalClue();
  };
  $('#wgo').onclick=go;inp.addEventListener('keydown',e=>{if(e.key==='Enter')go()});
  document.querySelectorAll('[data-w]').forEach(b=>b.onclick=()=>{inp.value=b.dataset.w;go()});
  G.wagerGo=go;
}
function finalClue(){
  const F=SHOW.final;setState('answer');
  const c={q:F.q,a:F.a,v:G.wager,img:false};
  S(cardHtml(c,{cat:F.cat,wager:G.wager}));
  askAnswer(c,{ms:FINAL_MS,prefix:'',cb:(t,to)=>{
    clearTimers();
    const ok=t&&judge(t,F.a);const delta=ok?G.wager:-G.wager;G.score+=delta;(ok?sfx.good:sfx.bad)();
    G.final={played:true,delta,txt:t,ok};G.last={mode:'final',cls:ok?'good':'bad',delta,value:G.wager};
    setState('result');renderHud();
    S(`<div class="panel"><div class="sub">${esc(F.cat)} · your wager ${money(G.wager)}</div>
     <div class="verdict ${ok?'good':'bad'}">${ok?'Correct!':(to&&!(t||'').trim()?'Time’s up!':'Incorrect')}</div>
     <div class="h1 ${ok?'gold':''}" style="font-size:min(7vw,10vh)">${ok?'+':'−'}${money(G.wager)}</div>
     <div class="typed">You answered: <b>${esc((t||'').trim()||'(nothing)')}</b></div>
     <div class="sub">Correct response</div>
     <div class="serif" style="font-size:max(20px,5vmin);color:var(--gold-b);text-shadow:.3vmin .35vmin 0 #000">${esc(F.a)}</div>
     <div class="note">On the show: ${F.right.length?`<b>${F.right.map(esc).join(', ')}</b> got it right`:''}${F.wrong.length?`; <b>${F.wrong.map(esc).join(', ')}</b> missed`:''}.</div>
     <div class="contestants" style="gap:2vmin">${ok?'':'<button class="btn ghost" id="override">I was right (override)</button>'}<button class="btn" id="next">See the final results ▸</button></div>
     </div>`);
    $('#next').onclick=nextAfterResult;
    const ov=$('#override');if(ov)ov.onclick=()=>{G.score+=2*G.wager;G.final.delta=G.wager;G.final.ok=true;G.last.cls='good';ov.remove();renderHud();const v=$('.verdict');v.className='verdict good';v.textContent='Overruled — correct!';sfx.good()};
  }});
}

/* ---------- end ---------- */
const ORD=n=>['1st','2nd','3rd','4th'][n-1];
function endScreen(){
  clearTimers();setState('end');setLights(null);
  G.roundScores.F=G.score;
  savePlayed(SHOW.gameId,G.score);
  const fin=SHOW.scores.Final;
  const people=SHOW.contestants.map(c=>({name:c.name,short:c.short,score:fin[c.short],real:true,j:SHOW.scores.J[c.short],dj:SHOW.scores.DJ[c.short]}));
  const me={name:'You',score:G.score,real:false,j:G.roundScores.J??0,dj:G.roundScores.DJ??0};
  const all=[...people,me].sort((a,b)=>b.score-a.score||(a.real?-1:1)); // ties: the real contestant keeps the nod
  const place=all.indexOf(me)+1;
  const winner=all[0];
  const realRank=[...people].sort((a,b)=>b.score-a.score).map(p=>p.short);
  const remarks={};realRank.forEach((n,i)=>remarks[n]=i===0?'Winner on the show':ORD(i+1)+' on the show');
  let headline;
  if(place===1)headline=`You win! You'd have beaten ${winner===me?'the whole podium':''} and ended the streak in style.`;
  else headline=`You would have placed <span class="gold">${ORD(place)}</span>`;
  const beat=people.filter(p=>p.score<me.score).map(p=>p.name.split(' ')[0]);
  const lost=people.filter(p=>p.score>=me.score).map(p=>p.name.split(' ')[0]);
  const detail=place===1?`You finished ahead of ${beat.join(', ')}.`:
    (beat.length?`You finished ahead of ${beat.join(' and ')}, but behind ${lost.join(' and ')}.`:`${lost.join(', ')} finished ahead of you.`);
  S(`<div class="panel" style="gap:1.6vmin"><div class="sub">${esc(SHOW.show)} · ${new Date(SHOW.aired+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>
   <div class="h1" style="font-size:min(8vw,12vh)">${place===1?'You <span class="gold">win!</span>':headline}</div>
   <div class="sub" style="letter-spacing:.08em;text-transform:none;font-size:max(13px,2.6vmin)">${detail}</div>
   <table class="cmp end"><tr><th>#</th><th>Contestant</th><th>After J!</th><th>After DJ!</th><th>Final</th></tr>
   ${all.map((p,i)=>`<tr class="${p.real?'':'me'}"><td>${i+1}</td><td>${esc(p.name)}${p.real?`<small>${esc(remarks[p.short])}</small>`:'<small>your game</small>'}</td>
     <td class="${p.j<0?'neg':''}">${money(p.j)}</td><td class="${p.dj<0?'neg':''}">${money(p.dj)}</td><td class="${p.score<0?'neg':''}">${money(p.score)}</td></tr>`).join('')}</table>
   <div class="contestants"><button class="btn" id="again">Play again</button></div></div>`);
  $('#again').onclick=()=>{location.reload()};
  renderHud();
  window.__result={place,score:G.score};
}

/* ---------- input ---------- */
document.addEventListener('keydown',e=>{
  const st=G.state,age=performance.now()-G.stateAt;
  const inField=e.target&&e.target.tagName==='INPUT';
  if((st==='reading'||st==='open')&&(e.code==='Space'||e.key===' ')){e.preventDefault();if(!e.repeat)buzz();return}
  if((st==='reading'||st==='open')&&(e.key==='s'||e.key==='S'||e.key==='Escape')){e.preventDefault();skipClue();return}
  if(inField)return;
  if(e.key==='Enter'||e.code==='Space'){
    if(st==='intro'){e.preventDefault();$('#go').click()}
    else if(st==='result'&&age>500){e.preventDefault();nextAfterResult()}
    else if(st==='roundend'&&age>400){e.preventDefault();$('#cont').click()}
    else if(st==='finalwager'&&!$('#wg')&&age>400){e.preventDefault();$('#cont').click()}
  }
});
stage.addEventListener('pointerdown',e=>{ if(AC&&AC.state==='suspended')AC.resume() });

/* ---------- debug autoplay (?auto=1[&fast=1]) : plays the whole show by itself ---------- */
if(AUTO){
  setInterval(()=>{
    const st=G.state,age=performance.now()-G.stateAt;
    if(st==='intro')$('#go').click();
    else if(st==='open'&&age>80)buzz();
    else if(st==='answer'&&$('#ans')&&!$('#ans').dataset.f){
      const inp=$('#ans');inp.dataset.f=1;
      const c=G.round==='F'?{a:SHOW.final.a}:G.clue;
      inp.value=Math.random()<.65?'what is '+c.a.replace(/\(|\)/g,''):'definitely wrong';
      setTimeout(()=>G.submitAnswer&&G.submitAnswer(),120);
    }
    else if(st==='wager'&&$('#wg')&&!$('#wg').dataset.f){const inp=$('#wg');inp.dataset.f=1;inp.value=String(Math.min(Math.max(G.score,5),1000));G.wagerGo()}
    else if(st==='finalwager'&&$('#wg')&&!$('#wg').value){$('#wg').value=String(Math.round(G.score/2));G.wagerGo()}
    else if(st==='finalwager'&&!$('#wg')&&age>600)$('#cont').click();
    else if(st==='result'&&age>600)nextAfterResult();
    else if(st==='roundend'&&age>600)$('#cont').click();
  },200);
}
window.__G=G;window.__startRound=startRound;window.__loadShow=loadShow;window.__savePlayed=savePlayed;window.__readPlayed=readPlayed;
intro();
})();
