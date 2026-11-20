(()=>{
'use strict';
const Q=new URLSearchParams(location.search);
const FAST=Q.has('fast'), AUTO=Q.has('auto');
const R=ms=>FAST?Math.max(40,ms/10):ms;           // delays & reading time (debug fast-forward)
const READ_BUZZ_MS=5000, ANSWER_MS=15000, FINAL_MS=30000, LOCKOUT_MS=250;
const $=s=>document.querySelector(s);
const stage=$('#stage'), hud=$('#hud'), lights=$('#lights'), topL=$('#topL');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>(n<0?'-':'')+'$'+Math.abs(n).toLocaleString('en-US');
const YOU='You';
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
$('#mute').onclick=e=>{G.sound=!G.sound;e.target.textContent=G.sound?'🔊 Sound on':'🔇 Sound off';e.target.blur()};

/* ---------- timers ---------- */
function later(fn,ms){const t=setTimeout(fn,ms);G.timers.push(t);return t}
function clearTimers(){G.timers.forEach(t=>{clearTimeout(t);clearInterval(t)});G.timers=[]}
function setState(s){G.state=s;G.stateAt=performance.now()}
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
function renderHud(extra){
  hud.classList.remove('hide');
  const left=30-G.used.size;
  hud.innerHTML=`<div class="scorebox ${G.score<0?'neg':'pos'}">${money(G.score)}<small>${YOU}</small></div>
  <div class="info">${extra!==undefined?extra:(G.round==='J'?'Jeopardy! Round':G.round==='DJ'?'Double Jeopardy! Round':'Final Jeopardy!')}${G.round!=='F'&&extra===undefined?`<br>${left} clue${left===1?'':'s'} left`:''}</div>`;
}
const S=(html)=>{stage.innerHTML=html};

/* ---------- intro ---------- */
function intro(){
  clearTimers();setState('intro');setLights(null);hud.classList.add('hide');
  const d=new Date(SHOW.aired+'T12:00:00');
  topL.innerHTML='<b>Jeopardy!</b> Replay';
  S(`<div class="panel">
    <div class="logo">Jeopardy!</div>
    <div class="sub">Replay · ${esc(SHOW.show)} · ${d.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div>
    <div class="contestants">${SHOW.contestants.map(c=>`<div><b>${esc(c.name)}</b>${esc(c.bio)}</div>`).join('')}<div><b>You</b>Taking the fourth podium</div></div>
    <ul class="rules">
      <li><b>Lights</b> – read the clue; when the border lights up, press <b>SPACE</b> or tap <b>BUZZ</b> (≈5 s). Too early = ¼ s lockout.</li>
      <li><b>Answer</b> – type your response after buzzing (15 s). Typos &amp; “what is” are fine.</li>
      <li><b>Daily Doubles</b> – wager up to your score (or the top clue value). <b>Final Jeopardy</b> – 30 s.</li>
    </ul>
    <button class="btn" id="go">Start the game</button>
    <div class="hint">or press <b>Enter</b></div></div>`);
  $('#go').onclick=()=>startRound('J');
}

/* ---------- rounds & board ---------- */
function startRound(r){
  clearTimers();G.round=r;G.used=new Set();G.curCol=-1;G.stay=0;
  topL.innerHTML=`<b>Jeopardy!</b> Replay · ${r==='J'?'Jeopardy! Round':'Double Jeopardy! Round'}`;
  renderBoard();renderHud();setState('board');
  later(pickNext,R(1600));
}
function renderBoard(flashKey){
  const rd=SHOW.rounds[G.round];
  let h='<div class="board">'+rd.cats.map(c=>`<div class="cat"><span>${esc(c)}</span></div>`).join('');
  for(let r=0;r<5;r++)for(let c=0;c<6;c++){
    const k=c+','+r,used=G.used.has(k),mult=G.round==='J'?200:400;
    h+=`<div class="cell${used?' used':''}${flashKey===k?' flash':''}" data-k="${k}">${used?'':'$'+(r+1)*mult}</div>`;
  }
  S(h+'</div>');
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
function pickNext(){
  if(G.used.size>=30)return roundEnd();
  const {clue,jump}=choose();
  G.stay=(!jump&&clue.c===G.curCol)?G.stay+1:1;G.curCol=clue.c;
  G.used.add(clue.c+','+clue.r);G.clue=clue;
  renderBoard(clue.c+','+clue.r);renderHud();setState('picking');
  later(()=>clue.dd?ddSplash(clue):showClue(clue),R(1000));
}

/* ---------- clue card ---------- */
function clueSize(t){const n=t.length;const k=n<50?1:n<90?.88:n<140?.76:n<200?.66:.58;return `min(${5.4*k}vw,${8.4*k}vh)`}
const catName=()=>SHOW.rounds[G.round].cats[G.clue.c];
const faceValue=c=>c.v*(G.round==='J'?1:1);
function cardHtml(c,opts={}){
  const val=opts.noValue?'':`<span class="cv">${money(opts.wager!==undefined?opts.wager:c.v)}</span>`;
  return `<div class="card"><div class="card-head"><span>${esc(opts.cat||catName())}</span>${val}</div>
   <div class="clue" style="font-size:${clueSize(c.q)}">${esc(c.q)}</div>
   ${c.img?'<div class="imgnote">📺 a picture accompanied this clue on the show</div>':''}
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
  foot(`<div class="hint">Listen… wait for the <b>lights</b></div><button class="buzz" id="bz">BUZZ</button>`);
  $('#bz').addEventListener('pointerdown',e=>{e.preventDefault();buzz()});
}
function openBuzzers(){
  if(G.state!=='reading')return;
  setState('open');G.openAt=performance.now();setLights('on');sfx.open();
  foot(`<div class="hint">Lights are on! Press <b>SPACE</b> or tap <b>BUZZ</b></div><button class="buzz live" id="bz">BUZZ!</button><div class="bar"><i id="bar"></i></div>`);
  $('#bz').addEventListener('pointerdown',e=>{e.preventDefault();buzz()});
  runTimer(READ_BUZZ_MS,f=>{const b=$('#bar');if(b){b.style.transform=`scaleX(${f})`;b.className=f<.3?'warn':''}},()=>{
    if(G.state==='open')noBuzz();
  });
}
function buzz(){
  const now=performance.now();
  if(G.state==='reading'){
    if(now<G.lockedUntil)return;
    G.lockedUntil=now+LOCKOUT_MS;sfx.lock();setLights('bad');
    const h=$('.hint');if(h){h.innerHTML='<span class="lock">TOO EARLY! Locked out ¼ second</span>'}
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
  const rowHtml=`<div class="hint">${o.prefix||''}Type your response — <b>Enter</b> to lock it in</div>
   <div class="answer-row"><input id="ans" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" placeholder="What is …?"><button class="btn" id="sub">Go</button></div>
   <div class="bar"><i id="bar"></i></div><div class="hint" id="secs"></div>`;
  foot(rowHtml);
  const inp=$('#ans');inp.focus({preventScroll:true});
  let done=false;
  const submit=()=>{if(done)return;done=true;clearTimers();o.cb(inp.value)};
  inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();submit()}});
  $('#sub').onclick=submit;
  runTimer(o.ms,(f,s)=>{const b=$('#bar');if(b){b.style.transform=`scaleX(${f})`;b.className=f<.3?'warn':''}const e=$('#secs');if(e)e.textContent=s+' s'},()=>{if(!done){done=true;o.cb(inp.value,true)}});
  G.submitAnswer=submit;
}
function noBuzz(){
  clearTimers();setState('nobuzz');setLights(null);
  finishClue(G.clue,null,'nobuzz');
}

/* ---------- daily double ---------- */
function ddSplash(c){
  setState('ddsplash');setLights(null);sfx.dd();
  S(`<div class="panel flashbg"><div class="dd">Daily<br>Double!</div><div class="sub">${esc(catName())}</div></div>`);
  later(()=>ddWager(c),R(2600));
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
  S(cardHtml(c,{wager:G.wager}));setLights(null);renderHud(`Daily Double · wager ${money(G.wager)}`);
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
  else{
    const ok=txt&&judge(txt,c.a);
    delta=ok?value:-value;
    verdict=ok?'Correct!':(timedOut&&!(txt||'').trim()?'Time’s up!':'Incorrect');cls=ok?'good':'bad';
    G.score+=delta;(ok?sfx.good:sfx.bad)();
  }
  G.last={c,delta,value,txt,mode,cls};
  const wasRight=cls==='good';
  setState('result');
  renderHud(G.round==='J'?'Jeopardy! Round':'Double Jeopardy! Round');
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
    ov.remove();renderHud(G.round==='J'?'Jeopardy! Round':'Double Jeopardy! Round');
    const v=$('.verdict');v.className='verdict good';v.textContent='Overruled — correct!';sfx.good();
  };
}
function nextAfterResult(){
  if(G.state!=='result')return;
  clearTimers();
  if(G.last.mode==='final')return endScreen();
  setState('board');renderBoard();renderHud();later(pickNext,R(900));
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
  renderHud(r==='J'?'Jeopardy! Round complete':'Double Jeopardy! Round complete');
}
function finalIntro(){
  clearTimers();G.round='F';setLights(null);setState('finalwager');
  topL.innerHTML='<b>Jeopardy!</b> Replay · Final Jeopardy!';renderHud('Final Jeopardy!');
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
    setState('result');renderHud('Final Jeopardy!');
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
    const ov=$('#override');if(ov)ov.onclick=()=>{G.score+=2*G.wager;G.final.delta=G.wager;G.final.ok=true;G.last.cls='good';ov.remove();renderHud('Final Jeopardy!');const v=$('.verdict');v.className='verdict good';v.textContent='Overruled — correct!';sfx.good()};
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
  const remarks={'Greg':'New champion — ended Jamie’s 31-game streak','Jamie':'Finished 2nd after a 31-game run','Katrina':'Finished 3rd'};
  let headline;
  if(place===1)headline=`You win! You'd have beaten ${winner===me?'the whole podium':''} and ended the streak in style.`;
  else headline=`You would have placed <span class="gold">${ORD(place)}</span>`;
  const beat=people.filter(p=>p.score<me.score).map(p=>p.name.split(' ')[0]);
  const lost=people.filter(p=>p.score>=me.score).map(p=>p.name.split(' ')[0]);
  const detail=place===1?`You finished ahead of ${beat.join(', ')}.`:
    (beat.length?`You finished ahead of ${beat.join(' and ')}, but behind ${lost.join(' and ')}.`:`${lost.join(', ')} finished ahead of you.`);
  S(`<div class="panel" style="gap:1.6vmin"><div class="sub">Show #9551 · final scores</div>
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
window.__G=G;
intro();
})();
