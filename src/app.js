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
const G={score:0,rawScore:0,coryat:0,state:'intro',round:'J',used:new Set(),curCol:-1,stay:0,timers:[],stateAt:0,
 roundScores:{},clue:null,lockedUntil:0,openAt:0,sound:true,history:[],skipped:null,paused:false,pauseAt:0,voiceMute:(()=>{try{return localStorage.getItem('jr-voice-mute')==='1'}catch(e){return false}})()};
function migratePlayed(rec){
  if(!rec||typeof rec!=='object')return rec;
  if(Array.isArray(rec.plays)&&rec.plays.length)return summarizePlayed(rec);
  const adj=rec.last!=null?rec.last:rec.best;
  if(adj==null&&!rec.finished)return rec;
  const raw=rec.lastRaw!=null?rec.lastRaw:(rec.bestRaw!=null?rec.bestRaw:adj);
  rec.plays=[{date:rec.date||new Date().toISOString(),raw,adj,trueScore:rec.lastTrue??null,coryat:rec.lastCoryat??null}];
  return summarizePlayed(rec);
}
function summarizePlayed(rec){
  const plays=(rec.plays||[]).slice();
  let best=null,bestRaw=null,bestTrue=null,bestCoryat=null;
  for(const p of plays){
    if(p.adj!=null)best=best==null?p.adj:Math.max(best,p.adj);
    if(p.raw!=null)bestRaw=bestRaw==null?p.raw:Math.max(bestRaw,p.raw);
    if(p.trueScore!=null)bestTrue=bestTrue==null?p.trueScore:Math.max(bestTrue,p.trueScore);
    if(p.coryat!=null)bestCoryat=bestCoryat==null?p.coryat:Math.max(bestCoryat,p.coryat);
  }
  const latest=[...plays].sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0];
  return Object.assign({},rec,{
    finished:true,plays,
    last:latest?latest.adj:rec.last,lastRaw:latest?latest.raw:rec.lastRaw,
    lastTrue:latest&&latest.trueScore!=null?latest.trueScore:null,
    lastCoryat:latest&&latest.coryat!=null?latest.coryat:null,
    best,bestRaw,bestTrue,bestCoryat,
    date:latest?latest.date:rec.date
  });
}
function readPlayed(){
  try{
    const all=JSON.parse(localStorage.getItem('jr-played')||'{}');
    let changed=false;
    for(const id of Object.keys(all)){
      const p=all[id];
      if(!p||typeof p!=='object')continue;
      if(!Array.isArray(p.plays)){all[id]=migratePlayed(p);changed=true}
    }
    if(changed)try{localStorage.setItem('jr-played',JSON.stringify(all))}catch(e){}
    return all;
  }catch(e){return{}}
}
function savePlayed(id,score,raw,more){
  if(AUTO||FAST)return;
  try{
    const rawV=raw==null?score:raw;
    const play={
      date:new Date().toISOString(),raw:rawV,adj:score,
      trueScore:more&&more.trueScore!=null?more.trueScore:(G.trueScore!=null?G.trueScore:null),
      coryat:more&&more.coryat!=null?more.coryat:(G.coryat!=null?G.coryat:null)
    };
    const all=readPlayed(),prev=migratePlayed(all[id]||{})||{};
    const plays=(prev.plays||[]).concat([play]);
    all[id]=summarizePlayed(Object.assign({},prev,{plays,finished:true}));
    localStorage.setItem('jr-played',JSON.stringify(all));
  }catch(e){}
}

/* ---------- in-progress saves (versioned; invalid/old saves are ignored) ---------- */
const SAVE_VER=1, PROGRESS_KEY='jr-progress';
const RNG={
  s:1,
  seed(n){this.s=((n>>>0)||1)},
  next(){
    let t=this.s=(this.s+0x6D2B79F5)>>>0;
    t=Math.imul(t^(t>>>15),t|1);
    t^=t+Math.imul(t^(t>>>7),t|61);
    return((t^(t>>>14))>>>0)/4294967296;
  }
};
function readProgressMap(){try{return JSON.parse(localStorage.getItem(PROGRESS_KEY)||'{}')}catch(e){return{}}}
function writeProgressMap(all){try{localStorage.setItem(PROGRESS_KEY,JSON.stringify(all))}catch(e){}}
function validProgress(sv,id){
  if(!sv||sv.v!==SAVE_VER)return false;
  if(id&&sv.id!==id)return false;
  if(!['J','DJ','F'].includes(sv.round))return false;
  if(!Array.isArray(sv.used)||typeof sv.score!=='number'||!isFinite(sv.score))return false;
  if(typeof sv.rng!=='number'||!sv.state)return false;
  if(!sv.used.every(k=>/^[0-5],[0-5]$/.test(k)))return false;
  return true;
}
function readProgress(id){
  try{
    const sv=readProgressMap()[id];
    return validProgress(sv,id)?sv:null;
  }catch(e){return null}
}
function clearProgress(id){
  if(AUTO||FAST)return;
  try{const all=readProgressMap();delete all[id];writeProgressMap(all)}catch(e){}
}
function inProgress(id){return !!readProgress(id)}
function progressLabel(sv){
  const rd=sv.round==='F'?'FJ':sv.round;
  return `Resume · ${rd} · ${money(sv.score)}`;
}
function shouldPersist(){
  if(AUTO||FAST||!SHOW||!SHOW.gameId)return false;
  if(G.state==='intro'||G.state==='end')return false;
  return G.used.size>0||G.round!=='J'||G.score!==0||!!G.roundScores.J||!!G.roundScores.DJ||G.state==='wager'||G.state==='ddsplash'||G.state==='finalwager'||G.state==='roundend';
}
function saveStateName(){
  const st=G.state;
  if(st==='result')return 'board';
  if(st==='reading'||st==='open'||st==='answer'||st==='picking')return G.clue?'picking':'board';
  if(st==='ddsplash')return 'ddsplash';
  return st;
}
function saveProgress(){
  if(!shouldPersist())return;
  try{
    const st=saveStateName();
    const sv={
      v:SAVE_VER,id:SHOW.gameId,round:G.round,used:[...G.used],score:G.score,rawScore:G.rawScore||0,coryat:G.coryat||0,
      roundScores:Object.assign({},G.roundScores),curCol:G.curCol,stay:G.stay,
      skipped:G.skipped||null,rng:RNG.s,state:st,
      clue:G.clue?{c:G.clue.c,r:G.clue.r}:null,
      wager:G.wager,final:G.final||null,
      savedAt:new Date().toISOString()
    };
    if(!validProgress(sv,SHOW.gameId))return;
    const all=readProgressMap();all[SHOW.gameId]=sv;writeProgressMap(all);
  }catch(e){}
}
function lookupClue(sv){
  if(!sv||!sv.clue||sv.round==='F'||!SHOW.rounds[sv.round])return null;
  return SHOW.rounds[sv.round].clues.find(c=>c.c===sv.clue.c&&c.r===sv.clue.r)||null;
}
function resetPlay(){
  G.score=0;G.rawScore=0;G.coryat=0;G.roundScores={};G.clue=null;G.pending=null;G.wager=undefined;G.final=null;G.last=null;
  G.skipped=null;G.history=[];G.used=new Set();G.curCol=-1;G.stay=0;
  RNG.seed(((Math.random()*0xFFFFFFFF)|0)>>>0||1);
}
function applyProgress(sv){
  G.score=sv.score;G.rawScore=sv.rawScore!=null?sv.rawScore:sv.score;G.coryat=sv.coryat||0;G.round=sv.round;G.used=new Set(sv.used);
  G.curCol=sv.curCol??-1;G.stay=sv.stay||0;
  G.roundScores=Object.assign({},sv.roundScores||{});
  G.skipped=sv.skipped||null;G.wager=sv.wager;G.final=sv.final||null;G.last=null;
  G.pending=null;RNG.seed(sv.rng);G.clue=lookupClue(sv);
}
function resumeGame(sv){
  applyProgress(sv);
  const st=sv.state;
  if(st==='roundend'){roundEnd();return}
  if(G.round==='F'){
    if(sv.wager!=null&&st!=='finalwager'&&st!=='roundend'){finalClue();return}
    finalIntro();return;
  }
  if((st==='wager'||st==='ddsplash')&&G.clue&&G.clue.dd){
    if(st==='wager')ddWager(G.clue);else ddSplash(G.clue);
    return;
  }
  if(st==='picking'&&G.clue){
    renderBoard(G.clue.c+','+G.clue.r);renderHud();setState('picking');
    G.pending=()=>G.clue.dd?ddSplash(G.clue):showClue(G.clue);
    later(G.pending,R(700));
    return;
  }
  renderBoard();renderHud();setState('board');
  later(pickNext,R(800));
}

/* ---------- speed-adjusted scoring ----------
 * After buzzers open (end of the read, or end of the mute/show delay), a
 * correct regular-clue buzz is worth face × survival(t), paid in discrete
 * $100 steps — not a smooth value rounded only at the end. Daily Doubles
 * and Final Jeopardy are not buzzer races, so they keep full wager value.
 * Wrong answers still cost the full face amount. Triple stumpers stay at
 * full value: no one on the show got there first.
 *
 *   survival(t) = 1                     t <= grace
 *               = exp(-(t-grace)/tau)   grace < t < cutoff
 *               = 0                     t >= cutoff
 *
 * For each clue we precompute the times when that curve hits the next
 * lower $100 multiple, and award whatever step the buzz lands in. The
 * last step drops to $0 when the curve falls to $50 (half a step) or at
 * cutoff, whichever is first — otherwise a $200 clue would keep paying
 * $100 until 5s, which overvalues a late buzz.
 *
 * Constants are from published buzzer timing and from stumper/rebound
 * rates in this catalog (609 games, 36,540 clues). Tune from measured
 * first-buzz times if those become available.
 */
const SPEED={
  // Full value this long after the lights. Official lockout is 0.25s
  // (Jeopardy.com, “How Does the Jeopardy! Buzzer Work?”, 2017). Typical
  // winning/average contestant reaction times are ~0.13–0.23s: Holznagel
  // trained from 228 ms to 126 ms (Secrets of the Buzzer; Vulture, 2020);
  // he called 216 ms “very average” (Jeopardy E3 transcript); Lynn Yu
  // cites a 0.225s contestant average; Brad Rutter described the race as
  // “hundredths of a second” (Vulture, 2020). 0.30s covers that window
  // plus a little home-device lag without paying full value past the
  // “narrow sweet spot” (Ken Jennings FAQ).
  grace:0.30,

  // Hard zero. The show’s familiar 5-second clock is the time to *answer*
  // after you’re recognized, not to buzz (Wikipedia / Jeopardy! rules).
  // There is no official buzz deadline — if no one rings in, the host
  // reveals the response — but by 5s the curve is already ~2% even on a
  // hard $1000 clue (tau 1.25). Floor to $0 here.
  cutoff:5.0,

  // Seconds, Jeopardy/DJ rows 0–4 (low to high dollar). Easy first-right
  // clues are three-way reflex races: in our data row 0 is 90.6% first-
  // right and only 4.4% stumpers, so after the grace window survival
  // should fall quickly without going off a cliff. 0.65s is a hair slower
  // than 0.6s: at 0.5s an easy $200 is still full value ($147 continuous,
  // held at $200 until the $100 step at 0.75s); at 2s it is already $0.
  // Harder rows are slower recalls, not slower thumbs — stumper rates
  // rise 4.4% → 9.7% → 14.1% → 18.9% → 28.4% and first-right falls to
  // 67.3% on row 4 — so tau scales about 2×, from 0.65 to 1.25.
  tauByRow:[0.65,0.80,0.95,1.10,1.25],

  // After a miss the system is re-armed for the other two (Jeopardy.com).
  // Rebound rate is a flat ~5% across rows in our data. Less of a three-
  // way slap; 1.5s as requested, applied as max(row tau, this).
  tauRebound:1.50,

  step:100,
  // Drop to $0 when the continuous value falls to half a step.
  zeroAt:50,

  // Per-game contest factor: multiplies tau (grace is left alone — that's
  // a reaction-time window, not a field-tightness knob). More buzzing in
  // the actual game → steeper curve (smaller tau); a quiet board → a
  // gentler tail. Not ELO-based; the same evidence curve is scaled for
  // every contestant in the game.
  //
  // Activity is (correct + incorrect responses) / buzz-able clues (J!+DJ
  // minus Daily Doubles), blended with the three players' combined Coryat
  // so a knowledge-heavy game also tightens slightly. In this catalog
  // (609 games): response rate median 0.982 / mean 0.977; combined Coryat
  // median $34,600 / mean $34,224. factor = clamp(1 - k*(activity-1)),
  // activity = (1-w)*(rate/rateBaseline) + w*(coryat/coryatBaseline).
  // k=1.8 puts a typical p10 quiet game (~0.90 responses/clue) near 1.15
  // and a p90 busy one (~1.05) near 0.87; only the tails hit the clamps.
  contest:{
    min:0.80,
    max:1.25,
    rateBaseline:0.98,
    coryatBaseline:34600,
    coryatWeight:0.25,
    k:1.8
  },
  gameFactor:1,

  activity(show){
    let avail=0,responses=0,coryat=0;
    const rounds=(show&&show.rounds)||{};
    for(const rnd of ['J','DJ']){
      const clues=(rounds[rnd]&&rounds[rnd].clues)||[];
      for(const c of clues){
        if(c.dd)continue;
        avail++;
        const nr=(c.right||[]).length,nw=(c.wrong||[]).length,v=c.v||0;
        responses+=nr+nw;
        coryat+=v*nr-v*nw;
      }
    }
    return {avail,responses,coryat,rate:avail?responses/avail:this.contest.rateBaseline};
  },
  contestFactor(show){
    const cfg=this.contest,a=this.activity(show);
    const w=cfg.coryatWeight;
    const activity=(1-w)*(a.rate/cfg.rateBaseline)+w*((a.coryat||0)/cfg.coryatBaseline);
    const f=1-cfg.k*(activity-1);
    return Math.max(cfg.min,Math.min(cfg.max,f));
  },
  setGame(show){
    this.gameFactor=show?this.contestFactor(show):1;
    return this.gameFactor;
  },

  tau(clue){
    if(!clue||clue.dd)return Infinity;
    const right=clue.right||[];
    if(clue.stumper||!right.length)return Infinity;
    const row=Math.max(0,Math.min(4,clue.r|0));
    let tau=this.tauByRow[row];
    if((clue.wrong||[]).length) tau=Math.max(tau,this.tauRebound);
    return tau*this.gameFactor;
  },
  continuous(face,t,tau){
    face=+face||0;t=+t||0;
    if(!isFinite(tau))return face;
    if(t>=this.cutoff)return 0;
    if(t<=this.grace)return face;
    return face*Math.exp(-(t-this.grace)/tau);
  },
  award(face,t,tau){
    const v=this.continuous(face,t,tau);
    if(v<=this.zeroAt||t>=this.cutoff)return 0;
    return this.step*Math.ceil((v-1e-9)/this.step);
  },
  // Time the award drops TO each lower $100 multiple, and to $0.
  steps(face,tau){
    face=+face||0;
    const out=[{t:0,value:face}];
    if(!face||!isFinite(tau))return out;
    for(let amt=face-this.step;amt>=this.step;amt-=this.step){
      const t=this.grace+tau*Math.log(face/amt);
      if(t>=this.cutoff)break;
      out.push({t,value:amt});
    }
    const t0=Math.min(this.cutoff,this.grace+tau*Math.log(face/this.zeroAt));
    out.push({t:t0,value:0});
    return out;
  }
};

/* ---------- visual-only ELO (does not scale buzz speed) ---------- */
/* Formula (documented as 'ELO' here, on the end screen title/aria, and
 * in config comments; the number next to a name has no visible label).
 *
 * Each player starts at 1500. Games are processed in air-date order.
 * The number shown for an episode is the rating *before* that game
 * (career rating is the fallback when a before-rating is missing).
 *
 * 1. Finishing-order Elo. A 3-player game is three pairwise matches on
 *    Final $ (ties = 0.5). Standard expected score
 *    E = 1/(1+10^((Ropp-R)/400)), K=20, using pre-game ratings for
 *    every pair, with all deltas applied after the game. A clean 1st /
 *    2nd / 3rd among equals is +20 / 0 / −20.
 *
 * 2. Stats prior / blend. After the Elo update, a career stats prior
 *    is blended in at weight 0.25: rating = 0.75*Elo + 0.25*prior.
 *    The prior is the mean of three mappings, each 1500 at the catalog
 *    per-player-game baseline and ±400 ELO over the given spread:
 *      accuracy (R/(R+W))     center 0.875, spread 0.15
 *      average official Coryat  center $11,200, spread $8,000
 *      buzz share (R+W)/avail   center 0.333, spread 0.20
 *    Career totals are used, including games fetched from J! Archive
 *    that are not in this catalog. The blended rating is the input to
 *    the next game's expected scores.
 *
 * 3. Display only. ELO is never used to scale SPEED / True Score / tau.
 *    Color is by tier (thresholds below): muted gray-blue, white,
 *    light gold, bright gold-orange.
 */
const ELO={
  start:1500,
  k:20,
  blend:0.25,
  tiers:[
    {min:0,    color:'#9aa8c8', name:'low'},
    {min:1400, color:'#f3f5ff', name:'average'},
    {min:1600, color:'#e6c56a', name:'strong'},
    {min:1800, color:'#ff9d3d', name:'elite'}
  ],
  data:null,
  load(){
    if(this._p)return this._p;
    this._p=fetch('players.json').then(r=>r.ok?r.json():null).then(d=>{
      if(d&&d.players)this.data=d;
      window.__PLAYERS=this.data;
      return this.data;
    }).catch(()=>null);
    return this._p;
  },
  idFor(show,i){
    const d=this.data,gid=show&&show.gameId;
    const row=d&&d.games&&d.games[gid];
    return (row&&row[i])||null;
  },
  rating(id,gameId){
    if(id==null||!this.data||!this.data.players)return null;
    const p=this.data.players[id];
    if(!p)return null;
    if(gameId!=null&&p.b&&p.b[gameId]!=null)return p.b[gameId];
    return p.e!=null?p.e:null;
  },
  color(n){
    let c=this.tiers[0].color;
    for(const t of this.tiers) if(n>=t.min) c=t.color;
    return c;
  },
  badge(n){
    if(n==null||!isFinite(n))return '';
    const v=Math.round(n);
    return `<span class="elo" style="color:${this.color(v)}" title="ELO ${v}" aria-label="ELO ${v}">${v}</span>`;
  }
};
ELO.load();

function loadShow(id){

  const meta=CATALOG.find(e=>e.gameId===id)||CATALOG[0];
  return fetch('episodes/'+meta.gameId+'.json').then(r=>{if(!r.ok)throw new Error('episode '+r.status);return r.json()}).then(d=>{SHOW=Object.assign({},meta,d);window.__SHOW=SHOW;SPEED.setGame(SHOW);return SHOW});
}

/* ---------- sound (tiny WebAudio blips) ---------- */
let AC=null;
function tone(f,d,type='sine',v=.12,delay=0){ if(!G.sound||G.paused)return; try{
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

/* ---------- clue read-aloud (speechSynthesis) ---------- */
/* Host-pace timing: the lights / buzzers / answer prompt arm when a
 * real host would finish the clue, not when our TTS happens to end.
 * 2.7 words/sec (162 wpm) is a touch quicker than typical conversational
 * American English (~150 wpm / 2.5 wps) and matches a measured-style
 * Jeopardy! host cadence. TTS is sped up just enough to finish slightly
 * early (early=0.12, ~12% of host time) so the last word is out before
 * the lights. The utterance is NEVER cancelled for timing — if a voice
 * runs long, it keeps playing after the buzzers open. Skip, home, round-
 * skip, and the mute button still cancel, as a leave of the clue.
 */
const Voice={
  tok:0, text:null, onDone:null, active:false, voice:null,
  read:{
    hostWps:2.7,
    early:0.12,
    minMs:700,
    minRate:0.85,
    maxRate:1.5
  },
  wordCount(text){
    return String(text||'').trim().split(/\s+/).filter(Boolean).length;
  },
  hostMs(text){
    const w=this.wordCount(text);
    if(!w)return 0;
    return Math.max(this.read.minMs, Math.round(1000*w/this.read.hostWps));
  },
  rateFor(text){
    const early=this.read.early;
    const r=early>=1?this.read.maxRate:1/(1-early);
    return Math.max(this.read.minRate, Math.min(this.read.maxRate, r));
  },
  enabled(){return !AUTO&&!FAST&&!G.voiceMute&&!!window.speechSynthesis},
  pick(){
    if(!window.speechSynthesis)return null;
    const vs=speechSynthesis.getVoices()||[];
    const en=vs.filter(v=>/^en([-_]|$)/i.test(v.lang||'')||/english/i.test(v.name||''));
    const pool=en.length?en:vs;
    const score=v=>{
      const n=(v.name||'')+' '+(v.voiceURI||'');
      if(/premium/i.test(n))return 300;
      if(/enhanced/i.test(n))return 200;
      if(/\b(Ava|Zoe|Samantha|Google US English)\b/i.test(n))return 100;
      if(/en-US/i.test(v.lang))return 50;
      if(/^en/i.test(v.lang))return 20;
      return 0;
    };
    let best=null,bestS=-1;
    for(const v of pool){const sc=score(v);if(sc>bestS){best=v;bestS=sc}}
    this.voice=best||pool[0]||null;return this.voice;
  },
  unlock(){
    if(!window.speechSynthesis)return;
    try{
      this.pick();
      const u=new SpeechSynthesisUtterance(' ');
      u.volume=0;u.rate=10;if(this.voice)u.voice=this.voice;
      speechSynthesis.speak(u);speechSynthesis.cancel();
    }catch(e){}
  },
  cancel(){
    this.tok++;this.text=null;this.onDone=null;this.active=false;
    try{if(window.speechSynthesis)speechSynthesis.cancel()}catch(e){}
  },
  speak(text,onDone){
    const hostMs=this.hostMs(text);
    const tok=++this.tok;
    this.text=text||'';this.onDone=onDone;this.active=false;
    const arm=()=>{
      later(()=>{if(tok!==this.tok)return;this.onDone=null;onDone&&onDone()},R(hostMs||0));
    };
    if(!String(text||'').trim()||AUTO||FAST||!this.enabled()){
      arm();
      return;
    }
    this.pick();
    this.active=true;
    const rate=this.rateFor(text);
    try{
      // Drop a leftover utterance from a previous clue only — never
      // cancel this clue's speech to open the buzzers.
      speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(text);
      if(this.voice){u.voice=this.voice;u.lang=this.voice.lang||'en-US'}else u.lang='en-US';
      u.rate=rate;
      u.onend=()=>{if(tok!==this.tok)return;this.active=false;if(this.text===text)this.text=null};
      u.onerror=()=>{if(tok!==this.tok)return;this.active=false};
      speechSynthesis.speak(u);
    }catch(e){this.active=false}
    arm();
  },
  pause(){
    if(!this.active||!window.speechSynthesis)return;
    try{if(speechSynthesis.speaking&&!speechSynthesis.paused)speechSynthesis.pause()}catch(e){}
    const tok=this.tok;
    setTimeout(()=>{
      if(tok!==this.tok||!this.active||!G.paused)return;
      try{
        if(!speechSynthesis.paused&&speechSynthesis.speaking){speechSynthesis.cancel()}
      }catch(e){}
    },80);
  },
  resume(){
    if(!this.active||!window.speechSynthesis)return;
    try{
      if(speechSynthesis.paused){speechSynthesis.resume();return}
    }catch(e){}
    // pause unsupported or cancel happened: restart the clue, keep the
    // already-running host timer (same tok).
    if(this.text&&this.onDone){
      const text=this.text,tok=this.tok;
      try{
        speechSynthesis.cancel();
        const u=new SpeechSynthesisUtterance(text);
        if(this.voice){u.voice=this.voice;u.lang=this.voice.lang||'en-US'}else u.lang='en-US';
        u.rate=this.rateFor(text);
        u.onend=()=>{if(tok!==this.tok)return;this.active=false;if(this.text===text)this.text=null};
        u.onerror=()=>{if(tok!==this.tok)return;this.active=false};
        speechSynthesis.speak(u);
      }catch(e){}
    }
  },
  setMute(on){
    G.voiceMute=!!on;
    try{localStorage.setItem('jr-voice-mute',G.voiceMute?'1':'0')}catch(e){}
    if(G.voiceMute&&this.active){
      // Stop talking, but do not skip the remaining host-pace wait and
      // do not cut the utterance off the timer — tok stays so arm() still fires.
      this.active=false;this.text=null;
      try{if(window.speechSynthesis)speechSynthesis.cancel()}catch(e){}
    }
  }
};
if(window.speechSynthesis){
  Voice.pick();
  speechSynthesis.addEventListener('voiceschanged',()=>Voice.pick());
}

hud.addEventListener('click',e=>{const m=e.target.closest('#mute');if(m){G.sound=!G.sound;m.innerHTML=G.sound?ICON.snd:ICON.mute;m.blur()}
  const vm=e.target.closest('#vmute');if(vm){Voice.setMute(!G.voiceMute);vm.innerHTML=G.voiceMute?ICON.vmute:ICON.voice;vm.classList.toggle('on',G.voiceMute);vm.setAttribute('aria-label',G.voiceMute?'Unmute voice':'Mute voice');vm.title=G.voiceMute?'Voice muted':'Voice on';vm.blur();return}
  if(e.target.closest('#pause')){togglePause();const b=e.target.closest('#pause');if(b)b.blur();return}
  if(G.paused)return;
  if(e.target.closest('#ff'))fastForward();if(e.target.closest('#rskip'))skipRound();if(e.target.closest('#home'))askLeave()});

/* ---------- timers ---------- */
const sched=[];
function later(fn,ms){
  const rec={kind:'to',fn,remain:ms,start:performance.now(),id:null};
  rec.id=setTimeout(()=>{dropSched(rec);fn()},ms);
  sched.push(rec);G.timers.push(rec.id);return rec.id;
}
function runTimer(ms,onTick,onDone){
  const rec={kind:'iv',onTick,onDone,remain:ms,total:ms,start:performance.now(),id:null};
  const tick=()=>{
    const left=rec.start+rec.remain-performance.now();
    if(left<=0){clearInterval(rec.id);dropSched(rec);onTick(0,0);onDone();return}
    onTick(left/rec.total,Math.ceil(left/1000));
  };
  rec.id=setInterval(tick,50);
  sched.push(rec);G.timers.push(rec.id);
  onTick(1,Math.ceil(ms/1000));
}
function dropSched(rec){const i=sched.indexOf(rec);if(i>=0)sched.splice(i,1)}
function syncTimerIds(){G.timers=sched.map(r=>r.id).filter(Boolean)}
function freezeSched(){
  const t=performance.now();
  for(const rec of sched){
    if(rec.kind==='to'){clearTimeout(rec.id);rec.remain=Math.max(0,rec.remain-(t-rec.start))}
    else{clearInterval(rec.id);rec.remain=Math.max(0,rec.start+rec.remain-t)}
    rec.id=null;
  }
  G.timers=[];
}
function thawSched(){
  const t=performance.now();
  for(const rec of sched){
    rec.start=t;
    if(rec.kind==='to') rec.id=setTimeout(()=>{dropSched(rec);rec.fn()},rec.remain);
    else rec.id=setInterval(()=>{
      const left=rec.start+rec.remain-performance.now();
      if(left<=0){clearInterval(rec.id);dropSched(rec);rec.onTick(0,0);rec.onDone();return}
      rec.onTick(left/rec.total,Math.ceil(left/1000));
    },50);
  }
  syncTimerIds();
}
function clearTimers(){
  for(const rec of sched.splice(0)){if(rec.kind==='to')clearTimeout(rec.id);else clearInterval(rec.id)}
  G.timers.forEach(t=>{clearTimeout(t);clearInterval(t)});G.timers=[];
  Voice.cancel();
}
function setState(s){G.state=s;document.body.dataset.st=s;G.stateAt=performance.now();if(s!=='answer')document.body.classList.remove('typing')}
function pauseOverlay(){
  let el=$('#pauseov');
  if(!el){
    el=document.createElement('div');el.id='pauseov';el.className='pauseov';el.hidden=true;
    el.setAttribute('role','button');el.setAttribute('aria-label','Resume');
    el.innerHTML='<div class="pauselabel">Paused</div>';
    el.addEventListener('click',()=>{if(G.paused)setPaused(false)});
    appEl.appendChild(el);
  }
  return el;
}
function setPaused(on,opts){
  on=!!on;if(on===!!G.paused){
    if(on&&opts&&opts.overlay===false){const el=pauseOverlay();el.hidden=true;el.classList.toggle('quiet',true)}
    return;
  }
  if(G.state==='intro'&&on)return;
  if(on){
    G.pauseAt=performance.now();G.paused=true;freezeSched();
    Voice.pause();
    if(AC&&AC.state==='running')AC.suspend();
    document.body.dataset.paused='1';
    const el=pauseOverlay();
    const show=!opts||opts.overlay!==false;
    el.hidden=!show;el.classList.toggle('quiet',!show);
  }else{
    const dt=performance.now()-(G.pauseAt||performance.now());
    G.paused=false;G.pauseAt=0;
    if(G.openAt)G.openAt+=dt;
    if(G.lockedUntil)G.lockedUntil+=dt;
    if(G.stateAt)G.stateAt+=dt;
    Voice.resume();
    thawSched();
    if(AC&&AC.state==='suspended')AC.resume();
    document.body.removeAttribute('data-paused');
    const el=$('#pauseov');if(el){el.hidden=true;el.classList.remove('quiet')}
  }
  if(G.state!=='intro')renderHud();
}
function togglePause(){setPaused(!G.paused)}
function canTypePause(e){
  if(G.state==='intro')return false;
  if($('.leave'))return false;
  const t=e&&e.target,tag=t&&t.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA'||(t&&t.isContentEditable))return false;
  if(document.body.classList.contains('typing'))return false;
  return true;
}
function setLights(mode){lights.className='lights'+(mode?' show':'')+(mode==='on'?' on':'')+(mode==='bad'?' bad':'')}

/* ---------- HUD ---------- */
const ICON={
 snd:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
 mute:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
 ff:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6l9 6-9 6zM12 6l9 6-9 6z" fill="currentColor"/></svg>',
 next:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6l8.5 6L4 18zM12 6l8.5 6L12 18z" fill="currentColor"/><rect x="20" y="6" width="2" height="12" rx="1" fill="currentColor"/></svg>',
 home:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" fill="currentColor"/></svg>',
 pause:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>',
 play:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
 voice:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h11.5A2.5 2.5 0 0 1 19 7v6.5a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.2V16H5A2.5 2.5 0 0 1 2.5 13.5V7A2.5 2.5 0 0 1 5 4.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 9h7M8 12h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
 vmute:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h11.5A2.5 2.5 0 0 1 19 7v6.5a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.2V16H5A2.5 2.5 0 0 1 2.5 13.5V7A2.5 2.5 0 0 1 5 4.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 9h7M8 12h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M3.5 5l17 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'};
function renderHud(){
  hud.classList.remove('hide');
  const rs=G.round==='J'||G.round==='DJ';
  const real=G.skipped&&SHOW.scores[G.skipped]?`<div class="realstrip" aria-label="Real scores at the jump">${SHOW.contestants.map(c=>`${esc(c.short)} ${money(SHOW.scores[G.skipped][c.short])}`).join(' · ')}</div>`:'';
  const atEnd=G.state==='end';
  const pauseLbl=G.paused?'Resume':'Pause';
  hud.innerHTML=`${real}<div class="corner l"><button id="ff" class="ic" type="button" aria-label="Skip the wait">${ICON.ff}</button><button id="home" class="ic" type="button" aria-label="Back to episodes">${ICON.home}</button></div><div class="hudmid"><button id="pause" class="ic${G.paused?' on':''}" type="button" aria-label="${pauseLbl}" title="${pauseLbl}">${G.paused?ICON.play:ICON.pause}</button><div class="scorebox ${G.score<0?'neg':'pos'}">${money(G.score)}</div><button id="vmute" class="ic${G.voiceMute?' on':''}" type="button" aria-label="${G.voiceMute?'Unmute voice':'Mute voice'}" title="${G.voiceMute?'Voice muted':'Voice on'}">${G.voiceMute?ICON.vmute:ICON.voice}</button></div><div class="corner r"><button id="mute" class="ic" type="button" aria-label="Toggle sound">${G.sound?ICON.snd:ICON.mute}</button><button id="rskip" class="ic" type="button" aria-label="${G.round==='J'?'Skip to Double Jeopardy':'Skip to Final Jeopardy'}" ${rs&&!atEnd?'':'hidden'}>${ICON.next}</button></div>`;
}
function askLeave(){
  if(G.state==='end'){intro();return}
  if($('.leave'))return;
  const box=document.createElement('div');box.className='leave';box.setAttribute('role','dialog');box.setAttribute('aria-label','Leave game?');
  box.innerHTML='<div class="leavecard"><div class="leaveq">Leave game?</div><div class="leaverow"><button type="button" class="btn" id="leavey">Yes</button><button type="button" class="btn ghost" id="leaven">No</button></div></div>';
  appEl.appendChild(box);
  $('#leavey').onclick=()=>{saveProgress();box.remove();clearTimers();setPaused(false);setLights(null);G.pending=null;G.clue=null;G.skipped=null;intro()};
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
  if(clue)fit(clue,clue.firstElementChild,portrait?Math.min(20,vm*.055):Math.min(31,vm*.046),12);
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
  closeCatNote();clearTimers();setPaused(false);setState('intro');setLights(null);hud.classList.add('hide');
  const played=readPlayed();
  const fmt=e=>new Date(e.aired+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
  const fmtPlay=iso=>{
    try{return new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}catch(e){return ''}
  };
  const seasons=[...new Set(CATALOG.map(e=>e.season))].sort((a,b)=>b-a);
  if(pick==null || pick>=CATALOG.length) pick=0;
  let season=CATALOG[pick].season;
  let tab=(()=>{try{const t=localStorage.getItem('jr-picker-tab');if(t==='progress'||t==='finished'||t==='all')return t}catch(e){}return 'all'})();
  function saveTab(t){tab=t;try{localStorage.setItem('jr-picker-tab',t)}catch(e){}}
  function rowsFor(s){
    return CATALOG.map((e,i)=>[e,i]).filter(([e])=>e.season===s);
  }
  function mark(s){
    const rows=rowsFor(s), n=rows.filter(([e])=>played[e.gameId]&&played[e.gameId].finished).length;
    return n?`✓ ${n}/${rows.length}`:`${rows.length}`;
  }
  function progressRows(){
    return CATALOG.map((e,i)=>({e,i,sv:readProgress(e.gameId)}))
      .filter(x=>x.sv)
      .sort((a,b)=>(b.sv.savedAt||'').localeCompare(a.sv.savedAt||''));
  }
  function finishedRows(){
    return CATALOG.map((e,i)=>({e,i,p:played[e.gameId]}))
      .filter(x=>x.p&&x.p.finished)
      .sort((a,b)=>(b.p.date||'').localeCompare(a.p.date||''));
  }
  function progressStatus(sv){
    const rd=sv.round==='F'?'Final Jeopardy':sv.round==='DJ'?'Double Jeopardy':'Jeopardy';
    return `${rd} · ${money(sv.score)}`;
  }
  function playSubs(pl){
    const bits=[];
    if(pl.raw!=null&&pl.raw!==pl.adj)bits.push(`raw ${money(pl.raw)}`);
    if(pl.trueScore!=null)bits.push(`True ${money(pl.trueScore)}`);
    if(pl.coryat!=null)bits.push(`Coryat ${money(pl.coryat)}`);
    return bits.join(' · ');
  }
  function playlistHtml(p){
    const plays=[...(p.plays||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    return `<ul class="playlist hide">${plays.map(pl=>{
      const sub=playSubs(pl);
      return `<li><span class="pd">${esc(fmtPlay(pl.date))}</span><span class="ps">${money(pl.adj)}</span>${sub?`<span class="psub">${esc(sub)}</span>`:''}</li>`;
    }).join('')}</ul>`;
  }
  function cardShell(e,i,extraClass,inner){
    const on=i===pick?' sel':'';
    return `<div class="ep${on}${extraClass}" data-i="${i}" role="button" tabindex="0">
        <span class="ed">${esc(e.show)} · ${fmt(e)}</span>
        <span class="en">${e.contestants.map(c=>esc(c.short)).join(' · ')}</span>${inner}</div>`;
  }
  function cardsHtml(){
    const rows=rowsFor(season);
    return rows.map(([e,i])=>{
      const p=played[e.gameId], did=p&&p.finished, mid=readProgress(e.gameId);
      const badge=mid?`<span class="resume" aria-label="In progress, ${progressLabel(mid)}"><i class="halfc" aria-hidden="true"></i>${esc(progressLabel(mid))}</span>`:
        (did?`<span class="played" aria-label="Played, best ${money(p.best)}">✓ ${money(p.best)}</span>`:'');
      return cardShell(e,i,`${mid?' mid':''}${!mid&&did?' did':''}`,badge);
    }).join('');
  }
  function progressHtml(){
    const rows=progressRows();
    if(!rows.length)return `<div class="empty">No games in progress.</div>`;
    return rows.map(({e,i,sv})=>cardShell(e,i,' mid',`<span class="estatus">${esc(progressStatus(sv))}</span>`)).join('');
  }
  function finishedHtml(){
    const rows=finishedRows();
    if(!rows.length)return `<div class="empty">No finished games yet.</div>`;
    return rows.map(({e,i,p})=>{
      const n=(p.plays||[]).length;
      const main=`<span class="finline"><span class="playedline" aria-label="Best ${money(p.best)}">✓ ${money(p.best)}</span>${p.bestRaw!=null&&p.bestRaw!==p.best?`<span class="rawbit">raw ${money(p.bestRaw)}</span>`:''}${n>1?`<button type="button" class="playtog" aria-expanded="false" aria-label="${n} plays">×${n}<span class="chev" aria-hidden="true">▾</span></button>`:''}</span>`;
      return cardShell(e,i,' did',main+(n>1?playlistHtml(p):''));
    }).join('');
  }
  function gridHtml(){
    if(tab==='progress')return progressHtml();
    if(tab==='finished')return finishedHtml();
    return cardsHtml();
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
  function tabCounts(){
    return {all:CATALOG.length,progress:progressRows().length,finished:finishedRows().length};
  }
  const cnt=tabCounts();
  S(`<div class="panel intro" data-tab="${tab}">
    <div class="logo">Jeopardy!</div>
    <div class="ptabs" role="tablist" aria-label="Game lists">
      <button type="button" class="ptab${tab==='all'?' on':''}" role="tab" data-tab="all" aria-selected="${tab==='all'}">All <span class="pcnt">${cnt.all}</span></button>
      <button type="button" class="ptab${tab==='progress'?' on':''}" role="tab" data-tab="progress" aria-selected="${tab==='progress'}">In Progress <span class="pcnt">${cnt.progress}</span></button>
      <button type="button" class="ptab${tab==='finished'?' on':''}" role="tab" data-tab="finished" aria-selected="${tab==='finished'}">Finished <span class="pcnt">${cnt.finished}</span></button>
    </div>
    <div class="sbar" ${tab==='all'?'':'hidden'}>
      <button type="button" class="ssel" id="ssel" aria-haspopup="listbox" aria-expanded="false"><span id="slabel">${headerLabel()}</span><span class="scount" id="smeta">${mark(season)}</span><span class="chev" aria-hidden="true">▾</span></button>
      <div class="smenu hide" id="smenu" role="listbox">${menuHtml()}</div>
    </div>
    <div class="eps" id="epgrid">${gridHtml()}</div>
    <div class="actions" id="goactions"></div></div>`);
  const menu=$('#smenu'), sel=$('#ssel');
  function renderGo(){
    const mid=readProgress(CATALOG[pick].gameId);
    const box=$('#goactions');
    if(mid){
      box.innerHTML=`<button class="btn" id="go">Resume</button><button class="btn ghost" id="restart" type="button">Restart</button>`;
    }else{
      box.innerHTML=`<button class="btn" id="go">Start</button>`;
    }
    const begin=(resume)=>{
      Voice.unlock();
      const go=$('#go'), rs=$('#restart');
      if(go)go.disabled=true;if(rs)rs.disabled=true;
      const id=CATALOG[pick].gameId;
      const sv=resume?readProgress(id):null;
      loadShow(id).then(()=>{
        if(sv&&validProgress(sv,id)){resumeGame(sv);return}
        if(!resume)clearProgress(id);
        resetPlay();startRound('J');
      }).catch(()=>{if(go)go.disabled=false;if(rs)rs.disabled=false});
    };
    $('#go').onclick=()=>begin(!!mid);
    const rs=$('#restart');if(rs)rs.onclick=()=>{clearProgress(CATALOG[pick].gameId);begin(false)};
  }
  function selectCard(i){
    pick=+i;SHOW=CATALOG[pick];
    document.querySelectorAll('.ep').forEach(x=>x.classList.toggle('sel',+x.dataset.i===pick));
    renderGo();
  }
  function bindCards(){
    document.querySelectorAll('.ep').forEach(b=>{
      b.onclick=e=>{
        if(e.target.closest('.playtog'))return;
        selectCard(b.dataset.i);
      };
      b.onkeydown=e=>{
        if(e.target.closest('.playtog'))return;
        if(e.key==='Enter'||e.key===' '){e.preventDefault();selectCard(b.dataset.i)}
      };
    });
    document.querySelectorAll('.playtog').forEach(btn=>{
      btn.onclick=e=>{
        e.preventDefault();e.stopPropagation();
        const card=btn.closest('.ep');
        const open=!card.classList.contains('open');
        card.classList.toggle('open',open);
        btn.setAttribute('aria-expanded',open?'true':'false');
        const list=card.querySelector('.playlist');
        if(list)list.classList.toggle('hide',!open);
      };
    });
  }
  function ensurePickVisible(){
    const visible=[...document.querySelectorAll('.ep')].map(x=>+x.dataset.i);
    if(visible.length&&!visible.includes(pick))selectCard(visible[0]);
    else renderGo();
  }
  function showTab(next){
    saveTab(next);
    const panel=document.querySelector('.panel.intro');
    panel.dataset.tab=tab;
    document.querySelectorAll('.ptab').forEach(b=>{
      const on=b.dataset.tab===tab;
      b.classList.toggle('on',on);
      b.setAttribute('aria-selected',on?'true':'false');
    });
    const bar=document.querySelector('.sbar');
    if(bar)bar.hidden=tab!=='all';
    if(tab==='all'){
      season=CATALOG[pick].season;
      const sl=$('#slabel'), sm=$('#smeta');
      if(sl)sl.textContent=headerLabel();
      if(sm)sm.textContent=mark(season);
      document.querySelectorAll('.sitem').forEach(x=>x.classList.toggle('on',+x.dataset.s===season));
    }
    $('#epgrid').innerHTML=gridHtml();
    bindCards();
    ensurePickVisible();
  }
  bindCards();
  renderGo();
  document.querySelectorAll('.ptab').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
  if(sel)sel.onclick=e=>{e.stopPropagation();const open=menu.classList.toggle('hide');sel.setAttribute('aria-expanded',open?'false':'true')};
  if(menu)menu.querySelectorAll('.sitem').forEach(b=>b.onclick=e=>{
    e.stopPropagation();
    season=+b.dataset.s;
    const first=CATALOG.findIndex(e=>e.season===season);
    pick=first;SHOW=CATALOG[pick];
    $('#slabel').textContent=headerLabel();$('#smeta').textContent=mark(season);
    $('#epgrid').innerHTML=gridHtml();bindCards();renderGo();
    menu.querySelectorAll('.sitem').forEach(x=>x.classList.toggle('on',+x.dataset.s===season));
    menu.classList.add('hide');sel.setAttribute('aria-expanded','false');
  });
  if(!intro._close){intro._close=ev=>{const m=document.querySelector('#smenu'),s=document.querySelector('#ssel');if(!m||!s)return;if(!ev.target.closest('.sbar')){m.classList.add('hide');s.setAttribute('aria-expanded','false')}};document.addEventListener('pointerdown',intro._close);}
}

/* ---------- rounds & board ---------- */
function startRound(r){
  clearTimers();G.round=r;G.used=new Set();G.curCol=-1;G.stay=0;
  renderBoard();renderHud();setState('board');
  saveProgress();
  later(pickNext,R(3600));
}
function renderBoard(flashKey){
  const rd=SHOW.rounds[G.round];
  let h='<div class="board">'+rd.cats.map((c,i)=>`<div class="cat" data-c="${i}" role="button" tabindex="0" aria-label="About the category ${esc(c)}"><span>${esc(c)}</span></div>`).join('');
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

function catNoteText(round,i){
  const n=SHOW.cat_notes;
  if(!n)return '';
  if(round==='F')return n.F||'';
  const row=n[round];
  return (row&&row[i])||'';
}
function closeCatNote(){
  const pop=$('#catpop');
  if(!pop)return;
  pop.remove();
  const resume=!!G.catPause;
  G.catPause=false;
  if(resume)setPaused(false);
}
function openCatNote(i){
  if(G.round!=='J'&&G.round!=='DJ')return;
  if(!(G.state==='board'||G.state==='picking'))return;
  const title=(SHOW.rounds[G.round].cats||[])[i];
  if(title==null)return;
  if($('#catpop'))closeCatNote();
  const note=catNoteText(G.round,i)||'This category follows the idea in its title.';
  if(!G.paused){G.catPause=true;setPaused(true,{overlay:false})}
  else G.catPause=false;
  const pop=document.createElement('div');
  pop.id='catpop';pop.className='catpop';pop.setAttribute('role','dialog');
  pop.setAttribute('aria-modal','true');pop.setAttribute('aria-label','Category explanation');
  pop.innerHTML=`<div class="catpopcard"><div class="catpoptitle">${esc(title)}</div><div class="catpopbody">${esc(note)}</div><button type="button" class="btn" id="catpopx">Close</button></div>`;
  pop.addEventListener('click',e=>{if(e.target===pop)closeCatNote()});
  appEl.appendChild(pop);
  const x=$('#catpopx');if(x)x.onclick=closeCatNote;
}

/* semi-random, human-ish selection: favours high values, tends to stay in the category, sometimes jumps */
function choose(){
  const avail=SHOW.rounds[G.round].clues.filter(c=>!G.used.has(c.c+','+c.r));
  const inCol=avail.filter(c=>c.c===G.curCol);
  let jump=G.curCol<0||inCol.length===0||RNG.next()<0.14||G.stay>=5&&RNG.next()<0.5;
  const pool=jump?avail.filter(c=>c.c!==G.curCol||avail.length===inCol.length):avail;
  const w=c=>{
    let x=Math.pow(c.r+1,1.6);                         // higher value → heavier
    if(!jump&&c.c===G.curCol) x*=4.5;                   // stay in the same category
    return x*(0.6+RNG.next()*0.8);                      // noise: no tidy top-to-bottom runs
  };
  const ws=pool.map(w),tot=ws.reduce((a,b)=>a+b,0);
  let t=RNG.next()*tot;for(let i=0;i<pool.length;i++){t-=ws[i];if(t<=0)return {clue:pool[i],jump}}
  return {clue:pool[pool.length-1],jump};
}
function skipRound(){
  if(G.paused)return;
  if(G.round!=='J'&&G.round!=='DJ')return;
  const from=G.round;clearTimers();setLights(null);G.pending=null;G.clue=null;
  if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();
  G.roundScores[from]=G.score;G.skipped=from;
  from==='J'?startRound('DJ'):finalIntro();
}
function fastForward(){
  if(G.paused)return;
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
  saveProgress();
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
  footReading();
  Voice.speak(c.q,()=>openBuzzers());
}
function footReading(){
  foot(`<button class="buzz" id="bz">BUZZ</button><div class="bar" style="visibility:hidden"></div><button class="skip" id="skip" type="button">Don’t know · skip</button>`);
  $('#bz').addEventListener('pointerdown',e=>{e.preventDefault();buzz()});
  $('#skip').onclick=skipClue;
}
function openBuzzers(){
  if(G.state!=='reading')return;
  setState('open');G.openAt=performance.now();G.reaction=null;setLights('on');sfx.open();
  foot(`<button class="buzz live" id="bz">BUZZ!</button><div class="bar"><i id="bar"></i></div><button class="skip" id="skip" type="button">Don’t know · skip</button>`);
  $('#bz').addEventListener('pointerdown',e=>{e.preventDefault();buzz()});
  $('#skip').onclick=skipClue;
  runTimer(READ_BUZZ_MS,f=>{const b=$('#bar');if(b){b.style.transform=`scaleX(${f})`;b.className=f<.3?'warn':''}},()=>{
    if(G.state==='open')noBuzz();
  });
}
function buzz(){
  if(G.paused)return;
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
  if(G.paused)return;
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
    G.wager=n;saveProgress();ddClue(c);
  };
  $('#wgo').onclick=go;inp.addEventListener('keydown',e=>{if(e.key==='Enter')go()});
  document.querySelectorAll('[data-w]').forEach(b=>b.onclick=()=>{inp.value=b.dataset.w;go()});
  G.wagerGo=go;
  saveProgress();
}
function ddClue(c){
  setState('reading');
  S(cardHtml(c,{wager:G.wager}));setLights(null);renderHud();
  Voice.speak(c.q,()=>{
    if(G.state!=='reading')return;
    setState('answer');
    askAnswer(c,{ms:ANSWER_MS,prefix:'',cb:(t,to)=>finishClue(c,t,'dd',to)});
  });
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
    const t=(mode==='buzz'&&G.reaction!=null)?G.reaction/1000:0;
    const awarded=(ok&&mode==='buzz')?SPEED.award(value,t,SPEED.tau(c)):value;
    delta=ok?awarded:-value;
    verdict=ok?'Correct!':(timedOut&&!(txt||'').trim()?'Time’s up!':'Incorrect');cls=ok?'good':'bad';
    G.rawScore=(G.rawScore||0)+(ok?value:-value);
    G.score+=delta;(ok?sfx.good:sfx.bad)();
    G.lastBuzzT=t;
    const face=c.v||value;
    G.coryat=(G.coryat||0)+(ok?face:-face);
  }
  G.last={c,delta,value,txt,mode,cls};
  const wasRight=cls==='good';
  setState('result');
  renderHud();
  S(`<div class="panel">
    <div class="sub">${esc(catName())} · ${money(mode==='dd'?G.wager:c.v)}${mode==='dd'?' · Daily Double':''}</div>
    <div class="verdict ${cls}">${verdict}</div>
    ${delta?`<div class="h1 ${delta>0?'gold':''}" style="font-size:min(7vw,10vh)">${delta>0?'+':'−'}${money(Math.abs(delta)).replace('-','')}${cls==='good'&&delta>0&&delta!==value?` <span class="of">of ${money(value)}</span>`:''}</div>`:''}
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
    const t=(G.last.mode==='buzz'&&G.reaction!=null)?G.reaction/1000:0;
    const awarded=G.last.mode==='buzz'?SPEED.award(value,t,SPEED.tau(c)):value;
    G.score+=value+awarded;G.rawScore=(G.rawScore||0)+2*value;
    G.coryat=(G.coryat||0)+2*(c.v||value);
    G.last.cls='good';G.last.delta=awarded;
    ov.remove();renderHud();
    const v=$('.verdict');v.className='verdict good';v.textContent='Overruled — correct!';sfx.good();
    const h=$('.h1');if(h)h.innerHTML=`+${money(awarded)}${awarded!==value?` <span class="of">of ${money(value)}</span>`:''}`;
    if(h)h.classList.add('gold');
    saveProgress();
  };
  saveProgress();
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
  saveProgress();
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
    saveProgress();
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
    G.wager=n;saveProgress();finalClue();
  };
  $('#wgo').onclick=go;inp.addEventListener('keydown',e=>{if(e.key==='Enter')go()});
  document.querySelectorAll('[data-w]').forEach(b=>b.onclick=()=>{inp.value=b.dataset.w;go()});
  G.wagerGo=go;
  saveProgress();
}
function finalClue(){
  const F=SHOW.final;setState('reading');
  const c={q:F.q,a:F.a,v:G.wager,img:false};
  S(cardHtml(c,{cat:F.cat,wager:G.wager}));
  Voice.speak(F.q,()=>{
    if(G.state!=='reading')return;
    setState('answer');
    askAnswer(c,{ms:FINAL_MS,prefix:'',cb:(t,to)=>{
    clearTimers();
    const ok=t&&judge(t,F.a);const delta=ok?G.wager:-G.wager;G.score+=delta;G.rawScore=(G.rawScore||0)+delta;(ok?sfx.good:sfx.bad)();
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
    const ov=$('#override');if(ov)ov.onclick=()=>{G.score+=2*G.wager;G.rawScore=(G.rawScore||0)+2*G.wager;G.final.delta=G.wager;G.final.ok=true;G.last.cls='good';ov.remove();renderHud();const v=$('.verdict');v.className='verdict good';v.textContent='Overruled — correct!';sfx.good()};
    }});
  });
}

/* ---------- end ---------- */
const ORD=n=>['1st','2nd','3rd','4th'][n-1];
function endScreen(){
  clearTimers();setState('end');setLights(null);
  G.roundScores.F=G.score;
  clearProgress(SHOW.gameId);
  savePlayed(SHOW.gameId,G.score,G.rawScore||0);
  const fin=SHOW.scores.Final;
  const people=SHOW.contestants.map((c,i)=>{
    const id=ELO.idFor(SHOW,i);
    return {name:c.name,short:c.short,score:fin[c.short],raw:fin[c.short],adj:fin[c.short],real:true,j:SHOW.scores.J[c.short],dj:SHOW.scores.DJ[c.short],elo:ELO.rating(id,SHOW.gameId)};
  });
  const me={name:'You',score:G.score,raw:G.rawScore||0,adj:G.score,real:false,j:G.roundScores.J??0,dj:G.roundScores.DJ??0};
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
   <div class="endwrap"><table class="cmp end"><tr><th>#</th><th>Contestant</th><th>After J!</th><th>After DJ!</th><th>Raw</th><th>Speed-adj</th></tr>
   ${all.map((p,i)=>`<tr class="${p.real?'':'me'}"><td>${i+1}</td><td>${esc(p.name)}${p.real?ELO.badge(p.elo):''}${p.real?`<small>${esc(remarks[p.short])}</small>`:'<small>your game</small>'}</td>
     <td class="${p.j<0?'neg':''}">${money(p.j)}</td><td class="${p.dj<0?'neg':''}">${money(p.dj)}</td>
     <td class="${(p.raw??p.score)<0?'neg':''}">${money(p.raw??p.score)}</td><td class="${(p.adj??p.score)<0?'neg':''}">${money(p.adj??p.score)}</td></tr>`).join('')}</table></div>
   <div class="contestants"><button class="btn" id="again">Play again</button></div></div>`);
  $('#again').onclick=()=>{location.reload()};
  renderHud();
  window.__result={place,score:G.score,raw:G.rawScore||0,adj:G.score};
}

/* ---------- input ---------- */
document.addEventListener('keydown',e=>{
  const st=G.state,age=performance.now()-G.stateAt;
  const inField=e.target&&e.target.tagName==='INPUT';
  if($('#catpop')){
    if(e.key==='Escape'||e.key==='Enter'||e.key==='p'||e.key==='P'||e.code==='Space'||e.key===' '){e.preventDefault();closeCatNote()}
    return;
  }
  const isP=e.key==='p'||e.key==='P';
  const isSpace=e.code==='Space'||e.key===' ';
  const spaceBusy=(st==='reading'||st==='open'||st==='intro'||st==='result'||st==='roundend'||(st==='finalwager'&&!$('#wg')));
  if(!e.repeat&&canTypePause(e)&&(isP||(isSpace&&(G.paused||!spaceBusy)))){e.preventDefault();togglePause();return}
  if(G.paused){if(isSpace||e.key==='Enter'||e.key==='s'||e.key==='S'||e.key==='Escape')e.preventDefault();return}
  if((st==='reading'||st==='open')&&isSpace){e.preventDefault();if(!e.repeat)buzz();return}
  if((st==='reading'||st==='open')&&(e.key==='s'||e.key==='S'||e.key==='Escape')){e.preventDefault();skipClue();return}
  if(inField)return;
  if(e.key==='Enter'||isSpace){
    if(st==='intro'){e.preventDefault();$('#go').click()}
    else if(st==='result'&&age>500){e.preventDefault();nextAfterResult()}
    else if(st==='roundend'&&age>400){e.preventDefault();$('#cont').click()}
    else if(st==='finalwager'&&!$('#wg')&&age>400){e.preventDefault();$('#cont').click()}
  }
});
stage.addEventListener('pointerdown',e=>{ if(G.paused)return; if(AC&&AC.state==='suspended')AC.resume(); Voice.unlock() });
stage.addEventListener('click',e=>{
  const cat=e.target.closest('#set .board .cat');
  if(!cat)return;
  e.preventDefault();
  const i=+cat.dataset.c;
  if(Number.isInteger(i))openCatNote(i);
});
stage.addEventListener('keydown',e=>{
  const cat=e.target.closest&&e.target.closest('#set .board .cat');
  if(!cat)return;
  if(e.key==='Enter'||e.key===' '){e.preventDefault();openCatNote(+cat.dataset.c)}
});


/* ---------- debug autoplay (?auto=1[&fast=1]) : plays the whole show by itself ---------- */
if(AUTO){
  setInterval(()=>{
    if(G.paused)return;
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
window.__G=G;window.__startRound=startRound;window.__loadShow=loadShow;window.__savePlayed=savePlayed;window.__readPlayed=readPlayed;window.__setPaused=setPaused;window.__togglePause=togglePause;window.__clearTimers=clearTimers;window.__openCatNote=openCatNote;window.__closeCatNote=closeCatNote;window.__Voice=Voice;window.__SPEED=SPEED;window.__ELO=ELO;window.__SHOW=SHOW;window.__endScreen=endScreen;window.__finishClue=finishClue;window.__RNG=RNG;window.__saveProgress=saveProgress;window.__readProgress=readProgress;window.__clearProgress=clearProgress;window.__resetPlay=resetPlay;window.__resumeGame=resumeGame;
intro();
})();
