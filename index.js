/* ═══════════════════════════════════════════════
   FOCUS — index.js v3
   All fixes + new features
   ═══════════════════════════════════════════════ */

const exampleMode = new URLSearchParams(location.search).get('example') === '1';

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
  theme:'midnight', lightMode:true, classicLook:false,
  statsRange:'week', statsOffset:0, zoomedDay:null,
  hasEverRun:true,
  rankSystemEnabled: true,
  rank: { points: 0, events: [] },

  // ── IndexedDB helpers (most reliable on mobile Safari for localhost) ──
  _idbGet(key){ return new Promise(resolve=>{ try{ const req=indexedDB.open('focus_db',1); req.onupgradeneeded=e=>e.target.result.createObjectStore('kv'); req.onsuccess=e=>{ try{ const tx=e.target.result.transaction('kv','readonly'); const r=tx.objectStore('kv').get(key); r.onsuccess=()=>resolve(r.result||null); r.onerror=()=>resolve(null); }catch(_){resolve(null);} }; req.onerror=()=>resolve(null); }catch(_){resolve(null);} }); },
  _idbSet(key,val){ return new Promise(resolve=>{ try{ const req=indexedDB.open('focus_db',1); req.onupgradeneeded=e=>e.target.result.createObjectStore('kv'); req.onsuccess=e=>{ try{ const tx=e.target.result.transaction('kv','readwrite'); tx.objectStore('kv').put(val,key); tx.oncomplete=()=>resolve(true); tx.onerror=()=>resolve(false); }catch(_){resolve(false);} }; req.onerror=()=>resolve(false); }catch(_){resolve(false);} }); },

  async load(){
    if(exampleMode) return;
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
      this.classicLook = s.classicLook === true;
      if(s.lightMode!==undefined) this.lightMode=s.lightMode;
      if(s.customColumns) this.customColumns=[];
      if(s.hasEverRun !== undefined) this.hasEverRun = s.hasEverRun;
      if(s.rankSystemEnabled !== undefined) this.rankSystemEnabled = s.rankSystemEnabled;
      if(s.rank) this.rank = s.rank;
      // Restore goals from the combined state blob (written by State.save)
      if(s.goals && Array.isArray(s.goals) && typeof Goals !== 'undefined'){
        Goals._data = s.goals.map(g=>({
          id:String(g.id||Date.now()), name:g.name||'Untitled', icon:g.icon||'🎯',
          color:g.color||GOAL_COLORS[0], category:g.category||'health', desc:g.desc||'', log:g.log||{},
          qualitySpec:!!g.qualitySpec
        }));
      }
      if(s.goalsTrash && Array.isArray(s.goalsTrash) && typeof Goals !== 'undefined'){
        Goals._trash = s.goalsTrash;
      }
    }catch(e){ console.warn('State apply error',e); }
  },
  // Plain-object copy of everything that gets persisted / exported
  snapshot(){
    return {
      tasks:this.tasks, taskTrash:this.taskTrash||[], planner:this.planner.blocks, blockTrash:this.blockTrash||[], stats:this.stats,
      pomo:{durations:this.pomo.durations}, notes:this.notes, noteTrash:this.noteTrash||[],
      theme:this.theme, lightMode:this.lightMode, classicLook:this.classicLook,
      customColumns:this.customColumns||[],
      hasEverRun:this.hasEverRun,
      rankSystemEnabled:this.rankSystemEnabled,
      rank:this.rank,
      // Include habits in exports and the combined local snapshot
      goals:(typeof Goals!=='undefined'?Goals._data:null)||[],
      goalsTrash:(typeof Goals!=='undefined'?Goals._trash:null)||[],
    };
  },
  save(){
    if(exampleMode) return;
    const key='focus_state_v3';
    const data=JSON.stringify(this.snapshot());
    // Write to ALL storage layers so at least one survives a mobile refresh
    try{ localStorage.setItem(key,data); }catch(e){}
    try{ sessionStorage.setItem(key,data); }catch(e){}
    this._idbSet(key,data); // async, fire-and-forget
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

function applyAppearance(){
  const classic = State.classicLook;
  $('modernAppearance').media = classic ? 'not all' : 'all';
  $('classicAppearance').media = classic ? 'all' : 'not all';
  const button = $('settingsClassicLookBtn');
  button.setAttribute('aria-pressed', String(classic));
  button.textContent = classic ? 'Classic on' : 'Classic off';
}

$('settingsClassicLookBtn').addEventListener('click', () => {
  State.classicLook = !State.classicLook;
  applyAppearance();
  State.save();
});

// ── THEME ──
function applyTheme(theme, light){
  const isMobile = window.innerWidth <= 768;

  document.documentElement.setAttribute('data-theme', theme);
  document.body.classList.toggle('light-mode', !!light);
  document.documentElement.classList.remove('light-mode');
  // Sync settings page controls
  const sSel=$('settingsThemePicker');
  if(sSel) sSel.querySelectorAll('.tswatch').forEach(button => {
    const selected=button.dataset.theme === theme;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const sBtn=$('settingsLightModeBtn'); if(sBtn) sBtn.textContent=light?'☀ Light':'☽ Dark';
  // Sync the Altayer-style toggle (Altayer: checked=dark, unchecked=light)
  const chk=document.getElementById('darkmode-switch');
  if(chk) chk.checked=!light;   // dark mode = checked, light mode = unchecked
  // Sync desktop label via .is-dark class (can't use CSS :checked sibling across DOM)
  const desktopLbl=document.querySelector('.desktop-focus-toggle');
  if(desktopLbl){
    desktopLbl.classList.toggle('is-dark', !light);
    desktopLbl.setAttribute('aria-pressed', String(!light));
  }
  State.theme=theme; State.lightMode=!!light;

  // On mobile, defer storage writes + stats update so they don't compete with
  // the repaint. State.save() hits localStorage, sessionStorage, IndexedDB. Pushing to setTimeout(0) lets the
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
  // Reset stats scroll-reveal flag only when actually leaving stats (stats section was active)
  const statsWasActive = document.getElementById('stats')?.classList.contains('active');
  if(name !== 'stats' && statsWasActive){
    _statsRevealDone = false;
    _statsRevealSetup = false;
    if(_statsRevealObserver){ _statsRevealObserver.disconnect(); _statsRevealObserver=null; }
  }
  $$('.section').forEach(s=>s.classList.remove('active'));
  const sec=document.getElementById(name); if(sec) sec.classList.add('active');
  const navSection = name === 'goal-detail' ? 'goals' : name;
  $$('.nav-item, .mobile-nav-item').forEach(item => {
    const active = item.dataset.section === navSection;
    item.classList.toggle('active', active);
    if(active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  $('workspacePage').textContent = name === 'goal-detail'
    ? 'Habit details'
    : document.querySelector('.nav-item.active .nav-label')?.textContent || 'Overview';
  window.scrollTo(0, 0);
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
  if(name==='goals') { if(typeof Goals !== 'undefined') Goals.render(); }
  if(name==='goal-detail') { /* rendered by Goals.renderDetail */ }
}
$$('.nav-item').forEach(i=>i.addEventListener('click',()=>showSection(i.dataset.section)));
$$('.mobile-nav-item').forEach(i=>i.addEventListener('click',()=>showSection(i.dataset.section)));
function goToTimer(){ showSection('pomodoro'); }
$('dashboardNewTask').addEventListener('click', () => {
  showSection('tasks');
  $('taskInput').focus();
});

// ── CLOCK ──
function updateClock(){
  const now=new Date();
  $('sidebarTime').textContent=now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false});
  $('sidebarDate').textContent=now.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
  const workspaceDate = $('workspaceDate');
  const date = dateStr(now);
  if(workspaceDate.dateTime !== date){
    workspaceDate.dateTime = date;
    workspaceDate.textContent = now.toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'});
  }
  const h=now.getHours();
  const greet=h<12?'Good morning':h<17?'Good afternoon':'Good evening';
  const gl=document.querySelector('#dashboard .section-label');
  if(gl) gl.textContent=greet;
}
updateClock(); setInterval(updateClock,1000);

// ── DASHBOARD TIPS ──
const tips=[
  {title:"The Focus Technique",desc:"Work in 25-minute focused intervals with 5-minute breaks. After 4 sessions take a longer 15–30 minute break to restore full concentration."},
  {title:"Time Blocking",desc:"Assign every hour a specific task before your day starts. This kills decision fatigue and protects your most important work."},
  {title:"The 2-Minute Rule",desc:"If a task takes less than 2 minutes, do it immediately. Otherwise schedule it. This keeps your list free of trivial clutter."},
  {title:"Eat the Frog",desc:"Tackle your most dreaded task first thing in the morning when willpower peaks. Everything after feels easier by comparison."},
  {title:"Deep Work Blocks",desc:"Schedule 90-minute uninterrupted blocks for demanding tasks. Silence notifications and protect this time ruthlessly."},
  {title:"Energy Management",desc:"Align tasks with your energy — creative work in peak hours, admin and routine tasks in low-energy windows."},
];
let tipIdx=0;
function showTip(){ const tt=$('tipTitle'),td=$('tipDesc'); if(tt) tt.textContent=tips[tipIdx].title; if(td) td.textContent=tips[tipIdx].desc; tipIdx=(tipIdx+1)%tips.length; }
$('nextTipBtn')?.addEventListener('click',showTip);

// ── DASHBOARD ──
function updateDashboard(){
  const today=todayStr(), mins=State.stats.focusMinutesByDay[today]||0;
  const _s=(id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  const _w=(id,v)=>{ const el=$(id); if(el) el.style.width=v; };
  _s('todayFocusTime',`${Math.floor(mins/60)}h ${mins%60}m`);
  _w('focusFill',Math.min(100,(mins/240)*100)+'%');
  const total=State.tasks.length, done=State.tasks.filter(t=>t.done || t.status==='done').length;
  _s('tasksCompleted',`${done} / ${total}`);
  _w('taskFill',total?(done/total*100)+'%':'0%');
  _s('streakDays',State.stats.currentStreak);
  _w('streakFill',Math.min(100,State.stats.currentStreak*10)+'%');
  _s('pomodoroCount',State.stats.totalPomodoros);
  _w('pomodoroFill',Math.min(100,State.stats.totalPomodoros*8)+'%');
  _s('dashTimerDisplay',fmt(State.pomo.secondsLeft));
  const timerMode = {pomodoro:'Deep focus', short:'Short break', long:'Long break'};
  _s('dashSessionType', `${timerMode[State.pomo.mode]} · ${State.pomo.totalSeconds / 60} min`);
  const list=$('dashTaskList');
  if(list){
    const pending=State.tasks.filter(t=>!t.done && t.status!=='done').slice(0,4);
    list.innerHTML=pending.length
      ?pending.map(t=>`<li class="preview-task"><span class="preview-task-dot" aria-hidden="true"></span><span>${escapeHtml(t.name)}</span></li>`).join('')
      :'<li class="preview-task empty-state"><span class="preview-task-dot" aria-hidden="true"></span><div><strong>Nothing in the queue</strong><p>Add a task to see it here.</p></div></li>';
  }
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
  $('timerDisplay').textContent=d; const dtd=$('dashTimerDisplay'); if(dtd) dtd.textContent=d;
  document.title=POMO.running?`${d} — FOCUS`:'Focus · Personal workspace';
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
$('startStopBtn')?.addEventListener('click',()=>{
  if(POMO.running){clearInterval(POMO.intervalId);POMO.running=false;$('startStopBtn').textContent='▶ Start';document.title='FOCUS';}
  else{POMO.running=true;$('startStopBtn').textContent='⏸ Pause';POMO.intervalId=setInterval(tickTimer,1000);}
});
$('resetBtn')?.addEventListener('click',()=>resetTimer());
$('skipBtn')?.addEventListener('click',()=>{clearInterval(POMO.intervalId);resetTimer(POMO.mode==='pomodoro'?'short':'pomodoro');});
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

$('swStartStopBtn')?.addEventListener('click',()=>{
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

$('swResetBtn')?.addEventListener('click',()=>{
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

$('swLapBtn')?.addEventListener('click',()=>{
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

  const gridStyle = `style="grid-template-columns: 28px 1fr 140px 160px 150px 60px"`;

  list.innerHTML=`<li class="task-grid-header" ${gridStyle}>
    <span class="tgh-drag"></span>
    <span class="tgh-name">Task</span>
    <span class="tgh-priority">Priority</span>
    <span class="tgh-status">Status</span>
    <span class="tgh-due">Due Date</span>
    <span class="tgh-actions"></span>
  </li>`
  +items.map(t=>{
    const st=t.status||(t.done?'done':'not-started');
    const sm=STATUS_META[st]||STATUS_META['not-started'];
    const pm=PRIORITY_META[t.priority]||PRIORITY_META['medium'];
    const isDone=st==='done'||t.done;
    const dueOverdue=t.due&&!isDone&&t.due<todayStr();
    const isOverdue=t.due&&!isDone&&t.due<todayStr();

    return `<li class="task-item task-grid-row${isDone?' done':''}${isOverdue?' overdue-task':''}" data-id="${t.id}" draggable="true" ${gridStyle}>
      <div class="task-drag-handle" title="Drag to reorder">⠿</div>
      <div class="task-name-cell">
        <span class="task-name" data-full="${escapeHtml(t.name)}">${escapeHtml(t.name)}</span>
        <button class="task-readmore-btn" style="display:none" onclick="expandTaskName(this)">read more</button>
        <span class="task-category-tag tag-${t.category}">${t.category}</span>
      </div>
      <div class="task-priority-cell">
        <select class="task-priority-select pri-select-${pm.key||t.priority}"
          onchange="updateTaskPriority(${t.id},this.value)"
          title="Priority">
          <option value="low"${t.priority==='low'?' selected':''}>Low</option>
          <option value="medium"${t.priority==='medium'?' selected':''}>Medium</option>
          <option value="high"${t.priority==='high'?' selected':''}>High</option>
          <option value="critical"${t.priority==='critical'?' selected':''}>Critical</option>
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
      <div class="task-row-actions">
        <button class="task-edit" onclick="openEditTaskModal(${t.id})" title="Edit task">✎</button>
        <button class="task-delete" onclick="deleteTask(${t.id})" title="Delete task">✕</button>
      </div>
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
  const d=new Date(str+'T00:00:00');
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
// ── EDIT TASK MODAL ──
function openEditTaskModal(id){
  const t=State.tasks.find(t=>t.id===id); if(!t)return;
  const modal=$('editTaskModal'); if(!modal)return;
  $('editTaskModalId').value=id;
  $('editTaskName').value=t.name||'';
  $('editTaskCategory').value=t.category||'work';
  $('editTaskPriority').value=t.priority||'medium';
  $('editTaskStatus').value=t.status||(t.done?'done':'not-started');
  $('editTaskDue').value=t.due||'';
  modal.style.display='flex';
  setTimeout(()=>$('editTaskName').focus(),50);
}
function saveEditTask(){
  const id=parseInt($('editTaskModalId').value);
  const t=State.tasks.find(t=>t.id===id); if(!t)return;
  const name=$('editTaskName').value.trim();
  if(!name){toast('Task name cannot be empty.','warn');return;}
  t.name=name;
  t.category=$('editTaskCategory').value;
  t.priority=$('editTaskPriority').value;
  t.status=$('editTaskStatus').value;
  t.done=t.status==='done';
  t.due=$('editTaskDue').value;
  if(t.done) recordTaskOutcome(t);
  State.save(); renderTaskList();
  $('editTaskModal').style.display='none';
  toast('Task updated \u2713','success');
  if(document.getElementById('dashboard').classList.contains('active'))updateDashboard();
}
document.addEventListener('click',e=>{
  if(e.target.id==='editTaskModal') $('editTaskModal').style.display='none';
  if(e.target.id==='editTaskModalClose') $('editTaskModal').style.display='none';
  if(e.target.id==='editTaskSave') saveEditTask();
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&$('editTaskModal')&&$('editTaskModal').style.display!=='none')
    $('editTaskModal').style.display='none';
});

$('addTaskBtn')?.addEventListener('click',addTask);
$('taskInput')?.addEventListener('keydown',e=>{if(e.key==='Enter')addTask();});
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

$('prevWeek')?.addEventListener('click',()=>{
  if(State.zoomedDay){
    // Navigate to previous day
    const d=new Date(State.zoomedDay+'T12:00:00'); d.setDate(d.getDate()-1);
    State.zoomedDay=dateStr(d); showDayZoom(State.zoomedDay);
  } else {
    State.planner.weekOffset--;
    if(State.plannerView==='month') showMonthView(); else showWeekView();
  }
});
$('nextWeek')?.addEventListener('click',()=>{
  if(State.zoomedDay){
    // Navigate to next day
    const d=new Date(State.zoomedDay+'T12:00:00'); d.setDate(d.getDate()+1);
    State.zoomedDay=dateStr(d); showDayZoom(State.zoomedDay);
  } else {
    State.planner.weekOffset++;
    if(State.plannerView==='month') showMonthView(); else showWeekView();
  }
});
$('zoomBackBtn')?.addEventListener('click',()=>{
  State.zoomedDay=null;
  clearInterval(nowLineInterval); clearInterval(blockCountdownInterval);
  clearInterval(window._weekNowInterval);
  $('plannerNav').style.display='none';
  $('plannerViewToggle').style.display='';
  if(State.plannerView==='month') showMonthView(); else showWeekView();
  $('zoomBackBtn').style.display='none';
});

function plannerOverviewBlocks(key){
  return [...(State.planner.blocks[key] || [])].sort((a,b)=>timeToMins(a.start)-timeToMins(b.start));
}

function showWeekView(){
  $('weeklyView').style.display='block';
  $('monthlyView').style.display='none';
  $('dayZoomView').style.display='none';
  $('zoomBackBtn').style.display='none';
  $('plannerNav').style.display='none';
  const sunday=getWeekStart(State.planner.weekOffset);
  sunday.setDate(sunday.getDate()-1);
  const today=todayStr();
  const grid=$('weeklyPlannerGrid');
  grid.innerHTML='';
  const weekday=new Intl.DateTimeFormat(undefined,{weekday:'short'});
  let nowMarker=null;

  for(let i=0;i<7;i++){
    const day=new Date(sunday);
    day.setDate(sunday.getDate()+i);
    const key=dateStr(day);
    const blocks=plannerOverviewBlocks(key);
    const status=key===today?' is-today':key<today?' is-past':'';
    const row=document.createElement('div');
    row.className='week-row';
    row.innerHTML=`<div class="week-row-header${status}">
      <span class="day-name">${weekday.format(day)}</span><span class="day-num">${day.getDate()}</span>
    </div>`;

    const preview=document.createElement('button');
    preview.type='button';
    preview.className='week-row-blocks'+status;
    preview.dataset.key=key;
    preview.setAttribute('aria-label',`Open ${day.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}, ${blocks.length} blocks`);
    preview.innerHTML=blocks.length
      ? `<span class="planner-overview-tiles">${blocks.map(block=>{
        const title=escapeHtml(block.title);
        const time=`${escapeHtml(block.start)}–${escapeHtml(block.end)}`;
        return `<span class="planner-overview-tile block-${escapeHtml(block.type)}${block.done?' is-done':''}" title="${title} · ${time}">
          <span class="planner-overview-time">${block.done?'✓ ':''}${time}</span>
          <span class="planner-overview-title">${title}</span>
        </span>`;
      }).join('')}</span>`
      : '<span class="planner-overview-empty">No blocks planned</span>';
    if(key===today){
      const rail=document.createElement('span');
      rail.className='planner-overview-rail';
      rail.setAttribute('aria-hidden','true');
      nowMarker=document.createElement('span');
      nowMarker.className='week-row-now-line';
      rail.appendChild(nowMarker);
      preview.appendChild(rail);
    }
    preview.addEventListener('click',()=>{ State.zoomedDay=key; showDayZoom(key); });
    row.appendChild(preview);
    grid.appendChild(row);
  }

  clearInterval(window._weekNowInterval);
  if(nowMarker){
    const updateMarker=()=>{
      const now=new Date();
      nowMarker.style.left=((now.getHours()*60+now.getMinutes())/1440*100)+'%';
    };
    updateMarker();
    window._weekNowInterval=setInterval(updateMarker,60000);
  }
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
  const blocks=State.planner.blocks[key]||[];
  setSuggestedBlockStart(blocks);
  renderDayGrid(key);
  const firstStart=blocks.length ? Math.min(...blocks.map(block=>timeToMins(block.start))) : 9*60;
  $('dayZoomGrid').scrollTop=Math.max(0,firstStart*PX_PER_MINUTE-48);
  startNowLine(key);
  startBlockCountdownInterval();
}

// ── MONTH VIEW ──
function showMonthView(){
  $('weeklyView').style.display='none';
  $('dayZoomView').style.display='none';
  $('monthlyView').style.display='block';
  $('zoomBackBtn').style.display='none';
  $('plannerNav').style.display='flex';
  // Disable "next" button only if already on current month and no future navigation
  const _nowForNav=new Date();
  const _baseForNav=new Date(_nowForNav.getFullYear(), _nowForNav.getMonth()+State.planner.weekOffset, 1);
  const _isCurrentMonth=_baseForNav.getFullYear()===_nowForNav.getFullYear()&&_baseForNav.getMonth()===_nowForNav.getMonth();
  $('nextWeek').disabled = false; // allow future months
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
  for(let d=1;d<=dim;d++){
    const dateKey=`${y}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const blocks=plannerOverviewBlocks(dateKey);
    const isToday=dateKey===today;
    const isPast=dateKey<today;
    const cell=document.createElement('button');
    cell.type='button';
    cell.className=`month-cell${isToday?' is-today':''}${isPast?' is-past':''}`;
    cell.setAttribute('aria-label',`Open ${new Date(y,mo,d).toLocaleDateString(undefined,{month:'long',day:'numeric'})}, ${blocks.length} blocks`);
    const count=blocks.length?`<span class="planner-month-count">${blocks.length}</span>`:'';
    const previews=blocks.slice(0,2).map(block=>`<span class="month-mini-block block-${escapeHtml(block.type)}${block.done?' is-done':''}" title="${escapeHtml(block.title)}">
      <span>${escapeHtml(block.title)}</span></span>`).join('');
    cell.innerHTML=`<span class="month-cell-num">${d}${count}</span><span class="month-cell-blocks">${previews}</span>`;
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
  const topPx=totalMins*PX_PER_MINUTE;
  const line=document.createElement('div');
  line.className='now-line';
  // Place inside blockLayer if it exists, otherwise fall back to grid
  const blockLayer=grid.querySelector('.grid-block-layer')||grid;
  line.style.cssText='position:absolute;left:0;right:0;top:'+topPx+'px;';
  blockLayer.appendChild(line);
}


const DAY_MINUTES=24*60;
const PX_PER_MINUTE=2.4;
const COMPACT_BLOCK_HEIGHT=56;
const LABEL_W=60; // px width of time-label column

function renderDayGrid(key){
  const blocks=State.planner.blocks[key]||[];
  const grid=$('dayZoomGrid'), today=todayStr();
  grid.innerHTML='';
  grid.style.position='relative';
  const startInput=$('blockStartTime');
  if(startInput.value===startInput.dataset.suggestedStart) setSuggestedBlockStart(blocks);

  const totalH=DAY_MINUTES*PX_PER_MINUTE;
  grid.style.setProperty('--planner-hour-height', 60*PX_PER_MINUTE+'px');

  // Hour guides sit below the draggable block layer.
  const rowLayer=document.createElement('div');
  rowLayer.style.cssText='position:relative;width:100%;height:'+totalH+'px;flex-shrink:0;';
  for(let h=0;h<24;h++){
    const row=document.createElement('div'); row.className='time-row';
    const lbl=document.createElement('div'); lbl.className='time-label';
    if(h===0) lbl.textContent='12:00 AM';
    else if(h<12) lbl.textContent=h+':00 AM';
    else if(h===12) lbl.textContent='12:00 PM';
    else lbl.textContent=(h-12)+':00 PM';
    if(key===today&&new Date().getHours()===h) lbl.style.color='var(--accent)';
    const slot=document.createElement('div'); slot.className='time-slot';
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
    if(!Number.isFinite(startMins) || startMins<0 || startMins>=DAY_MINUTES) return;
    const duration=plannerBlockDuration(b);
    const visibleDuration=Math.min(duration,DAY_MINUTES-startMins);
    const topPx=startMins*PX_PER_MINUTE;
    const heightPx=visibleDuration*PX_PER_MINUTE;
    const isDone=!!b.done;

    const el=document.createElement('div');
    el.className='time-block block-'+b.type+(isDone?' block-done':'');
    el.style.cssText='position:absolute;top:'+topPx+'px;height:'+heightPx+'px;left:4px;right:4px;pointer-events:all;';
    el.classList.toggle('compact-block',heightPx<COMPACT_BLOCK_HEIGHT);
    el.title=b.title+' ('+b.start+'–'+b.end+')';
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

    bindPlannerBlockDrag(el,b,key,grid,rowLayer,blocks,duration);
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
  showRescheduleModal(key, bid, blk, plannerBlockDuration(blk));
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

function plannerBlockDuration(block){
  const duration=timeToMins(block.end)-timeToMins(block.start);
  return duration>0 ? duration : duration+DAY_MINUTES;
}

function setSuggestedBlockStart(blocks){
  const latestEnd=blocks.reduce((latest, block)=>{
    const end=timeToMins(block.start)+plannerBlockDuration(block);
    return end<DAY_MINUTES ? Math.max(latest, end) : latest;
  }, 0);
  const input=$('blockStartTime');
  input.value=latestEnd ? minsToTime(latestEnd) : '09:00';
  input.dataset.suggestedStart=input.value;
}

function bindPlannerBlockDrag(el, block, key, grid, rowLayer, blocks, duration){
  const start=timeToMins(block.start);
  let drag=null;

  function updatePosition(){
    const minute=Math.max(0, Math.min(DAY_MINUTES-1,
      (drag.y-rowLayer.getBoundingClientRect().top-drag.offset)/PX_PER_MINUTE));
    let next=Math.round(minute);
    let nearest=8;
    for(const candidate of drag.boundaries){
      const distance=Math.abs(candidate-minute);
      if(distance<=nearest){
        next=candidate;
        nearest=distance;
      }
    }
    drag.minute=next;
    el.style.top=next*PX_PER_MINUTE+'px';
    const height=Math.min(duration,DAY_MINUTES-next)*PX_PER_MINUTE;
    el.style.height=height+'px';
    el.classList.toggle('compact-block',height<COMPACT_BLOCK_HEIGHT);
  }

  function scrollWhileDragging(){
    if(!drag || !el.isConnected || !grid.clientHeight) return;
    const {top,bottom}=grid.getBoundingClientRect();
    const zone=Math.min(40,grid.clientHeight/4);
    const before=grid.scrollTop;
    if(drag.y<top+zone) grid.scrollTop-=Math.min(24,(top+zone-drag.y)/2);
    else if(drag.y>bottom-zone) grid.scrollTop+=Math.min(24,(drag.y-bottom+zone)/2);
    if(grid.scrollTop!==before) updatePosition();
    drag.frame=requestAnimationFrame(scrollWhileDragging);
  }

  el.addEventListener('pointerdown',e=>{
    if(drag || !e.isPrimary || e.button!==0 || e.target.closest('button,label,input')) return;
    const offset=e.clientY-rowLayer.getBoundingClientRect().top-start*PX_PER_MINUTE;
    drag={id:e.pointerId,y:e.clientY,initialY:e.clientY,offset,minute:start,active:false,frame:0};
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove',e=>{
    if(!drag || e.pointerId!==drag.id) return;
    drag.y=e.clientY;
    if(!drag.active){
      if(Math.abs(drag.y-drag.initialY)<5) return;
      drag.active=true;
      drag.boundaries=blocks.filter(other=>other!==block).flatMap(other=>{
        const otherStart=timeToMins(other.start);
        return [otherStart-duration, otherStart+plannerBlockDuration(other)];
      }).filter(candidate=>candidate>=0 && candidate<DAY_MINUTES);
      el.classList.add('dragging');
      drag.frame=requestAnimationFrame(scrollWhileDragging);
    }
    updatePosition();
  });

  function finish(e, commit){
    if(!drag || e.pointerId!==drag.id) return;
    const {active,minute,frame}=drag;
    drag=null;
    cancelAnimationFrame(frame);
    if(!active) return;
    el.classList.remove('dragging');
    if(commit && minute!==start){
      block.start=minsToTime(minute);
      block.end=minsToTime(minute+duration);
      State.save();
      renderDayGrid(key);
    } else {
      el.style.top=start*PX_PER_MINUTE+'px';
      const height=Math.min(duration,DAY_MINUTES-start)*PX_PER_MINUTE;
      el.style.height=height+'px';
      el.classList.toggle('compact-block',height<COMPACT_BLOCK_HEIGHT);
    }
    if(commit && el.isConnected){
      // Ignore the click synthesized from this completed drag.
      const ignoreClick=event=>event.stopImmediatePropagation();
      el.addEventListener('click',ignoreClick,{capture:true,once:true});
      setTimeout(()=>el.removeEventListener('click',ignoreClick,true),0);
    }
  }
  el.addEventListener('pointerup',e=>finish(e,true));
  el.addEventListener('pointercancel',e=>finish(e,false));
  el.addEventListener('lostpointercapture',e=>finish(e,false));

  if(block.note){
    el.addEventListener('click',e=>{
      if(e.target.closest('button,label,input')) return;
      const open=el.classList.contains('note-open');
      $$('.time-block.note-open').forEach(item=>item.classList.remove('note-open'));
      el.classList.toggle('note-open',!open);
    });
  }
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

$('addBlockBtn')?.addEventListener('click',()=>{
  const title=$('blockTitle').value.trim();
  if(!title){toast('Please enter a block title.','warn');return;}
  const startVal=$('blockStartTime').value || '09:00';
  const [startH, startM] = startVal.split(':');
  const durMins=selectedBlockDuration();
  const start=`${startH}:${startM}`;
  const end=minsToTime(parseInt(startH)*60+parseInt(startM)+durMins);
  const type=$('blockType').value;
  const note=$('blockNote').value.trim();
  const key=State.zoomedDay||todayStr();
  if(!State.planner.blocks[key])State.planner.blocks[key]=[];
  State.planner.blocks[key].push({id:Date.now().toString(),title,start,end,type,note,done:false});
  $('blockTitle').value=''; $('blockNote').value='';
  State.save(); renderDayGrid(key); toast('Block added!','success');
  const input=$('blockStartTime');
  if(timeToMins(start)+durMins<DAY_MINUTES){
    input.value=end;
    input.dataset.suggestedStart=end;
  } else {
    setSuggestedBlockStart(State.planner.blocks[key]);
  }
  // Scroll to the newly added block
  setTimeout(()=>{
    const grid=$('dayZoomGrid'); if(!grid)return;
    const topPx=timeToMins(start)*PX_PER_MINUTE;
    grid.scrollTo({top:Math.max(0,topPx-60),behavior:'smooth'});
    // Also scroll the main page to bring the grid into view on mobile
    const wrap=$('dayZoomView'); if(wrap) wrap.scrollIntoView({behavior:'smooth',block:'nearest'});
  },80);
});

// ── DURATION CONTROLS ──
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
const durationSlider=$('blockDurationSlider');
function selectedBlockDuration(){
  const position=Number(durationSlider.value);
  return position<11 ? (position+1)*5 : 60+(position-11)*15;
}
function renderDurationSlider(){
  const minutes=selectedBlockDuration();
  const hours=Math.floor(minutes/60);
  const remainder=minutes%60;
  const label=hours ? hours+' h'+(remainder ? ' '+remainder+' min' : '') : minutes+' min';
  $('blockDurationValue').value=label;
  durationSlider.setAttribute('aria-valuetext',label);
}
durationSlider.addEventListener('input',renderDurationSlider);
renderDurationSlider();

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
$('editBlockModalClose')?.addEventListener('click',()=>{ $('editBlockModal').style.display='none'; _editKey=_editBid=null; });
$('editBlockModal')?.addEventListener('click',e=>{ if(e.target===$('editBlockModal'))$('editBlockModal').style.display='none'; });
$('editBlockSave')?.addEventListener('click',()=>{
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
$('modalClose')?.addEventListener('click',()=>{ $('blockNoteModal').style.display='none'; _modalKey=_modalBid=null; });
$('modalSave')?.addEventListener('click',()=>{
  if(!_modalKey||!_modalBid)return;
  const blk=(State.planner.blocks[_modalKey]||[]).find(b=>b.id===_modalBid); if(!blk)return;
  blk.note=$('modalNoteBody').value;
  State.save(); renderDayGrid(_modalKey);
  $('blockNoteModal').style.display='none'; toast('Note saved!','success');
});
$('blockNoteModal')?.addEventListener('click',e=>{ if(e.target===$('blockNoteModal'))$('blockNoteModal').style.display='none'; });

// ── STATS ──
$$('.range-tab').forEach(t=>t.addEventListener('click',()=>{
  $$('.range-tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
  State.statsRange=t.dataset.range; State.statsOffset=0; updateStats();
}));

// Stats period navigation (prev/next week or month)
document.addEventListener('click', e=>{
  if(e.target.id==='statsNavPrev'){ State.statsOffset--; updateStats(); }
  if(e.target.id==='statsNavNext' && State.statsOffset<0){ State.statsOffset++; updateStats(); }
});

const achievements=[
  {id:'first_session',icon:'⚡',name:'First Session',max:1,val:s=>Math.min(1,s.totalPomodoros)},
  {id:'ten_sessions',icon:'🔟',name:'10 Sessions',max:10,val:s=>Math.min(10,s.totalPomodoros)},
  {id:'fifty_sessions',icon:'💯',name:'50 Sessions',max:50,val:s=>Math.min(50,s.totalPomodoros)},
  {id:'streak_3',icon:'🔥',name:'3-Day Streak',max:3,val:s=>Math.min(3,s.bestStreak)},
  {id:'streak_7',icon:'⚡',name:'Week Warrior',max:7,val:s=>Math.min(7,s.bestStreak)},
  {id:'streak_30',icon:'🏆',name:'Iron Focus',max:30,val:s=>Math.min(30,s.bestStreak)},
];

// Format focus minutes: under an hour -> "45m", an hour or more -> "1.5h" / "2h"
function fmtFocus(m){
  m=Math.round(m||0);
  if(m<60) return m+'m';
  return (+(m/60).toFixed(1))+'h';
}

function updateStats(){
  const s=State.stats, tasks=State.tasks;
  $('totalFocusHours').textContent=(Object.values(s.focusMinutesByDay).reduce((a,b)=>a+b,0)/60).toFixed(1)+'h';
  $('totalPomodoros').textContent=s.totalPomodoros;
  $('totalTasksDone').textContent=Math.max(tasks.filter(t=>t.done).length, State.stats.doneOnTimeTasks.length);
  $('bestStreak').textContent=s.bestStreak;
  const isMonth=State.statsRange==='month';
  const off=State.statsOffset||0;
  let days;
  const todayKey=todayStr();
  if(isMonth){
    const now=new Date();
    const baseMonth=new Date(now.getFullYear(), now.getMonth()+off, 1);
    const y=baseMonth.getFullYear(),mo=baseMonth.getMonth(),dim=new Date(y,mo+1,0).getDate();
    days=Array.from({length:dim},(_,i)=>{const d=new Date(y,mo,i+1);return{key:dateStr(d),label:String(i+1)};});
    // Period label
    const periodName=baseMonth.toLocaleDateString('en-US',{month:'long',year:'numeric'});
    const lbl=$('statsPeriodLabel');
    if(lbl) lbl.textContent=off===0?'This Month':periodName;
  } else {
    days=getWeekDays(off).map((k,i)=>({key:k,label:['M','T','W','T','F','S','S'][i]}));
    // Period label
    const lbl=$('statsPeriodLabel');
    if(lbl){
      if(off===0) lbl.textContent='This Week';
      else if(off===-1) lbl.textContent='Last Week';
      else{
        const mon=new Date(days[0].key+'T12:00:00'), sun=new Date(days[6].key+'T12:00:00');
        const f=d=>d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
        lbl.textContent=`${f(mon)} – ${f(sun)}`;
      }
    }
  }

  // Enable/disable next button
  const nextBtn=$('statsNavNext');
  if(nextBtn) nextBtn.disabled = off >= 0;

  $('barChartLabel').textContent=`Daily Focus (${isMonth?($('statsPeriodLabel')?.textContent||'this month'):'week'})`;
  $('lineGraphLabel').textContent=`Focus Trend (${isMonth?($('statsPeriodLabel')?.textContent||'month'):'week'})`;

  // Bar chart
  const today=todayStr(), maxM=Math.max(1,...days.map(d=>s.focusMinutesByDay[d.key]||0));
  $('statsWeekChart').innerHTML=days.map(d=>{
    const m=s.focusMinutesByDay[d.key]||0,pct=Math.min(110,(m/maxM)*110);
    const isFuture=d.key>today;
    return `<div class="bar-chart-col${isFuture?' future-day':''}">
      <div class="bar-chart-bar${d.key===today?' highlight':''}" style="height:${Math.max(4,pct)}px"></div>
      <div class="bar-chart-label">${d.label}</div>
      <div class="bar-chart-val">${m>0?fmtFocus(m):''}</div>
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
  const habitPts=(()=>{ const HP={done:15,rest:3,miss:-10}; return (Goals._data||[]).reduce((sum,g)=>sum+Object.values(g.log||{}).reduce((s2,e)=>s2+(HP[e.status]||0),0),0); })();
  const score=taskPts+sessionPts+blockPts+streakPts+Math.max(0,habitPts);
  const ringMax=500;
  const circ=2*Math.PI*80;
  const fillPct=Math.min(1,score/ringMax);
  $('effProgress').style.strokeDashoffset=circ-(circ*fillPct);
  $('efficiencyValue').textContent=score>0?score:'—';
  const descs={0:'Complete tasks and sessions to build your score.',50:'Good start! Keep the momentum going.',150:"Nice progress. You're building solid habits.",300:"Strong performance. Your focus is sharpening.",500:"Excellent! You're operating at a high level.",800:"Elite. You've mastered time and focus.",1200:"Legendary. Exceptional consistency and output."};
  const dk=Object.keys(descs).map(Number).filter(k=>score>=k).pop()||0;
  const breakdown=`${taskPts} tasks · ${sessionPts} sessions · ${blockPts} blocks · ${streakPts} streak · ${Math.max(0,habitPts)} habits`;
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
let _statsRevealDone = false;
let _statsRevealSetup = false; // true once observer is live for this visit
function setupStatsScrollReveal(){
  // If already set up OR fully revealed during this stats visit, bail out immediately.
  // This prevents scroll/touch-triggered updateStats() calls from replaying animations.
  if(_statsRevealDone || _statsRevealSetup) return;

  // Disconnect any stale observer from a previous visit
  if(_statsRevealObserver){ _statsRevealObserver.disconnect(); _statsRevealObserver=null; }

  const statsSection=$('stats');
  if(!statsSection) return;

  const cards = Array.from(statsSection.querySelectorAll('.card'));

  // Fresh entry — reset all cards so animations play from scratch
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
    if(!toReveal.length){ _statsRevealDone = true; _statsRevealSetup = true; return; }

    let revealedCount = 0;
    _statsRevealSetup = true; // mark that observer is now live — block any further calls
    _statsRevealObserver = new IntersectionObserver((entries)=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          const el = entry.target;
          const idx = toReveal.indexOf(el);
          setTimeout(()=>{
            el.classList.remove('stats-scroll-reveal');
            el.classList.add('revealed');
            revealedCount++;
            if(revealedCount >= toReveal.length){
              _statsRevealDone = true;
              // Fully done — disconnect observer so no future scroll events fire
              if(_statsRevealObserver){ _statsRevealObserver.disconnect(); _statsRevealObserver=null; }
            }
            // If this is the line-graph card, trigger chart draw after reveal
            if(el.classList.contains('line-graph-card')){
              const isMonth=State.statsRange==='month';
              const todayKey2=todayStr();
              const off2=State.statsOffset||0;
              let days2;
              if(isMonth){
                const now=new Date();
                const baseMonth=new Date(now.getFullYear(), now.getMonth()+off2, 1);
                const y=baseMonth.getFullYear(),mo=baseMonth.getMonth(),dim=new Date(y,mo+1,0).getDate();
                days2=Array.from({length:dim},(_,i)=>{const d=new Date(y,mo,i+1);return{key:dateStr(d),label:String(i+1)};});
              } else {
                days2=getWeekDays(off2).map((k,i)=>({key:k,label:['M','T','W','T','F','S','S'][i]}));
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
  const pad  = { l:40, r:12, t:14, b:26 };
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
        ctx.fillText(fmtFocus(maxV * f), pad.l - 4, y + 4);
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
  const firstFutureIdx = days.findIndex(d => d.key > todayKeyLG);

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
    for (let i = 1; i <= lastDataIdx; i++) ctx.lineTo(xOf(i), yOf(vals[i]));
    ctx.lineTo(xOf(lastDataIdx), pad.t + gh);
    ctx.lineTo(xOf(0), pad.t + gh);
    ctx.closePath();
    const areaGrad = ctx.createLinearGradient(0, pad.t, 0, pad.t + gh);
    areaGrad.addColorStop(0, 'rgba(232,168,64,0.12)');
    areaGrad.addColorStop(1, 'rgba(232,168,64,0)');
    ctx.fillStyle = areaGrad; ctx.fill();

    // Colored segments (past/present only)
    for (let i = 1; i < n; i++) {
      if (i > lastDataIdx) break;
      const x0 = xOf(i-1), y0 = yOf(vals[i-1]), x1 = xOf(i), y1 = yOf(vals[i]);
      const diff  = vals[i] - vals[i-1];
      const color = diff > 0 ? '#00e676' : diff < 0 ? '#ff3d3d' : '#7a7d8e';
      ctx.save(); ctx.strokeStyle = color + '55'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.restore();
    }

    ctx.restore(); // remove clip

    // Dashed future baseline — drawn outside clip so it spans full future range
    if (firstFutureIdx !== -1) {
      const baseY = pad.t + gh;
      const futureStartIdx = firstFutureIdx > 0 ? firstFutureIdx - 1 : firstFutureIdx;
      ctx.save();
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 4]);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(xOf(futureStartIdx), baseY);
      for (let i = futureStartIdx + 1; i < n; i++) ctx.lineTo(xOf(i), baseY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Dots — past/present only; skip future empty days
    const bgColor = isDark ? '#181b24' : '#ffffff';
    vals.forEach((v, i) => {
      const isFutureDay = days[i].key > todayKeyLG;
      if (isFutureDay && v === 0) return; // skip empty future dots
      if (xOf(i) > revealX + 6) return; // hide during animation reveal
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

$('addNoteBtn')?.addEventListener('click',()=>{
  const note={id:Date.now(),title:'New Note',body:'',category:'general',color:'default',created:Date.now(),updated:Date.now()};
  State.notes.unshift(note); State.save(); openNote(note.id); renderNotesList();
});
$('deleteNoteBtn')?.addEventListener('click',()=>{
  if(!State.activeNoteId)return;
  deleteNoteById(State.activeNoteId);
});
$('noteTitleInput')?.addEventListener('input',()=>{clearTimeout(noteAutoSave);noteAutoSave=setTimeout(saveCurrentNote,800);});
$('noteBody')?.addEventListener('input',()=>{updateNoteWordCount();clearTimeout(noteAutoSave);noteAutoSave=setTimeout(saveCurrentNote,800);});
$('noteCategory')?.addEventListener('change',saveCurrentNote);
$('noteSearch')?.addEventListener('input',renderNotesList);

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
  { id:'platinum', name:'PLATINUM', title:'Elite Performer',    icon:'🪙', color:'#e5e4e2', min:600,  max:1100 },
  { id:'diamond',  name:'DIAMOND',  title:'Master of Focus',    icon:'💎', color:'#b9f2ff', min:1100, max:2000 },
  { id:'emerald',  name:'EMERALD',  title:'Legendary Grinder',  icon:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="52" height="52" style="display:inline-block;vertical-align:middle;image-rendering:pixelated"><rect x="5" y="0" width="2" height="1" fill="#00aa44"/><rect x="7" y="0" width="2" height="1" fill="#00cc55"/><rect x="9" y="0" width="2" height="1" fill="#00aa44"/><rect x="3" y="1" width="2" height="1" fill="#00aa44"/><rect x="5" y="1" width="6" height="1" fill="#00ff66"/><rect x="11" y="1" width="2" height="1" fill="#00aa44"/><rect x="2" y="2" width="1" height="1" fill="#008833"/><rect x="3" y="2" width="10" height="1" fill="#00dd55"/><rect x="13" y="2" width="1" height="1" fill="#008833"/><rect x="1" y="3" width="1" height="1" fill="#007722"/><rect x="2" y="3" width="12" height="1" fill="#00cc44"/><rect x="14" y="3" width="1" height="1" fill="#007722"/><rect x="1" y="4" width="14" height="1" fill="#00bb44"/><rect x="1" y="5" width="14" height="1" fill="#00aa33"/><rect x="2" y="6" width="12" height="1" fill="#009933"/><rect x="2" y="7" width="12" height="1" fill="#008822"/><rect x="3" y="8" width="10" height="1" fill="#007722"/><rect x="4" y="9" width="8" height="1" fill="#006611"/><rect x="5" y="10" width="6" height="1" fill="#005511"/><rect x="6" y="11" width="4" height="1" fill="#004400"/><rect x="7" y="12" width="2" height="1" fill="#003300"/></svg>', color:'#50c878', min:2000, max:3500 },
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

  $('rankBadgeIcon').innerHTML=rank.icon;
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
function seedExampleData(){
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
  State.tasks=exTasks;
  const completed=exTasks.find(task=>task.done);
  State.stats.doneOnTimeTasks=[{id:completed.id, name:completed.name, due:today, completedOn:today, category:completed.category}];

  // Notes
  const exNotes=[
    {id:Date.now()+100, title:'Deep Work — Key Takeaways', body:'## Core Idea\nDepth beats shallowness in almost every knowledge-worker profession.\n\n## Rules\n- Work deeply: scheduled, distraction-free sessions\n- Embrace boredom: do not reach for your phone every idle moment\n- Quit social media (or be deliberate about it)\n- Drain the shallows: ruthlessly cut low-value tasks\n\n## My commitment\nTwo 90-min deep work blocks per day, phone in another room.', category:'study', color:'blue', created:Date.now()-86400000, updated:Date.now()-3600000},
    {id:Date.now()+101, title:'Project Alpha — Sprint Notes', body:'## Goals this sprint\n- Complete API integration\n- Write unit tests for auth module\n- Review PR from Sarah\n\n## Blockers\n- Waiting on design assets from Jake\n- Need prod credentials for staging env\n\n## Done\n- Set up CI pipeline\n- Fixed mobile nav bug', category:'work', color:'orange', created:Date.now()-172800000, updated:Date.now()-7200000},
    {id:Date.now()+102, title:'Morning Routine Ideas', body:'Try waking up 30 min earlier.\n\nOption A (energising)\n- 6:00 wake, water, stretch\n- 6:15 20 min walk outside\n- 6:35 journal + plan the day\n- 7:00 first deep work block\n\nOption B (gentle)\n- 6:30 wake, meditate 10 min\n- 6:40 coffee + reading\n- 7:00 plan the day', category:'personal', color:'green', created:Date.now()-259200000, updated:Date.now()-86400000},
  ];
  State.notes=exNotes;

  const weekdayBlocks = [
    ['Deep work', '09:00', '10:30', 'focus', 'Work on the main deliverable before checking messages.'],
    ['Course practice', '11:00', '12:00', 'study', 'Complete the exercises and note any questions.'],
    ['Lunch break', '12:30', '13:15', 'break', 'Step away from the desk.'],
    ['Project review', '14:00', '15:00', 'creative', 'Review the draft and capture the next revision.'],
    ['Plan tomorrow', '16:15', '16:45', 'admin', 'Choose three priorities for the next day.'],
  ];
  const weekendBlocks = [
    ['Morning walk', '09:30', '10:15', 'exercise', 'Take an easy route outside.'],
    ['Read and take notes', '11:00', '11:45', 'study', 'Save one idea worth revisiting.'],
    ['Weekly reset', '15:00', '15:45', 'admin', 'Review the week and clear the inbox.'],
  ];
  const focusTopics = ['Portfolio draft', 'Machine learning practice', 'Writing sprint',
    'Landing page design', 'Project research'];
  const monday = getWeekDays()[0];
  const weekStart = new Date(monday + 'T12:00:00');
  State.planner.blocks = {};
  let blockId = 1;

  // Two weeks of history, this week, and two upcoming weeks.
  for (let day = -14; day < 21; day++) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + day);
    const key = dateStr(date);
    const weekday = (date.getDay() + 6) % 7;
    const schedule = weekday < 5 ? weekdayBlocks : weekendBlocks;
    State.planner.blocks[key] = schedule.map(([title, start, end, type, note], index) => ({
      id: blockId++,
      title: type === 'focus' ? focusTopics[weekday] : title,
      start, end, type, note,
      done: key < today && (day + index + 14) % 6 !== 0,
    }));
  }

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

  // Goals — seed 3 example habits with realistic history
  const buildLog = (pattern) => {
    // pattern: array of {offset, status, note?} going back N days
    const log = {};
    pattern.forEach(({offset, status, note}) => {
      log[d(offset)] = {status, note: note||'', ...(status==='done' ? {quality: 3 + (Math.abs(offset) % 3)} : {})};
    });
    return log;
  };

  const exGoals = [
    {
      id: 'demo-goal-1',
      name: 'Morning Run',
      qualitySpec: true,
      icon: '🏃',
      color: '#4dd87a',
      category: 'fitness',
      desc: '20 min run before breakfast',
      log: buildLog([
        {offset:-13,status:'done',note:'5km park loop'}, {offset:-12,status:'done'}, {offset:-11,status:'rest',note:'rest day'},
        {offset:-10,status:'done'}, {offset:-9,status:'done',note:'Personal best!'}, {offset:-8,status:'miss'},
        {offset:-7,status:'done'}, {offset:-6,status:'done'}, {offset:-5,status:'done',note:'Rainy but did it'},
        {offset:-4,status:'rest'}, {offset:-3,status:'done'}, {offset:-2,status:'done'}, {offset:-1,status:'done'},
        {offset:0,status:'done',note:'Great start today'},
      ])
    },
    {
      id: 'demo-goal-2',
      name: 'Read 30 Minutes',
      qualitySpec: true,
      icon: '📚',
      color: '#4a8fe8',
      category: 'learning',
      desc: 'Read before bed each night',
      log: buildLog([
        {offset:-13,status:'done'}, {offset:-12,status:'miss'}, {offset:-11,status:'done',note:'Atomic Habits ch.3'},
        {offset:-10,status:'done'}, {offset:-9,status:'done'}, {offset:-8,status:'done',note:'Finished ch.5'},
        {offset:-7,status:'miss'}, {offset:-6,status:'done'}, {offset:-5,status:'done'},
        {offset:-4,status:'done',note:'Deep Work — great chapter'}, {offset:-3,status:'rest'}, {offset:-2,status:'done'}, {offset:-1,status:'done'},
      ])
    },
    {
      id: 'demo-goal-3',
      name: 'Meditate',
      icon: '🧘',
      color: '#9b6ce8',
      category: 'mindfulness',
      desc: '10 min mindfulness session',
      log: buildLog([
        {offset:-10,status:'done'}, {offset:-9,status:'done',note:'Body scan session'},
        {offset:-8,status:'done'}, {offset:-7,status:'miss'}, {offset:-6,status:'done'},
        {offset:-5,status:'done'}, {offset:-4,status:'done',note:'Felt very calm after'},
        {offset:-3,status:'done'}, {offset:-2,status:'rest'}, {offset:-1,status:'done'},
        {offset:0,status:'done',note:'10 min breathing'},
      ])
    },
  ];

  Goals._data=exGoals;
}

// ── SETTINGS PAGE CONTROLS ──
document.querySelectorAll('#settingsThemePicker .tswatch').forEach(btn => {
  btn.addEventListener('click', () => applyTheme(btn.dataset.theme, State.lightMode));
});
document.getElementById('settingsLightModeBtn')?.addEventListener('click', () => applyTheme(State.theme, !State.lightMode));
// Altayer-style checkbox toggles dark/light mode
document.querySelector('.desktop-focus-toggle').addEventListener('click', () => {
  applyTheme(State.theme, !State.lightMode);
});
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
  if(!exampleMode){
    try{ localStorage.removeItem('focus_state_v3'); }catch(e){}
  }

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

// ── EXPORT / IMPORT USER DATA (JSON) ──
const EXPORT_FORMAT = 'focus-export';
const EXPORT_VERSION = 1;

function exportUserData(){
  try{
    const payload = {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      data: State.snapshot(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `focus-data-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
    toast('Data exported', 'success');
  }catch(e){
    console.warn('[Export] failed', e);
    toast('Export failed', 'warn');
  }
}

// Validates + normalises an imported object, then replaces current data with it.
// Returns true on success.
function importUserData(parsed){
  // Accept both the wrapped export format and a raw state object
  const s = (parsed && parsed.data && typeof parsed.data === 'object') ? parsed.data : parsed;
  if(!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('Not a valid FOCUS data file');

  const KNOWN = ['tasks','taskTrash','planner','blockTrash','stats','pomo','notes','noteTrash',
                 'theme','lightMode','classicLook','rank','rankSystemEnabled','goals','goalsTrash'];
  if(!KNOWN.some(k => k in s)) throw new Error('This file has no FOCUS data in it');

  const arr = v => Array.isArray(v) ? v : [];
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  const THEMES = ['midnight','forest','sunset','arctic','rose','ultraviolet'];

  // Stop any running timer before swapping state underneath it
  if(POMO.running){ clearInterval(POMO.intervalId); POMO.running = false; }

  State.tasks      = arr(s.tasks);
  State.taskTrash  = arr(s.taskTrash);
  State.planner    = { blocks: obj(s.planner), weekOffset: 0 };
  State.blockTrash = arr(s.blockTrash);
  State.notes      = arr(s.notes);
  State.noteTrash  = arr(s.noteTrash);
  State.activeNoteId = null;
  State.zoomedDay  = null;
  State.customColumns = [];

  const st = obj(s.stats);
  State.stats = Object.assign(
    { focusMinutesByDay:{}, totalPomodoros:0, bestStreak:0, currentStreak:0, lastFocusDay:'', missedTasks:[], doneOnTimeTasks:[] },
    st
  );
  State.stats.focusMinutesByDay = obj(State.stats.focusMinutesByDay);
  State.stats.missedTasks       = arr(State.stats.missedTasks);
  State.stats.doneOnTimeTasks   = arr(State.stats.doneOnTimeTasks);

  const d = obj(obj(s.pomo).durations);
  ['pomoDuration','shortBreak','longBreak','sessionGoal'].forEach(key=>{
    const n = Number(d[key]);
    if(isFinite(n) && n > 0){
      const [mn,mx] = DUR_BOUNDS[key];
      POMO.durations[key] = Math.max(mn, Math.min(mx, Math.round(n)));
    }
  });

  State.theme = THEMES.includes(s.theme) ? s.theme : 'midnight';
  State.lightMode = !!s.lightMode;
  State.classicLook = s.classicLook === true;
  applyAppearance();
  State.rankSystemEnabled = s.rankSystemEnabled !== undefined ? !!s.rankSystemEnabled : true;
  const r = obj(s.rank);
  State.rank = { points: Number(r.points)||0, events: arr(r.events) };
  State.hasEverRun = true;

  // Habits
  const mapGoal = g => ({
    id: String(g.id || Date.now() + Math.random()),
    name: g.name || 'Untitled', icon: g.icon || '🎯',
    color: g.color || GOAL_COLORS[0], category: g.category || 'health',
    desc: g.desc || '', log: obj(g.log), qualitySpec: !!g.qualitySpec,
  });
  Goals._data  = arr(s.goals).filter(g => g && typeof g === 'object').map(mapGoal);
  Goals._trash = arr(s.goalsTrash).filter(g => g && typeof g === 'object')
                   .map(g => Object.assign(mapGoal(g), { deletedAt: g.deletedAt || Date.now() }));

  // Persist everywhere (Goals.save also calls State.save → local storage layers)
  Goals.save();

  // Re-render the UI
  POMO.session = 1;
  ['pomoDuration','shortBreak','longBreak','sessionGoal'].forEach(k=>{ try{ syncDisplayValue(k); }catch(e){} });
  try{ applyTheme(State.theme, State.lightMode); }catch(e){}
  try{ applyRankSystemToggle(); }catch(e){}
  try{ resetTimer(); }catch(e){}
  try{ auditMissedTasks(); }catch(e){}
  try{ updateDashboard(); }catch(e){}
  try{ renderTaskList(); }catch(e){}
  try{ renderPlanner(); }catch(e){}
  try{ renderNotesList(); }catch(e){}
  try{ Goals._updateTrashBadge(); Goals._renderHero(); Goals.render(); }catch(e){}
  if(document.getElementById('stats').classList.contains('active')){ try{ updateStats(); }catch(e){} }
  return true;
}

document.getElementById('exportDataBtn')?.addEventListener('click', exportUserData);

(function wireImport(){
  const btn = document.getElementById('importDataBtn');
  const input = document.getElementById('importDataFile');
  if(!btn || !input) return;
  btn.addEventListener('click', () => { input.value = ''; input.click(); });
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onerror = () => toast('Could not read that file', 'warn');
    reader.onload = () => {
      let parsed;
      try{ parsed = JSON.parse(reader.result); }
      catch(e){ toast('That file is not valid JSON', 'warn'); return; }
      if(!confirm('Importing will replace ALL your current tasks, notes, planner blocks, habits, stats, and settings with the data in this file. Continue?')) return;
      try{
        importUserData(parsed);
        toast('Data imported', 'success');
      }catch(e){
        console.warn('[Import] failed', e);
        toast(e.message || 'Import failed', 'warn');
      }
    };
    reader.readAsText(file);
  });
})();

// ── INIT ──
(async()=>{
  await State.load();
  if(exampleMode){
    seedExampleData();
    $('exampleWorkspaceBanner').hidden=false;
    const workspaceUrl=new URL(location.href);
    workspaceUrl.searchParams.delete('example');
    $('exitExampleWorkspace').href=workspaceUrl.href;
    document.title='Example workspace · Focus';
  }
  applyAppearance();
  applyTheme(State.theme,State.lightMode);
  applyRankSystemToggle();
  if(!State.rank) State.rank={points:0,events:[]};
  if(!State.blockTrash) State.blockTrash=[];
  auditMissedTasks();
  resetTimer();
  updateDashboard();
  renderTaskList();
  renderPlanner();
  if(typeof Goals !== 'undefined' && document.getElementById('goals')?.classList.contains('active')) Goals.render();

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
/* ═══════════════════════════════════════════════════════════════
   GOALS — REDESIGN v2
   Drop-in replacement for the previous `Goals` module + wiring.
   Persists to localStorage under `focus_goals_v1` (same key as v1
   so existing habits are preserved).
   Requires globals already present in the app:
     - showSection(name)
     - toast(msg, type)
   ═══════════════════════════════════════════════════════════════ */

const GOAL_ICONS = ['🎯','🏃','💪','📚','🧘','🥗','😴','💧','✍️','🎨','🎸','🌿','🧹','💰','👥','🌅','🧠','🏊','🚴','🌱','📖','🍎','🚶','💊','☕','🛌','🪥','🧴','🎧','🪞'];
const GOAL_COLORS = ['#e8a840','#4dd87a','#ff5a53','#4a8fe8','#9b6ce8','#f07340','#3abaff','#f05090','#50d8c0','#ffcc44','#ff8a3a','#8aff7a'];
const GOAL_CATEGORIES = [
  {id:'health',      label:'Health',      emoji:'💪'},
  {id:'fitness',     label:'Fitness',     emoji:'🏃'},
  {id:'mindfulness', label:'Mind',        emoji:'🧘'},
  {id:'learning',    label:'Learning',    emoji:'📚'},
  {id:'creative',    label:'Creative',    emoji:'🎨'},
  {id:'social',      label:'Social',      emoji:'👥'},
  {id:'finance',     label:'Finance',     emoji:'💰'},
  {id:'work',        label:'Work',        emoji:'💼'},
  {id:'sleep',       label:'Sleep',       emoji:'😴'},
  {id:'nutrition',   label:'Nutrition',   emoji:'🥗'},
];
const QUALITY_LEVELS = [
  { n:1, label:'Awful', color:'#ff8a8a' }, // light red
  { n:2, label:'Bad',   color:'#ff9f43' }, // orange
  { n:3, label:'Mid',   color:'#ffd84d' }, // yellow
  { n:4, label:'Good',  color:'#8be28b' }, // light green
  { n:5, label:'Perfect', color:'#3ae0e8' } // aqua blue
];
const Q_MAP = Object.fromEntries(QUALITY_LEVELS.map(q => [q.n, q]));
const CAT_MAP = Object.fromEntries(GOAL_CATEGORIES.map(c => [c.id, c]));

const Goals = {
  _data: [],
  _trash: [],
  _activeId: null,
  _view: 'cards', // cards | week | month
  _selDate: null,  // date being logged on the detail page (null = today)
  _monthOff: 0,    // month offset shown on the detail page (0 = current)
  _ovWeekOff: 0,   // week offset on the Goals Week overview (0 = this week, -1 = last week …)
  _ovMonthOff: 0,  // month offset on the Goals Month overview (0 = this month)
  shiftOverview(period, delta){
    if (period === 'week') {
      if (this._ovWeekOff + delta > 0) return;
      this._ovWeekOff += delta;
      this._renderWeekPane();
    } else if (period === 'month') {
      if (this._ovMonthOff + delta > 0) return;
      this._ovMonthOff += delta;
      this._renderMonthPane();
    }
  },
  _syncOverviewNav(){
    document.querySelectorAll('[data-goals-period]').forEach(b => {
      const off = b.dataset.goalsPeriod === 'week' ? this._ovWeekOff : this._ovMonthOff;
      if (Number(b.dataset.goalsStep) > 0) b.disabled = off >= 0;
    });
  },
  _selKey(){ const t=this.todayStr(); return (this._selDate && this._selDate<=t) ? this._selDate : t; },
  openDetail(id, date){
    this._selDate = (date && date <= this.todayStr()) ? date : null;
    if (this._selDate) { const d=new Date(this._selDate+'T00:00:00'), n=new Date(); this._monthOff=(d.getFullYear()-n.getFullYear())*12+(d.getMonth()-n.getMonth()); }
    else this._monthOff = 0;
    this.renderDetail(id);
  },
  selectDate(date){
    if (date > this.todayStr()) return;
    this._selDate = date;
    this.renderDetail(this._activeId);
  },
  shiftMonth(delta){
    if (this._monthOff + delta > 0) return;
    this._monthOff += delta;
    this.renderDetail(this._activeId);
  },
  _storageKey: 'focus_goals_v1',
  _trashKey: 'focus_goals_trash_v1',

  get data(){ return this._data; },

  /* ── Persistence ───────────────────────────────────────────── */
  load(){
    if(exampleMode) return;
    // If State.load() already populated _data (from focus_state_v3), keep it.
    // Only read from the legacy goals-specific key if we still have nothing.
    if(!this._data.length){
      try {
        const raw = localStorage.getItem(this._storageKey);
        if (raw) this._data = JSON.parse(raw) || [];
      } catch(e){}
      if (!this._data.length) {
        try {
          const raw = sessionStorage.getItem(this._storageKey);
          if (raw) this._data = JSON.parse(raw) || [];
        } catch(e){}
      }
    }
    if(!this._trash.length){
      try {
        const rawT = localStorage.getItem(this._trashKey);
        if (rawT) this._trash = JSON.parse(rawT) || [];
      } catch(e){}
    }
    // shape guard
    this._data = (this._data || []).map(g => ({
      id: String(g.id || Date.now()),
      name: g.name || 'Untitled',
      icon: g.icon || '🎯',
      color: g.color || GOAL_COLORS[0],
      category: g.category || 'health',
      desc: g.desc || '',
      log: g.log || {},
      qualitySpec: !!g.qualitySpec,
    }));
    this._trash = (this._trash || []).map(g => ({
      id: String(g.id || Date.now()),
      name: g.name || 'Untitled',
      icon: g.icon || '🎯',
      color: g.color || GOAL_COLORS[0],
      category: g.category || 'health',
      desc: g.desc || '',
      log: g.log || {},
      qualitySpec: !!g.qualitySpec,
      deletedAt: g.deletedAt || Date.now(),
    }));
  },
  _saving: false, // re-entrancy guard
  save(){
    if(exampleMode) return;
    const s = JSON.stringify(this._data);
    try { localStorage.setItem(this._storageKey, s); } catch(e){}
    try { sessionStorage.setItem(this._storageKey, s); } catch(e){}
    const t = JSON.stringify(this._trash);
    try { localStorage.setItem(this._trashKey, t); } catch(e){}
    // Push goals to Supabase via State.save() so they sync cross-device.
    // _saving guard prevents the mutual Goals.save()<->State.save() loop.
    if(!this._saving){
      this._saving = true;
      try { if(typeof State !== 'undefined' && State.save) State.save(); } catch(e){}
      this._saving = false;
    }
  },

  /* ── Date helpers ──────────────────────────────────────────── */
  _pad(n){ return String(n).padStart(2,'0'); },
  toKey(d){ return `${d.getFullYear()}-${this._pad(d.getMonth()+1)}-${this._pad(d.getDate())}`; },
  todayStr(){ const n = new Date(); n.setHours(0,0,0,0); return this.toKey(n); },
  formatDate(str){
    const d = new Date(str+'T00:00:00');
    return d.toLocaleDateString(undefined,{weekday:'long', month:'short', day:'numeric'});
  },
  getWeekDates(refDate){
    const now = refDate ? new Date(refDate) : new Date();
    now.setHours(0,0,0,0);
    const day = now.getDay(); // Sun=0
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((day + 6) % 7));
    return Array.from({length:7}, (_,i) => {
      const d = new Date(mon); d.setDate(mon.getDate()+i);
      return this.toKey(d);
    });
  },
  getMonthDates(off){
    const now = new Date(); now.setDate(1); now.setMonth(now.getMonth() + (off||0));
    const y = now.getFullYear(), m = now.getMonth();
    const days = new Date(y, m+1, 0).getDate();
    return Array.from({length: days}, (_,i) => {
      const d = new Date(y, m, i+1); return this.toKey(d);
    });
  },

  /* ── Streaks ───────────────────────────────────────────────── */
  calcStreak(log){
    const today = this.todayStr();
    let cur = 0, longest = 0, run = 0;

    // Current: walk backward from today; rest preserves, miss/empty breaks
    let d = new Date(today+'T00:00:00');
    while (true) {
      const k = this.toKey(d);
      const e = log[k];
      if (e && e.status === 'done') cur++;
      else if (e && e.status === 'rest') { /* preserve */ }
      else break;
      d.setDate(d.getDate() - 1);
    }

    // Longest: scan all dated entries chronologically
    const dates = Object.keys(log).sort();
    let prev = null;
    for (const k of dates) {
      if (log[k].status === 'done') {
        if (prev) {
          const diff = (new Date(k+'T00:00:00') - new Date(prev+'T00:00:00')) / 86400000;
          run = (diff <= 2) ? run + 1 : 1;
        } else run = 1;
        longest = Math.max(longest, run);
        prev = k;
      } else if (log[k].status === 'miss') {
        run = 0; prev = null;
      }
    }
    longest = Math.max(longest, cur);
    return { current: cur, longest };
  },

  /* ── CRUD ──────────────────────────────────────────────────── */
  add(g){
    g.id = Date.now().toString();
    g.log = {};
    this._data.push(g);
    this.save();
    this.render();
  },
  getById(id){ return this._data.find(g => g.id === id); },
  delete(id){
    const g = this._data.find(g => g.id === id);
    if (g) {
      this._trash.unshift({ ...g, deletedAt: Date.now() });
      if (this._trash.length > 50) this._trash = this._trash.slice(0, 50);
    }
    this._data = this._data.filter(g => g.id !== id);
    this.save();
    this._updateTrashBadge();
    showSection('goals');
    this.render();
    if (typeof toast === 'function') toast('Habit moved to trash','warn');
  },
  restoreFromTrash(id){
    const idx = this._trash.findIndex(g => g.id === id);
    if (idx === -1) return;
    const g = this._trash.splice(idx, 1)[0];
    delete g.deletedAt;
    this._data.push(g);
    this.save();
    this._updateTrashBadge();
    this.render();
    if (typeof toast === 'function') toast('Habit restored ✦','success');
  },
  emptyTrash(){
    this._trash = [];
    this.save();
    this._updateTrashBadge();
  },
  _updateTrashBadge(){
    const badge = document.getElementById('goalsTrashCount');
    if (!badge) return;
    const n = this._trash.length;
    badge.textContent = n;
    badge.style.display = n ? 'inline' : 'none';
  },
  openTrash(){
    const list = document.getElementById('goalsTrashList');
    if (list) {
      if (!this._trash.length) {
        list.innerHTML = '<li class="trash-empty-state">Trash is empty.</li>';
      } else {
        list.innerHTML = this._trash.map(g => `
          <li class="trash-item">
            <span class="trash-item-icon">${g.icon}</span>
            <span class="trash-item-name">${escapeHtml(g.name)}</span>
            <button class="trash-restore-btn" data-id="${g.id}">Restore</button>
            <button class="trash-perm-del-btn" data-id="${g.id}">✕</button>
          </li>`).join('');
        list.querySelectorAll('.trash-restore-btn').forEach(btn => {
          btn.addEventListener('click', () => { this.restoreFromTrash(btn.dataset.id); this.openTrash(); });
        });
        list.querySelectorAll('.trash-perm-del-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            this._trash = this._trash.filter(g => g.id !== btn.dataset.id);
            this.save(); this._updateTrashBadge(); this.openTrash();
          });
        });
      }
    }
    const modal = document.getElementById('goalsTrashModal');
    if (modal) { modal.style.display = 'flex'; requestAnimationFrame(() => modal.classList.add('active')); }
  },
  closeTrash(){
    const modal = document.getElementById('goalsTrashModal');
    if (modal) { modal.classList.remove('active'); setTimeout(() => { modal.style.display = 'none'; }, 200); }
  },
  /* ── Edit goal ──────────────────────────────────────────────── */
  _editIcon: '🎯',
  _editColor: '#e8a840',
  _editCat: 'health',
  openEditModal(id){
    const g = this.getById(id); if (!g) return;
    this._editIcon = g.icon;
    this._editColor = g.color;
    this._editCat = g.category;

    const ni = document.getElementById('editGoalNameInput'); if (ni) ni.value = g.name;
    const di = document.getElementById('editGoalDescInput'); if (di) di.value = g.desc || '';
    const eq = document.getElementById('editGoalQualityToggle'); if (eq) eq.checked = !!g.qualitySpec;

    // Icons
    const ip = document.getElementById('editGoalIconPicker');
    if (ip) {
      ip.innerHTML = '';
      GOAL_ICONS.forEach(icon => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'gmod-icon';
        b.textContent = icon;
        if (icon === this._editIcon) b.classList.add('selected');
        b.onclick = () => { ip.querySelectorAll('.gmod-icon').forEach(x => x.classList.remove('selected')); b.classList.add('selected'); this._editIcon = icon; };
        ip.appendChild(b);
      });
    }
    // Colors
    const cp = document.getElementById('editGoalColorPicker');
    if (cp) {
      cp.innerHTML = '';
      GOAL_COLORS.forEach(color => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'gmod-color';
        b.style.background = color; b.style.color = color;
        if (color === this._editColor) b.classList.add('selected');
        b.onclick = () => { cp.querySelectorAll('.gmod-color').forEach(x => x.classList.remove('selected')); b.classList.add('selected'); this._editColor = color; };
        cp.appendChild(b);
      });
    }
    // Categories
    const catP = document.getElementById('editGoalCatPicker');
    if (catP) {
      catP.innerHTML = '';
      GOAL_CATEGORIES.forEach(c => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'gmod-cat';
        b.textContent = `${c.emoji} ${c.label}`;
        if (c.id === this._editCat) b.classList.add('selected');
        b.onclick = () => { catP.querySelectorAll('.gmod-cat').forEach(x => x.classList.remove('selected')); b.classList.add('selected'); this._editCat = c.id; };
        catP.appendChild(b);
      });
    }

    const saveBtn = document.getElementById('saveEditGoalBtn');
    if (saveBtn) saveBtn.onclick = () => this.saveEdit(id);

    const modal = document.getElementById('editGoalModal');
    if (modal) { modal.style.display = 'flex'; requestAnimationFrame(() => modal.classList.add('active')); }
    document.getElementById('editGoalNameInput')?.focus();
  },
  closeEditModal(){
    const modal = document.getElementById('editGoalModal');
    if (modal) { modal.classList.remove('active'); setTimeout(() => { modal.style.display = 'none'; }, 200); }
  },
  saveEdit(id){
    const g = this.getById(id); if (!g) return;
    const name = (document.getElementById('editGoalNameInput')?.value || '').trim();
    if (!name) { if (typeof toast === 'function') toast('Please name your habit','warn'); return; }
    g.name = name;
    g.desc = (document.getElementById('editGoalDescInput')?.value || '').trim();
    g.icon = this._editIcon;
    g.color = this._editColor;
    g.category = this._editCat;
    g.qualitySpec = !!document.getElementById('editGoalQualityToggle')?.checked;
    this.save();
    this.closeEditModal();
    this.renderDetail(id);
    this.render();
    if (typeof toast === 'function') toast('Habit updated ✦','success');
  },

  /* ── Logging ───────────────────────────────────────────────── */

  // Points per status — permanent once set per day
  _habitPts: { done: 15, rest: 3, miss: -10 },

  // Set a day status permanently; reverse old rank pts if overwriting
  _applyStatus(g, key, status){
    const prev = g.log[key]?.status || null;
    if (prev === status) return false; // already set — locked

    // Reverse old rank points when overwriting
    if (prev !== null && State.rankSystemEnabled) {
      const undo = -(this._habitPts[prev] || 0);
      if (undo !== 0) {
        State.rank = State.rank || { points:0, events:[] };
        State.rank.points = Math.max(0, (State.rank.points||0) + undo);
        State.rank.events = [{ desc:`↩ Corrected: ${g.name} (${prev})`, pts:undo, ts:Date.now() }, ...(State.rank.events||[])].slice(0,20);
      }
    }

    g.log[key] = { status, note: g.log[key]?.note || '' }; // quality is cleared on status change (only valid for 'done')

    // Award new rank points
    const pts = this._habitPts[status] || 0;
    if (pts !== 0) {
      const labels = { done:'✓ Habit kept', rest:'~ Rest day', miss:'✗ Habit missed' };
      addRankEvent(`${labels[status]}: ${g.name}`, pts);
    }
    return true;
  },

  logToday(status){
    const g = this.getById(this._activeId); if (!g) return;
    const k = this._selKey();
    const isPast = k !== this.todayStr();
    const note = document.getElementById('gdNoteInput')?.value || '';
    const changed = this._applyStatus(g, k, status);
    if (!changed) {
      if (typeof toast === 'function') toast('Already logged — tap a different status to change','normal');
      return;
    }
    if (g.log[k]) g.log[k].note = note;
    this.save();
    this.renderDetail(this._activeId, status);
    const labels = { done:'Done — kept ✓', rest:'Rest day ~', miss:'Missed ✗' };
    const when = isPast ? ` · ${new Date(k+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'})}` : '';
    if (typeof toast === 'function') toast(labels[status]+when,'success');
  },
  // Quality Specification — rate a completed day 1-5 (click the same rating again to clear)
  setQuality(id, key, q, e){
    if (e) e.stopPropagation();
    const g = this.getById(id); if (!g || !g.qualitySpec) return;
    const entry = g.log[key];
    if (!entry || entry.status !== 'done') {
      if (typeof toast === 'function') toast('Mark the day as Done first, then rate its quality','normal');
      return;
    }
    if (entry.quality === q) delete entry.quality; else entry.quality = q;
    this.save();
    if (document.getElementById('goal-detail')?.classList.contains('active')) this.renderDetail(id);
    else this.render();
    if (typeof toast === 'function') toast(entry.quality ? `Quality: ${entry.quality} — ${Q_MAP[entry.quality].label}` : 'Quality rating cleared','success');
  },
  _qualityScaleHTML(selected, enabled){
    return QUALITY_LEVELS.map(q => `<button type="button" class="q-btn${selected === q.n ? ' is-active' : ''}" data-q="${q.n}" style="--qc:${q.color}" ${enabled ? '' : 'disabled'} title="${q.n} — ${q.label}" aria-label="Quality ${q.n}: ${q.label}"><span class="q-btn-num">${q.n}</span><span class="q-btn-lbl">${q.label}</span></button>`).join('');
  },
  logFromCard(id, status, e){
    if (e) e.stopPropagation();
    const g = this.getById(id); if (!g) return;
    const k = this.todayStr();
    const changed = this._applyStatus(g, k, status);
    if (!changed) {
      if (typeof toast === 'function') toast('Already logged — tap a different status to change','normal');
      return;
    }
    this.save();
    this.render({ flashId: id, flashStatus: status });
    const labels = { done:'✓ Done', rest:'~ Rest', miss:'✗ Missed' };
    if (typeof toast === 'function') toast(labels[status],'success');
  },

  /* ── Hero stats ────────────────────────────────────────────── */
  _renderHero(){
    const today = this.todayStr();
    const dateEl  = document.getElementById('goalsHeroDate');
    const countEl = document.getElementById('goalsHeroCount');
    const ringDone  = document.getElementById('goalsRingDone');
    const ringTotal = document.getElementById('goalsRingTotal');
    const ringFill  = document.getElementById('goalsRingFill');

    if (dateEl) {
      dateEl.textContent = new Date().toLocaleDateString(undefined, {
        weekday: 'long', month: 'long', day: 'numeric'
      });
    }
    const total = this._data.length;
    const done  = this._data.filter(g => g.log[today]?.status === 'done').length;
    if (countEl) countEl.textContent = `${total} active habit${total === 1 ? '' : 's'}`;
    if (ringDone)  ringDone.textContent  = done;
    if (ringTotal) ringTotal.textContent = `/${total}`;
    if (ringFill) {
      const C = 2 * Math.PI * 52; // 326.7
      const pct = total ? done / total : 0;
      ringFill.setAttribute('stroke-dasharray', C.toFixed(2));
      ringFill.setAttribute('stroke-dashoffset', (C * (1 - pct)).toFixed(2));
    }
  },

  /* ── Tabs ──────────────────────────────────────────────────── */
  /* ── Quality Overview mode ─────────────────────────────────── */
  _qMode: false,
  // Returns how a day box should look for habit g. When Quality Overview is on and the
  // habit has Quality Specification enabled, rated days show their quality colour
  // instead of done / rest / missed.
  _qCell(g, e){
    if (!this._qMode || !g.qualitySpec) return { status: e ? e.status : '', cls: '', style: '', tip: '' };
    if (e && e.status === 'done' && Q_MAP[e.quality]) {
      const q = Q_MAP[e.quality];
      return { status: '', cls: 'q-rated',
               style: `background:${q.color};border-color:${q.color};box-shadow:0 0 8px -2px ${q.color};`,
               tip: ` · Quality ${q.n} — ${q.label}` };
    }
    if (e && e.status === 'done') return { status: '', cls: 'q-unrated', style: '', tip: ' · Done, not rated' };
    return { status: '', cls: 'q-none', style: '', tip: '' };
  },
  _renderQualityLegend(){
    const html = QUALITY_LEVELS.map(q =>
      `<span class="gm-legend-item"><span class="gm-legend-swatch" style="background:${q.color}"></span>${q.n} · ${q.label}</span>`
    ).join('') + `<span class="gm-legend-item"><span class="gm-legend-swatch q-unrated-sw"></span>Done, not rated</span>`;
    ['goalsQualityLegend','gdQualityLegend'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.display = this._qMode ? '' : 'none';
      el.innerHTML = this._qMode ? html : '';
    });
  },
  // Keep the button on the list page and the one inside a habit in sync
  _syncQualityBtns(){
    ['goalsQualityBtn','gdQualityBtn'].forEach(id => {
      const b = document.getElementById(id); if (!b) return;
      b.classList.toggle('active', this._qMode);
      b.setAttribute('aria-pressed', String(this._qMode));
    });
  },
  setQualityMode(on){
    if (on && !this._data.some(g => g.qualitySpec)) {
      if (typeof toast === 'function') toast('Turn on Quality Specification for a habit first','warn');
      return;
    }
    this._qMode = !!on;
    if(!exampleMode){
      try { localStorage.setItem('focus_goals_qmode', on ? '1' : '0'); } catch(e){}
    }
    this._syncQualityBtns();
    this._renderQualityLegend();
    this.render();
    // If a habit is open, refresh it too so the toggle works from inside the habit
    if (document.getElementById('goal-detail')?.classList.contains('active') && this._activeId) this.renderDetail(this._activeId);
  },
  setView(view){
    this._view = view;
    document.querySelectorAll('#goalsTabs .goals-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    this._applyView();
  },
  _applyView(){
    const hasData = !!this._data.length;
    const grid     = document.getElementById('goalsGrid');
    const empty    = document.getElementById('goalsEmpty');
    const overview = document.getElementById('goalsOverview');
    const weekP    = document.getElementById('goalsWeekPane');
    const monthP   = document.getElementById('goalsMonthPane');

    if (!hasData) {
      if (grid)     grid.style.display     = 'none';
      if (overview) overview.style.display = 'none';
      if (empty)    empty.style.display    = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';

    if (this._view === 'cards') {
      if (grid)     grid.style.display     = 'grid';
      if (overview) overview.style.display = 'none';
    } else {
      if (grid)     grid.style.display     = 'none';
      if (overview) overview.style.display = 'grid';
      if (weekP)  weekP.style.display  = (this._view === 'week')  ? 'block' : 'none';
      if (monthP) monthP.style.display = (this._view === 'month') ? 'block' : 'none';
      if (this._view === 'week')  this._renderWeekPane();
      if (this._view === 'month') this._renderMonthPane();
    }
  },

  /* ── Cards render ──────────────────────────────────────────── */
  render(opts){
    opts = opts || {};
    this._renderHero();

    const grid = document.getElementById('goalsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const today = this.todayStr();
    const weekDates = this.getWeekDates();
    const dayNames = ['M','T','W','T','F','S','S'];

    this._data.forEach((g, idx) => {
      const streaks = this.calcStreak(g.log);
      const todayEntry = g.log[today];
      const card = document.createElement('article');
      card.className = 'goal-card';
      card.style.setProperty('--gc', g.color);
      card.style.animationDelay = `${Math.min(idx, 8) * 0.05}s`;
      card.onclick = () => this.openDetail(g.id);

      const ribbon = weekDates.map((d, i) => {
        const e = g.log[d];
        const qc = this._qCell(g, e);
        const cls = [
          'gc-day-dot',
          qc.status,
          qc.cls,
          d > today ? 'future' : '',
          d === today ? 'today' : '',
          (opts.flashId === g.id && d === today && opts.flashStatus) ? 'just-logged' : ''
        ].filter(Boolean).join(' ');
        return `<div class="gc-day" data-date="${d}"${d <= today ? ' title="Log ' + d + qc.tip + '" style="cursor:pointer"' : ''}>
          <span class="gc-day-label">${dayNames[i]}</span>
          <div class="${cls}"${qc.style ? ` style="${qc.style}"` : ''}></div>
        </div>`;
      }).join('');

      const cat = CAT_MAP[g.category] || { label: g.category, emoji: '' };
      const ts = todayEntry?.status;

      card.innerHTML = `
        <div class="gc-top">
          <div class="gc-icon">${g.icon}</div>
          <div class="gc-titles">
            <div class="gc-name">${escapeHtml(g.name)}</div>
            <div class="gc-cat">${cat.emoji} ${cat.label}</div>
          </div>
          <div class="gc-streak" title="Longest: ${streaks.longest}">
            <span class="flame">🔥</span>
            <span class="n">${streaks.current}</span>
            <span class="u">d</span>
          </div>
        </div>
        ${g.desc ? `<div class="gc-desc">"${escapeHtml(g.desc)}"</div>` : ''}
        <div class="gc-ribbon">${ribbon}</div>
        <div class="gc-actions">
          <button type="button" class="gc-act done ${ts==='done'?'is-active':''}" data-act="done">✓ Done</button>
          <button type="button" class="gc-act rest ${ts==='rest'?'is-active':''}" data-act="rest">~ Rest</button>
          <button type="button" class="gc-act miss ${ts==='miss'?'is-active':''}" data-act="miss">× Miss</button>
        </div>
        ${g.qualitySpec ? `<div class="gc-quality" data-qrow>
          <span class="gc-quality-label">Quality</span>
          <div class="q-scale mini">${this._qualityScaleHTML(ts==='done' ? todayEntry.quality : null, ts==='done')}</div>
        </div>` : ''}
      `;
      card.querySelectorAll('.gc-quality .q-btn').forEach(btn => {
        btn.addEventListener('click', (e) => this.setQuality(g.id, today, parseInt(btn.dataset.q,10), e));
      });
      card.querySelector('.gc-quality')?.addEventListener('click', e => e.stopPropagation());
      card.querySelectorAll('.gc-day[data-date]').forEach(el => {
        el.addEventListener('click', (e) => {
          const dt = el.dataset.date;
          if (dt > today) return;
          e.stopPropagation();
          this.openDetail(g.id, dt);
        });
      });
      card.querySelectorAll('.gc-act').forEach(btn => {
        btn.addEventListener('click', (e) => this.logFromCard(g.id, btn.dataset.act, e));
      });
      grid.appendChild(card);
    });

    this._applyView();
  },

  /* ── Week / Month matrix panes ─────────────────────────────── */
  _renderWeekPane(){
    const matrix = document.getElementById('goalsWeekMatrix');
    const range  = document.getElementById('goalsWeekRange');
    if (!matrix) return;
    const ref = new Date(); ref.setDate(ref.getDate() + this._ovWeekOff * 7);
    const days = this.getWeekDates(ref);
    const today = this.todayStr();

    matrix.innerHTML = this._data.map(g => `
      <div class="gm-row" style="--gc:${g.color}">
        <div class="gm-row-head">
          <div class="gm-row-icon">${g.icon}</div>
          <div class="gm-row-name">${escapeHtml(g.name)}</div>
        </div>
        <div class="gm-cells week">
          ${days.map(d => {
            const e = g.log[d];
            const qc = this._qCell(g, e);
            const cls = [
              'gm-cell',
              qc.status,
              qc.cls,
              d > today ? 'future' : '',
              d === today ? 'today' : ''
            ].filter(Boolean).join(' ');
            return `<div class="${cls}"${qc.style ? ` style="${qc.style}"` : ''} title="${d}${qc.tip}"></div>`;
          }).join('')}
        </div>
      </div>
    `).join('');

    if (range) {
      const f = k => new Date(k+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'});
      range.textContent = `${f(days[0])} — ${f(days[6])}` + (this._ovWeekOff === 0 ? ' (this week)' : '');
    }
    this._syncOverviewNav();
  },

  _renderMonthPane(){
    const matrix = document.getElementById('goalsMonthMatrix');
    const head   = document.getElementById('goalsMonthHead');
    const label  = document.getElementById('goalsMonthLabel');
    if (!matrix) return;
    const mOff = this._ovMonthOff;
    const days = this.getMonthDates(mOff);
    const today = this.todayStr();
    const isMobile = window.innerWidth < 768;
    const mBase = new Date(); mBase.setDate(1); mBase.setMonth(mBase.getMonth() + mOff);

    if (label) label.textContent = mBase.toLocaleDateString(undefined,{month:'long',year:'numeric'});

    if (isMobile) {
      // Mobile: render a calendar card per goal (like the detail page)
      if (head) head.style.display = 'none';
      const dow = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      const firstDow = mBase.getDay();
      const offset = (firstDow + 6) % 7;

      matrix.className = 'gm-mobile-month-list';
      matrix.innerHTML = this._data.map(g => {
        const dowHeader = dow.map(d => `<div class="gd-month-dow">${d}</div>`).join('');
        let cells = '';
        for (let i = 0; i < offset; i++) cells += `<div class="gd-month-cell empty"></div>`;
        cells += days.map(d => {
          const e = g.log[d];
          const qc = this._qCell(g, e);
          const cls = [
            'gd-month-cell',
            qc.status,
            qc.cls,
            d === today ? 'today' : ''
          ].filter(Boolean).join(' ');
          const dayNum = parseInt(d.split('-')[2], 10);
          return `<div class="${cls}"${qc.style ? ` style="${qc.style}color:#111;"` : ''} title="${d}${qc.tip}">${dayNum}</div>`;
        }).join('');

        return `<div class="gm-mobile-month-card" style="--gc:${g.color}">
          <div class="gm-mobile-month-card-head">
            <div class="gm-row-icon">${g.icon}</div>
            <div class="gm-row-name">${escapeHtml(g.name)}</div>
          </div>
          <div class="gd-month gm-mobile-cal">${dowHeader}${cells}</div>
        </div>`;
      }).join('');
    } else {
      // Desktop: original horizontal matrix
      if (head) {
        head.style.display = '';
        let h = '';
        for (let i = 1; i <= 31; i++) h += `<span>${i <= days.length ? i : ''}</span>`;
        head.innerHTML = h;
      }
      matrix.className = 'gm-matrix';
      matrix.innerHTML = this._data.map(g => {
        const cells = [];
        for (let i = 0; i < 31; i++) {
          if (i >= days.length) {
            cells.push(`<div class="gm-cell" style="visibility:hidden"></div>`);
            continue;
          }
          const d = days[i];
          const e = g.log[d];
          const qc = this._qCell(g, e);
          const cls = [
            'gm-cell',
            qc.status,
            qc.cls,
            d > today ? 'future' : '',
            d === today ? 'today' : ''
          ].filter(Boolean).join(' ');
          cells.push(`<div class="${cls}"${qc.style ? ` style="${qc.style}"` : ''} title="${d}${qc.tip}"></div>`);
        }
        return `<div class="gm-row" style="--gc:${g.color}">
          <div class="gm-row-head">
            <div class="gm-row-icon">${g.icon}</div>
            <div class="gm-row-name">${escapeHtml(g.name)}</div>
          </div>
          <div class="gm-cells month">${cells.join('')}</div>
        </div>`;
      }).join('');
    }
    this._syncOverviewNav();
  },

  /* ── Detail page ───────────────────────────────────────────── */
  renderDetail(id, flashStatus){
    this._activeId = id;
    const g = this.getById(id); if (!g) return;
    showSection('goal-detail');

    const today = this.todayStr();
    const selKey = this._selKey();
    const isToday = selKey === today;
    const weekDates = this.getWeekDates(selKey + 'T00:00:00');
    const monthOff = this._monthOff || 0;
    const monthDates = this.getMonthDates(monthOff);
    const monthBase = new Date(); monthBase.setDate(1); monthBase.setMonth(monthBase.getMonth() + monthOff);
    const streaks = this.calcStreak(g.log);

    const all = Object.values(g.log);
    const done = all.filter(e => e.status==='done').length;
    const miss = all.filter(e => e.status==='miss').length;
    const rest = all.filter(e => e.status==='rest').length;

    // Apply color
    const hero = document.getElementById('gdHero');
    if (hero) hero.style.setProperty('--gc', g.color);
    document.getElementById('goal-detail')?.style.setProperty('--gc', g.color);

    setText('gdIcon', g.icon);
    setText('gdName', g.name);
    const cat = CAT_MAP[g.category] || { label:g.category, emoji:'' };
    setText('gdCategory', `${cat.emoji} ${cat.label}`);
    setText('gdDesc', g.desc ? `"${g.desc}"` : '');

    setText('gdCurrent', streaks.current);
    setText('gdLongest', streaks.longest);
    setText('gdDone', done);
    setText('gdRest', rest);
    setText('gdMiss', miss);

    setText('gdLogTitle', isToday ? 'Log today' : 'Log past day');
    setText('gdTodayDate', this.formatDate(selKey));
    const backBtn = document.getElementById('gdBackToday');
    if (backBtn) {
      backBtn.style.display = isToday ? 'none' : '';
      backBtn.onclick = () => { this._selDate = null; this._monthOff = 0; this.renderDetail(this._activeId); };
    }
    const f = k => new Date(k+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'});
    setText('gdWeekRange', `${f(weekDates[0])} — ${f(weekDates[6])}`);
    setText('gdMonthLabel', monthBase.toLocaleDateString(undefined,{month:'long',year:'numeric'}));
    const mPrev = document.getElementById('gdMonthPrev'), mNext = document.getElementById('gdMonthNext');
    if (mPrev) mPrev.onclick = () => this.shiftMonth(-1);
    if (mNext) { mNext.onclick = () => this.shiftMonth(1); mNext.disabled = monthOff >= 0; }

    // Buttons / note
    const todayEntry = g.log[selKey];
    ['gdBtnDone','gdBtnRest','gdBtnMiss'].forEach(bid => {
      const b = document.getElementById(bid); if (b) b.classList.remove('is-active');
    });
    if (todayEntry) {
      const map = { done:'gdBtnDone', rest:'gdBtnRest', miss:'gdBtnMiss' };
      document.getElementById(map[todayEntry.status])?.classList.add('is-active');
    }
    const note = document.getElementById('gdNoteInput');
    if (note) {
      note.value = todayEntry?.note || '';
      note.placeholder = isToday ? 'A note for today (optional)…' : 'A note for this day (optional)…';
    }

    this._syncQualityBtns();
    this._renderQualityLegend();

    // Quality Specification pane
    const qPane = document.getElementById('gdQuality');
    if (qPane) {
      if (g.qualitySpec) {
        qPane.style.display = '';
        const isDone = todayEntry?.status === 'done';
        const cur = isDone ? todayEntry.quality : null;
        const scale = document.getElementById('gdQualityScale');
        scale.innerHTML = this._qualityScaleHTML(cur, isDone);
        scale.querySelectorAll('.q-btn').forEach(btn => {
          btn.onclick = (e) => this.setQuality(id, selKey, parseInt(btn.dataset.q,10), e);
        });
        const curEl = document.getElementById('gdQualityCurrent');
        curEl.textContent = cur ? `${cur} — ${Q_MAP[cur].label}` : '—';
        curEl.style.color = cur ? Q_MAP[cur].color : '';
        setText('gdQualityHint', isDone ? 'How well did it go? Tap the same number again to clear.' : 'Mark this day as Done to rate its quality.');
      } else {
        qPane.style.display = 'none';
      }
    }

    // Wire log + delete buttons (rebind each render is fine; small surface)
    document.getElementById('gdBtnDone').onclick = () => this.logToday('done');
    document.getElementById('gdBtnRest').onclick = () => this.logToday('rest');
    document.getElementById('gdBtnMiss').onclick = () => this.logToday('miss');
    const del = document.getElementById('gdDeleteBtn');
    if (del) del.onclick = () => {
      if (confirm(`Move "${g.name}" to trash?`)) this.delete(id);
    };
    const edit = document.getElementById('gdEditBtn');
    if (edit) edit.onclick = () => this.openEditModal(id);

    // Week visualisation
    const weekEl = document.getElementById('gdWeek');
    if (weekEl) {
      const dn = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      weekEl.innerHTML = weekDates.map((d, i) => {
        const e = g.log[d];
        const qc = this._qCell(g, e);
        const cls = [
          'dot',
          qc.status,
          qc.cls,
          d === today ? 'today' : '',
          d === selKey ? 'selected' : '',
          d > today ? 'future' : 'selectable'
        ].filter(Boolean).join(' ');
        const dayNum = parseInt(d.split('-')[2], 10);
        return `<div class="gd-week-cell">
          <span class="lbl">${dn[i]}</span>
          <div class="${cls}"${qc.style ? ` style="${qc.style}color:#111;"` : ''} data-date="${d}" title="${(d > today ? d : 'Log ' + d) + qc.tip}"><span class="num">${dayNum}</span></div>
        </div>`;
      }).join('');
      weekEl.querySelectorAll('.dot.selectable').forEach(el => {
        el.onclick = () => this.selectDate(el.dataset.date);
      });
    }

    // Month grid (with DOW header + leading blanks)
    const monthEl = document.getElementById('gdMonth');
    if (monthEl) {
      const dow = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      const firstDow = monthBase.getDay();
      const offset = (firstDow + 6) % 7; // shift to Mon-start
      let html = dow.map(d => `<div class="gd-month-dow">${d}</div>`).join('');
      for (let i = 0; i < offset; i++) html += `<div class="gd-month-cell empty"></div>`;
      html += monthDates.map(d => {
        const e = g.log[d];
        const qc = this._qCell(g, e);
        const cls = [
          'gd-month-cell',
          qc.status,
          qc.cls,
          d === today ? 'today' : '',
          d === selKey ? 'selected' : '',
          d > today ? 'future' : 'selectable'
        ].filter(Boolean).join(' ');
        const dayNum = parseInt(d.split('-')[2], 10);
        return `<div class="${cls}"${qc.style ? ` style="${qc.style}color:#111;"` : ''} data-date="${d}" title="${(d > today ? d : 'Log ' + d) + qc.tip}">${dayNum}</div>`;
      }).join('');
      monthEl.innerHTML = html;
      monthEl.querySelectorAll('.gd-month-cell.selectable').forEach(el => {
        el.onclick = () => this.selectDate(el.dataset.date);
      });
    }

    // History
    const hist = document.getElementById('gdHistory');
    const histCount = document.getElementById('gdHistoryCount');
    if (hist) {
      const entries = Object.entries(g.log).sort((a,b) => b[0].localeCompare(a[0]));
      if (histCount) histCount.textContent = `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`;
      if (!entries.length) {
        hist.innerHTML = `<div class="gd-h-item">
          <span class="gd-h-glyph">·</span>
          <span class="gd-h-date">—</span>
          <span class="gd-h-note is-empty">Nothing logged yet — start with today.</span>
        </div>`;
      } else {
        hist.innerHTML = entries.slice(0, 60).map(([date, entry], i) => {
          const sym = entry.status === 'done' ? '✓' : entry.status === 'rest' ? '~' : '×';
          const noteHtml = entry.note
            ? `<span class="gd-h-note">"${escapeHtml(entry.note)}"</span>`
            : `<span class="gd-h-note is-empty">${entry.status === 'done' ? 'Kept the promise.' : entry.status === 'rest' ? 'Rest day.' : 'Missed — try again.'}</span>`;
          return `<div class="gd-h-item" style="animation-delay:${i*0.025}s">
            <span class="gd-h-glyph ${entry.status}">${sym}</span>
            <span class="gd-h-date">${this.formatDate(date)}</span>
            ${noteHtml}
            ${(g.qualitySpec && entry.status === 'done' && Q_MAP[entry.quality]) ? `<span class="gd-h-quality" style="--qc:${Q_MAP[entry.quality].color}" title="Quality: ${Q_MAP[entry.quality].label}">${entry.quality}</span>` : ''}
          </div>`;
        }).join('');
      }
    }

    // Note input → autosave
    if (note && !note._wired) {
      note._wired = true;
      note.addEventListener('input', () => {
        const cur = this.getById(this._activeId);
        const k = this._selKey();
        if (cur?.log[k]) { cur.log[k].note = note.value; this.save(); }
      });
    }

    // Cards grid stays fresh underneath
    if (flashStatus) this._renderHero();
  },

  /* ── Modal ─────────────────────────────────────────────────── */
  _selectedIcon: '🎯',
  _selectedColor: '#e8a840',
  _selectedCat: 'health',
  initModal(){
    // Icons
    const ip = document.getElementById('goalIconPicker');
    if (ip) {
      ip.innerHTML = '';
      GOAL_ICONS.forEach(icon => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'gmod-icon';
        b.textContent = icon;
        if (icon === this._selectedIcon) b.classList.add('selected');
        b.onclick = () => {
          ip.querySelectorAll('.gmod-icon').forEach(x => x.classList.remove('selected'));
          b.classList.add('selected');
          this._selectedIcon = icon;
        };
        ip.appendChild(b);
      });
    }
    // Colors
    const cp = document.getElementById('goalColorPicker');
    if (cp) {
      cp.innerHTML = '';
      GOAL_COLORS.forEach(color => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'gmod-color';
        b.style.background = color; b.style.color = color;
        if (color === this._selectedColor) b.classList.add('selected');
        b.onclick = () => {
          cp.querySelectorAll('.gmod-color').forEach(x => x.classList.remove('selected'));
          b.classList.add('selected');
          this._selectedColor = color;
        };
        cp.appendChild(b);
      });
    }
    // Categories
    const catP = document.getElementById('goalCatPicker');
    if (catP) {
      catP.innerHTML = '';
      GOAL_CATEGORIES.forEach(c => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'gmod-cat';
        b.textContent = `${c.emoji} ${c.label}`;
        if (c.id === this._selectedCat) b.classList.add('selected');
        b.onclick = () => {
          catP.querySelectorAll('.gmod-cat').forEach(x => x.classList.remove('selected'));
          b.classList.add('selected');
          this._selectedCat = c.id;
        };
        catP.appendChild(b);
      });
    }
    const ni = document.getElementById('goalNameInput'); if (ni) ni.value = '';
    const di = document.getElementById('goalDescInput'); if (di) di.value = '';
    const qt = document.getElementById('goalQualityToggle'); if (qt) qt.checked = false; // off by default
  },
  openModal(){
    this.initModal();
    const m = document.getElementById('addGoalModal');
    if (m) {
      m.style.display = 'flex';
      requestAnimationFrame(() => m.classList.add('active'));
    }
    document.getElementById('goalNameInput')?.focus();
  },
  closeModal(){
    const m = document.getElementById('addGoalModal');
    if (m) {
      m.classList.remove('active');
      setTimeout(() => { m.style.display = 'none'; }, 200);
    }
  },
  saveFromModal(){
    const name = (document.getElementById('goalNameInput')?.value || '').trim();
    if (!name) { if (typeof toast === 'function') toast('Please name your habit','warn'); return; }
    const desc = (document.getElementById('goalDescInput')?.value || '').trim();
    this.add({
      name, desc,
      icon: this._selectedIcon,
      color: this._selectedColor,
      category: this._selectedCat,
      qualitySpec: !!document.getElementById('goalQualityToggle')?.checked,
    });
    this.closeModal();
    if (typeof toast === 'function') toast('Habit created — keep it daily ✦','success');
  },
};

/* ── Helpers ─────────────────────────────────────────────────── */
function setText(id, v){ const el = document.getElementById(id); if (el) el.textContent = v; }
function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

/* ── Wire UI ─────────────────────────────────────────────────── */
(function wireGoals(){
  // Load any saved data immediately so first paint is correct
  try { Goals._saving = true; Goals.load(); Goals._saving = false; } catch(e){ Goals._saving = false; }
  Goals._updateTrashBadge();

  const addBtn   = document.getElementById('addGoalBtn');
  const closeBtn = document.getElementById('addGoalModalClose');
  const saveBtn  = document.getElementById('saveGoalBtn');
  const modal    = document.getElementById('addGoalModal');
  const name     = document.getElementById('goalNameInput');
  const tabs     = document.getElementById('goalsTabs');

  const qBtn = document.getElementById('goalsQualityBtn');
  if (qBtn) qBtn.addEventListener('click', () => Goals.setQualityMode(!Goals._qMode));
  // Same toggle, inside a habit's page
  const gdQBtn = document.getElementById('gdQualityBtn');
  if (gdQBtn) gdQBtn.addEventListener('click', () => {
    const cur = Goals.getById(Goals._activeId);
    if (cur && !cur.qualitySpec && !Goals._qMode) {
      if (typeof toast === 'function') toast('Quality Specification is off for this habit — turn it on with ✎ Edit','warn');
      return;
    }
    Goals.setQualityMode(!Goals._qMode);
  });
  try {
    if (!exampleMode && localStorage.getItem('focus_goals_qmode') === '1' && Goals._data.some(g => g.qualitySpec)) {
      Goals._qMode = true;
      Goals._syncQualityBtns();
      Goals._renderQualityLegend();
    }
  } catch(e){}
  if (addBtn)   addBtn.addEventListener('click', () => Goals.openModal());
  if (closeBtn) closeBtn.addEventListener('click', () => Goals.closeModal());
  if (saveBtn)  saveBtn.addEventListener('click', () => Goals.saveFromModal());
  if (modal)    modal.addEventListener('click', e => { if (e.target === modal) Goals.closeModal(); });
  if (name)     name.addEventListener('keydown', e => { if (e.key === 'Enter') Goals.saveFromModal(); });

  // Trash
  const trashBtn = document.getElementById('goalsTrashBtn');
  const trashModal = document.getElementById('goalsTrashModal');
  const trashClose = document.getElementById('goalsTrashModalClose');
  const emptyTrash = document.getElementById('emptyGoalsTrashBtn');
  if (trashBtn) trashBtn.addEventListener('click', () => Goals.openTrash());
  if (trashClose) trashClose.addEventListener('click', () => Goals.closeTrash());
  if (trashModal) trashModal.addEventListener('click', e => { if (e.target === trashModal) Goals.closeTrash(); });
  if (emptyTrash) emptyTrash.addEventListener('click', () => { if (confirm('Permanently delete all trashed habits?')) { Goals.emptyTrash(); Goals.openTrash(); } });

  // Edit modal
  const editGoalModalClose = document.getElementById('editGoalModalClose');
  const editGoalModal = document.getElementById('editGoalModal');
  if (editGoalModalClose) editGoalModalClose.addEventListener('click', () => Goals.closeEditModal());
  if (editGoalModal) editGoalModal.addEventListener('click', e => { if (e.target === editGoalModal) Goals.closeEditModal(); });

  // Previous / next week + month arrows on the Week and Month overviews
  document.querySelectorAll('[data-goals-period]').forEach(btn => {
    btn.addEventListener('click', () => Goals.shiftOverview(btn.dataset.goalsPeriod, parseInt(btn.dataset.goalsStep, 10)));
  });

  if (tabs) {
    tabs.addEventListener('click', e => {
      const btn = e.target.closest('.goals-tab');
      if (btn) Goals.setView(btn.dataset.view);
    });
  }

  // Escape closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const m = document.getElementById('addGoalModal');
      if (m && m.style.display !== 'none') Goals.closeModal();
    }
  });

  // Initial render (in case the page is already active)
  if (document.getElementById('goals')?.classList.contains('active')) Goals.render();
})();

// Re-render on navigation back to /goals (the host app calls Goals.render()
// inside its showSection() switch — this line is just belt-and-braces).
if (document.getElementById('goals')?.classList.contains('active')) {
  Goals.render();
}