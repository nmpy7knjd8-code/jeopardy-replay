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
let SHOW=EPISODES[0];
const epParam=Q.get('ep');
if(epParam){const e=EPISODES.find(e=>e.gameId===epParam)||EPISODES[+epParam];if(e)SHOW=e}
const G={score:0,state:'intro',round:'J',used:new Set(),curCol:-1,stay:0,timers:[],stateAt:0,
 roundScores:{},clue:null,lockedUntil:0,openAt:0,sound:true,history:[]};

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
hud.addEventListener('click',e=>{const m=e.target.closest('#mute');if(m){G.sound=!G.sound;m.textContent=G.sound?'🔊':'🔇';m.blur()}});

/* ---------- timers ---------- */
function later(fn,ms){const t=setTimeout(fn,ms);G.timers.push(t);return t}
function clearTimers(){G.timers.forEach(t=>{clearTimeout(t);clearInterval(t)});G.timers=[]}
function setState(s){G.state=s;G.stateAt=performance.now();if(s!=='answer')document.body.classList.remove('typing')}
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
function renderHud(){
  hud.classList.remove('hide');
  hud.innerHTML=`<div class="scorebox ${G.score<0?'neg':'pos'}">${money(G.score)}</div><button id="mute" type="button" aria-label="Toggle sound">${G.sound?'🔊':'🔇'}</button>`;
}
const S=(html)=>{stage.innerHTML=html;ro.disconnect();const cl=stage.querySelector('.clue');if(cl)ro.observe(cl);const bd=stage.querySelector('.body');if(bd)ro.observe(bd);requestAnimationFrame(fitAll)};
const ro=window.ResizeObserver?new ResizeObserver(()=>requestAnimationFrame(fitAll)):{observe(){},disconnect(){}};
/* ---------- fit-to-box text sizing ---------- */
function fit(box,el,max,min=9){
  if(!box||!el||!box.clientWidth)return;
  const cs=getComputedStyle(box);
  const w=box.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
  const h=box.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
  let lo=min,hi=max;
  el.style.fontSize=hi+'px';
  if(el.scrollWidth<=w+.5&&el.offsetHeight<=h){return}
  while(hi-lo>.5){const mid=(lo+hi)/2;el.style.fontSize=mid+'px';(el.scrollWidth<=w+.5&&el.offsetHeight<=h)?lo=mid:hi=mid}
  el.style.fontSize=lo+'px';
}
function sizeBoard(){
  const b=document.querySelector('.board');if(!b)return;
  const portrait=innerWidth<innerHeight,ar=portrait?1.65:1.72,catF=portrait?2:1.4,gap=2,pad=2;
  const availW=stage.clientWidth-(portrait?8:24),availH=stage.clientHeight-(portrait?16:20)-48;
  let W=Math.min(availW,portrait?560:1180);
  const hFor=w=>{const cw=(w-2*pad-5*gap)/6,ch=cw/ar;return ch*(5+catF)+5*gap+2*pad};
  if(hFor(W)>availH)W=W*availH/hFor(W);
  const cw=(W-2*pad-5*gap)/6,ch=cw/ar;
  b.style.width=W+'px';b.style.gridTemplateRows=`${ch*catF}px repeat(5,${ch}px)`;
  return {cw,ch,chCat:ch*catF};
}
function fitAll(){
  const vm=Math.min(innerWidth,innerHeight),portrait=innerWidth<innerHeight;
  const clue=document.querySelector('.clue:not(.ans)');
  if(clue)fit(clue,clue.firstElementChild,portrait?Math.min(26,vm*.07):Math.min(40,vm*.058),12);
  const cc=document.querySelector('.banner .cc');
  if(cc)fit(cc.parentElement,cc,Math.min(vm*.11,84),14);
  const bd=document.querySelector('.board');
  if(bd){
    const g=sizeBoard();if(!g)return;
    const cats=[...bd.querySelectorAll('.cat')];
    // ONE shared category font size: largest size where the longest (<=12 letters) word fits the cell width
    const probe=document.createElement('span');probe.className='cat';probe.style.cssText='position:absolute;visibility:hidden;white-space:nowrap;font-size:100px;padding:0;left:-9999px';document.body.appendChild(probe);
    let maxW=1;
    SHOW.rounds[G.round].cats.forEach(t=>t.split(/\s+/).forEach(w=>{if(w.length>12)return;probe.textContent=w;maxW=Math.max(maxW,probe.scrollWidth)}));
    probe.remove();
    const availW=g.cw-8,availH=g.chCat-6;
    let f=Math.min(g.cw*.2,24,availW/maxW*100);
    f=Math.max(f,9);
    const spans=cats.map(c=>c.firstElementChild);
    const apply=()=>spans.forEach(sp=>sp.style.fontSize=f+'px');
    apply();
    while(f>9&&spans.some(sp=>sp.offsetHeight>availH)){f-=.5;apply()}
    // ONE shared value font: the widest label ("$1000"/"$2000") must fit the cell width with padding
    const vp=document.createElement('span');vp.className='cell';vp.style.cssText='position:absolute;visibility:hidden;white-space:nowrap;padding:0;left:-9999px;background:none;display:inline-block;width:auto;height:auto;font-size:100px';
    vp.innerHTML='<span style="font-size:100px">$'+(G.round==='J'?'1000':'2000')+'</span>';document.body.appendChild(vp);
    const vw=vp.firstElementChild.getBoundingClientRect().width;vp.remove();
    const vf=Math.max(8,Math.min(g.ch*.6,(g.cw-10)/vw*100,60));
    bd.style.setProperty('--vf',vf+'px');
  }
}
addEventListener('resize',()=>requestAnimationFrame(fitAll));
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fitAll);
function syncVV(){
  const v=window.visualViewport;if(!v)return;
  appEl.style.height=v.height+'px';appEl.style.top=v.offsetTop+'px';
  document.body.classList.toggle('kb',v.height<innerHeight-100);   // on-screen keyboard is up
  window.scrollTo(0,0);requestAnimationFrame(fitAll);
}
if(window.visualViewport){visualViewport.addEventListener('resize',syncVV);visualViewport.addEventListener('scroll',syncVV);syncVV()}

/* ---------- intro ---------- */
let pick=0;
function intro(){
  clearTimers();setState('intro');setLights(null);hud.classList.add('hide');
  const fmt=e=>new Date(e.aired+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  const cur=Math.max(0,EPISODES.indexOf(SHOW));pick=cur;
  S(`<div class="panel intro">
    <div class="logo">Jeopardy!</div>
    <div class="sub">Pick an episode</div>
    <div class="eps">${EPISODES.map((e,i)=>`<button type="button" class="ep${i===cur?' sel':''}" data-i="${i}">
      <span class="ed">${fmt(e)} · ${esc(e.show)}</span>
      <span class="en">${e.contestants.map(c=>esc(c.name)).join(' · ')}</span>
      <span class="et">${esc(e.tag||'')}</span></button>`).join('')}</div>
    <button class="btn" id="go">Start</button>
    <div class="hint">Buzz when the lights come on · type your response · Enter to submit</div></div>`);
  document.querySelectorAll('.ep').forEach(b=>b.onclick=()=>{pick=+b.dataset.i;SHOW=EPISODES[pick];document.querySelectorAll('.ep').forEach(x=>x.classList.toggle('sel',x===b))});
  $('#go').onclick=()=>{SHOW=EPISODES[pick];startRound('J')};
}

/* ---------- rounds & board ---------- */
function startRound(r){
  clearTimers();G.round=r;G.used=new Set();G.curCol=-1;G.stay=0;
  renderBoard();renderHud();setState('board');
  later(pickNext,R(2600));
}
function renderBoard(flashKey){
  const keepVf=document.querySelector('.board')?document.querySelector('.board').style.getPropertyValue('--vf'):'';
  const rd=SHOW.rounds[G.round];
  let h='<div class="board">'+rd.cats.map(c=>`<div class="cat"><span>${esc(c)}</span></div>`).join('');
  for(let r=0;r<5;r++)for(let c=0;c<6;c++){
    const k=c+','+r,used=G.used.has(k),mult=G.round==='J'?200:400;
    h+=`<div class="cell${used?' used':''}${flashKey===k?' flash':''}" data-k="${k}" data-r="${r}"><span>${used?'':'$'+(r+1)*mult}</span></div>`;
  }
  S('<div class="bw">'+h+'</div><button class="ff" id="ff" type="button" aria-label="Skip the wait" title="Skip the wait">⏩</button></div>');
  $('#ff').onclick=fastForward;
  if(keepVf)document.querySelector('.board').style.setProperty('--vf',keepVf);
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
  foot(`<div class="hint">Wait for the lights…</div><button class="buzz" id="bz">BUZZ</button><button class="skip" id="skip" type="button">Don’t know · skip</button>`);
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
    const h=$('.hint');if(h){h.innerHTML='<span class="lock">TOO EARLY! Locked out</span>'}
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
  S(`<div class="panel flashbg"><div class="dd">Daily<br>Double!</div><div class="sub">${esc(catName())}</div><button class="ff" id="ff" type="button" aria-label="Skip">⏩</button></div>`);
  $('#ff').onclick=fastForward;
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
   <div class="hint" id="wmsg">Enter a whole-dollar amount</div></div>`);
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
    <div class="hint">press <b>Enter</b> or <b>Space</b></div></div>`);
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
  setState('board');renderBoard();renderHud();later(pickNext,R(1900));
}

/* ---------- round end / final ---------- */
function roundEnd(){
  clearTimers();setState('roundend');
  G.roundScores[G.round]=G.score;
  const r=G.round,real=SHOW.scores[r];
  const rows=[[YOU,G.score,true],...SHOW.contestants.map(c=>[c.name,real[c.short],false])].sort((a,b)=>b[1]-a[1]);
  S(`<div class="panel"><div class="sub">End of the</div><div class="h1">${r==='J'?'Jeopardy! Round':'Double Jeopardy! Round'}</div>
   <table class="cmp"><tr><th>Contestant</th><th>Score</th></tr>
   ${rows.map(x=>`<tr class="${x[2]?'me':''}"><td>${esc(x[0])}</td><td class="${x[1]<0?'neg':''}">${money(x[1])}</td></tr>`).join('')}</table>
   <button class="btn" id="cont">${r==='J'?'On to Double Jeopardy!':'On to Final Jeopardy!'}</button><div class="hint">press <b>Enter</b></div></div>`);
  $('#cont').onclick=()=>r==='J'?startRound('DJ'):finalIntro();
  renderHud();
}
function finalIntro(){
  clearTimers();G.round='F';setLights(null);setState('finalwager');
  const F=SHOW.final;
  if(G.score<=0){
    S(`<div class="panel"><div class="logo" style="font-size:min(9vw,14vh)">Final Jeopardy!</div><div class="sub">The category is</div><div class="h1 gold">${esc(F.cat)}</div>
      <div class="note">With ${money(G.score)}, you don't qualify to play Final Jeopardy — just like on the show.</div>
      <button class="btn" id="cont">See the results</button><div class="hint">press <b>Enter</b></div></div>`);
    G.wager=0;G.last={mode:'final',skip:true};
    $('#cont').onclick=()=>{G.final={played:false,delta:0};endScreen()};
    return;
  }
  S(`<div class="panel"><div class="logo" style="font-size:min(9vw,14vh)">Final Jeopardy!</div><div class="sub">The category is</div><div class="h1 gold">${esc(F.cat)}</div>
    <div class="sub">You have <span class="gold">${money(G.score)}</span> · wager <span class="gold">$0</span> to <span class="gold">${money(G.score)}</span></div>
    <div class="answer-row" style="max-width:70vmin"><input id="wg" type="text" inputmode="numeric" autocomplete="off" placeholder="$ amount"><button class="btn" id="wgo">Lock in</button></div>
    <div class="contestants" style="gap:1vmin"><button class="btn ghost" data-w="0">$0</button><button class="btn ghost" data-w="${Math.round(G.score/2)}">Half</button><button class="btn ghost" data-w="${G.score}">Everything</button></div>
    <div class="hint" id="wmsg">Enter a whole-dollar amount</div></div>`);
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
     <div class="hint">press <b>Enter</b> or <b>Space</b></div></div>`);
    $('#next').onclick=nextAfterResult;
    const ov=$('#override');if(ov)ov.onclick=()=>{G.score+=2*G.wager;G.final.delta=G.wager;G.final.ok=true;G.last.cls='good';ov.remove();renderHud();const v=$('.verdict');v.className='verdict good';v.textContent='Overruled — correct!';sfx.good()};
  }});
}

/* ---------- end ---------- */
const ORD=n=>['1st','2nd','3rd','4th'][n-1];
function endScreen(){
  clearTimers();setState('end');setLights(null);hud.classList.add('hide');
  G.roundScores.F=G.score;
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
    else if(st==='wager'&&$('#wg')&&!$('#wg').value){$('#wg').value=String(Math.min(G.score,1000)||5);G.wagerGo()}
    else if(st==='finalwager'&&$('#wg')&&!$('#wg').value){$('#wg').value=String(Math.round(G.score/2));G.wagerGo()}
    else if(st==='finalwager'&&!$('#wg')&&age>600)$('#cont').click();
    else if(st==='result'&&age>600)nextAfterResult();
    else if(st==='roundend'&&age>600)$('#cont').click();
  },200);
}
window.__G=G;window.__startRound=startRound;
intro();
})();
