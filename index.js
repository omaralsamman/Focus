/* ═══════════════════════════════════════════════
   FOCUS — index.js v3
   All fixes + new features
   ═══════════════════════════════════════════════ */

// ── STATE ──
const State = {
  pomo: {
    running:false, intervalId:null, mode:'pomodoro',
    secondsLeft:25*60, totalSeconds:25*60, session:1,
    durations:{ pomoDuration:25, shortBreak:5, longBreak:15, sessionGoal:4 },
  },
  tasks:[],
  taskTrash:[],
  customColumns:[],
  planner:{ blocks:{}, weekOffset:0 },
  blockTrash:[],
  stats:{ focusMinutesByDay:{}, totalPomodoros:0, bestStreak:0, currentStreak:0, lastFocusDay:'', missedTasks:[], doneOnTimeTasks:[] },
  notes:[], noteTrash:[], activeNoteId:null,
  theme:'midnight', lightMode:false,
  statsRange:'week', zoomedDay:null,
  hasEverRun:false,
  rankSystemEnabled: true,
  rank: { points: 0, events: [] },

  // ── IndexedDB helpers (most reliable on mobile Safari for localhost) ──
  _idbGet(key){ return new Promise(resolve=>{ try{ const req=indexedDB.open('focus_db',1); req.onupgradeneeded=e=>e.target.result.createObjectStore('kv'); req.onsuccess=e=>{ try{ const tx=e.target.result.transaction('kv','readonly'); const r=tx.objectStore('kv').get(key); r.onsuccess=()=>resolve(r.result||null); r.onerror=()=>resolve(null); }catch(_){resolve(null);} }; req.onerror=()=>resolve(null); }catch(_){resolve(null);} }); },
  _idbSet(key,val){ return new Promise(resolve=>{ try{ const req=indexedDB.open('focus_db',1); req.onupgradeneeded=e=>e.target.result.createObjectStore('kv'); req.onsuccess=e=>{ try{ const tx=e.target.result.transaction('kv','readwrite'); tx.objectStore('kv').put(val,key); tx.oncomplete=()=>resolve(true); tx.onerror=()=>resolve(false); }catch(_){resolve(false);} }; req.onerror=()=>resolve(false); }catch(_){resolve(false);} }); },

  async load(){
    const key='focus_state_v3';
    let s={};
    // 1st: localStorage
    try{ const raw=localStorage.getItem(key); if(raw) s=JSON.parse(raw); }catch(e){}
    // 2nd: sessionStorage (survives soft reloads on mobile where localStorage fails)
    if(!s||!Object.keys(s).length){
      try{ const raw=sessionStorage.getItem(key); if(raw) s=JSON.parse(raw); }catch(e){}
    }
    // 3rd: IndexedDB — works on iOS Safari localhost reliably
    if(!s||!Object.keys(s).length){
      try{ const raw=await this._idbGet(key); if(raw) s=JSON.parse(raw); }catch(e){}
    }
    // 4th: window.storage (Claude artifact environment only)
    if(!s||!Object.keys(s).length){
      try{ if(typeof window.storage!=='undefined'){ const result=await window.storage.get(key); if(result&&result.value) s=JSON.parse(result.value); } }catch(e){}
    }
    try{
      if(s.tasks) this.tasks=s.tasks;
      if(s.taskTrash) this.taskTrash=s.taskTrash;
      if(s.planner) this.planner.blocks=s.planner;
      if(s.blockTrash) this.blockTrash=s.blockTrash;
      if(s.stats){
        Object.assign(this.stats,s.stats);
        if(!this.stats.missedTasks) this.stats.missedTasks=[];
        if(!this.stats.doneOnTimeTasks) this.stats.doneOnTimeTasks=[];
      }
      if(s.pomo) Object.assign(this.pomo.durations,s.pomo.durations||{});
      if(s.notes) this.notes=s.notes;
      if(s.noteTrash) this.noteTrash=s.noteTrash;
      if(s.theme) this.theme=s.theme;
      if(s.lightMode!==undefined) this.lightMode=s.lightMode;
      if(s.customColumns) this.customColumns=s.customColumns;
      if(s.hasEverRun !== undefined) this.hasEverRun = s.hasEverRun;
      if(s.rankSystemEnabled !== undefined) this.rankSystemEnabled = s.rankSystemEnabled;
      if(s.rank) this.rank = s.rank;
    }catch(e){ console.warn('State apply error',e); }
  },
  save(){
    const key='focus_state_v3';
    const data=JSON.stringify({
      tasks:this.tasks, taskTrash:this.taskTrash||[], planner:this.planner.blocks, blockTrash:this.blockTrash||[], stats:this.stats,
      pomo:{durations:this.pomo.durations}, notes:this.notes, noteTrash:this.noteTrash||[],
      theme:this.theme, lightMode:this.lightMode,
      customColumns:this.customColumns||[],
      hasEverRun:this.hasEverRun,
      rankSystemEnabled:this.rankSystemEnabled,
      rank:this.rank,
    });
    // Write to ALL storage layers so at least one survives a mobile refresh
    try{ localStorage.setItem(key,data); }catch(e){}
    try{ sessionStorage.setItem(key,data); }catch(e){}
    this._idbSet(key,data); // async, fire-and-forget
    try{ if(typeof window.storage!=='undefined') window.storage.set(key,data); }catch(e){}
    // Push to Supabase cloud if signed in
    SupaSync.push(data);
  }
};

const $=id=>document.getElementById(id);
const $$=sel=>document.querySelectorAll(sel);

function fmt(s){ return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`; }
function todayStr(){ const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; }
function dateStr(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

function toast(msg,type='normal'){
  const t=$('toast');
  t.textContent=msg;
  t.style.borderLeftColor=type==='success'?'var(--green)':type==='warn'?'var(--red)':'var(--accent)';
  t.classList.add('show'); clearTimeout(t._t);
  t._t=setTimeout(()=>t.classList.remove('show'),1000);
}

function playDone(){
  try{
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    [523,659,784,1047].forEach((freq,i)=>{
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.connect(g);g.connect(ctx.destination);
      o.frequency.value=freq;o.type='sine';
      g.gain.setValueAtTime(0,ctx.currentTime+i*0.15);
      g.gain.linearRampToValueAtTime(0.22,ctx.currentTime+i*0.15+0.02);
      g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+i*0.15+0.4);
      o.start(ctx.currentTime+i*0.15); o.stop(ctx.currentTime+i*0.15+0.45);
    });
  }catch(e){}
}

// ── THEME ──
function applyTheme(theme, light){
  const isMobile = window.innerWidth <= 768;

  document.documentElement.setAttribute('data-theme', theme);
  document.body.classList.toggle('light-mode', !!light);
  document.documentElement.classList.remove('light-mode');
  // Sync settings page controls
  const sSel=$('settingsThemePicker');
  if(sSel) sSel.querySelectorAll('.tswatch').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
  const sBtn=$('settingsLightModeBtn'); if(sBtn) sBtn.textContent=light?'☀ Light':'☽ Dark';
  // Sync the Altayer-style toggle (Altayer: checked=dark, unchecked=light)
  const chk=document.getElementById('darkmode-switch');
  if(chk) chk.checked=!light;   // dark mode = checked, light mode = unchecked
  // Sync desktop label via .is-dark class (can't use CSS :checked sibling across DOM)
  const desktopLbl=document.querySelector('.desktop-focus-toggle');
  if(desktopLbl) desktopLbl.classList.toggle('is-dark', !light);
  State.theme=theme; State.lightMode=!!light;

  // On mobile, defer storage writes + stats update so they don't compete with
  // the repaint. State.save() hits localStorage, sessionStorage, IndexedDB
  // AND Supabase — all on the main thread. Pushing to setTimeout(0) lets the
  // browser paint the theme change first, then saves after the frame settles.
  const _statsEl = document.getElementById('stats');
  const _statsActive = _statsEl && _statsEl.classList.contains('active');
  if(isMobile){
    setTimeout(()=>{
      State.save();
      if(_statsActive) updateStats();
    }, 0);
  } else {
    State.save();
    if(_statsActive) updateStats();
  }
}

// ── NAVIGATION ──
function showSection(name){
  $$('.section').forEach(s=>s.classList.remove('active'));
  $$('.nav-item,.mobile-nav-item').forEach(n=>n.classList.remove('active'));
  const sec=document.getElementById(name); if(sec) sec.classList.add('active');
  document.querySelectorAll(`[data-section="${name}"]`).forEach(el=>el.classList.add('active'));
  if(name==='dashboard') updateDashboard();
  if(name==='pomodoro'){
    const activeTab = document.querySelector('.pomo-tab.active');
    if(activeTab && activeTab.dataset.mode === 'stopwatch'){
      showStopwatchView();
    } else {
      applyPomoModeColors();
    }
  }
  if(name==='stats'){ auditMissedTasks(); requestAnimationFrame(()=>{ requestAnimationFrame(updateStats); }); }
  if(name==='planner') renderPlanner();
  if(name==='tasks') renderTaskList();
  if(name==='notes') renderNotesList();
}
$$('.nav-item').forEach(i=>i.addEventListener('click',()=>showSection(i.dataset.section)));
$$('.mobile-nav-item').forEach(i=>i.addEventListener('click',()=>showSection(i.dataset.section)));
function goToTimer(){ showSection('pomodoro'); }

// ── CLOCK ──
function updateClock(){
  const now=new Date();
  $('sidebarTime').textContent=now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false});
  $('sidebarDate').textContent=now.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
  const h=now.getHours();
  const greet=h<12?'Good morning':h<17?'Good afternoon':'Good evening';
  const gl=document.querySelector('#dashboard .section-label');
  if(gl) gl.textContent=greet;
}
updateClock(); setInterval(updateClock,1000);

// ── QUOTES / TIPS ──
const quotes=[
  {text:"The secret of getting ahead is getting started.",author:"Mark Twain"},
  {text:"Focus is a matter of deciding what things you're not going to do.",author:"John Carmack"},
  {text:"Time is what we want most, but what we use worst.",author:"William Penn"},
  {text:"Either you run the day, or the day runs you.",author:"Jim Rohn"},
  {text:"Until we can manage time, we can manage nothing else.",author:"Peter Drucker"},
  {text:"Deep work is the ability to focus without distraction on a cognitively demanding task.",author:"Cal Newport"},
  {text:"It's not that I'm so smart, it's just that I stay with problems longer.",author:"Albert Einstein"},
];
let qi=Math.floor(Math.random()*quotes.length);
function showQuote(){ const q=quotes[qi%quotes.length]; $('quoteText').textContent=`"${q.text}"`; $('quoteAuthor').textContent=`— ${q.author}`; qi++; }
showQuote();

const tips=[
  {title:"The Focus Technique",desc:"Work in 25-minute focused intervals with 5-minute breaks. After 4 sessions take a longer 15–30 minute break to restore full concentration."},
  {title:"Time Blocking",desc:"Assign every hour a specific task before your day starts. This kills decision fatigue and protects your most important work."},
  {title:"The 2-Minute Rule",desc:"If a task takes less than 2 minutes, do it immediately. Otherwise schedule it. This keeps your list free of trivial clutter."},
  {title:"Eat the Frog",desc:"Tackle your most dreaded task first thing in the morning when willpower peaks. Everything after feels easier by comparison."},
  {title:"Deep Work Blocks",desc:"Schedule 90-minute uninterrupted blocks for demanding tasks. Silence notifications and protect this time ruthlessly."},
  {title:"Energy Management",desc:"Align tasks with your energy — creative work in peak hours, admin and routine tasks in low-energy windows."},
];
let tipIdx=0;
function showTip(){ $('tipTitle').textContent=tips[tipIdx].title; $('tipDesc').textContent=tips[tipIdx].desc; tipIdx=(tipIdx+1)%tips.length; }
$('nextTipBtn').addEventListener('click',showTip);

// ── DASHBOARD ──
function updateDashboard(){
  const today=todayStr(), mins=State.stats.focusMinutesByDay[today]||0;
  $('todayFocusTime').textContent=`${Math.floor(mins/60)}h ${mins%60}m`;
  $('focusFill').style.width=Math.min(100,(mins/240)*100)+'%';
  const total=State.tasks.length, done=State.tasks.filter(t=>t.done).length;
  $('tasksCompleted').textContent=`${done} / ${total}`;
  $('taskFill').style.width=total?(done/total*100)+'%':'0%';
  $('streakDays').textContent=State.stats.currentStreak;
  $('streakFill').style.width=Math.min(100,State.stats.currentStreak*10)+'%';
  $('pomodoroCount').textContent=State.stats.totalPomodoros;
  $('pomodoroFill').style.width=Math.min(100,State.stats.totalPomodoros*8)+'%';
  $('dashTimerDisplay').textContent=fmt(State.pomo.secondsLeft);
  const list=$('dashTaskList');
  const pending=State.tasks.filter(t=>!t.done).slice(0,5);
  list.innerHTML=pending.length
    ?pending.map(t=>`<li class="preview-task"><span style="color:var(--text-muted)">◇</span> ${t.name}</li>`).join('')
    :'<li class="preview-task empty-state">No tasks yet — add some in Tasks ↗</li>';
  renderWeekBars(); renderMonthGrid();
}

let dashWeekOffset = 0;

function renderWeekBars(){
  const c=$('weekBars'); if(!c) return;
  const today=todayStr(), days=getWeekDays(dashWeekOffset);
  const max=Math.max(1,...days.map(d=>State.stats.focusMinutesByDay[d]||0));
  c.innerHTML=days.map(d=>{
    const m=State.stats.focusMinutesByDay[d]||0;
    return `<div class="week-bar${d===today?' today':''}" style="height:${Math.max(4,(m/max)*72)}px" title="${m}m"></div>`;
  }).join('');
  // Update label
  const lbl=$('weekCardLabel');
  if(lbl){
    if(dashWeekOffset===0) lbl.textContent='This Week';
    else if(dashWeekOffset===-1) lbl.textContent='Last Week';
    else{
      const mon=new Date(days[0]), sun=new Date(days[6]);
      const fmt=d=>d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
      lbl.textContent=`${fmt(mon)} – ${fmt(sun)}`;
    }
  }
  // Disable next button when already on current week
  const nextBtn=$('weekNavNext');
  if(nextBtn) nextBtn.disabled = dashWeekOffset >= 0;
}


function renderMonthGrid(){
  const c=$('monthGrid'); if(!c)return;
  const now=new Date(),y=now.getFullYear(),mo=now.getMonth(),dim=new Date(y,mo+1,0).getDate();
  const todayD=now.getDate();
  const max=Math.max(1,...Array.from({length:dim},(_,i)=>{
    const d=new Date(y,mo,i+1); return State.stats.focusMinutesByDay[dateStr(d)]||0;
  }));
  c.style.gridTemplateColumns=`repeat(${dim},1fr)`;
  c.innerHTML=Array.from({length:dim},(_,i)=>{
    const d=new Date(y,mo,i+1),key=dateStr(d),m=State.stats.focusMinutesByDay[key]||0;
    let cls='month-day';
    if(m===0)cls+=' no-data';
    else if(m<30)cls+=' has-data';
    else if(m<90)cls+=' has-data good';
    else cls+=' has-data great';
    if(i+1===todayD)cls+=' today-marker';
    return `<div class="${cls}" style="height:${Math.max(4,(m/max)*56)}px" title="${d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}: ${m}m"></div>`;
  }).join('');
}

function getWeekDays(off=0){
  const now=new Date(),dow=now.getDay(),mon=new Date(now);
  mon.setDate(now.getDate()-((dow+6)%7)+off*7);
  return Array.from({length:7},(_,i)=>{ const d=new Date(mon); d.setDate(mon.getDate()+i); return dateStr(d); });
}

// Week nav buttons on dashboard weekly card
document.addEventListener('click', e=>{
  if(e.target.id==='weekNavPrev'){ dashWeekOffset--; renderWeekBars(); }
  if(e.target.id==='weekNavNext' && dashWeekOffset<0){ dashWeekOffset++; renderWeekBars(); }
});


// ── TIMER ──
const POMO=State.pomo;
function pomoDur(m){ return m==='pomodoro'?POMO.durations.pomoDuration*60:m==='short'?POMO.durations.shortBreak*60:POMO.durations.longBreak*60; }
function resetTimer(mode){
  POMO.mode=mode||POMO.mode;
  POMO.secondsLeft=POMO.totalSeconds=pomoDur(POMO.mode);
  POMO.running=false; clearInterval(POMO.intervalId);
  // Sync active tab highlight
  $$('.pomo-tab').forEach(x=>{x.classList.remove('active');if(x.dataset.mode===POMO.mode)x.classList.add('active');});
  // Apply mode class to layout for colour theming
  const layout=document.querySelector('.pomodoro-center')||document.querySelector('.pomodoro-layout');
  if(layout){layout.classList.remove('pomo-mode-pomodoro','pomo-mode-short','pomo-mode-long');layout.classList.add('pomo-mode-'+POMO.mode);}
  updateTimerUI(); $('startStopBtn').textContent='▶ Start';
}
function applyPomoModeColors(){
  const layout=document.querySelector('.pomodoro-center')||document.querySelector('.pomodoro-layout');
  if(!layout) return;
  layout.classList.remove('pomo-mode-pomodoro','pomo-mode-short','pomo-mode-long');
  layout.classList.add('pomo-mode-'+POMO.mode);
}
function updateTimerUI(){
  const d=fmt(POMO.secondsLeft);
  $('timerDisplay').textContent=d; $('dashTimerDisplay').textContent=d;
  document.title=POMO.running?`${d} — FOCUS`:'FOCUS';
  const circ=2*Math.PI*130,off=circ*(1-POMO.secondsLeft/POMO.totalSeconds);
  $('ringProgress').style.strokeDashoffset=circ-off;
  $('timerSessionLabel').textContent={pomodoro:'FOCUS',short:'BREAK',long:'LONG BREAK'}[POMO.mode];
  $('sessionCount').textContent=`Session ${POMO.session} of ${POMO.durations.sessionGoal}`;
}
function tickTimer(){ if(POMO.secondsLeft<=0){handleTimerDone();return;} POMO.secondsLeft--; updateTimerUI(); }
function handleTimerDone(){
  clearInterval(POMO.intervalId); POMO.running=false;
  $('startStopBtn').textContent='▶ Start'; document.title='FOCUS'; playDone();
  if(POMO.mode==='pomodoro'){
    const task=$('sessionTaskInput').value.trim()||'Deep Focus';
    const log=$('sessionLog');
    const e=document.createElement('li'); e.className='log-entry';
    const now=new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
    const dur=POMO.durations.pomoDuration;
    e.innerHTML=`<span class="log-type">✓</span><span class="log-topic">${task}</span><span class="log-meta">${now} · ${dur}m</span>`;
    if(log.querySelector('.log-empty'))log.innerHTML='';
    log.prepend(e);
    const today=todayStr();
    State.stats.focusMinutesByDay[today]=(State.stats.focusMinutesByDay[today]||0)+POMO.durations.pomoDuration;
    State.stats.totalPomodoros++; updateStreak(); State.save();
    // Award rank points for session
    if(State.rankSystemEnabled){
      const dur=POMO.durations.pomoDuration;
      const pts=Math.round(dur*0.6+5); // ~20pts for 25min session
      addRankEvent(`Focus session: ${task} (${dur}m)`, pts);
    }
    toast('Session complete! Take a break. 🎉','success');
    POMO.session++;
    if(POMO.session>POMO.durations.sessionGoal){POMO.session=1;resetTimer('long');}
    else resetTimer('short');
  } else { toast('Break over! Time to focus.','normal'); resetTimer('pomodoro'); }
}
function updateStreak(){
  const today=todayStr(),yest=new Date(); yest.setDate(yest.getDate()-1); const yStr=dateStr(yest);
  if(State.stats.lastFocusDay===today)return;
  if(State.stats.lastFocusDay===yStr)State.stats.currentStreak++;
  else State.stats.currentStreak=1;
  State.stats.lastFocusDay=today;
  if(State.stats.currentStreak>State.stats.bestStreak)State.stats.bestStreak=State.stats.currentStreak;
}
$('startStopBtn').addEventListener('click',()=>{
  if(POMO.running){clearInterval(POMO.intervalId);POMO.running=false;$('startStopBtn').textContent='▶ Start';document.title='FOCUS';}
  else{POMO.running=true;$('startStopBtn').textContent='⏸ Pause';POMO.intervalId=setInterval(tickTimer,1000);}
});
$('resetBtn').addEventListener('click',()=>resetTimer());
$('skipBtn').addEventListener('click',()=>{clearInterval(POMO.intervalId);resetTimer(POMO.mode==='pomodoro'?'short':'pomodoro');});
$$('.pomo-tab').forEach(t=>t.addEventListener('click',()=>{
  $$('.pomo-tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
  if(t.dataset.mode==='stopwatch'){
    showStopwatchView();
  } else {
    showPomoView();
    POMO.session=1; resetTimer(t.dataset.mode);
  }
}));

// ── Pomo / Stopwatch view switching ──
function showPomoView(){
  $('pomoTimerView').style.display='';
  $('stopwatchView').style.display='none';
  // restore pomo mode colors
  const layout=document.querySelector('.pomodoro-center')||document.querySelector('.pomodoro-layout');
  if(layout){ layout.classList.remove('pomo-mode-stopwatch'); }
  applyPomoModeColors();
}

function showStopwatchView(){
  $('pomoTimerView').style.display='none';
  $('stopwatchView').style.display='';
  document.title='FOCUS';
  // Apply stopwatch color class
  const layout=document.querySelector('.pomodoro-center')||document.querySelector('.pomodoro-layout');
  if(layout){
    layout.classList.remove('pomo-mode-pomodoro','pomo-mode-short','pomo-mode-long');
    layout.classList.add('pomo-mode-stopwatch');
  }
}

// ── STOPWATCH ──
const SW = {
  running: false,
  intervalId: null,
  elapsedMs: 0,
  startTime: null,     // Date.now() when last started
  laps: [],
  lastLapMs: 0,
};

function fmtSw(ms){
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

function fmtSwMs(ms){
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const cs = Math.floor((ms % 1000) / 10);
  return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}.${cs.toString().padStart(2,'0')}`;
}

function updateSwUI(){
  const elapsed = SW.running ? (SW.elapsedMs + (Date.now() - SW.startTime)) : SW.elapsedMs;
  $('swDisplay').textContent = fmtSw(elapsed);
  document.title = SW.running ? `${fmtSw(elapsed)} — FOCUS` : 'FOCUS';
  // Animate arc — one full rotation every 60 seconds
  const circ = 816.8;
  const secFrac = (elapsed / 1000 % 60) / 60;
  $('swRingProgress').style.strokeDashoffset = circ - circ * secFrac;
}

function swTick(){
  updateSwUI();
}

$('swStartStopBtn').addEventListener('click',()=>{
  if(SW.running){
    // Pause — just stop the clock, no points awarded yet
    SW.elapsedMs += Date.now() - SW.startTime;
    SW.running = false;
    clearInterval(SW.intervalId);
    $('swStartStopBtn').textContent = '▶ Resume';
    $('swStartStopBtn').classList.remove('sw-running');
    updateSwUI();
    document.title = 'FOCUS';
  } else {
    // Start / Resume
    SW.startTime = Date.now();
    SW.running = true;
    clearInterval(SW.intervalId);
    SW.intervalId = setInterval(swTick, 50); // 50ms for smooth display
    $('swStartStopBtn').textContent = '⏸ Pause';
    $('swStartStopBtn').classList.add('sw-running');
  }
});

$('swResetBtn').addEventListener('click',()=>{
  // If the stopwatch is still running, capture the final elapsed time first
  if(SW.running){
    SW.elapsedMs += Date.now() - SW.startTime;
    SW.running = false;
  }
  clearInterval(SW.intervalId);

  // Award points and log the session on reset (only if at least 1 min was tracked)
  const mins = Math.floor(SW.elapsedMs / 60000);
  if(mins >= 1){
    const task = $('swTaskInput').value.trim() || 'Stopwatch session';
    if(State.rankSystemEnabled){
      const pts = Math.round(mins * 0.5 + 2);
      addRankEvent(`⏱ Stopwatch: ${task} (${mins}m)`, pts);
      toast(`+${pts} pts — ${mins}m tracked! ⏱`, 'success');
    }
    // Add to focus minutes stats
    const today = todayStr();
    State.stats.focusMinutesByDay[today] = (State.stats.focusMinutesByDay[today]||0) + mins;
    State.stats.totalPomodoros++;
    updateStreak();
    State.save();
    // Log in session log
    const log = $('sessionLog');
    const entry = document.createElement('li'); entry.className = 'log-entry';
    const now = new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
    entry.innerHTML = `<span class="log-type sw-log-icon">⏱</span><span class="log-topic">${task}</span><span class="log-meta">${now} · ${mins}m · stopwatch</span>`;
    if(log.querySelector('.log-empty')) log.innerHTML='';
    log.prepend(entry);
  }

  // Reset all state
  SW.elapsedMs = 0;
  SW.startTime = null;
  SW.laps = [];
  SW.lastLapMs = 0;
  $('swStartStopBtn').textContent = '▶ Start';
  $('swStartStopBtn').classList.remove('sw-running');
  $('swDisplay').textContent = '00:00:00';
  $('swLapCount').textContent = '';
  $('swRingProgress').style.strokeDashoffset = '816.8';
  $('swLapsWrap').style.display = 'none';
  $('swLapList').innerHTML = '';
  document.title = 'FOCUS';
});

$('swLapBtn').addEventListener('click',()=>{
  if(!SW.running && SW.elapsedMs === 0) return;
  const elapsed = SW.running ? (SW.elapsedMs + (Date.now() - SW.startTime)) : SW.elapsedMs;
  const lapTime = elapsed - SW.lastLapMs;
  SW.laps.push({ lap: SW.laps.length + 1, total: elapsed, split: lapTime });
  SW.lastLapMs = elapsed;
  // Render laps
  $('swLapsWrap').style.display = '';
  $('swLapList').innerHTML = [...SW.laps].reverse().map((l,i,arr)=>{
    const fastest = arr.reduce((mn,x)=>x.split < mn.split ? x : mn, arr[0]);
    const slowest = arr.reduce((mx,x)=>x.split > mx.split ? x : mx, arr[0]);
    const cls = arr.length > 1 ? (l.lap===fastest.lap ? 'lap-fast' : l.lap===slowest.lap ? 'lap-slow' : '') : '';
    return `<li class="sw-lap-item ${cls}">
      <span class="lap-num">Lap ${l.lap}</span>
      <span class="lap-split">${fmtSwMs(l.split)}</span>
      <span class="lap-total">${fmtSwMs(l.total)}</span>
    </li>`;
  }).join('');
});
// ── Timer duration inputs — respects hr/min unit selects ──
// Durations are always stored in MINUTES internally.
const UNIT_SELECT_MAP = {
  pomoDuration: 'pomoDurationUnit',
  shortBreak:   'shortBreakUnit',
  longBreak:    'longBreakUnit',
};
// Bounds in minutes
const DUR_BOUNDS = { pomoDuration:[1,480], shortBreak:[1,120], longBreak:[1,240], sessionGoal:[1,12] };

function getUnitMins(key){
  const selId = UNIT_SELECT_MAP[key];
  if(!selId) return 1; // sessionGoal has no unit
  const sel = $(selId);
  return (sel && sel.value === 'hr') ? 60 : 1;
}

function parseTimerDuration(str, key){
  const n = parseFloat(str);
  if(isNaN(n) || n <= 0) return POMO.durations[key];
  const unitMins = getUnitMins(key);
  const totalMins = Math.round(n * unitMins);
  const [mn, mx] = DUR_BOUNDS[key];
  return Math.max(mn, Math.min(mx, totalMins));
}

// Sync displayed value when unit changes (convert stored minutes → display value)
function syncDisplayValue(key){
  const inp = $(key); if(!inp) return;
  const unitMins = getUnitMins(key);
  const stored = POMO.durations[key]; // always minutes
  inp.value = unitMins > 1 ? +(stored / 60).toFixed(2).replace(/\.00$/,'') : stored;
}

['pomoDuration','shortBreak','longBreak','sessionGoal'].forEach(key=>{
  const inp=$(key); if(!inp) return;
  // Init display
  syncDisplayValue(key);

  const commit=()=>{
    const v=parseTimerDuration(inp.value, key);
    POMO.durations[key]=v;
    syncDisplayValue(key); // reformat display to match stored value
    if(!POMO.running) resetTimer();
    State.save();
  };
  inp.addEventListener('change', commit);
  inp.addEventListener('blur',   commit);
  inp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ commit(); inp.blur(); } });

  // Unit dropdown handler
  const selId = UNIT_SELECT_MAP[key];
  if(selId){
    const sel=$(selId); if(!sel) return;
    sel.addEventListener('change', ()=>{
      // Re-display stored minutes in the new unit, then reset timer
      syncDisplayValue(key);
      if(!POMO.running) resetTimer();
    });
  }
});

// ── TASKS ──
let taskFilter='all';
let taskSortMode='none'; // 'none' | 'priority' | 'status'


function addTask(){
  
  const name=$('taskInput').value.trim();
  if(!name){toast('Please enter a task name.','warn');return;}
  State.tasks.unshift({
    id:Date.now(),name,
    category:$('taskCategory').value,
    priority:$('taskPriority').value,
    status:$('taskStatus').value||'not-started',
    due:$('taskDue').value,
    done:$('taskStatus').value==='done',
    created:todayStr()
  });
  $('taskInput').value='';$('taskDue').value='';$('taskStatus').value='not-started';
  State.save();renderTaskList();toast('Task added! ✓','success');
}
// ── CUSTOM COLUMNS ──
if(!State.customColumns) State.customColumns = [];

function renderTaskList(){
  const list=$('taskList');
  let items=[...State.tasks];
  if(taskFilter==='done') items=items.filter(t=>t.done||(t.status==='done'));
  else if(taskFilter==='pending') items=items.filter(t=>!t.done&&t.status!=='done');
  else if(!['all','done','pending'].includes(taskFilter)) items=items.filter(t=>t.category===taskFilter);

  const isDone = t => t.done || t.status === 'done';

  if(taskSortMode==='priority'){
    const priorityOrder={critical:0,high:1,medium:2,low:3,someday:4};
    items.sort((a,b)=>{
      const aDone=isDone(a)?1:0, bDone=isDone(b)?1:0;
      if(aDone!==bDone) return aDone-bDone;
      return (priorityOrder[a.priority]??2)-(priorityOrder[b.priority]??2);
    });
  } else if(taskSortMode==='status'){
    // working → not-started → stuck → done
    const statusOrder={working:0,'not-started':1,stuck:2,done:3};
    items.sort((a,b)=>{
      const sa=a.status||(a.done?'done':'not-started');
      const sb=b.status||(b.done?'done':'not-started');
      return (statusOrder[sa]??1)-(statusOrder[sb]??1);
    });
  } else if(taskSortMode==='date'){
    // tasks with due dates first (earliest first), no-date tasks at bottom, done always last
    items.sort((a,b)=>{
      const aDone=isDone(a)?1:0, bDone=isDone(b)?1:0;
      if(aDone!==bDone) return aDone-bDone;
      if(!a.due && !b.due) return 0;
      if(!a.due) return 1;
      if(!b.due) return -1;
      return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
    });
  }

  if(!items.length){
    list.innerHTML=`<li class="task-empty-state"><span>✦</span><p>${taskFilter==='done'?'No completed tasks.':'No tasks here.'}</p></li>`;
    renderAddColumnBtn();
    return;
  }

  const customCols = State.customColumns || [];
  const customHeaderCells = customCols.map(col=>
    `<span class="tgh-custom" data-col-id="${col.id}">
      ${col.name}
      <button class="col-remove-btn" onclick="removeCustomColumn('${col.id}')" title="Remove column">✕</button>
    </span>`
  ).join('');

  const customColsStyle = customCols.length
    ? `style="grid-template-columns: 28px 1fr 140px 160px 150px ${customCols.map(()=>'140px').join(' ')} 32px"`
    : `style="grid-template-columns: 28px 1fr 140px 160px 150px 32px"`;

  list.innerHTML=`<li class="task-grid-header" ${customColsStyle}>
    <span class="tgh-drag"></span>
    <span class="tgh-name">Task</span>
    <span class="tgh-priority">Priority</span>
    <span class="tgh-status">Status</span>
    <span class="tgh-due">Due Date</span>
    ${customHeaderCells}
    <span class="tgh-actions"></span>
  </li>`
  +items.map(t=>{
    const st=t.status||(t.done?'done':'not-started');
    const sm=STATUS_META[st]||STATUS_META['not-started'];
    const pm=PRIORITY_META[t.priority]||PRIORITY_META['medium'];
    const isDone=st==='done'||t.done;
    const dueOverdue=t.due&&!isDone&&t.due<todayStr();
    const isOverdue=t.due&&!isDone&&t.due<todayStr();

    const customCells = customCols.map(col=>{
      const val = (t.customData && t.customData[col.id]) || '';
      return `<div class="task-custom-cell">
        <input class="task-custom-input" type="text" value="${val.replace(/"/g,'&quot;')}"
          placeholder="—"
          onchange="updateCustomCell(${t.id},'${col.id}',this.value)"
          onclick="this.focus()"
        />
      </div>`;
    }).join('');

    return `<li class="task-item task-grid-row${isDone?' done':''}${isOverdue?' overdue-task':''}" data-id="${t.id}" draggable="true" ${customColsStyle}>
      <div class="task-drag-handle" title="Drag to reorder">⠿</div>
      <div class="task-name-cell">
        <span class="task-name" data-full="${t.name.replace(/"/g,'&quot;')}">${t.name}</span>
        <button class="task-readmore-btn" style="display:none" onclick="expandTaskName(this)">read more</button>
        <span class="task-category-tag tag-${t.category}">${t.category}</span>
      </div>
      <div class="task-priority-cell">
        <select class="task-priority-select pri-select-${pm.key||t.priority}"
          onchange="updateTaskPriority(${t.id},this.value)"
          title="Priority">
          <option value="low"${t.priority==='low'?' selected':''}>🟢 Low</option>
          <option value="medium"${t.priority==='medium'?' selected':''}>🟡 Medium</option>
          <option value="high"${t.priority==='high'?' selected':''}>🟠 High</option>
          <option value="critical"${t.priority==='critical'?' selected':''}>🔴 Critical</option>
        </select>
      </div>
      <div class="task-status-cell">
        <select class="task-status-select status-select-${st}"
          onchange="updateTaskStatus(${t.id},this.value)"
          title="Status">
          <option value="not-started"${st==='not-started'?' selected':''}>○ Not Started</option>
          <option value="working"${st==='working'?' selected':''}>◑ Working On It</option>
          <option value="stuck"${st==='stuck'?' selected':''}>⚠ Stuck</option>
          <option value="done"${st==='done'?' selected':''}>✓ Done</option>
        </select>
      </div>
      <div class="task-due-cell${dueOverdue?' overdue':''}">
        <input type="date" class="task-due-input" value="${t.due||''}"
          onchange="updateTaskDue(${t.id},this.value)"
          title="Set due date"
        />
        ${t.due?`<span class="task-due-label${dueOverdue?' overdue-label':''}">${formatDueDate(t.due)}</span>`:'<span class="task-due-label muted-label">Set date</span>'}
      </div>
      ${customCells}
      <button class="task-delete" onclick="deleteTask(${t.id})">✕</button>
    </li>`;
  }).join('');

  setupTaskDragAndDrop();
  renderAddColumnBtn();
  // Check for truncated task names on mobile — use longer delay so layout has settled
  setTimeout(checkTaskNameTruncation, 150);
  // Also re-check on resize in case column widths changed
  if(window._taskResizeObserver) window._taskResizeObserver.disconnect();
  const taskList=document.getElementById('taskList');
  if(taskList && window.ResizeObserver){
    window._taskResizeObserver=new ResizeObserver(()=>{ checkTaskNameTruncation(); });
    window._taskResizeObserver.observe(taskList);
  }
}

function expandTaskName(btn){
  // On desktop: expand inline as before
  if(window.innerWidth > 768){
    const nameEl=btn.previousElementSibling;
    if(!nameEl)return;
    nameEl.style.webkitLineClamp='unset';
    nameEl.style.display='block';
    nameEl.style.overflow='visible';
    nameEl.dataset.expanded='1';
    btn.style.display='none';
    return;
  }
  // On mobile: show popup
  const nameEl=btn.closest('.task-name-cell')&&btn.closest('.task-name-cell').querySelector('.task-name');
  const fullText=(nameEl&&nameEl.dataset.full)||nameEl&&nameEl.textContent||'';
  showTaskNamePopup(fullText);
}

function showTaskNamePopup(text){
  const existing=document.getElementById('taskNamePopup');
  if(existing) existing.remove();
  const overlay=document.createElement('div');
  overlay.id='taskNamePopup';
  overlay.className='task-name-popup-overlay';
  overlay.innerHTML=`
    <div class="task-name-popup-box">
      <div class="task-name-popup-header">
        <span>Task Name</span>
        <button class="task-name-popup-close" id="taskNamePopupClose">✕</button>
      </div>
      <div class="task-name-popup-body">${text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('taskNamePopupClose').addEventListener('click',()=>overlay.remove());
  overlay.addEventListener('click',e=>{ if(e.target===overlay) overlay.remove(); });
}

function checkTaskNameTruncation(){
  // On desktop: hide all read-more buttons (desktop uses single-line ellipsis natively)
  if(window.innerWidth > 768){
    document.querySelectorAll('.task-readmore-btn').forEach(btn=>btn.style.display='none');
    return;
  }
  document.querySelectorAll('.task-name').forEach(el=>{
    const btn=el.nextElementSibling;
    if(!btn||!btn.classList.contains('task-readmore-btn'))return;

    // Temporarily lift the line-clamp to measure the natural full height
    el.style.webkitLineClamp='unset';
    el.style.display='block';
    el.style.overflow='visible';

    const lineHeight=parseFloat(getComputedStyle(el).lineHeight)||16;
    const naturalH=el.scrollHeight;

    // Restore 2-line clamp
    el.style.webkitLineClamp='2';
    el.style.display='-webkit-box';
    el.style.overflow='hidden';

    // Show "read more" only if full text needs 3 or more lines
    btn.style.display = (naturalH >= lineHeight * 3) ? 'inline-block' : 'none';
  });
}

function renderAddColumnBtn(){
  // Add Column button removed
  let existing = $('addColumnBtnWrap');
  if(existing) existing.remove();
}

function promptAddColumn(){
  const name = prompt('Enter column name (e.g. "Notes", "Owner", "Link"):');
  if(!name || !name.trim()) return;
  if(!State.customColumns) State.customColumns = [];
  State.customColumns.push({ id: 'col_'+Date.now(), name: name.trim() });
  State.save();
  renderTaskList();
}

function removeCustomColumn(colId){
  if(!confirm('Remove this column? Column data will be lost.')) return;
  State.customColumns = (State.customColumns||[]).filter(c=>c.id!==colId);
  // Remove column data from all tasks
  State.tasks.forEach(t=>{ if(t.customData) delete t.customData[colId]; });
  State.save();
  renderTaskList();
}

function updateCustomCell(taskId, colId, value){
  const t = State.tasks.find(t=>t.id===taskId); if(!t) return;
  if(!t.customData) t.customData = {};
  t.customData[colId] = value;
  State.save();
}

function updateTaskPriority(id, priority){
  const t=State.tasks.find(t=>t.id===id); if(!t)return;
  t.priority=priority; State.save(); renderTaskList();
  if(document.getElementById('dashboard').classList.contains('active'))updateDashboard();
}

// ── PERMANENT TASK OUTCOME TRACKING ──
function recordTaskOutcome(t){
  const today=todayStr();
  const alreadyRecorded=State.stats.doneOnTimeTasks.some(r=>r.id===t.id);
  if(!alreadyRecorded){
    State.stats.missedTasks=State.stats.missedTasks.filter(r=>r.id!==t.id);
    State.stats.doneOnTimeTasks.push({id:t.id,name:t.name,due:t.due||null,completedOn:today,category:t.category||'work'});
    // Award rank points for task done on time
    if(State.rankSystemEnabled){
      const priorityPts={critical:20,high:12,medium:7,low:4,someday:2};
      const base=priorityPts[t.priority]||7;
      const onTime=!t.due||t.due>=today;
      const pts=onTime?Math.round(base*1.5):base;
      addRankEvent(`✓ ${t.name}${onTime&&t.due?' ⚡ on time':''}`,pts);
    }
    State.save();
  }
}
function auditMissedTasks(){
  const today=todayStr();
  let changed=false;
  State.tasks.forEach(t=>{
    if(!t.done&&t.status!=='done'&&t.due&&t.due<today){
      const alreadyMissed=State.stats.missedTasks.some(r=>r.id===t.id);
      const alreadyDone=State.stats.doneOnTimeTasks.some(r=>r.id===t.id);
      if(!alreadyMissed&&!alreadyDone){
        State.stats.missedTasks.push({id:t.id,name:t.name,due:t.due,missedOn:today,category:t.category||'work'});
        // Deduct rank points for missed task
        if(State.rankSystemEnabled){
          const priorityPts={critical:-15,high:-10,medium:-6,low:-3,someday:-1};
          const pts=priorityPts[t.priority]||-5;
          addRankEvent(`✗ Missed: ${t.name}`,pts);
        }
        changed=true;
      }
    }
  });
  if(changed) State.save();
}

function updateTaskStatus(id, status){
  const t=State.tasks.find(t=>t.id===id); if(!t)return;
  t.status=status; t.done=status==='done';
  if(t.done){toast('Task done! 🎉','success'); recordTaskOutcome(t);}
  State.save(); renderTaskList();
  if(document.getElementById('dashboard').classList.contains('active'))updateDashboard();
}

function updateTaskDue(id, due){
  const t=State.tasks.find(t=>t.id===id); if(!t)return;
  t.due=due; State.save(); renderTaskList();
}

const STATUS_META={
  'not-started':{label:'Not Started',cls:'status-not-started',icon:'○'},
  'working':    {label:'Working On It',cls:'status-working',icon:'◑'},
  'stuck':      {label:'Stuck',cls:'status-stuck',icon:'⚠'},
  'done':       {label:'Done',cls:'status-done',icon:'✓'},
};
const PRIORITY_META={
  critical:{label:'Critical',cls:'pri-critical'},
  high:{label:'High',cls:'pri-high'},
  medium:{label:'Medium',cls:'pri-med'},
  low:{label:'Low',cls:'pri-low'},
  someday:{label:'Someday',cls:'pri-someday'},
};
function formatDueDate(str){
  const d=new Date(str+'T12:00:00');
  const today=new Date(); today.setHours(0,0,0,0);
  const diff=Math.round((d-today)/(1000*60*60*24));
  if(diff===0)return'Today';if(diff===1)return'Tomorrow';if(diff===-1)return'Yesterday';
  if(diff<0)return`${Math.abs(diff)}d ago`;if(diff<7)return`in ${diff}d`;
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
}
function cycleTaskStatus(id){
  const t=State.tasks.find(t=>t.id===id); if(!t)return;
  const order=['not-started','working','stuck','done'];
  const cur=t.status||(t.done?'done':'not-started');
  t.status=order[(order.indexOf(cur)+1)%order.length];
  t.done=t.status==='done';
  State.save(); renderTaskList();
  if(t.done){toast('Task done! 🎉','success'); recordTaskOutcome(t);}
  if(document.getElementById('dashboard').classList.contains('active'))updateDashboard();
}

// ── TASK DRAG AND DROP ──
let dragTaskId = null;
function setupTaskDragAndDrop(){
  const list = $('taskList');
  list.querySelectorAll('.task-item[draggable]').forEach(item=>{
    // Mouse drag
    item.addEventListener('dragstart', e=>{
      dragTaskId = parseInt(item.dataset.id);
      setTimeout(()=>item.classList.add('dragging-task'),0);
      e.dataTransfer.effectAllowed='move';
    });
    item.addEventListener('dragend', ()=>{
      item.classList.remove('dragging-task');
      list.querySelectorAll('.task-item').forEach(i=>i.classList.remove('drag-over-task'));
      dragTaskId=null;
    });
    item.addEventListener('dragover', e=>{ e.preventDefault(); if(parseInt(item.dataset.id)===dragTaskId)return; item.classList.add('drag-over-task'); });
    item.addEventListener('dragleave', ()=>item.classList.remove('drag-over-task'));
    item.addEventListener('drop', e=>{
      e.preventDefault(); item.classList.remove('drag-over-task');
      const fromId=dragTaskId, toId=parseInt(item.dataset.id);
      if(!fromId||fromId===toId)return;
      reorderTask(fromId,toId);
    });

    // Touch drag
    let touchStartY=0, touchItem=null, touchClone=null;
    const handle=item.querySelector('.task-drag-handle');
    if(handle){
      handle.addEventListener('touchstart', e=>{
        touchStartY=e.touches[0].clientY;
        touchItem=item;
        dragTaskId=parseInt(item.dataset.id);
        touchClone=item.cloneNode(true);
        touchClone.style.cssText=`position:fixed;z-index:9999;opacity:0.85;pointer-events:none;width:${item.offsetWidth}px;left:${item.getBoundingClientRect().left}px;top:${item.getBoundingClientRect().top}px;transform:scale(1.02);box-shadow:0 8px 32px rgba(0,0,0,0.5);`;
        document.body.appendChild(touchClone);
        item.classList.add('dragging-task');
      },{passive:true});
      handle.addEventListener('touchmove', e=>{
        if(!touchClone)return;
        e.preventDefault();
        const dy=e.touches[0].clientY-touchStartY;
        const rect=item.getBoundingClientRect();
        touchClone.style.top=(rect.top+dy)+'px';
        // Find item under finger
        touchClone.style.display='none';
        const under=document.elementFromPoint(e.touches[0].clientX,e.touches[0].clientY)?.closest('.task-item');
        touchClone.style.display='';
        list.querySelectorAll('.task-item').forEach(i=>i.classList.remove('drag-over-task'));
        if(under&&under!==item) under.classList.add('drag-over-task');
      },{passive:false});
      handle.addEventListener('touchend', e=>{
        if(touchClone){touchClone.remove();touchClone=null;}
        item.classList.remove('dragging-task');
        const over=list.querySelector('.task-item.drag-over-task');
        if(over){
          over.classList.remove('drag-over-task');
          const toId=parseInt(over.dataset.id);
          if(dragTaskId&&dragTaskId!==toId) reorderTask(dragTaskId,toId);
        }
        dragTaskId=null; touchItem=null;
      });
    }
  });
}

function reorderTask(fromId, toId){
  const fromIdx=State.tasks.findIndex(t=>t.id===fromId);
  const toIdx=State.tasks.findIndex(t=>t.id===toId);
  if(fromIdx<0||toIdx<0)return;
  const [moved]=State.tasks.splice(fromIdx,1);
  State.tasks.splice(toIdx,0,moved);
  State.save(); renderTaskList();
}
function toggleTask(id){const t=State.tasks.find(t=>t.id===id);if(!t)return;t.done=!t.done;t.status=t.done?'done':'not-started';if(t.done)toast('Task done! 🎉','success');State.save();renderTaskList();if(document.getElementById('dashboard').classList.contains('active'))updateDashboard();}
function deleteTask(id){
  const t=State.tasks.find(t=>t.id===id);
  if(t){
    if(!State.taskTrash) State.taskTrash=[];
    State.taskTrash.unshift({...t, deletedAt:Date.now()});
    if(State.taskTrash.length>100) State.taskTrash=State.taskTrash.slice(0,100);
  }
  State.tasks=State.tasks.filter(t=>t.id!==id);
  State.save(); renderTaskList(); updateTasksTrashBadge();
  if(document.getElementById('dashboard').classList.contains('active'))updateDashboard();
  toast('Task moved to trash 🗑','normal');
}
$('addTaskBtn').addEventListener('click',addTask);
$('taskInput').addEventListener('keydown',e=>{if(e.key==='Enter')addTask();});
$$('.filter-btn').forEach(btn=>btn.addEventListener('click',()=>{$$('.filter-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');taskFilter=btn.dataset.filter;renderTaskList();}));
$$('.task-sort-btn').forEach(btn=>btn.addEventListener('click',()=>{$$('.task-sort-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');taskSortMode=btn.dataset.sort;renderTaskList();}));
const _sortToggleBtn=document.getElementById('taskSortToggle');
if(_sortToggleBtn){_sortToggleBtn.addEventListener('click',()=>{taskSortMode=!taskSortMode;_sortToggleBtn.classList.toggle('active',taskSortMode);_sortToggleBtn.textContent=taskSortMode?'⇅ Sorted by Priority':'⇅ Sort by Priority';renderTaskList();});}

// ── PLANNER ──
function timeToMins(t){const[h,m]=t.split(':').map(Number);return h*60+m;}
function minsToTime(m){return `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;}

function getWeekStart(off=0){
  const now=new Date(),dow=now.getDay(),mon=new Date(now);
  mon.setDate(now.getDate()-((dow+6)%7)+off*7); mon.setHours(0,0,0,0); return mon;
}

function renderPlanner(){
  if(State.zoomedDay) showDayZoom(State.zoomedDay);
  else if(State.plannerView==='month') showMonthView();
  else showWeekView();
  renderInventory();
}

// ── WEEK/MONTH TOGGLE ──
State.plannerView = State.plannerView || 'week';

function switchPlannerView(v){
  State.plannerView = v;
  // Update toggle buttons
  $$('.pvt-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  // Hide nav until day zoom
  $('plannerNav').style.display = 'none';
  $('zoomBackBtn').style.display = 'none';
  State.zoomedDay = null;
  clearInterval(nowLineInterval); clearInterval(blockCountdownInterval); clearInterval(window._weekNowInterval);
  $('weeklyView').style.display = 'none';
  $('monthlyView').style.display = 'none';
  $('dayZoomView').style.display = 'none';
  if(v === 'week') showWeekView();
  else showMonthView();
}

$$('.pvt-btn').forEach(btn => btn.addEventListener('click', () => switchPlannerView(btn.dataset.view)));

$('prevWeek').addEventListener('click',()=>{
  if(State.zoomedDay){
    // Navigate to previous day
    const d=new Date(State.zoomedDay+'T12:00:00'); d.setDate(d.getDate()-1);
    State.zoomedDay=dateStr(d); showDayZoom(State.zoomedDay);
  } else {
    State.planner.weekOffset--;
    if(State.plannerView==='month') showMonthView(); else showWeekView();
  }
});
$('nextWeek').addEventListener('click',()=>{
  if(State.zoomedDay){
    // Navigate to next day
    const d=new Date(State.zoomedDay+'T12:00:00'); d.setDate(d.getDate()+1);
    State.zoomedDay=dateStr(d); showDayZoom(State.zoomedDay);
  } else {
    State.planner.weekOffset++;
    if(State.plannerView==='month') showMonthView(); else showWeekView();
  }
});
$('zoomBackBtn').addEventListener('click',()=>{
  State.zoomedDay=null;
  clearInterval(nowLineInterval); clearInterval(blockCountdownInterval);
  clearInterval(window._weekNowInterval);
  $('plannerNav').style.display='none';
  $('plannerViewToggle').style.display='';
  if(State.plannerView==='month') showMonthView(); else showWeekView();
  $('zoomBackBtn').style.display='none';
});

function showWeekView(){
  $('weeklyView').style.display='block';
  $('monthlyView').style.display='none';
  $('dayZoomView').style.display='none';
  $('zoomBackBtn').style.display='none';
  $('plannerNav').style.display='none';
  const off=State.planner.weekOffset;
  const mon=getWeekStart(off); // Monday
  // Build Sun→Sat order: Sun is mon-1 day, then Mon..Sat
  const sunDate=new Date(mon); sunDate.setDate(mon.getDate()-1);
  const allDays=[sunDate,...Array.from({length:6},(_,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return d;})];
  const today=todayStr(), todayDate=new Date();
  const isThisWeek=off===0;
  const grid=$('weeklyPlannerGrid'); grid.innerHTML='';
  const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const DAY_START=0, DAY_END=24; // hours

  allDays.forEach((day,i)=>{
    const key=dateStr(day), blocks=State.planner.blocks[key]||[];
    const isToday=key===today;
    const isPast=day<new Date(todayDate.getFullYear(),todayDate.getMonth(),todayDate.getDate());
    const row=document.createElement('div'); row.className='week-row';
    let headerCls='week-row-header'; let blocksCls='week-row-blocks';
    if(isToday){headerCls+=' is-today';blocksCls+=' is-today';}
    else if(isPast){headerCls+=' is-past';blocksCls+=' is-past';}

    // Build timeline HTML
    const header=document.createElement('div'); header.className=headerCls;
    header.innerHTML=`<div class="day-name">${dayNames[i]}</div><div class="day-num">${day.getDate()}</div>`;

    const blocksDiv=document.createElement('div'); blocksDiv.className=blocksCls; blocksDiv.dataset.key=key;
    const timeline=document.createElement('div'); timeline.className='week-row-timeline'; timeline.style.position='relative'; timeline.style.width='100%'; timeline.style.height='40px';

    if(blocks.length===0){
      const empty=document.createElement('div'); empty.className='week-row-empty'; empty.textContent='—'; timeline.appendChild(empty);
    } else {
      blocks.forEach(b=>{
        const startMins=timeToMins(b.start);
        let endMins=timeToMins(b.end); if(endMins<=startMins) endMins+=24*60;
        const durTotal=(DAY_END-DAY_START)*60;
        const leftPct=Math.max(0,(startMins-DAY_START*60)/durTotal*100);
        const widthPct=Math.max(0.5,Math.min(100-leftPct,(endMins-startMins)/durTotal*100));
        const el=document.createElement('div');
        el.className=`mini-block block-${b.type}`;
        el.style.left=leftPct+'%'; el.style.width=widthPct+'%';
        el.innerHTML=`<span style="font-size:9px;opacity:0.7">${b.start}</span> ${b.title}`;
        el.title=`${b.title} (${b.start}–${b.end})`;
        timeline.appendChild(el);
      });
    }

    // Now-line for today
    if(isToday){
      const now=new Date();
      const totalMins=now.getHours()*60+now.getMinutes();
      const pct=(totalMins/(DAY_END*60))*100;
      const nl=document.createElement('div'); nl.className='week-row-now-line';
      nl.style.left=pct+'%'; nl.id='weekNowLine_'+key;
      timeline.appendChild(nl);
    }

    const hint=document.createElement('div'); hint.className='week-zoom-hint'; hint.textContent='Tap to edit';
    blocksDiv.appendChild(timeline); blocksDiv.appendChild(hint);
    blocksDiv.addEventListener('click',()=>{ State.zoomedDay=key; showDayZoom(key); });
    row.appendChild(header); row.appendChild(blocksDiv);
    grid.appendChild(row);
  });

  // Update now-line every minute
  clearInterval(window._weekNowInterval);
  window._weekNowInterval=setInterval(()=>{
    allDays.forEach(day=>{
      if(dateStr(day)!==today)return;
      const nl=document.getElementById('weekNowLine_'+today); if(!nl)return;
      const now=new Date();
      const pct=(now.getHours()*60+now.getMinutes())/(24*60)*100;
      nl.style.left=pct+'%';
    });
  },60000);
}

function showDayZoom(key){
  $('weeklyView').style.display='none';
  $('monthlyView').style.display='none';
  $('dayZoomView').style.display='block';
  $('zoomBackBtn').style.display='inline-block';
  $('plannerNav').style.display='flex';
  $('plannerViewToggle').style.display='none';
  const d=new Date(key+'T12:00:00');
  $('dayZoomHeader').textContent=d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
  renderDayGrid(key);
  startNowLine(key);
  startBlockCountdownInterval();
}

// ── MONTH VIEW ──
function showMonthView(){
  $('weeklyView').style.display='none';
  $('dayZoomView').style.display='none';
  $('monthlyView').style.display='block';
  $('zoomBackBtn').style.display='none';
  $('plannerNav').style.display='none';
  const now=new Date();
  const baseMonth=new Date(now.getFullYear(), now.getMonth()+State.planner.weekOffset, 1);
  const y=baseMonth.getFullYear(), mo=baseMonth.getMonth();
  const dim=new Date(y,mo+1,0).getDate();
  const firstDow=(new Date(y,mo,1).getDay()+6)%7;
  $('plannerWeekLabel').textContent=baseMonth.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  const grid=$('monthlyPlannerGrid'); grid.innerHTML='';
  ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(d=>{
    const h=document.createElement('div'); h.className='month-hdr'; h.textContent=d; grid.appendChild(h);
  });
  for(let i=0;i<firstDow;i++){const e=document.createElement('div');e.className='month-cell empty';grid.appendChild(e);}
  const today=todayStr();
  const todayDate=new Date(); todayDate.setHours(0,0,0,0);
  for(let d=1;d<=dim;d++){
    const dateKey=`${y}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const blocks=State.planner.blocks[dateKey]||[];
    const isToday=dateKey===today;
    const cellDate=new Date(y,mo,d); cellDate.setHours(0,0,0,0);
    const isPast=cellDate<todayDate&&!isToday;
    const cell=document.createElement('div');
    cell.className=`month-cell${isToday?' is-today':''}${isPast?' is-past':''}`;
    cell.innerHTML=`<div class="month-cell-num">${d}</div>
      <div class="month-cell-blocks">${blocks.slice(0,3).map(b=>`<div class="month-mini-block block-${b.type}">${b.title}</div>`).join('')}${blocks.length>3?`<div class="month-more">+${blocks.length-3}</div>`:''}</div>`;
    cell.addEventListener('click',()=>{
      State.zoomedDay=dateKey;
      showDayZoom(dateKey);
    });
    grid.appendChild(cell);
  }
}

// Now line
let nowLineInterval=null;
function startNowLine(key){
  clearInterval(nowLineInterval);
  updateNowLine(key);
  nowLineInterval=setInterval(()=>updateNowLine(key),60000);
}
function updateNowLine(key){
  const existing=document.querySelector('.now-line');
  if(existing)existing.remove();
  if(key!==todayStr())return;
  const grid=$('dayZoomGrid'); if(!grid)return;
  const now=new Date();
  const totalMins=now.getHours()*60+now.getMinutes();
  // Use same pixel math as blocks: minutes -> pixels at ROW_H px/hour
  const topPx=(totalMins/60)*ROW_H;
  const line=document.createElement('div');
  line.className='now-line';
  // Place inside blockLayer if it exists, otherwise fall back to grid
  const blockLayer=grid.querySelector('.grid-block-layer')||grid;
  line.style.cssText='position:absolute;left:0;right:0;top:'+topPx+'px;';
  blockLayer.appendChild(line);
}


const GRID_START_HOUR=0, GRID_END_HOUR=24, ROW_H=60;
const LABEL_W=60; // px width of time-label column

function renderDayGrid(key){
  const blocks=State.planner.blocks[key]||[];
  const grid=$('dayZoomGrid'), today=todayStr();
  grid.innerHTML='';
  grid.style.position='relative';

  const totalH=(GRID_END_HOUR-GRID_START_HOUR)*ROW_H;

  // 1. Row layer: 24 time-rows with labels + drop slots
  const rowLayer=document.createElement('div');
  rowLayer.style.cssText='position:relative;width:100%;height:'+totalH+'px;flex-shrink:0;';
  for(let h=GRID_START_HOUR;h<GRID_END_HOUR;h++){
    const row=document.createElement('div'); row.className='time-row';
    const lbl=document.createElement('div'); lbl.className='time-label';
    if(h===0) lbl.textContent='12:00 AM';
    else if(h<12) lbl.textContent=h+':00 AM';
    else if(h===12) lbl.textContent='12:00 PM';
    else lbl.textContent=(h-12)+':00 PM';
    if(key===today&&new Date().getHours()===h) lbl.style.color='var(--accent)';
    const slot=document.createElement('div'); slot.className='time-slot';
    slot.dataset.hour=h;
    slot.addEventListener('dragover',e=>{ e.preventDefault(); slot.classList.add('drop-target'); });
    slot.addEventListener('dragleave',()=>slot.classList.remove('drop-target'));
    slot.addEventListener('drop',e=>{
      e.preventDefault(); slot.classList.remove('drop-target');
      const bid=e.dataTransfer.getData('bid'), dkey=e.dataTransfer.getData('key');
      moveBlock(dkey,bid,h,0,key);
    });
    row.appendChild(lbl); row.appendChild(slot); rowLayer.appendChild(row);
  }
  grid.appendChild(rowLayer);

  // 2. Block overlay: absolutely positioned layer spanning full grid height.
  //    All blocks are placed here so they are NEVER clipped by a row boundary.
  //    This fixes the 11 PM (and any late-hour) block stretching issue.
  const blockLayer=document.createElement('div');
  blockLayer.style.cssText='position:absolute;top:0;left:'+LABEL_W+'px;right:0;height:'+totalH+'px;pointer-events:none;z-index:2;';
  grid.appendChild(blockLayer);

  blocks.forEach(b=>{
    const startMins=timeToMins(b.start);
    let endMins=timeToMins(b.end);
    if(endMins<=startMins) endMins+=24*60; // wrap midnight (handles 00:00 end too)
    if(endMins<=startMins) endMins=startMins+30;
    const startH=Math.floor(startMins/60);
    if(startH<GRID_START_HOUR||startH>=GRID_END_HOUR)return;
    const durMins=Math.max(15,endMins-startMins);
    // Position is absolute minutes-from-midnight mapped to the full block layer
    const topPx=(startMins-GRID_START_HOUR*60)/60*ROW_H;
    // Clamp height so block never exceeds the grid boundary
    const maxHeightPx=(GRID_END_HOUR-GRID_START_HOUR)*ROW_H-topPx;
    const heightPx=Math.min(maxHeightPx, Math.max(22,durMins/60*ROW_H-2));
    const isDone=!!b.done;

    const el=document.createElement('div');
    el.className='time-block block-'+b.type+(isDone?' block-done':'');
    el.style.cssText='position:absolute;top:'+topPx+'px;height:'+heightPx+'px;left:4px;right:4px;pointer-events:all;';
    el.draggable=true;
    el.dataset.bid=b.id; el.dataset.key=key;

    const notePreview=b.note?`<div class="time-block-note-preview">${b.note.substring(0,40)}${b.note.length>40?'…':''}</div>`:'';
    const notePopover=b.note?`<div class="block-note-popover">${b.note}</div>`:'';
    if(b.note) el.classList.add('has-note');
    el.innerHTML=`
      <div class="time-block-header">
        <label class="block-done-wrap" title="${isDone?'Mark undone':'Mark done'}">
          <input type="checkbox" class="block-done-chk" ${isDone?'checked':''} onchange="toggleBlockDone('${key}','${b.id}',this.checked)" />
          <span class="block-done-box">${isDone?'✓':''}</span>
        </label>
        <span class="time-block-title${isDone?' done-title':''}">${b.title}</span>
        <span class="time-block-actions">
          <button class="block-action-btn edit-btn" title="Edit block" onclick="openEditBlockModal('${key}','${b.id}')">✎</button>
          <button class="block-action-btn" title="Edit note" onclick="openBlockNoteModal('${key}','${b.id}')">📝</button>
          <button class="block-action-btn" title="Delete" onclick="deleteBlock('${key}','${b.id}')">✕</button>
        </span>
      </div>
      <div class="time-block-time">${b.start}–${b.end}</div>
      ${notePreview}
      ${notePopover}
      <div class="block-countdown" data-start="${b.start}" data-end="${b.end}" data-day="${key}"></div>`;

    el.addEventListener('dragstart',e=>{
      e.dataTransfer.setData('bid',b.id); e.dataTransfer.setData('key',key);
      setTimeout(()=>el.classList.add('dragging'),0);
    });
    el.addEventListener('dragend',()=>el.classList.remove('dragging'));
    addTouchDrag(el,b,key,grid);
    blockLayer.appendChild(el);
  });

  setTimeout(()=>{ updateNowLine(key); updateBlockCountdowns(); checkAndPopulateInventory(); },50);
}
function toggleBlockDone(key, bid, checked){
  const blk=(State.planner.blocks[key]||[]).find(b=>b.id===bid); if(!blk)return;
  blk.done = checked;
  State.save(); renderDayGrid(key); renderInventory();
  if(checked){
    toast('Block marked done! ✓','success');
    // Award rank points for completing a block
    if(State.rankSystemEnabled){
      const blockTypePts={focus:10,study:8,creative:7,meeting:5,exercise:6,admin:3,break:1};
      const base=blockTypePts[blk.type]||4;
      let dur=timeToMins(blk.end)-timeToMins(blk.start); if(dur<=0) dur+=24*60;
      dur=Math.max(15,dur);
      // On-time bonus: block end hasn't passed yet (or today is the block day and within time)
      const now=new Date();
      const [y,m,d]=key.split('-').map(Number);
      const [eh,em]=blk.end.split(':').map(Number);
      const blockEnd=new Date(y,m-1,d,eh,em,0);
      const onTime=blockEnd>=now;
      const pts=Math.round(base*(dur/30))+(onTime?Math.round(base*0.5):0);
      addRankEvent(`${blk.title} block done${onTime?' ⚡ on time':''}`,pts);
    }
  } else {
    // Deduct points if unchecking
    if(State.rankSystemEnabled){
      const blockTypePts={focus:6,study:5,creative:4,meeting:3,exercise:4,admin:2,break:1};
      addRankEvent(`${blk.title} unchecked`,-Math.round((blockTypePts[blk.type]||3)*0.5));
    }
  }
}

// ── INVENTORY ──
function checkAndPopulateInventory(){
  renderInventory();
}

function renderInventory(){
  const inv=$('plannerInventory'), list=$('inventoryList'), cnt=$('inventoryCount');
  if(!inv||!list||!cnt)return;
  const now=new Date();
  const overdue=[];
  Object.entries(State.planner.blocks).forEach(([key,blocks])=>{
    const [y,m,d]=key.split('-').map(Number);
    blocks.forEach(b=>{
      if(b.done) return;
      const [sh,sm_]=b.start.split(':').map(Number);
      const [eh,em]=b.end.split(':').map(Number);
      const blockStart_=new Date(y,m-1,d,sh,sm_,0);
      let blockEnd=new Date(y,m-1,d,eh,em,0);
      if(blockEnd<=blockStart_) blockEnd=new Date(blockEnd.getTime()+24*60*60*1000);
      if(blockEnd < now) overdue.push({key,block:b,blockEnd});
    });
  });
  overdue.sort((a,b)=>b.blockEnd-a.blockEnd); // newest first
  if(!overdue.length){ inv.style.display='none'; return; }
  inv.style.display='block';
  cnt.textContent=overdue.length;
  list.innerHTML=overdue.map(({key,block})=>{
    const d=new Date(key+'T12:00:00');
    const dayLabel=d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
    return `<li class="inventory-item">
      <div class="inventory-item-info">
        <span class="inventory-item-title">${block.title}</span>
        <span class="inventory-item-meta">${dayLabel} · ${block.start}–${block.end}</span>
      </div>
      <div class="inventory-item-actions">
        <button class="inv-btn inv-reschedule" onclick="rescheduleInventoryBlock('${key}','${block.id}')">Reschedule</button>
        <button class="inv-btn inv-delete" onclick="deleteInventoryBlock('${key}','${block.id}')">Delete</button>
      </div>
    </li>`;
  }).join('');
}

function rescheduleInventoryBlock(key, bid){
  const blk=(State.planner.blocks[key]||[]).find(b=>b.id===bid); if(!blk)return;
  let dur=timeToMins(blk.end)-timeToMins(blk.start);
  if(dur<=0) dur+=24*60;
  dur=Math.max(15,dur);
  // Show reschedule modal
  showRescheduleModal(key, bid, blk, dur);
}

function showRescheduleModal(key, bid, blk, dur){
  // Create modal if not exists
  let modal=$('rescheduleModal');
  if(!modal){
    modal=document.createElement('div');
    modal.id='rescheduleModal';
    modal.className='modal-overlay';
    modal.innerHTML=`
      <div class="modal-box">
        <div class="modal-header">
          <span id="rescheduleModalTitle">Reschedule Block</span>
          <button class="modal-close" id="rescheduleModalClose">✕</button>
        </div>
        <div style="padding:8px 0 4px;font-family:var(--font-mono);font-size:11px;color:var(--text-muted);letter-spacing:1px">DATE</div>
        <input type="date" id="rescheduleDate" class="task-select" style="width:100%;margin-bottom:12px" />
        <div style="padding:8px 0 4px;font-family:var(--font-mono);font-size:11px;color:var(--text-muted);letter-spacing:1px">TIME</div>
        <input type="time" id="rescheduleTime" class="task-select bst-time-input" style="width:100%;margin-bottom:16px" />
        <div class="modal-footer">
          <button class="add-task-btn" id="rescheduleConfirm">Reschedule →</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    $('rescheduleModalClose').addEventListener('click',()=>{ modal.style.display='none'; });
    modal.addEventListener('click',e=>{ if(e.target===modal) modal.style.display='none'; });
  }
  // Pre-fill with today + next hour
  const now=new Date();
  $('rescheduleDate').value=todayStr();
  $('rescheduleTime').value=`${String(now.getHours()).padStart(2,'0')}:00`;
  modal.style.display='flex';
  // Set confirm action
  const confirmBtn=$('rescheduleConfirm');
  const newConfirm=confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirm,confirmBtn);
  newConfirm.addEventListener('click',()=>{
    const newDate=$('rescheduleDate').value;
    const newTime=$('rescheduleTime').value;
    if(!newDate||!newTime){toast('Please pick a date and time.','warn');return;}
    const [sh,sm]=newTime.split(':').map(Number);
    const newEnd=minsToTime(sh*60+sm+dur);
    // Remove from old day
    State.planner.blocks[key]=(State.planner.blocks[key]||[]).filter(b=>b.id!==bid);
    // Add to new day
    if(!State.planner.blocks[newDate]) State.planner.blocks[newDate]=[];
    State.planner.blocks[newDate].push({...blk, start:newTime, end:newEnd, done:false});
    State.save(); renderInventory();
    modal.style.display='none';
    toast(`Block rescheduled to ${newDate} at ${newTime}!`,'success');
    if(State.zoomedDay===newDate) renderDayGrid(newDate);
  });
}

function deleteInventoryBlock(key, bid){
  if(!State.planner.blocks[key])return;
  State.planner.blocks[key]=State.planner.blocks[key].filter(b=>b.id!==bid);
  State.save(); renderInventory();
  if(State.zoomedDay===key) renderDayGrid(key);
  toast('Block deleted.','normal');
}

// ── BLOCK COUNTDOWN TIMERS ──
let blockCountdownInterval=null;
function updateBlockCountdowns(){
  const countdowns=document.querySelectorAll('.block-countdown[data-start]');
  if(!countdowns.length)return;
  const now=new Date();
  countdowns.forEach(el=>{
    const dayKey=el.dataset.day;
    const startStr=el.dataset.start, endStr=el.dataset.end;
    const [sy,sm,sd]=dayKey.split('-').map(Number);
    const [sh,smin]=startStr.split(':').map(Number);
    const [eh,emin]=endStr.split(':').map(Number);
    const blockStart=new Date(sy,sm-1,sd,sh,smin,0);
    let blockEnd=new Date(sy,sm-1,sd,eh,emin,0);
    if(blockEnd<=blockStart) blockEnd=new Date(blockEnd.getTime()+24*60*60*1000);
    const diffStart=blockStart-now, diffEnd=blockEnd-now;
    if(diffEnd<0){
      el.className='block-countdown past';
      el.innerHTML=`<span class="block-countdown-dot"></span> Done`;
      // trigger inventory check when block expires
      renderInventory();
    } else if(diffStart<=0){
      el.className='block-countdown live';
      const remSecs=Math.floor(diffEnd/1000);
      const remH=Math.floor(remSecs/3600),remM=Math.floor((remSecs%3600)/60),remS=remSecs%60;
      el.innerHTML=`<span class="block-countdown-dot"></span> ${remH>0?`${remH}h ${remM}m left`:remM>0?`${remM}m ${remS}s left`:`${remS}s left`}`;
    } else if(diffStart<30*60*1000){
      el.className='block-countdown soon';
      const remSecs=Math.floor(diffStart/1000),remM=Math.floor(remSecs/60),remS=remSecs%60;
      el.innerHTML=`<span class="block-countdown-dot"></span> ${remM>0?`in ${remM}m ${remS}s`:`in ${remS}s`}`;
    } else {
      el.className='block-countdown upcoming';
      const remSecs=Math.floor(diffStart/1000),remH=Math.floor(remSecs/3600),remM=Math.floor((remSecs%3600)/60);
      el.innerHTML=`<span class="block-countdown-dot"></span> ${remH>0?`in ${remH}h ${remM}m`:`in ${remM}m`}`;
      const dot=el.querySelector('.block-countdown-dot');
      if(dot)dot.style.animation='none';
    }
  });
}
function startBlockCountdownInterval(){
  clearInterval(blockCountdownInterval);
  blockCountdownInterval=setInterval(updateBlockCountdowns,1000);
}

// Touch-based drag for mobile
function addTouchDrag(el, block, key, grid){
  let startY=0, origTop=0, isDragging=false;
  el.addEventListener('touchstart',e=>{
    startY=e.touches[0].clientY; origTop=parseInt(el.style.top)||0; isDragging=false;
  },{passive:true});
  el.addEventListener('touchmove',e=>{
    const dy=e.touches[0].clientY-startY;
    if(!isDragging&&Math.abs(dy)>8){isDragging=true;el.classList.add('dragging');}
    if(!isDragging)return;
    e.preventDefault();
    el.style.top=Math.max(0,origTop+dy)+'px';
  },{passive:false});
  el.addEventListener('touchend',e=>{
    if(!isDragging){
      el.classList.remove('dragging');
      // Tap on a block with a note — toggle the note popover
      if(block.note && el.classList.contains('has-note') && !e.target.closest('button') && !e.target.closest('input')){
        const isOpen=el.classList.contains('note-open');
        // Close any other open popovers first
        document.querySelectorAll('.time-block.note-open').forEach(b=>b.classList.remove('note-open'));
        if(!isOpen) el.classList.add('note-open');
      }
      return;
    }
    el.classList.remove('dragging');
    // top is absolute from midnight in pixels at ROW_H px/hour
    const newTop=Math.max(0,parseInt(el.style.top)||0);
    const newTotalMins=(newTop/ROW_H)*60;
    const newHour=Math.min(GRID_END_HOUR-1,Math.floor(newTotalMins/60));
    const newMin=Math.round(newTotalMins%60);
    moveBlock(key,block.id,newHour,newMin,key);
  });
}

function moveBlock(fromKey, bid, newHour, newMin, toKey){
  if(!State.planner.blocks[fromKey])return;
  const blk=State.planner.blocks[fromKey].find(b=>b.id===bid); if(!blk)return;
  let dur=timeToMins(blk.end)-timeToMins(blk.start);
  if(dur<=0) dur+=24*60; // handle midnight-crossing blocks
  const clampedHour=Math.max(GRID_START_HOUR,Math.min(GRID_END_HOUR-1,newHour));
  blk.start=`${String(clampedHour).padStart(2,'0')}:${String(newMin).padStart(2,'0')}`;
  blk.end=minsToTime(clampedHour*60+newMin+Math.max(15,dur));
  if(toKey!==fromKey){
    if(!State.planner.blocks[toKey])State.planner.blocks[toKey]=[];
    State.planner.blocks[toKey].push(blk);
    State.planner.blocks[fromKey]=State.planner.blocks[fromKey].filter(b=>b.id!==bid);
  }
  State.save(); renderDayGrid(toKey||fromKey);
}

function deleteBlock(key,id){
  if(!State.planner.blocks[key])return;
  const blk=State.planner.blocks[key].find(b=>b.id===id);
  if(blk){
    if(!State.blockTrash) State.blockTrash=[];
    State.blockTrash.unshift({...blk, _dateKey:key, deletedAt:Date.now()});
    if(State.blockTrash.length>100) State.blockTrash=State.blockTrash.slice(0,100);
    // Deduct rank points for deleted block
    if(!blk.done && State.rankSystemEnabled){
      const blockTypePts={focus:10,study:8,creative:7,meeting:5,exercise:6,admin:3,break:1};
      const pts=blockTypePts[blk.type]||4;
      addRankEvent(`Deleted ${blk.title}`, -Math.round(pts*0.5));
    }
  }
  State.planner.blocks[key]=State.planner.blocks[key].filter(b=>b.id!==id);
  State.save(); renderDayGrid(key); renderInventory(); updateBlockTrashBadge();
  toast('Block moved to trash 🗑','normal');
}

$('addBlockBtn').addEventListener('click',()=>{
  const title=$('blockTitle').value.trim();
  if(!title){toast('Please enter a block title.','warn');return;}
  const startVal=$('blockStartTime').value || '09:00';
  const [startH, startM] = startVal.split(':');
  const durMins=parseInt($('blockDuration').value);
  const start=`${startH}:${startM}`;
  const end=minsToTime(parseInt(startH)*60+parseInt(startM)+durMins);
  const type=$('blockType').value;
  const note=$('blockNote').value.trim();
  const key=State.zoomedDay||todayStr();
  if(!State.planner.blocks[key])State.planner.blocks[key]=[];
  State.planner.blocks[key].push({id:Date.now().toString(),title,start,end,type,note,done:false});
  $('blockTitle').value=''; $('blockNote').value='';
  State.save(); renderDayGrid(key); toast('Block added!','success');
  // Scroll to the newly added block
  setTimeout(()=>{
    const grid=$('dayZoomGrid'); if(!grid)return;
    const [sh,sm]=start.split(':').map(Number);
    const topPx=(sh*60+sm)/60*ROW_H;
    grid.scrollTo({top:Math.max(0,topPx-60),behavior:'smooth'});
    // Also scroll the main page to bring the grid into view on mobile
    const wrap=$('dayZoomView'); if(wrap) wrap.scrollIntoView({behavior:'smooth',block:'nearest'});
  },80);
});

// ── DURATION INPUT (free text, like start time) ──
let _durVal=60;
function parseDuration(str){
  // Accepts: "90", "90 min", "1h 30m", "1h30m", "1:30", "2h", "45m"
  str=str.trim().toLowerCase();
  let mins=0;
  const hm=str.match(/(\d+)\s*h(?:r|ours?)?\s*(\d+)?\s*m?/);
  const mOnly=str.match(/^(\d+)\s*m(?:in)?s?$/);
  const hOnly=str.match(/^(\d+)\s*h(?:r|ours?)?$/);
  const colon=str.match(/^(\d+):(\d{2})$/);
  const plain=str.match(/^(\d+)$/);
  if(hm){ mins=parseInt(hm[1])*60+(hm[2]?parseInt(hm[2]):0); }
  else if(mOnly){ mins=parseInt(mOnly[1]); }
  else if(hOnly){ mins=parseInt(hOnly[1])*60; }
  else if(colon){ mins=parseInt(colon[1])*60+parseInt(colon[2]); }
  else if(plain){ mins=parseInt(plain[1]); }
  return Math.max(1,Math.min(1440,mins||60));
}
function formatDur(m){
  const h=Math.floor(m/60),min=m%60;
  return h>0?(min>0?`${h}h ${min}m`:`${h}h`):`${min} min`;
}
function setDurVal(v){
  _durVal=Math.max(1,Math.min(1440,v));
  $('blockDuration').value=_durVal;
  const inp=$('blockDurationInput');
  if(inp) inp.value=formatDur(_durVal);
}
setDurVal(60);
// Bind the text input
const _durInp=$('blockDurationInput');
if(_durInp){
  _durInp.addEventListener('change',()=>{
    const parsed=parseDuration(_durInp.value);
    setDurVal(parsed);
  });
  _durInp.addEventListener('blur',()=>{
    const parsed=parseDuration(_durInp.value);
    setDurVal(parsed);
  });
  _durInp.addEventListener('keydown',e=>{
    if(e.key==='Enter'){const parsed=parseDuration(_durInp.value);setDurVal(parsed);_durInp.blur();}
  });
}

// ── EDIT BLOCK MODAL ──
let _editKey=null, _editBid=null;
function openEditBlockModal(key,bid){
  _editKey=key; _editBid=bid;
  const blk=(State.planner.blocks[key]||[]).find(b=>b.id===bid); if(!blk)return;
  $('editBlockTitle').value=blk.title||'';
  $('editBlockStart').value=blk.start||'09:00';
  // Compute duration in minutes and show in friendly form
  let dur=timeToMins(blk.end)-timeToMins(blk.start); if(dur<=0) dur+=24*60;
  $('editBlockDurationInput').value=formatDur(Math.max(1,dur));
  $('editBlockType').value=blk.type||'focus';
  $('editBlockNote').value=blk.note||'';
  $('editBlockModal').style.display='flex';
}
$('editBlockModalClose').addEventListener('click',()=>{ $('editBlockModal').style.display='none'; _editKey=_editBid=null; });
$('editBlockModal').addEventListener('click',e=>{ if(e.target===$('editBlockModal'))$('editBlockModal').style.display='none'; });
$('editBlockSave').addEventListener('click',()=>{
  if(!_editKey||!_editBid)return;
  const blk=(State.planner.blocks[_editKey]||[]).find(b=>b.id===_editBid); if(!blk)return;
  blk.title=$('editBlockTitle').value.trim()||blk.title;
  blk.start=$('editBlockStart').value||blk.start;
  const dur=parseDuration($('editBlockDurationInput').value);
  const [sh,sm]=blk.start.split(':').map(Number);
  blk.end=minsToTime(sh*60+sm+dur);
  blk.type=$('editBlockType').value;
  blk.note=$('editBlockNote').value;
  State.save(); renderDayGrid(_editKey);
  $('editBlockModal').style.display='none'; toast('Block updated!','success');
});

// ── BLOCK NOTE MODAL ──
let _modalKey=null, _modalBid=null;
function openBlockNoteModal(key,bid){
  _modalKey=key; _modalBid=bid;
  const blk=(State.planner.blocks[key]||[]).find(b=>b.id===bid); if(!blk)return;
  $('modalBlockTitle').textContent=blk.title;
  $('modalNoteBody').value=blk.note||'';
  $('blockNoteModal').style.display='flex';
  setTimeout(()=>$('modalNoteBody').focus(),100);
}
$('modalClose').addEventListener('click',()=>{ $('blockNoteModal').style.display='none'; _modalKey=_modalBid=null; });
$('modalSave').addEventListener('click',()=>{
  if(!_modalKey||!_modalBid)return;
  const blk=(State.planner.blocks[_modalKey]||[]).find(b=>b.id===_modalBid); if(!blk)return;
  blk.note=$('modalNoteBody').value;
  State.save(); renderDayGrid(_modalKey);
  $('blockNoteModal').style.display='none'; toast('Note saved!','success');
});
$('blockNoteModal').addEventListener('click',e=>{ if(e.target===$('blockNoteModal'))$('blockNoteModal').style.display='none'; });

// ── STATS ──
$$('.range-tab').forEach(t=>t.addEventListener('click',()=>{
  $$('.range-tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
  State.statsRange=t.dataset.range; updateStats();
}));

const achievements=[
  {id:'first_session',icon:'⚡',name:'First Session',max:1,val:s=>Math.min(1,s.totalPomodoros)},
  {id:'ten_sessions',icon:'🔟',name:'10 Sessions',max:10,val:s=>Math.min(10,s.totalPomodoros)},
  {id:'fifty_sessions',icon:'💯',name:'50 Sessions',max:50,val:s=>Math.min(50,s.totalPomodoros)},
  {id:'streak_3',icon:'🔥',name:'3-Day Streak',max:3,val:s=>Math.min(3,s.bestStreak)},
  {id:'streak_7',icon:'⚡',name:'Week Warrior',max:7,val:s=>Math.min(7,s.bestStreak)},
  {id:'streak_30',icon:'🏆',name:'Iron Focus',max:30,val:s=>Math.min(30,s.bestStreak)},
];

function updateStats(){
  const s=State.stats, tasks=State.tasks;
  $('totalFocusHours').textContent=(Object.values(s.focusMinutesByDay).reduce((a,b)=>a+b,0)/60).toFixed(1)+'h';
  $('totalPomodoros').textContent=s.totalPomodoros;
  $('totalTasksDone').textContent=Math.max(tasks.filter(t=>t.done).length, State.stats.doneOnTimeTasks.length);
  $('bestStreak').textContent=s.bestStreak;
  const isMonth=State.statsRange==='month';
  let days;
  const todayKey=todayStr();
  if(isMonth){
    const now=new Date(),y=now.getFullYear(),mo=now.getMonth(),dim=new Date(y,mo+1,0).getDate();
    days=Array.from({length:dim},(_,i)=>{const d=new Date(y,mo,i+1);return{key:dateStr(d),label:String(i+1)};})
         .filter(d=>d.key<=todayKey);
  } else {
    days=getWeekDays(0).map((k,i)=>({key:k,label:['M','T','W','T','F','S','S'][i]}));
  }
  $('barChartLabel').textContent=`Daily Focus (${isMonth?'this month':'this week'}, minutes)`;
  $('lineGraphLabel').textContent=`Focus Trend (${isMonth?'month':'week'})`;

  // Bar chart
  const today=todayStr(), maxM=Math.max(1,...days.map(d=>s.focusMinutesByDay[d.key]||0));
  $('statsWeekChart').innerHTML=days.map(d=>{
    const m=s.focusMinutesByDay[d.key]||0,pct=Math.min(110,(m/maxM)*110);
    return `<div class="bar-chart-col">
      <div class="bar-chart-bar${d.key===today?' highlight':''}" style="height:${Math.max(4,pct)}px"></div>
      <div class="bar-chart-label">${d.label}</div>
      <div class="bar-chart-val">${m>0?m+'m':''}</div>
    </div>`;
  }).join('');

  // ── Line chart with animated canvas draw ──
  drawLineGraph(days, s);

  // ── Pie chart with animated fill ──
  drawPieChart(tasks);

  // Breakdown
  const cats=['work','study','personal','health','creative','finance','reading','project'];
  const counts={}; cats.forEach(c=>counts[c]=tasks.filter(t=>t.category===c).length);
  const maxC=Math.max(1,...Object.values(counts));
  const colors={work:'var(--blue)',study:'var(--purple)',personal:'var(--green)',health:'var(--red)',creative:'#b87fe8',finance:'#6dd490',reading:'var(--orange)',project:'#f07878'};
  $('breakdownList').innerHTML=cats.filter(c=>counts[c]>0).map(c=>`
    <div class="breakdown-item">
      <div class="breakdown-header"><span style="text-transform:capitalize">${c}</span><span>${counts[c]}</span></div>
      <div class="breakdown-bar"><div class="breakdown-fill" style="width:${(counts[c]/maxC*100).toFixed(0)}%;background:${colors[c]}"></div></div>
    </div>`).join('')||'<p style="color:var(--text-muted);font-size:13px;font-style:italic">Add tasks to see breakdown</p>';

  // Efficiency — unbounded score based on quality of work
  const priorityPts={critical:20,high:12,medium:7,low:4,someday:2};
  const taskPts=tasks.filter(t=>t.done).reduce((sum,t)=>{
    const base=priorityPts[t.priority]||5;
    const onTime=State.stats.doneOnTimeTasks.some(r=>r.id===t.id);
    return sum+base+(onTime?Math.round(base*0.5):0);
  },0);
  const avgFocusMins = s.totalPomodoros > 0
    ? Object.values(s.focusMinutesByDay||{}).reduce((a,b)=>a+b,0) / Math.max(1, s.totalPomodoros)
    : (State.pomo.durations.pomoDuration||25);
  const sessionPts = Math.round(s.totalPomodoros * Math.max(5, avgFocusMins * 0.6));
  const blockTypePts={focus:10,study:8,creative:7,meeting:5,exercise:6,admin:3,break:1};
  const blockPts=Object.values(State.planner.blocks||{}).flat().filter(b=>b.done).reduce((sum,b)=>{
    const base=blockTypePts[b.type]||4;
    const durMins=b.end&&b.start?(()=>{let s=timeToMins(b.start),e=timeToMins(b.end);if(e<=s)e+=24*60;return Math.max(15,e-s);})():30;
    return sum+Math.round(base*(durMins/30));
  },0);
  const streakPts=Math.round(s.currentStreak*3);
  const score=taskPts+sessionPts+blockPts+streakPts;
  const ringMax=500;
  const circ=2*Math.PI*80;
  const fillPct=Math.min(1,score/ringMax);
  $('effProgress').style.strokeDashoffset=circ-(circ*fillPct);
  $('efficiencyValue').textContent=score>0?score:'—';
  const descs={0:'Complete tasks and sessions to build your score.',50:'Good start! Keep the momentum going.',150:"Nice progress. You're building solid habits.",300:"Strong performance. Your focus is sharpening.",500:"Excellent! You're operating at a high level.",800:"Elite. You've mastered time and focus.",1200:"Legendary. Exceptional consistency and output."};
  const dk=Object.keys(descs).map(Number).filter(k=>score>=k).pop()||0;
  const breakdown=`${taskPts} tasks · ${sessionPts} sessions · ${blockPts} blocks · ${streakPts} streak`;
  $('efficiencyDesc').innerHTML=descs[dk]+'<br><span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);letter-spacing:0.5px">'+breakdown+'</span>';

  // Achievements with progress bars
  $('achievementsGrid').innerHTML=achievements.map(a=>{
    const cur=a.val(s),pct=Math.round((cur/a.max)*100),done=cur>=a.max;
    return `<div class="achievement ${done?'unlocked':'locked'}">
      <div class="achievement-icon">${a.icon}</div>
      <div class="achievement-name">${a.name}</div>
      <div class="achievement-progress-bar"><div class="achievement-progress-fill" style="width:${pct}%"></div></div>
      <div class="achievement-progress-text">${cur} / ${a.max}</div>
    </div>`;
  }).join('');

  updateRankCard();

  // ── Mobile scroll-reveal: observe off-screen stats cards ──
  if(window.innerWidth <= 768){
    setupStatsScrollReveal();
  }
}

// ── MOBILE: Scroll-reveal for off-screen stats cards ──
let _statsRevealObserver = null;
function setupStatsScrollReveal(){
  // Disconnect previous observer to avoid duplication
  if(_statsRevealObserver){ _statsRevealObserver.disconnect(); _statsRevealObserver=null; }

  const statsSection=$('stats');
  if(!statsSection) return;

  const cards = Array.from(statsSection.querySelectorAll('.card'));

  // Reset reveal state so re-entering stats page re-triggers animations
  cards.forEach(c=>{
    c.classList.remove('stats-scroll-reveal','revealed');
  });

  // Give browser a frame to settle layout, then check which cards are in viewport
  requestAnimationFrame(()=>{
    const viewH = window.innerHeight;

    cards.forEach(c=>{
      const rect = c.getBoundingClientRect();
      const inView = rect.top < viewH - 20 && rect.bottom > 0;
      if(inView){
        // Card is already visible — reveal immediately, no animation lock
        c.classList.add('revealed');
      } else {
        // Card is below (or above) fold — hide and wait for scroll
        c.classList.add('stats-scroll-reveal');
      }
    });

    const toReveal = cards.filter(c=>c.classList.contains('stats-scroll-reveal'));
    if(!toReveal.length) return;

    _statsRevealObserver = new IntersectionObserver((entries)=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          const el = entry.target;
          const idx = toReveal.indexOf(el);
          setTimeout(()=>{
            el.classList.remove('stats-scroll-reveal');
            el.classList.add('revealed');
            // If this is the line-graph card, trigger chart draw after reveal
            if(el.classList.contains('line-graph-card')){
              const isMonth=State.statsRange==='month';
              const todayKey2=todayStr();
              let days2;
              if(isMonth){
                const now=new Date(),y=now.getFullYear(),mo=now.getMonth(),dim=new Date(y,mo+1,0).getDate();
                days2=Array.from({length:dim},(_,i)=>{const d=new Date(y,mo,i+1);return{key:dateStr(d),label:String(i+1)};}).filter(d=>d.key<=todayKey2);
              } else {
                days2=getWeekDays(0).map((k,i)=>({key:k,label:['M','T','W','T','F','S','S'][i]}));
              }
              drawLineGraph(days2, State.stats);
            }
            if(el.classList.contains('pie-chart-card')){
              drawPieChart(State.tasks);
            }
          }, Math.max(0, idx) * 80); // stagger based on order among hidden cards
          _statsRevealObserver.unobserve(el);
        }
      });
    },{ threshold:0.08, rootMargin:'0px 0px -30px 0px' });

    toReveal.forEach(c=>_statsRevealObserver.observe(c));
  });
}

// ── LINE GRAPH — animated draw (device-pixel-ratio aware) ──
function drawLineGraph(days, s) {
  const canvas = $('focusLineChart'); if (!canvas) return;
  const container = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const cssW = container.getBoundingClientRect().width || container.clientWidth || 600;
  const cssH = container.getBoundingClientRect().height || 160;
  canvas.width  = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  const vals = days.map(d => s.focusMinutesByDay[d.key] || 0);
  const maxV = Math.max(1, ...vals);
  const pad  = { l:36, r:12, t:14, b:26 };
  const gw   = cssW - pad.l - pad.r;
  const gh   = cssH - pad.t - pad.b;
  const n    = vals.length;

  const isDark      = !document.body.classList.contains('light-mode');
  const gridColor   = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const labelColor  = isDark ? 'rgba(255,255,255,0.3)'  : 'rgba(0,0,0,0.35)';

  // Grid lines + Y labels (drawn immediately — static chrome)
  function drawGrid() {
    ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
    [0, 0.25, 0.5, 0.75, 1].forEach(f => {
      const y = pad.t + gh * (1 - f);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(cssW - pad.r, y); ctx.stroke();
      if (f > 0) {
        ctx.fillStyle = labelColor; ctx.font = '10px JetBrains Mono';
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(maxV * f) + 'm', pad.l - 4, y + 4);
      }
    });
    // X labels
    ctx.fillStyle = labelColor; ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'center';
    days.forEach((d, i) => {
      if (n <= 14 || i % (Math.ceil(n / 8)) === 0)
        ctx.fillText(d.label, xOf(i), cssH - 4);
    });
  }

  if (n < 2) {
    ctx.fillStyle = labelColor; ctx.font = '13px Cormorant Garamond'; ctx.textAlign = 'center';
    ctx.fillText('No data yet — complete some sessions', cssW / 2, cssH / 2); return;
  }

  const xOf = i => pad.l + (n === 1 ? gw / 2 : i / (n - 1) * gw);
  const yOf = v => pad.t + gh * (1 - v / maxV);

  const todayKeyLG  = todayStr();
  const lastDataIdx = days.reduce((last, d, i) => (vals[i] > 0 || d.key <= todayKeyLG ? i : last), 0);

  drawGrid();

  // ── Animated draw ──
  const DURATION = 900; // ms
  const startTime = performance.now();

  function frame(now) {
    const t = Math.min(1, (now - startTime) / DURATION);
    // ease-out cubic
    const ease = 1 - Math.pow(1 - t, 3);

    ctx.clearRect(0, 0, cssW, cssH);
    drawGrid();

    // Area fill — reveal left-to-right using clip
    const revealX = pad.l + gw * ease;
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.l, 0, revealX - pad.l, cssH);
    ctx.clip();

    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(vals[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(xOf(i), yOf(vals[i]));
    ctx.lineTo(xOf(n - 1), pad.t + gh);
    ctx.lineTo(xOf(0), pad.t + gh);
    ctx.closePath();
    const areaGrad = ctx.createLinearGradient(0, pad.t, 0, pad.t + gh);
    areaGrad.addColorStop(0, 'rgba(232,168,64,0.12)');
    areaGrad.addColorStop(1, 'rgba(232,168,64,0)');
    ctx.fillStyle = areaGrad; ctx.fill();

    // Colored segments
    for (let i = 1; i < n; i++) {
      if (i > lastDataIdx) break;
      const x0 = xOf(i-1), y0 = yOf(vals[i-1]), x1 = xOf(i), y1 = yOf(vals[i]);
      // partially draw the last segment within clip
      const diff  = vals[i] - vals[i-1];
      const color = diff > 0 ? '#00e676' : diff < 0 ? '#ff3d3d' : '#7a7d8e';
      ctx.save(); ctx.strokeStyle = color + '55'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.restore();
    }

    ctx.restore(); // remove clip

    // Dots — only up to the revealed point
    const bgColor = isDark ? '#181b24' : '#ffffff';
    vals.forEach((v, i) => {
      if (i > lastDataIdx && v === 0) return;
      if (xOf(i) > revealX + 6) return; // hide future dots
      const x = xOf(i), y = yOf(v);
      const prev  = i > 0 ? vals[i-1] : v, diff = v - prev;
      const color = diff > 0 ? '#00e676' : diff < 0 ? '#ff3d3d' : '#8b8fa8';
      // Scale dot in as the line reaches it
      const dotT  = Math.max(0, Math.min(1, (revealX - x) / 20));
      const dotR  = 3.5 * dotT;
      if (dotR < 0.5) return;
      ctx.beginPath(); ctx.arc(x, y, dotR + 1.5, 0, Math.PI * 2); ctx.fillStyle = bgColor; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, dotR, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, dotR, 0, Math.PI * 2);
      ctx.strokeStyle = color + '88'; ctx.lineWidth = 3; ctx.stroke();
    });

    if (t < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

// ── PIE CHART — animated slice sweep ──
function drawPieChart(tasks) {
  const svg = $('taskPieChart'); if (!svg) return;
  const today = todayStr();
  auditMissedTasks();
  const persistentDone   = State.stats.doneOnTimeTasks.length;
  const persistentMissed = State.stats.missedTasks.length;
  const liveDone  = tasks.filter(t => (t.done || t.status === 'done') && !State.stats.doneOnTimeTasks.some(r => r.id === t.id)).length;
  const pending   = tasks.filter(t => !t.done && t.status !== 'done' && (!t.due || t.due >= today)).length;
  const onTime    = persistentDone + liveDone;
  const missed    = persistentMissed;
  const total     = onTime + missed + pending;
  const pieStats  = $('pieChartStats');

  if (total === 0) {
    svg.innerHTML = `<circle cx="80" cy="80" r="48" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="22"/>
      <text x="80" y="86" text-anchor="middle" font-family="var(--font-mono)" font-size="11" fill="var(--text-muted)">No tasks</text>`;
    if (pieStats) pieStats.textContent = '';
    return;
  }

  // Build slices
  const allSlices = [
    { val: onTime,  color: '#4dd87a', label: 'On Time' },
    { val: missed,  color: '#ff5a53', label: 'Missed'  },
    { val: pending, color: 'var(--text-muted)', label: 'Pending' },
  ].filter(s => s.val > 0);

  const cx = 80, cy = 80, r = 48, strokeW = 22;
  const circumference = 2 * Math.PI * r; // ≈ 301.6
  const totalVal = allSlices.reduce((a, s) => a + s.val, 0);
  const GAP_DEG  = 3; // degrees of gap between slices
  const GAP_FRAC = GAP_DEG / 360;

  // Pre-compute each slice's offset/length in stroke-dash units
  const sliceMeta = [];
  let cumFrac = 0;
  allSlices.forEach((slice, idx) => {
    const frac   = slice.val / totalVal;
    const dash   = Math.max(0, (frac - GAP_FRAC) * circumference);
    const offset = circumference * (1 - cumFrac); // SVG: circle starts at 3 o'clock, we rotate -90°
    sliceMeta.push({ ...slice, frac, dash, offset, fullDash: dash });
    cumFrac += frac;
  });

  // Center text
  const pct = Math.round(onTime / total * 100);

  // Render skeleton first — a single dimmed ring
  svg.innerHTML = `
    <g transform="rotate(-90 ${cx} ${cy})">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
        stroke="rgba(255,255,255,0.06)" stroke-width="${strokeW}"/>
    </g>
    <circle cx="${cx}" cy="${cy}" r="${r - strokeW/2 - 2}" fill="var(--bg-card)"/>
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-family="var(--font-mono)"
      font-size="18" font-weight="300" fill="var(--text-primary)" opacity="0">${pct}%</text>
    <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-family="var(--font-mono)"
      font-size="9" fill="var(--text-muted)" letter-spacing="1" opacity="0">ON TIME</text>`;

  // Animate — one continuous sweep around the ring, slices fill in sequence
  const TOTAL_DUR = 900; // ms total animation
  const start = performance.now();

  // Pre-compute cumulative fraction thresholds for each slice
  // so the sweep hand passes through each slice in order
  let cumFracAnim = 0;
  const sliceThresholds = sliceMeta.map(sm => {
    const start_t = cumFracAnim;
    cumFracAnim += sm.frac;
    return { start_t, end_t: cumFracAnim };
  });

  function animatePie(now) {
    const rawT  = Math.min(1, (now - start) / TOTAL_DUR);
    // ease-out cubic applied to the sweep progress
    const sweepProgress = 1 - Math.pow(1 - rawT, 3);

    let paths = `<g transform="rotate(-90 ${cx} ${cy})">`;
    // Background ring
    paths += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
      stroke="rgba(255,255,255,0.06)" stroke-width="${strokeW}"/>`;

    sliceMeta.forEach((sm, idx) => {
      const thresh = sliceThresholds[idx];
      // How much of this slice has the sweep hand revealed?
      // sweepProgress goes 0→1 over the whole circumference
      const sliceProgress = Math.min(1, Math.max(0,
        (sweepProgress - thresh.start_t) / (thresh.end_t - thresh.start_t)
      ));
      const currentDash = sm.fullDash * sliceProgress;
      const gap = Math.max(0, circumference - currentDash);

      paths += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
        stroke="${sm.color}" stroke-width="${strokeW}" opacity="0.92"
        stroke-dasharray="${currentDash} ${gap}"
        stroke-dashoffset="${sm.offset}"
        stroke-linecap="butt"/>`;
    });

    paths += `</g>`;
    // Donut hole
    paths += `<circle cx="${cx}" cy="${cy}" r="${r - strokeW/2 - 1}" fill="var(--bg-card)"/>`;
    // Center text fades in after 70%
    const textOpacity = Math.max(0, (rawT - 0.7) / 0.3);
    paths += `<text x="${cx}" y="${cy - 6}" text-anchor="middle" font-family="var(--font-mono)"
      font-size="18" font-weight="300" fill="var(--text-primary)" opacity="${textOpacity}">${pct}%</text>
      <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-family="var(--font-mono)"
      font-size="9" fill="var(--text-muted)" letter-spacing="1" opacity="${textOpacity}">ON TIME</text>`;

    svg.innerHTML = paths;

    if (rawT < 1) requestAnimationFrame(animatePie);
    else if (pieStats) pieStats.textContent = `${onTime} done · ${missed} missed · ${pending} pending`;
  }

  requestAnimationFrame(animatePie);
}

window.addEventListener('resize',()=>{
  if(document.getElementById('stats').classList.contains('active')) updateStats();
});

// ── NOTES ──
let noteAutoSave=null;

function renderNotesList(){
  const search=$('noteSearch').value.toLowerCase();
  const list=$('notesList');
  let notes=[...State.notes];
  if(search)notes=notes.filter(n=>(n.title||'').toLowerCase().includes(search)||(n.body||'').toLowerCase().includes(search));
  if(!search) notes.sort((a,b)=>(a._order!==undefined&&b._order!==undefined)?a._order-b._order:(b.updated||0)-(a.updated||0));
  else notes.sort((a,b)=>(b.updated||0)-(a.updated||0));
  if(!notes.length){list.innerHTML=`<li class="notes-list-empty">${search?'No notes match.':'No notes yet.'}</li>`;return;}
  list.innerHTML=notes.map(n=>`
    <li class="note-list-item${n.id===State.activeNoteId?' active':''}" data-color="${n.color||'default'}" data-id="${n.id}" draggable="true">
      <div class="note-list-drag-handle" title="Drag to reorder">⠿</div>
      <div class="note-list-body" onclick="openNote(${n.id})">
        <div class="note-list-title">${n.title||'Untitled'}</div>
        <div class="note-list-preview">${(n.body||'').substring(0,55)||'Empty note...'}</div>
        <div class="note-list-meta">${n.category||'general'} · ${new Date(n.updated||Date.now()).toLocaleDateString()}</div>
      </div>
      <div class="note-list-actions">
        <button class="note-list-edit-btn" title="Edit" onclick="event.stopPropagation();openNote(${n.id})">✎</button>
        <button class="note-list-del-btn" title="Delete" onclick="event.stopPropagation();deleteNoteById(${n.id})">✕</button>
      </div>
    </li>`).join('');
  setupNoteDrag();
}

function openNote(id){
  const note=State.notes.find(n=>n.id===id); if(!note)return;
  State.activeNoteId=id;
  $('notesEmpty').style.display='none'; $('notesEditor').style.display='flex';
  $('noteTitleInput').value=note.title||'';
  $('noteBody').value=note.body||'';
  $('noteCategory').value=note.category||'general';
  // Apply color
  const color=note.color||'default';
  $('notesEditor').closest('.notes-editor-wrap').setAttribute('data-color',color);
  $$('.note-color-pill').forEach(d=>{d.classList.toggle('active',d.dataset.color===color);});
  updateNoteWordCount(); updateNoteSaved(note.updated); renderNotesList();
}

function saveCurrentNote(){
  if(!State.activeNoteId)return;
  const note=State.notes.find(n=>n.id===State.activeNoteId); if(!note)return;
  note.title=$('noteTitleInput').value||'Untitled';
  note.body=$('noteBody').value;
  note.category=$('noteCategory').value;
  note.updated=Date.now();
  State.save(); updateNoteSaved(note.updated); renderNotesList();
}
function updateNoteWordCount(){
  const words=($('noteBody').value.match(/\S+/g)||[]).length;
  $('noteWordCount').textContent=`${words} word${words!==1?'s':''}`;
}
function updateNoteSaved(ts){
  $('noteLastSaved').textContent=ts?`Saved ${new Date(ts).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}`:'Not saved';
}

function deleteNoteById(id){
  const note=State.notes.find(n=>n.id===id);
  if(note){
    if(!State.noteTrash) State.noteTrash=[];
    State.noteTrash.unshift({...note, deletedAt:Date.now()});
    if(State.noteTrash.length>100) State.noteTrash=State.noteTrash.slice(0,100);
  }
  if(State.activeNoteId===id){
    State.activeNoteId=null;
    $('notesEmpty').style.display='flex'; $('notesEditor').style.display='none';
  }
  State.notes=State.notes.filter(n=>n.id!==id);
  State.save(); renderNotesList(); updateNotesTrashBadge();
  toast('Note moved to trash 🗑','normal');
}

// ── TRASH ──
function updateTasksTrashBadge(){
  const cnt=(State.taskTrash||[]).length;
  const badge=$('tasksTrashCount'); if(!badge)return;
  badge.textContent=cnt; badge.style.display=cnt>0?'inline':'none';
}
function updateNotesTrashBadge(){
  // Notes trash button has no badge currently, can add later
}
function openTasksTrash(){
  const modal=$('tasksTrashModal'); if(!modal)return;
  const list=$('tasksTrashList');
  const items=State.taskTrash||[];
  if(!items.length){ list.innerHTML='<li class="trash-empty-state">Trash is empty.</li>'; }
  else {
    list.innerHTML=items.map(t=>`
      <li class="trash-item">
        <div class="trash-item-info">
          <div class="trash-item-name">${t.name}</div>
          <div class="trash-item-meta">${t.category||'—'} · ${t.priority||'—'} · deleted ${new Date(t.deletedAt||Date.now()).toLocaleDateString()}</div>
        </div>
        <div class="trash-item-actions">
          <button class="trash-restore-btn" onclick="restoreTask(${t.id})">↩ Restore</button>
          <button class="trash-perm-del-btn" onclick="permDeleteTask(${t.id})">✕</button>
        </div>
      </li>`).join('');
  }
  modal.style.display='flex';
}
function closeTasksTrash(){ $('tasksTrashModal').style.display='none'; }
function restoreTask(id){
  const t=(State.taskTrash||[]).find(t=>t.id===id); if(!t)return;
  State.taskTrash=State.taskTrash.filter(t=>t.id!==id);
  delete t.deletedAt;
  State.tasks.unshift(t);
  State.save(); renderTaskList(); updateTasksTrashBadge(); openTasksTrash();
  toast('Task restored ✓','success');
}
function permDeleteTask(id){
  State.taskTrash=(State.taskTrash||[]).filter(t=>t.id!==id);
  State.save(); updateTasksTrashBadge(); openTasksTrash();
}
function emptyTasksTrash(){
  if(!(State.taskTrash||[]).length) return;
  if(!confirm('Permanently delete all trashed tasks? This cannot be undone.')) return;
  State.taskTrash=[];
  State.save(); updateTasksTrashBadge(); openTasksTrash();
  toast('Trash emptied','normal');
}

function openNotesTrash(){
  const modal=$('notesTrashModal'); if(!modal)return;
  const list=$('notesTrashList');
  const items=State.noteTrash||[];
  if(!items.length){ list.innerHTML='<li class="trash-empty-state">Trash is empty.</li>'; }
  else {
    list.innerHTML=items.map(n=>`
      <li class="trash-item">
        <div class="trash-item-info">
          <div class="trash-item-name">${n.title||'Untitled'}</div>
          <div class="trash-item-meta">${n.category||'general'} · deleted ${new Date(n.deletedAt||Date.now()).toLocaleDateString()}</div>
        </div>
        <div class="trash-item-actions">
          <button class="trash-restore-btn" onclick="restoreNote(${n.id})">↩ Restore</button>
          <button class="trash-perm-del-btn" onclick="permDeleteNote(${n.id})">✕</button>
        </div>
      </li>`).join('');
  }
  modal.style.display='flex';
}
function closeNotesTrash(){ $('notesTrashModal').style.display='none'; }
function restoreNote(id){
  const n=(State.noteTrash||[]).find(n=>n.id===id); if(!n)return;
  State.noteTrash=State.noteTrash.filter(n=>n.id!==id);
  delete n.deletedAt;
  State.notes.unshift(n);
  State.save(); renderNotesList(); openNotesTrash();
  toast('Note restored ✓','success');
}
function permDeleteNote(id){
  State.noteTrash=(State.noteTrash||[]).filter(n=>n.id!==id);
  State.save(); openNotesTrash();
}
function emptyNotesTrash(){
  if(!(State.noteTrash||[]).length) return;
  if(!confirm('Permanently delete all trashed notes? This cannot be undone.')) return;
  State.noteTrash=[];
  State.save(); openNotesTrash();
  toast('Trash emptied','normal');
}

// Wire up trash buttons
document.addEventListener('DOMContentLoaded',()=>{
  const tTaskBtn=$('tasksTrashBtn'); if(tTaskBtn) tTaskBtn.addEventListener('click',openTasksTrash);
  const tNoteBtn=$('notesTrashBtn'); if(tNoteBtn) tNoteBtn.addEventListener('click',openNotesTrash);
  const cTaskBtn=$('tasksTrashModalClose'); if(cTaskBtn) cTaskBtn.addEventListener('click',closeTasksTrash);
  const cNoteBtn=$('notesTrashModalClose'); if(cNoteBtn) cNoteBtn.addEventListener('click',closeNotesTrash);
  const eTaskBtn=$('emptyTasksTrashBtn'); if(eTaskBtn) eTaskBtn.addEventListener('click',emptyTasksTrash);
  const eNoteBtn=$('emptyNotesTrashBtn'); if(eNoteBtn) eNoteBtn.addEventListener('click',emptyNotesTrash);
  // Close on backdrop click
  const tTaskModal=$('tasksTrashModal'); if(tTaskModal) tTaskModal.addEventListener('click',e=>{if(e.target===tTaskModal)closeTasksTrash();});
  const tNoteModal=$('notesTrashModal'); if(tNoteModal) tNoteModal.addEventListener('click',e=>{if(e.target===tNoteModal)closeNotesTrash();});
  updateTasksTrashBadge();
});

$('addNoteBtn').addEventListener('click',()=>{
  const note={id:Date.now(),title:'New Note',body:'',category:'general',color:'default',created:Date.now(),updated:Date.now()};
  State.notes.unshift(note); State.save(); openNote(note.id); renderNotesList();
});
$('deleteNoteBtn').addEventListener('click',()=>{
  if(!State.activeNoteId)return;
  deleteNoteById(State.activeNoteId);
});
$('noteTitleInput').addEventListener('input',()=>{clearTimeout(noteAutoSave);noteAutoSave=setTimeout(saveCurrentNote,800);});
$('noteBody').addEventListener('input',()=>{updateNoteWordCount();clearTimeout(noteAutoSave);noteAutoSave=setTimeout(saveCurrentNote,800);});
$('noteCategory').addEventListener('change',saveCurrentNote);
$('noteSearch').addEventListener('input',renderNotesList);

// Color picker — pill buttons
$$('.note-color-pill').forEach(btn=>btn.addEventListener('click',()=>{
  if(!State.activeNoteId)return;
  const color=btn.dataset.color;
  const note=State.notes.find(n=>n.id===State.activeNoteId); if(!note)return;
  note.color=color; note.updated=Date.now();
  $$('.note-color-pill').forEach(d=>d.classList.remove('active')); btn.classList.add('active');
  $('notesEditor').closest('.notes-editor-wrap').setAttribute('data-color',color);
  State.save(); renderNotesList();
}));

// ── Note toolbar buttons ──
function insertAtCursor(before,after=''){
  const ta=$('noteBody');
  ta.focus();
  const start=ta.selectionStart, end=ta.selectionEnd;
  const selected=ta.value.substring(start,end);
  const insert=selected?`${before}${selected}${after}`:`${before}${after}`;
  ta.setRangeText(insert,start,end,'end');
  if(!selected){ const pos=start+before.length; ta.setSelectionRange(pos,pos); }
  ta.dispatchEvent(new Event('input'));
}
function insertLinePrefix(prefix){
  const ta=$('noteBody');
  ta.focus();
  const start=ta.selectionStart;
  const lineStart=ta.value.lastIndexOf('\n',start-1)+1;
  ta.setRangeText(prefix,lineStart,lineStart,'end');
  ta.dispatchEvent(new Event('input'));
}
document.getElementById('noteBoldBtn')?.addEventListener('mousedown',e=>{e.preventDefault();insertAtCursor('**','**');});
document.getElementById('noteItalicBtn')?.addEventListener('mousedown',e=>{e.preventDefault();insertAtCursor('*','*');});
document.getElementById('noteH2Btn')?.addEventListener('mousedown',e=>{e.preventDefault();insertLinePrefix('## ');});
document.getElementById('noteListBtn')?.addEventListener('mousedown',e=>{e.preventDefault();insertLinePrefix('- ');});
document.getElementById('noteHrBtn')?.addEventListener('mousedown',e=>{e.preventDefault();insertAtCursor('\n---\n');});

// ── Note drag-to-reorder (HTML5 drag + touch) ──
let _dragNoteId=null;
function setupNoteDrag(){
  const listEl=$('notesList');
  const items=listEl.querySelectorAll('.note-list-item[draggable]');
  items.forEach(item=>{
    item.addEventListener('dragstart',e=>{
      _dragNoteId=parseInt(item.dataset.id);
      item.classList.add('note-dragging');
      e.dataTransfer.effectAllowed='move';
    });
    item.addEventListener('dragend',()=>{
      item.classList.remove('note-dragging');
      listEl.querySelectorAll('.note-drag-over').forEach(el=>el.classList.remove('note-drag-over'));
      syncNoteOrderFromDOM();
    });
    item.addEventListener('dragover',e=>{
      e.preventDefault(); e.dataTransfer.dropEffect='move';
      listEl.querySelectorAll('.note-drag-over').forEach(el=>el.classList.remove('note-drag-over'));
      if(parseInt(item.dataset.id)!==_dragNoteId) item.classList.add('note-drag-over');
    });
    item.addEventListener('drop',e=>{
      e.preventDefault();
      item.classList.remove('note-drag-over');
      const fromId=_dragNoteId, toId=parseInt(item.dataset.id);
      if(!fromId||fromId===toId)return;
      const fromIdx=State.notes.findIndex(n=>n.id===fromId);
      const toIdx=State.notes.findIndex(n=>n.id===toId);
      if(fromIdx<0||toIdx<0)return;
      const[moved]=State.notes.splice(fromIdx,1);
      State.notes.splice(toIdx,0,moved);
      // persist order
      State.notes.forEach((n,i)=>n._order=i);
      State.save(); renderNotesList();
    });
  });
}
function syncNoteOrderFromDOM(){
  const listEl=$('notesList');
  const ids=Array.from(listEl.querySelectorAll('.note-list-item')).map(li=>parseInt(li.dataset.id)).filter(Boolean);
  State.notes.sort((a,b)=>ids.indexOf(a.id)-ids.indexOf(b.id));
  State.notes.forEach((n,i)=>n._order=i);
  State.save();
}

// ═══════════════════════════════════════════════
//  RANK SYSTEM
// ═══════════════════════════════════════════════
const RANKS = [
  { id:'bronze',   name:'BRONZE',   title:'Novice Focuser',     icon:'🥉', color:'#cd7f32', min:0,    max:125  },
  { id:'silver',   name:'SILVER',   title:'Rising Achiever',    icon:'🥈', color:'#c0c0c0', min:125,  max:300  },
  { id:'gold',     name:'GOLD',     title:'Dedicated Worker',   icon:'🥇', color:'#ffd700', min:300,  max:600  },
  { id:'platinum', name:'PLATINUM', title:'Elite Performer',    icon:'💎', color:'#e5e4e2', min:600,  max:1100 },
  { id:'diamond',  name:'DIAMOND',  title:'Master of Focus',    icon:'🔷', color:'#b9f2ff', min:1100, max:2000 },
  { id:'emerald',  name:'EMERALD',  title:'Legendary Grinder',  icon:'💚', color:'#50c878', min:2000, max:3500 },
  { id:'insanium', name:'INSANIUM', title:'Transcendent Being', icon:'🌀', color:'#ff00ff', min:3500, max:Infinity },
];

function getRankForPoints(pts){
  for(let i=RANKS.length-1;i>=0;i--){ if(pts>=RANKS[i].min) return RANKS[i]; }
  return RANKS[0];
}

function addRankEvent(desc, pts){
  if(!State.rankSystemEnabled) return;
  if(!State.rank) State.rank = { points:0, events:[] };
  State.rank.points = Math.max(0, (State.rank.points||0) + pts);
  State.rank.events = [{ desc, pts, ts:Date.now() }, ...(State.rank.events||[])].slice(0,20);
  State.save();
  // Update rank UI if stats page is open
  if(document.getElementById('stats').classList.contains('active')){
    updateRankCard();
  }
}

function updateRankCard(){
  const card=$('rankCard'); if(!card)return;
  const inner=$('rankCardInner'); const disabled=$('rankDisabledNotice');
  if(!State.rankSystemEnabled){
    if(inner) inner.style.display='none';
    if(disabled) disabled.style.display='block';
    return;
  }
  if(inner) inner.style.display='flex';
  if(disabled) disabled.style.display='none';
  if(!State.rank) State.rank={points:0,events:[]};
  const pts=Math.max(0,State.rank.points||0);
  const rank=getRankForPoints(pts);
  const nextRank=RANKS[RANKS.indexOf(rank)+1]||null;

  // Apply rank class to card
  card.className=`card rank-card rank-${rank.id}`;
  const aura=$('rankAura'); if(aura) aura.className=`rank-aura`;

  $('rankBadgeIcon').textContent=rank.icon;
  $('rankName').textContent=rank.name;
  $('rankTitle').textContent=rank.title;
  $('rankPtsDisplay').textContent=pts.toLocaleString()+' pts';

  // Progress bar
  if(nextRank){
    const progress=(pts-rank.min)/(nextRank.min-rank.min);
    $('rankProgressLabel').textContent=`Progress to ${nextRank.name.charAt(0)+nextRank.name.slice(1).toLowerCase()}`;
    $('rankProgressPct').textContent=Math.round(progress*100)+'%';
    $('rankProgressFill').style.width=Math.round(progress*100)+'%';
  } else {
    $('rankProgressLabel').textContent='Max Rank Achieved';
    $('rankProgressPct').textContent='100%';
    $('rankProgressFill').style.width='100%';
  }

  // Events list
  const evList=$('rankEventList');
  const events=(State.rank.events||[]);
  if(!events.length){
    evList.innerHTML='<div style="color:var(--text-muted);font-size:10px;font-family:var(--font-mono);text-align:center;padding:16px 0">No events yet</div>';
  } else {
    evList.innerHTML=events.slice(0,10).map(ev=>{
      const isPos=ev.pts>=0;
      return `<div class="rank-event-item">
        <span class="rank-event-desc">${ev.desc}</span>
        <span class="rank-event-pts ${isPos?'pos':'neg'}">${isPos?'+':''}${ev.pts}</span>
      </div>`;
    }).join('');
  }
}

// ── RANK SYSTEM TOGGLE (Settings) ──
function applyRankSystemToggle(){
  const btn=$('rankSystemToggleBtn'); if(!btn)return;
  btn.textContent=State.rankSystemEnabled?'◈ Enabled':'○ Disabled';
  btn.style.background=State.rankSystemEnabled?'':'transparent';
  btn.style.opacity=State.rankSystemEnabled?'1':'0.6';
}

document.getElementById('rankSystemToggleBtn')?.addEventListener('click',()=>{
  State.rankSystemEnabled=!State.rankSystemEnabled;
  applyRankSystemToggle();
  State.save();
  toast(State.rankSystemEnabled?'Rank System enabled ◈':'Rank System disabled','normal');
  if(document.getElementById('stats').classList.contains('active')) updateRankCard();
});

// ═══════════════════════════════════════════════
//  BLOCK TRASH
// ═══════════════════════════════════════════════
function updateBlockTrashBadge(){
  const cnt=(State.blockTrash||[]).length;
  const badge=$('blockTrashCount'); if(!badge)return;
  badge.textContent=cnt; badge.style.display=cnt>0?'inline':'none';
}

function openBlockTrash(){
  const modal=$('blockTrashModal'); if(!modal)return;
  const list=$('blockTrashList');
  const items=State.blockTrash||[];
  if(!items.length){ list.innerHTML='<li class="trash-empty-state">Trash is empty.</li>'; }
  else {
    list.innerHTML=items.map(b=>`
      <li class="trash-item">
        <div class="trash-item-info">
          <div class="trash-item-name">${b.title}</div>
          <div class="trash-item-meta">${b._dateKey||'—'} · ${b.start}–${b.end} · ${b.type} · deleted ${new Date(b.deletedAt||Date.now()).toLocaleDateString()}</div>
        </div>
        <div class="trash-item-actions">
          <button class="trash-restore-btn" onclick="restoreBlock('${b.id}')">↩ Restore</button>
          <button class="trash-perm-del-btn" onclick="permDeleteBlock('${b.id}')">✕</button>
        </div>
      </li>`).join('');
  }
  modal.style.display='flex';
}

function closeBlockTrash(){ const m=$('blockTrashModal'); if(m) m.style.display='none'; }

function restoreBlock(id){
  const b=(State.blockTrash||[]).find(b=>b.id===id); if(!b)return;
  State.blockTrash=State.blockTrash.filter(b=>b.id!==id);
  const key=b._dateKey||todayStr();
  delete b.deletedAt; delete b._dateKey;
  if(!State.planner.blocks[key]) State.planner.blocks[key]=[];
  State.planner.blocks[key].push(b);
  State.save(); updateBlockTrashBadge(); openBlockTrash();
  if(State.zoomedDay===key) renderDayGrid(key);
  toast('Block restored ✓','success');
}

function permDeleteBlock(id){
  State.blockTrash=(State.blockTrash||[]).filter(b=>b.id!==id);
  State.save(); updateBlockTrashBadge(); openBlockTrash();
}

function emptyBlockTrash(){
  if(!(State.blockTrash||[]).length) return;
  if(!confirm('Permanently delete all trashed blocks? Cannot be undone.')) return;
  State.blockTrash=[];
  State.save(); updateBlockTrashBadge(); openBlockTrash();
  toast('Block trash emptied','normal');
}

// Wire block trash buttons on DOMContentLoaded
document.addEventListener('DOMContentLoaded',()=>{
  const btn=$('blockTrashBtn'); if(btn) btn.addEventListener('click',openBlockTrash);
  const closeBtn=$('blockTrashModalClose'); if(closeBtn) closeBtn.addEventListener('click',closeBlockTrash);
  const emptyBtn=$('emptyBlockTrashBtn'); if(emptyBtn) emptyBtn.addEventListener('click',emptyBlockTrash);
  const modal=$('blockTrashModal'); if(modal) modal.addEventListener('click',e=>{ if(e.target===modal) closeBlockTrash(); });
  updateBlockTrashBadge();
  applyRankSystemToggle();
});

// ═══════════════════════════════════════════════
//  DEV OPTIONS
// ═══════════════════════════════════════════════
document.getElementById('showDevOptionsBtn')?.addEventListener('click',()=>{
  const card=$('devOptionsCard'), reveal=$('devOptionsRevealWrap');
  if(card){ card.style.display=''; }
  if(reveal){ reveal.style.display='none'; }
  toast('Dev options unlocked ⚙','warn');
});

document.getElementById('hideDevOptionsBtn')?.addEventListener('click',()=>{
  const card=$('devOptionsCard'), reveal=$('devOptionsRevealWrap');
  if(card){ card.style.display='none'; }
  if(reveal){ reveal.style.display=''; }
});

document.getElementById('devApplyBtn')?.addEventListener('click',()=>{
  const focusToday=$('devFocusToday').value;
  const totalPomodoros=$('devTotalPomodoros').value;
  const currentStreak=$('devCurrentStreak').value;
  const bestStreak=$('devBestStreak').value;
  const doneOnTime=$('devDoneOnTime').value;
  const missedTasks=$('devMissedTasks').value;
  const rankPoints=$('devRankPoints').value;
  const rankSelect=$('devRankSelect')?.value;
  const focusDate=$('devFocusDate').value;
  const focusDateMins=$('devFocusDateMins').value;

  if(focusToday!=='') State.stats.focusMinutesByDay[todayStr()]=Math.max(0,parseInt(focusToday)||0);
  if(totalPomodoros!=='') State.stats.totalPomodoros=Math.max(0,parseInt(totalPomodoros)||0);
  if(currentStreak!==''){
    State.stats.currentStreak=Math.max(0,parseInt(currentStreak)||0);
    State.stats.lastFocusDay=todayStr();
  }
  if(bestStreak!=='') State.stats.bestStreak=Math.max(0,parseInt(bestStreak)||0);
  if(doneOnTime!==''){
    const target=Math.max(0,parseInt(doneOnTime)||0);
    // Pad or trim doneOnTimeTasks array
    while(State.stats.doneOnTimeTasks.length<target) State.stats.doneOnTimeTasks.push({id:Date.now()+Math.random(),name:'Dev task',due:null,completedOn:todayStr(),category:'work'});
    if(State.stats.doneOnTimeTasks.length>target) State.stats.doneOnTimeTasks=State.stats.doneOnTimeTasks.slice(0,target);
  }
  if(missedTasks!==''){
    const target=Math.max(0,parseInt(missedTasks)||0);
    while(State.stats.missedTasks.length<target) State.stats.missedTasks.push({id:Date.now()+Math.random(),name:'Dev missed',due:todayStr(),missedOn:todayStr(),category:'work'});
    if(State.stats.missedTasks.length>target) State.stats.missedTasks=State.stats.missedTasks.slice(0,target);
  }
  if(rankPoints!==''){
    if(!State.rank) State.rank={points:0,events:[]};
    State.rank.points=Math.max(0,parseInt(rankPoints)||0);
    State.rank.events=[{desc:'Dev override',pts:State.rank.points,ts:Date.now()},...(State.rank.events||[])].slice(0,20);
  }
  if(rankSelect!==undefined && rankSelect!==''){
    const pts=parseInt(rankSelect)||0;
    if(!State.rank) State.rank={points:0,events:[]};
    State.rank.points=pts;
    const rName=RANKS.find(r=>r.min===pts)?.name||'?';
    State.rank.events=[{desc:`Dev set rank: ${rName}`,pts,ts:Date.now()},...(State.rank.events||[])].slice(0,20);
    const sel=$('devRankSelect'); if(sel) sel.value='';
  }
  if(focusDate&&focusDateMins!==''){
    State.stats.focusMinutesByDay[focusDate]=Math.max(0,parseInt(focusDateMins)||0);
  }

  State.save();
  updateDashboard();
  if(document.getElementById('stats').classList.contains('active')) updateStats();
  toast('Dev stats applied ⚡','success');

  // Clear inputs
  ['devFocusToday','devTotalPomodoros','devCurrentStreak','devBestStreak','devDoneOnTime','devMissedTasks','devRankPoints','devFocusDate','devFocusDateMins'].forEach(id=>{ const el=$(id); if(el) el.value=''; });
});

document.getElementById('devResetRankBtn')?.addEventListener('click',()=>{
  if(!confirm('Reset rank points to 0?')) return;
  State.rank={points:0,events:[]};
  State.save();
  if(document.getElementById('stats').classList.contains('active')) updateRankCard();
  toast('Rank reset to 0','normal');
});

// ── DEV: Load Example Data ──
document.getElementById('devLoadExampleBtn')?.addEventListener('click',()=>{
  if(!confirm('This will add example tasks, notes, planner blocks, and stats on top of your existing data. Continue?')) return;
  const today=todayStr();
  const d=(offset)=>{ const dt=new Date(); dt.setDate(dt.getDate()+offset); return dateStr(dt); };

  // Tasks
  const exTasks=[
    {id:Date.now()+1, name:'Design new landing page mockup', category:'work', priority:'high', status:'working', due:d(1), done:false, created:today},
    {id:Date.now()+2, name:'Read "Atomic Habits" — chapters 5-7', category:'study', priority:'medium', status:'not-started', due:d(2), done:false, created:today},
    {id:Date.now()+3, name:'30-minute run + stretching', category:'health', priority:'medium', status:'done', due:today, done:true, created:today},
    {id:Date.now()+4, name:'Send project proposal to client', category:'work', priority:'critical', status:'not-started', due:d(0), done:false, created:today},
    {id:Date.now()+5, name:'Grocery run — weekly shop', category:'personal', priority:'low', status:'not-started', due:d(1), done:false, created:today},
    {id:Date.now()+6, name:'Finish React course module 8', category:'study', priority:'high', status:'working', due:d(3), done:false, created:today},
    {id:Date.now()+7, name:'Monthly budget review', category:'personal', priority:'medium', status:'not-started', due:d(4), done:false, created:today},
    {id:Date.now()+8, name:'Call dentist for appointment', category:'health', priority:'low', status:'not-started', due:d(5), done:false, created:today},
  ];
  State.tasks=[...exTasks, ...State.tasks];

  // Notes
  const exNotes=[
    {id:Date.now()+100, title:'Deep Work — Key Takeaways', body:'## Core Idea\nDepth beats shallowness in almost every knowledge-worker profession.\n\n## Rules\n- Work deeply: scheduled, distraction-free sessions\n- Embrace boredom: do not reach for your phone every idle moment\n- Quit social media (or be deliberate about it)\n- Drain the shallows: ruthlessly cut low-value tasks\n\n## My commitment\nTwo 90-min deep work blocks per day, phone in another room.', category:'study', color:'blue', created:Date.now()-86400000, updated:Date.now()-3600000},
    {id:Date.now()+101, title:'Project Alpha — Sprint Notes', body:'## Goals this sprint\n- Complete API integration\n- Write unit tests for auth module\n- Review PR from Sarah\n\n## Blockers\n- Waiting on design assets from Jake\n- Need prod credentials for staging env\n\n## Done\n- Set up CI pipeline\n- Fixed mobile nav bug', category:'work', color:'orange', created:Date.now()-172800000, updated:Date.now()-7200000},
    {id:Date.now()+102, title:'Morning Routine Ideas', body:'Try waking up 30 min earlier.\n\nOption A (energising)\n- 6:00 wake, water, stretch\n- 6:15 20 min walk outside\n- 6:35 journal + plan the day\n- 7:00 first deep work block\n\nOption B (gentle)\n- 6:30 wake, meditate 10 min\n- 6:40 coffee + reading\n- 7:00 plan the day', category:'personal', color:'green', created:Date.now()-259200000, updated:Date.now()-86400000},
  ];
  State.notes=[...exNotes, ...State.notes];

  // Stats — sprinkle focus minutes across the last 14 days
  const focusSeed=[95,0,120,75,110,0,80,145,60,90,0,105,50,70];
  focusSeed.forEach((mins,i)=>{
    const key=d(-(focusSeed.length-1-i));
    State.stats.focusMinutesByDay[key]=(State.stats.focusMinutesByDay[key]||0)+mins;
  });
  State.stats.totalPomodoros=Math.max(State.stats.totalPomodoros, 28);
  State.stats.currentStreak=Math.max(State.stats.currentStreak, 4);
  State.stats.bestStreak=Math.max(State.stats.bestStreak, 9);
  if(!State.stats.lastFocusDay) State.stats.lastFocusDay=today;

  // Rank points
  if(!State.rank) State.rank={points:0,events:[]};
  State.rank.points=(State.rank.points||0)+350;
  State.rank.events=[{desc:'Example data loaded',pts:350,ts:Date.now()},...(State.rank.events||[])].slice(0,20);

  State.save();
  updateDashboard();
  renderTaskList();
  renderNotesList();
  if(document.getElementById('stats').classList.contains('active')) updateStats();
  toast('Example data loaded','success');
});

// ── SETTINGS PAGE CONTROLS ──
document.querySelectorAll('#settingsThemePicker .tswatch').forEach(btn => {
  btn.addEventListener('click', () => applyTheme(btn.dataset.theme, State.lightMode));
});
document.getElementById('settingsLightModeBtn')?.addEventListener('click', () => applyTheme(State.theme, !State.lightMode));
// Altayer-style checkbox toggles dark/light mode
const darkmodeSwitch = document.getElementById('darkmode-switch');
if(darkmodeSwitch){
  darkmodeSwitch.addEventListener('change', function(){
    // Altayer convention: checked = dark mode, unchecked = light mode
    applyTheme(State.theme, !this.checked);
  });
}
document.getElementById('resetAllDataBtn')?.addEventListener('click', async () => {
  if(!confirm('This will permanently delete all your tasks, notes, planner blocks, and statistics. Are you sure?')) return;

  // 1. Wipe persisted storage
  try{ localStorage.removeItem('focus_state_v3'); }catch(e){}
  try{ if(window.storage) await window.storage.delete('focus_state_v3'); }catch(e){}

  // 2. Reset in-memory State to defaults
  State.tasks = [];
  State.taskTrash = [];
  State.customColumns = [];
  State.planner = { blocks:{}, weekOffset:0 };
  State.blockTrash = [];
  State.stats = { focusMinutesByDay:{}, totalPomodoros:0, bestStreak:0, currentStreak:0, lastFocusDay:'', missedTasks:[], doneOnTimeTasks:[] };
  State.notes = [];
  State.noteTrash = [];
  State.activeNoteId = null;
  State.zoomedDay = null;
  State.statsRange = 'week';
  State.rank = { points:0, events:[] };

  // 3. Persist the empty state immediately
  State.save();

  // 4. Re-render all sections so charts/stats update live
  updateDashboard();
  renderTaskList();
  renderPlanner();
  renderNotesList();
  updateStats();

  toast('All data has been reset.', 'success');
});

// ── INIT ──
(async()=>{
  await State.load();
  applyTheme(State.theme,State.lightMode);
  applyRankSystemToggle();
  if(!State.rank) State.rank={points:0,events:[]};
  if(!State.blockTrash) State.blockTrash=[];
  auditMissedTasks();
  resetTimer();
  updateDashboard();
  renderTaskList();
  renderPlanner();

  // Seed demo data on first run only
  if(!State.hasEverRun){
    State.tasks=[
      {id:1,name:"Review weekly goals and plan today's priorities",category:'work',priority:'high',effort:'short',due:todayStr(),done:false,created:todayStr()},
      {id:2,name:"Complete Chapter 4 of Deep Work",category:'study',priority:'medium',effort:'deep',due:'',done:false,created:todayStr()},
      {id:3,name:"Morning workout — 30 min",category:'health',priority:'medium',effort:'short',due:todayStr(),done:true,created:todayStr()},
      {id:4,name:"Reply to client emails",category:'work',priority:'low',effort:'quick',due:'',done:false,created:todayStr()},
    ];
    const today=todayStr();
    State.stats.focusMinutesByDay[today]=50; State.stats.totalPomodoros=2;
    State.stats.currentStreak=1; State.stats.bestStreak=1; State.stats.lastFocusDay=today;
    State.notes=[{id:1,title:'Welcome to FOCUS',body:"This is your notes page.\n\nUse it for:\n- Brain dumps\n- Study notes\n- Ideas and thoughts\n- Daily journaling\n\nNotes auto-save as you type.",category:'general',color:'default',created:Date.now(),updated:Date.now()}];
    State.hasEverRun = true;
    State.save(); updateDashboard(); renderTaskList();
  }
  renderNotesList();
})();

// Dismiss block note popovers when tapping outside a block
document.addEventListener('touchstart', e=>{
  if(!e.target.closest('.time-block')){
    document.querySelectorAll('.time-block.note-open').forEach(b=>b.classList.remove('note-open'));
  }
}, {passive:true});
/* ═══════════════════════════════════════════════
   FOCUS — animations.js (appended)
   Purpose-built animation hooks for every UI element
   ═══════════════════════════════════════════════ */

// ── 1. TIMER RUNNING STATE ──
// Add/remove .pomo-running on the timer ring wrapper so CSS animations kick in
(function patchTimerRunningState(){
  const wrapper = document.querySelector('.timer-ring-wrapper');
  const origStart = document.getElementById('startStopBtn');
  if(!origStart || !wrapper) return;

  origStart.addEventListener('click', () => {
    // State.pomo.running is toggled before our listener in original JS
    // so we read the button text to determine current state
    setTimeout(() => {
      if(State.pomo.running){
        wrapper.classList.add('pomo-running');
        document.querySelector('.pomodoro-layout')?.classList.add('pomo-running');
      } else {
        wrapper.classList.remove('pomo-running');
        document.querySelector('.pomodoro-layout')?.classList.remove('pomo-running');
      }
    }, 10);
  });

  // Also remove on reset/skip
  ['resetBtn','skipBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if(btn) btn.addEventListener('click', () => {
      wrapper.classList.remove('pomo-running');
      document.querySelector('.pomodoro-layout')?.classList.remove('pomo-running');
    });
  });
})();

// ── 2. POMO TAB RIPPLE ──
document.querySelectorAll('.pomo-tab').forEach(tab => {
  tab.addEventListener('click', function(){
    this.classList.add('ripple');
    setTimeout(() => this.classList.remove('ripple'), 550);
  });
});

// ── 3. ANIMATED TIP TRANSITIONS ──
(function patchTipTransitions(){
  const btn = document.getElementById('nextTipBtn');
  const title = document.getElementById('tipTitle');
  const desc  = document.getElementById('tipDesc');
  if(!btn || !title || !desc) return;

  btn.addEventListener('click', () => {
    title.classList.add('changing');
    desc.classList.add('changing');
    setTimeout(() => {
      title.classList.remove('changing');
      desc.classList.remove('changing');
    }, 350);
  }, true); // capture so it fires before the original handler
})();

// ── 4. SESSION LOG — new-entry animation ──
(function patchSessionLog(){
  const log = document.getElementById('sessionLog');
  if(!log) return;
  const observer = new MutationObserver(mutations => {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if(node.nodeType === 1 && node.classList.contains('log-entry')){
          node.classList.add('new-entry');
          setTimeout(() => node.classList.remove('new-entry'), 600);
        }
      });
    });
  });
  observer.observe(log, { childList: true });
})();

// ── 5. TOAST HIDE ANIMATION ──
(function patchToast(){
  const t = document.getElementById('toast');
  if(!t) return;
  // Watch for removal of .show class and add .hiding briefly
  const observer = new MutationObserver(() => {
    if(!t.classList.contains('show') && !t.classList.contains('hiding')){
      t.classList.add('hiding');
      setTimeout(() => t.classList.remove('hiding'), 320);
    }
  });
  observer.observe(t, { attributes: true, attributeFilter: ['class'] });
})();

// ── 6. MONTH GRID — stagger day pop-in on each render ──
(function patchMonthGrid(){
  const orig = window.renderMonthGrid;
  if(typeof renderMonthGrid === 'function'){
    // The function is local to the IIFE so we intercept via MutationObserver
    const grid = document.getElementById('monthGrid');
    if(!grid) return;
    const obs = new MutationObserver(() => {
      const days = grid.querySelectorAll('.month-day');
      days.forEach((d, i) => {
        d.style.animationDelay = (i * 0.008) + 's';
      });
    });
    obs.observe(grid, { childList: true });
  }
})();

// ── 7. WEEK BARS — stagger on each render ──
(function patchWeekBars(){
  const bars = document.getElementById('weekBars');
  if(!bars) return;
  const obs = new MutationObserver(() => {
    bars.querySelectorAll('.week-bar').forEach((b, i) => {
      b.style.animationDelay = (0.28 + i * 0.07) + 's';
    });
  });
  obs.observe(bars, { childList: true });
})();

// ── 8. NAV ICON BOUNCE on click ──
document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(item => {
  item.addEventListener('click', function(){
    const icon = this.querySelector('.nav-icon, .mnav-icon');
    if(!icon) return;
    icon.style.animation = 'none';
    requestAnimationFrame(() => {
      icon.style.animation = 'iconBounce 0.5s ease';
    });
  });
});

// ── 9. BUTTON PRESS ripple on primary buttons ──
document.querySelectorAll('.add-task-btn, .mini-btn, .ctrl-btn.primary').forEach(btn => {
  btn.addEventListener('click', function(e){
    const ripple = document.createElement('span');
    ripple.style.cssText = `
      position:absolute;
      border-radius:50%;
      background:rgba(255,255,255,0.25);
      width:100px;height:100px;
      left:${e.offsetX - 50}px;
      top:${e.offsetY - 50}px;
      pointer-events:none;
      transform:scale(0);
      animation:btnRipple 0.55s ease-out forwards;
    `;
    const pos = getComputedStyle(this).position;
    if(pos === 'static') this.style.position = 'relative';
    this.style.overflow = 'hidden';
    this.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  });
});

// ── 10. STAT VALUE number-count-up on dashboard load ──
(function patchStatCountUp(){
  function countUp(el, target, onDone, suffix=''){
    const isTime = target.includes('h');
    if(isTime) { el.textContent = target; if(onDone) onDone(); return; }
    const num = parseInt(target);
    if(isNaN(num) || num === 0) { el.textContent = target; if(onDone) onDone(); return; }
    const dur = 900;
    const step = 16;
    const steps = dur / step;
    const inc = num / steps;
    let cur = 0;
    const timer = setInterval(() => {
      cur = Math.min(cur + inc, num);
      el.textContent = Math.round(cur) + suffix;
      if(cur >= num){ el.textContent = target; clearInterval(timer); if(onDone) onDone(); }
    }, step);
  }

  // Observe stat value elements for text changes
  ['todayFocusTime','tasksCompleted','streakDays','pomodoroCount'].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    let prev = '';
    const obs = new MutationObserver(() => {
      const cur = el.textContent;
      if(cur !== prev){
        const target = cur;
        prev = cur; // lock prev BEFORE countUp writes intermediate values
        if(id === 'streakDays' || id === 'pomodoroCount'){
          obs.disconnect(); // pause observer during animation to prevent feedback loop
          countUp(el, target, () => {
            prev = el.textContent; // sync prev after animation completes
            obs.observe(el, { childList: true, characterData: true, subtree: true });
          });
        }
      }
    });
    obs.observe(el, { childList: true, characterData: true, subtree: true });
  });
})();

// ── 11. CARD entrance on section switch ──
// Re-trigger cardIn by toggling a reset class
(function patchSectionCardAnims(){
  const origShowSection = window.showSection;
  // showSection is defined in the outer scope, can't easily patch
  // Instead observe section class changes
  document.querySelectorAll('.section').forEach(sec => {
    const obs = new MutationObserver(mutations => {
      mutations.forEach(m => {
        if(m.target.classList.contains('active')){
          sec.querySelectorAll('.card[data-delay]').forEach(card => {
            card.style.animation = 'none';
            requestAnimationFrame(() => {
              card.style.animation = '';
            });
          });
        }
      });
    });
    obs.observe(sec, { attributes: true, attributeFilter: ['class'] });
  });
})();

// ── 12. PLANNER BLOCK entrance animation on each render ──
(function patchPlannerBlockAnims(){
  const plannerSection = document.getElementById('planner');
  if(!plannerSection) return;
  const obs = new MutationObserver(() => {
    plannerSection.querySelectorAll('.time-block:not(.anim-done)').forEach((block, i) => {
      block.classList.add('anim-done');
      block.style.animationDelay = (i * 0.04) + 's';
    });
  });
  obs.observe(plannerSection, { childList: true, subtree: true });
})();
// ══════════════════════════════════════════════════════
//  AI GOALS — Goal Analysis, Focus Patterns, Review
// ══════════════════════════════════════════════════════
(function initGoals(){

  /* ── Helpers ── */
  function loadingHTML(msg){
    return `<div class="ai-loading"><div class="ai-loading-dots"><span></span><span></span><span></span></div><span>${msg}</span></div>`;
  }

  function renderMarkdown(text){
    // Minimal markdown-to-HTML: ##/### headings, **bold**, bullet lists
    return text
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^[-•] (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/^(?!<[hup])/gm, '')
      .replace(/(<p><\/p>)/g, '')
      .trim();
  }

  /* ── Gather app data as a context string ── */
  function buildAppContext(){
    const now = new Date();
    const todayKey = todayStr();

    // Tasks summary
    const tasks = State.tasks || [];
    const doneTasks = tasks.filter(t=>t.status==='done');
    const pendingTasks = tasks.filter(t=>t.status!=='done');
    const overdueTasks = pendingTasks.filter(t=>t.due && t.due < todayKey);

    // Focus minutes by day — last 30 days
    const fmbd = State.stats.focusMinutesByDay || {};
    const dayEntries = Object.entries(fmbd)
      .sort((a,b)=>a[0].localeCompare(b[0]))
      .slice(-30);
    const totalFocusMins = dayEntries.reduce((s,[,v])=>s+v, 0);

    // Day-of-week pattern
    const dowMap = {0:'Sun',1:'Mon',2:'Tue',3:'Wed',4:'Thu',5:'Fri',6:'Sat'};
    const dowTotals = {Mon:0,Tue:0,Wed:0,Thu:0,Fri:0,Sat:0,Sun:0};
    const dowCounts = {Mon:0,Tue:0,Wed:0,Thu:0,Fri:0,Sat:0,Sun:0};
    dayEntries.forEach(([d,mins])=>{
      const dt = new Date(d+'T12:00:00');
      const k = dowMap[dt.getDay()];
      dowTotals[k] += mins; dowCounts[k]++;
    });
    const dowAvg = Object.entries(dowTotals).map(([k,v])=>`${k}: ${dowCounts[k]?Math.round(v/dowCounts[k]):0} min`).join(', ');

    // Planner blocks summary
    const allBlocks = Object.values(State.planner.blocks||{}).flat();
    const blockTypes = {};
    allBlocks.forEach(b=>{ blockTypes[b.type]=(blockTypes[b.type]||0)+1; });
    const blockSummary = Object.entries(blockTypes).map(([t,c])=>`${t}: ${c}`).join(', ');

    // Notes count
    const notesCount = (State.notes||[]).length;

    // Stats
    const streak = State.stats.currentStreak || 0;
    const pomodoros = State.stats.totalPomodoros || 0;
    const missedTasks = (State.stats.missedTasks||[]).length;
    const doneOnTime = (State.stats.doneOnTimeTasks||[]).length;

    // This week focus
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1);
    const weekMins = Array.from({length:7},(_,i)=>{
      const d = new Date(weekStart); d.setDate(weekStart.getDate()+i);
      return fmbd[dateStr(d)]||0;
    }).reduce((a,b)=>a+b,0);

    // This month focus
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const monthMins = dayEntries.filter(([d])=>d.startsWith(monthPrefix)).reduce((s,[,v])=>s+v,0);

    return `
APP DATA SUMMARY (today: ${todayKey}):
- Total tasks: ${tasks.length} | Done: ${doneTasks.length} | Pending: ${pendingTasks.length} | Overdue: ${overdueTasks.length}
- Task categories: ${[...new Set(tasks.map(t=>t.category))].join(', ')||'none'}
- High/critical priority pending: ${pendingTasks.filter(t=>t.priority==='critical'||t.priority==='high').length}
- Focus this week: ${Math.round(weekMins/60*10)/10} hours (${weekMins} min)
- Focus this month: ${Math.round(monthMins/60*10)/10} hours (${monthMins} min)
- Total focus (last 30 days): ${Math.round(totalFocusMins/60*10)/10} hours
- Avg focus by day of week: ${dowAvg}
- Current streak: ${streak} days | Total pomodoros: ${pomodoros}
- Tasks done on time: ${doneOnTime} | Missed/overdue: ${missedTasks}
- Planner block types: ${blockSummary||'none'}
- Notes: ${notesCount}
- Pending tasks sample: ${pendingTasks.slice(0,8).map(t=>`"${t.text}"(${t.priority||'?'},${t.category||'?'}${t.due?',due:'+t.due:''})`).join('; ')||'none'}
`.trim();
  }

  /* ── Call Claude API ── */
  async function callClaude(systemPrompt, userMessage){
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });
    if(!resp.ok) throw new Error(`API error ${resp.status}`);
    const data = await resp.json();
    return data.content.map(b=>b.text||'').join('');
  }

  /* ── 1. GOAL BREAKDOWN ── */
  const analyseGoalBtn = $('analyseGoalBtn');
  const goalInputText = $('goalInputText');
  const goalAnalysisResult = $('goalAnalysisResult');
  const goalTasksPreview = $('goalTasksPreview');
  const goalTasksList = $('goalTasksList');
  const addAllGoalTasksBtn = $('addAllGoalTasksBtn');
  let suggestedTasks = [];

  if(analyseGoalBtn){
    analyseGoalBtn.addEventListener('click', async ()=>{
      const goal = (goalInputText.value||'').trim();
      if(!goal){ toast('Please describe your goal first', 'warn'); return; }
      const category = $('goalCategory').value;
      const timeframe = $('goalTimeframe').value;

      analyseGoalBtn.disabled = true;
      analyseGoalBtn.textContent = '◬ Analysing…';
      goalAnalysisResult.style.display = 'block';
      goalAnalysisResult.innerHTML = loadingHTML('Breaking down your goal…');
      goalTasksPreview.style.display = 'none';

      const appCtx = buildAppContext();
      const system = `You are an expert productivity coach embedded in a focus/task app called Focus. 
The user has provided their goal. Your job is to:
1. Write a short encouraging analysis (2-3 sentences) of the goal's feasibility given their data.
2. Output a JSON block of suggested tasks to achieve the goal.

Format your response EXACTLY like this — no other text:
<analysis>
Your 2-3 sentence analysis here using markdown (**bold** for key points).
</analysis>
<tasks>
[
  {"text": "Task title", "priority": "high", "category": "${category}", "due": "YYYY-MM-DD or empty"},
  ...
]
</tasks>
Generate 5-10 specific, actionable tasks. Use realistic due dates relative to today (${todayStr()}) within the ${timeframe} timeframe. Keep task titles concise (under 60 chars). Prioritise appropriately.`;

      try{
        const raw = await callClaude(system, `My goal: ${goal}\nTimeframe: ${timeframe}\nCategory: ${category}\n\nMy current productivity data:\n${appCtx}`);

        // Parse analysis
        const analysisMatch = raw.match(/<analysis>([\s\S]*?)<\/analysis>/);
        const tasksMatch = raw.match(/<tasks>([\s\S]*?)<\/tasks>/);

        if(analysisMatch){
          goalAnalysisResult.innerHTML = `<div class="ai-result-body"><p>${renderMarkdown(analysisMatch[1].trim())}</p></div>`;
        } else {
          goalAnalysisResult.innerHTML = `<div class="ai-result-body"><p>${renderMarkdown(raw.substring(0,400))}</p></div>`;
        }

        // Parse tasks
        if(tasksMatch){
          try{
            suggestedTasks = JSON.parse(tasksMatch[1].trim());
            goalTasksList.innerHTML = '';
            suggestedTasks.forEach((t,i)=>{
              const li = document.createElement('li');
              li.className = 'goal-task-item';
              li.innerHTML = `<input type="checkbox" checked data-idx="${i}"><span class="gtask-text">${t.text}</span><span class="gtask-meta">${t.priority||'medium'} · ${t.category||category}${t.due?' · '+t.due:''}</span>`;
              goalTasksList.appendChild(li);
            });
            goalTasksPreview.style.display = 'block';
          }catch(e){ console.warn('Tasks parse error',e); }
        }
      }catch(e){
        goalAnalysisResult.innerHTML = `<div class="ai-result-body"><p style="color:var(--red)">Analysis failed. Please try again.</p></div>`;
        console.error(e);
      }
      analyseGoalBtn.disabled = false;
      analyseGoalBtn.textContent = '◬ Analyse Goal';
    });
  }

  /* Add selected tasks to the task list */
  if(addAllGoalTasksBtn){
    addAllGoalTasksBtn.addEventListener('click', ()=>{
      const checked = goalTasksList.querySelectorAll('input[type="checkbox"]:checked');
      let added = 0;
      checked.forEach(cb=>{
        const idx = parseInt(cb.dataset.idx);
        const t = suggestedTasks[idx];
        if(!t) return;
        State.tasks.push({
          id: Date.now() + Math.random(),
          text: t.text,
          category: t.category || 'work',
          priority: t.priority || 'medium',
          status: 'not-started',
          due: t.due || '',
          created: todayStr(),
          notes: ''
        });
        added++;
      });
      if(added){
        State.save();
        try{ renderTaskList(); }catch(e){}
        toast(`${added} task${added>1?'s':''} added ✓`, 'success');
        goalTasksPreview.style.display = 'none';
        goalInputText.value = '';
        goalAnalysisResult.innerHTML = '';
        goalAnalysisResult.style.display = 'none';
      } else {
        toast('Select at least one task', 'warn');
      }
    });
  }

  /* ── 2. FOCUS PATTERN INSIGHTS ── */
  const analysePatternBtn = $('analysePatternBtn');
  const patternResult = $('patternResult');

  if(analysePatternBtn){
    analysePatternBtn.addEventListener('click', async ()=>{
      analysePatternBtn.disabled = true;
      analysePatternBtn.textContent = '◬ Analysing…';
      patternResult.innerHTML = loadingHTML('Detecting your focus patterns…');

      const appCtx = buildAppContext();
      const system = `You are a productivity intelligence engine inside an app called Focus. 
Analyse the user's focus and task data and provide sharp, personalised insights.

Structure your response with these exact sections using ### headers:
### Your Peak Focus Days
### Your Productivity Patterns  
### Schedule Recommendations
### What's Holding You Back

Keep each section to 2-4 sentences. Be specific to the data — avoid generic advice. Use **bold** for key insights. If data is sparse, acknowledge it and give general guidance based on what's available.`;

      try{
        const raw = await callClaude(system, `My productivity data:\n${appCtx}`);
        patternResult.innerHTML = `<div class="ai-result-body">${renderMarkdown(raw)}</div>`;
      }catch(e){
        patternResult.innerHTML = `<div class="ai-result-body"><p style="color:var(--red)">Analysis failed. Please try again.</p></div>`;
        console.error(e);
      }
      analysePatternBtn.disabled = false;
      analysePatternBtn.textContent = '◬ Analyse Now';
    });
  }

  /* ── 3. WEEKLY / MONTHLY REVIEW ── */
  const analyseReviewBtn = $('analyseReviewBtn');
  const reviewResult = $('reviewResult');

  if(analyseReviewBtn){
    analyseReviewBtn.addEventListener('click', async ()=>{
      const period = $('reviewPeriod').value;
      analyseReviewBtn.disabled = true;
      analyseReviewBtn.textContent = '◬ Analysing…';
      reviewResult.innerHTML = loadingHTML(`Generating your ${period}ly review…`);

      const appCtx = buildAppContext();
      const system = `You are an expert productivity coach writing a ${period === 'week' ? 'weekly' : 'monthly'} review inside a focus app called Focus.

Structure your response with these exact sections using ### headers:
### Overall Performance
### Focus & Deep Work
### Task Completion
### Wins This ${period === 'week' ? 'Week' : 'Month'}
### Areas to Improve
### Goals for Next ${period === 'week' ? 'Week' : 'Month'}

Keep each section to 2-4 sentences. Be specific and encouraging. Use **bold** for key numbers and insights. Base everything on the actual data provided — don't invent numbers. If a metric is low, frame it constructively.`;

      try{
        const raw = await callClaude(system, `Review period: ${period}\n\nMy productivity data:\n${appCtx}`);
        reviewResult.innerHTML = `<div class="ai-result-body">${renderMarkdown(raw)}</div>`;
      }catch(e){
        reviewResult.innerHTML = `<div class="ai-result-body"><p style="color:var(--red)">Analysis failed. Please try again.</p></div>`;
        console.error(e);
      }
      analyseReviewBtn.disabled = false;
      analyseReviewBtn.textContent = '◬ Analyse Now';
    });
  }

})();

// ══════════════════════════════════════════════════════
//  SUPABASE AUTH — Google OAuth
// ══════════════════════════════════════════════════════
// ══════════════════════════════════════════════
//  SupaSync — cloud read/write helper
// ══════════════════════════════════════════════
const SupaSync = {
  _sb: null,        // supabase client, set once lib loads
  _uid: null,       // current user id
  _pushTimer: null, // debounce handle

  init(sb){ this._sb = sb; },

  setUser(uid){ this._uid = uid; },

  // Pull cloud state and merge into local State, then re-render
  async pull(){
    if(!this._sb || !this._uid) return;
    try{
      const { data, error } = await this._sb
        .from('user_data')
        .select('state')
        .eq('user_id', this._uid)
        .single();
      if(error || !data) return;
      const s = typeof data.state === 'string' ? JSON.parse(data.state) : data.state;
      if(!s || !Object.keys(s).length) return;
      // Merge cloud into State
      if(s.tasks)         State.tasks         = s.tasks;
      if(s.planner)       State.planner.blocks = s.planner;
      if(s.blockTrash)    State.blockTrash     = s.blockTrash;
      if(s.stats)         Object.assign(State.stats, s.stats);
      if(s.pomo)          Object.assign(State.pomo.durations, s.pomo.durations||{});
      if(s.notes)         State.notes         = s.notes;
      if(s.theme)         State.theme         = s.theme;
      if(s.lightMode !== undefined) State.lightMode = s.lightMode;
      if(s.customColumns) State.customColumns = s.customColumns;
      if(s.hasEverRun !== undefined) State.hasEverRun = s.hasEverRun;
      if(s.rankSystemEnabled !== undefined) State.rankSystemEnabled = s.rankSystemEnabled;
      if(s.rank)          State.rank          = s.rank;
      // Persist locally too
      State.save();
      // Re-render everything with correct function names
      try{ applyTheme(State.theme, State.lightMode); }catch(e){}
      try{ applyRankSystemToggle(); }catch(e){}
      try{ updateDashboard(); }catch(e){}
      try{ renderTaskList(); }catch(e){}
      try{ renderNotesList(); }catch(e){}
      try{ renderPlanner(); }catch(e){}
      if(document.getElementById('stats').classList.contains('active')){
        try{ updateStats(); }catch(e){}
      }
      toast('Data synced from cloud ☁️', 'success');
    }catch(e){ console.warn('[SupaSync] pull error', e); }
  },

  // Debounced push — waits 2 s after last save before writing to Supabase
  push(jsonData){
    if(!this._sb || !this._uid) return;
    clearTimeout(this._pushTimer);
    this._pushTimer = setTimeout(async ()=>{
      try{
        await this._sb.from('user_data').upsert({
          user_id: this._uid,
          state:   jsonData,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      }catch(e){ console.warn('[SupaSync] push error', e); }
    }, 2000);
  },
};

(function initSupabaseAuth(){
  const SUPABASE_URL  = 'https://wrelecqwsovhevioмktf.supabase.co'.replace('\u043c','m');
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyZWxlY3F3c292aGV2aW9ta3RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MzI3NjUsImV4cCI6MjA5NDQwODc2NX0.Vj2OcbMUvXcpNO7JkJikotJIjI5D41AYV-oFuJc8H6A';

  function waitForLib(cb){
    if(window.supabase && window.supabase.createClient){ cb(); return; }
    let tries=0;
    const iv=setInterval(()=>{
      tries++;
      if(window.supabase && window.supabase.createClient){ clearInterval(iv); cb(); }
      else if(tries>100){ clearInterval(iv); console.warn('[Auth] Supabase lib not found'); }
    },50);
  }

  waitForLib(function(){
    // ── IMPORTANT: implicit flow only — GitHub Pages is a static host with no
    //    server-side code. PKCE sends a ?code= that needs a backend to exchange;
    //    on a static host that code is never exchanged and the session is never
    //    created. Implicit flow puts the tokens directly in the #hash fragment,
    //    which Supabase reads client-side. Works on desktop AND mobile Safari. ──
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        flowType: 'implicit',
        detectSessionInUrl: true,  // reads #access_token from URL on redirect
        persistSession: true,
        storage: window.localStorage,
      }
    });
    SupaSync.init(sb);

    // Redirect back to the same page, stripping any existing hash/query so the
    // URL stays clean. Supabase appends the #access_token fragment after this.
    function getRedirectURL(){
      return window.location.origin + window.location.pathname;
    }

    // ── UI helpers ──
    function showSignedIn(user, doPull){
      const out=$('authSignedOut'), inn=$('authSignedIn');
      if(out) out.style.display='none';
      if(inn) inn.style.display='';
      const meta = user.user_metadata || {};
      const name  = meta.full_name || meta.name || user.email || 'User';
      const email = user.email || '';
      const avatar= meta.avatar_url || meta.picture || '';
      const el=$('authUserName');   if(el) el.textContent = name;
      const ee=$('authUserEmail');  if(ee) ee.textContent = email;
      const av=$('authAvatar');
      if(av){
        if(avatar){
          av.style.backgroundImage   = `url(${avatar})`;
          av.style.backgroundSize    = 'cover';
          av.style.backgroundPosition= 'center';
          av.textContent = '';
        } else {
          av.style.backgroundImage = 'none';
          av.textContent = name.charAt(0).toUpperCase();
        }
      }
      SupaSync.setUser(user.id);
      if(doPull) SupaSync.pull();
    }

    function showSignedOut(){
      const out=$('authSignedOut'), inn=$('authSignedIn');
      if(out) out.style.display='';
      if(inn) inn.style.display='none';
      SupaSync.setUser(null);
    }

    // ── Sign-in button ──
    const signInBtn=$('googleSignInBtn');
    if(signInBtn){
      signInBtn.addEventListener('click', async ()=>{
        signInBtn.disabled = true;
        signInBtn.textContent = 'Connecting…';
        const { error } = await sb.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: getRedirectURL() }
        });
        if(error){
          toast('Sign-in failed: '+error.message, 'warn');
          signInBtn.disabled = false;
          signInBtn.innerHTML = `<svg class="google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg> Continue with Google`;
        }
        // On success the browser navigates away — no further action needed here
      });
    }

    // ── Sign-out button ──
    const signOutBtn=$('googleSignOutBtn');
    if(signOutBtn){
      signOutBtn.addEventListener('click', async ()=>{
        await sb.auth.signOut();
        showSignedOut();
        toast('Signed out', 'normal');
      });
    }

    // ── Auth state listener ──
    // onAuthStateChange is the single source of truth. It fires:
    //   • INITIAL_SESSION  — on every page load (session from localStorage or URL hash)
    //   • SIGNED_IN        — after the OAuth redirect lands back here with #access_token
    //   • TOKEN_REFRESHED  — when the access token is silently refreshed
    //   • SIGNED_OUT       — after signOut()
    //
    // detectSessionInUrl:true means Supabase reads and exchanges the #access_token
    // from the URL *before* firing SIGNED_IN, so by the time we get here the
    // session is already persisted in localStorage — works on mobile Safari too.
    let _pullDone = false; // guard: only pull cloud data once per page load
    sb.auth.onAuthStateChange((event, session)=>{
      if(session && session.user){
        // Pull data on first sign-in OR on the initial page load after a redirect
        const isFirstLoad = (event === 'SIGNED_IN' || event === 'INITIAL_SESSION');
        const shouldPull  = isFirstLoad && !_pullDone;
        if(shouldPull) _pullDone = true;
        showSignedIn(session.user, shouldPull);
        // Clean the URL *after* Supabase has already read the hash/code
        if(window.location.hash.includes('access_token') || window.location.search.includes('code=')){
          history.replaceState(null, '', window.location.pathname);
        }
      } else {
        showSignedOut();
      }
    });
  });
})();
