// ────────────────────────────────────────────
// CONFIG
// ────────────────────────────────────────────
const PERIODS = [
  { n:1, label:'1. time',  start:'08:30', end:'09:15' },
  { n:2, label:'2. time',  start:'09:25', end:'10:10' },
  { n:3, label:'3. time',  start:'10:20', end:'11:05' },
  { n:4, label:'4. time',  start:'11:35', end:'12:20' },
  { n:5, label:'5. time',  start:'12:30', end:'13:15' },
  { n:6, label:'6. time',  start:'13:25', end:'14:10' },
  { n:7, label:'7. time',  start:'14:15', end:'15:00' },
];
function periodFromStart(start) {
  const idx = PERIODS.findIndex(p => p.start === start);
  return idx >= 0 ? idx + 1 : 1;
}

// Hvilken skoletime hører et klokkeslett til?
// Treffer klikket en pause, velges nærmeste time framfor å gjette.
function periodeFraKlokkeslett(dec) {
  for (let i = 0; i < PERIODS.length; i++) {
    const start = toDec(PERIODS[i].start), slutt = toDec(PERIODS[i].end);
    if (dec >= start && dec < slutt) return i + 1;
  }
  let beste = 1, minste = Infinity;
  PERIODS.forEach((p, i) => {
    const avstand = Math.min(Math.abs(dec - toDec(p.start)), Math.abs(dec - toDec(p.end)));
    if (avstand < minste) { minste = avstand; beste = i + 1; }
  });
  return beste;
}

// Ukedag 0–6 med mandag først (Date bruker søndag = 0)
function ukedagIndeks(d) {
  return d.getDay() === 0 ? 6 : d.getDay() - 1;
}
function periodLabel(start) {
  const p = PERIODS.find(p => p.start === start);
  return p ? `${p.label}  (${p.start}–${p.end})` : `${start}`;
}
function periodNumFromEnd(end) {
  const idx = PERIODS.findIndex(p => p.end === end);
  return idx >= 0 ? idx + 1 : PERIODS.length;
}
function getSelectedTrinns() {
  return [...document.querySelectorAll('input[name="trinnCheck"]:checked')].map(el=>parseInt(el.value));
}
function getEventTrinns(ev) {
  if (!ev) return [];
  if (ev.trinns && ev.trinns.length) return ev.trinns;
  return ev.trinn ? [ev.trinn] : [];
}

const GRID_START_H = 7.5;
const GRID_END_H   = 16.0;
const PX_PER_HOUR  = 60;
const TOTAL_PX     = (GRID_END_H - GRID_START_H) * PX_PER_HOUR;

const DAYS_LONG  = ['Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag','Søndag'];
const DAYS_SHORT = ['Man','Tir','Ons','Tor','Fre','Lør','Søn'];
const MONTHS     = ['januar','februar','mars','april','mai','juni','juli',
                    'august','september','oktober','november','desember'];
const MONTHS_SHORT = ['jan','feb','mar','apr','mai','jun','jul','aug','sep','okt','nov','des'];

const TODAY = new Date(); // Dynamisk — dagens dato
let currentWeekMonday = getMonday(TODAY);
let currentDay        = new Date(TODAY);
let currentMonthStart = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
let currentView = 'week';

// ────────────────────────────────────────────
// COLORS
// ────────────────────────────────────────────
const COLOR_POOL = [
  { bg:'#dbeafe', text:'#1e40af', border:'#60a5fa' },
  { bg:'#d1fae5', text:'#065f46', border:'#34d399' },
  { bg:'#fef3c7', text:'#78350f', border:'#fbbf24' },
  { bg:'#ede9fe', text:'#5b21b6', border:'#a78bfa' },
  { bg:'#ccfbf1', text:'#0f766e', border:'#2dd4bf' },
  { bg:'#fee2e2', text:'#991b1b', border:'#fca5a5' },
  { bg:'#fdf2f8', text:'#9d174d', border:'#f0abfc' },
];
const SPECIAL_COLORS = {
  mote:     { bg:'#f3f4f6', text:'#374151', border:'#9ca3af' },
  foreldre: { bg:'#fce7f3', text:'#831843', border:'#f472b6' },
  annet:    { bg:'#f0fdf4', text:'#166534', border:'#86efac' },
};
const subjectColorMap = {};
let colorPoolIdx = 0;
function getSubjectColor(name) {
  if (!name) return COLOR_POOL[0];
  if (!(name in subjectColorMap)) { subjectColorMap[name] = colorPoolIdx++ % COLOR_POOL.length; }
  return COLOR_POOL[subjectColorMap[name]];
}
function eventColor(ev) {
  if (ev.category === 'mote')     return SPECIAL_COLORS.mote;
  if (ev.category === 'foreldre') return SPECIAL_COLORS.foreldre;
  if (ev.category === 'annet')    return SPECIAL_COLORS.annet;
  if (ev.category === 'vikar')    return { bg:'#f3f4f6', text:'#6b7280', border:'#9ca3af' };
  return getSubjectColor(ev.title);
}

// ────────────────────────────────────────────
// STUDENTS
// ────────────────────────────────────────────
const allStudents = []; // ingen seed-data
function studentById(id) { return allStudents.find(s => s.id === id); }

// ────────────────────────────────────────────
// ELEVNAVN — holdes lokalt, forlater aldri enheten
// ────────────────────────────────────────────
// allStudents[] bærer navnet i minnet slik at all rendring fungerer som før,
// men ved lagring splittes lista i to: strukturen (id, trinn, startDato …)
// går til lp_students og kan synkes, mens navnene går til lp_studentNames
// og blir liggende på denne enheten. Elever uten kjent navn får et
// fallback-navn og flagget navnMangler = true, slik at fallbacket aldri
// lagres som om det var et ekte navn.

function fallbackNavn(id) {
  return 'Elev ' + String(id).slice(-4);
}

function elevNavn(id) {
  const s = studentById(id);
  return s ? s.navn : fallbackNavn(id);
}

// allStudents uten navn — dette er formen som kan forlate enheten
function elevlisteUtenNavn() {
  return allStudents.map(({ navn, navnMangler, ...rest }) => rest);
}

// { id: navn } for elever der vi faktisk kjenner navnet
function navnekart() {
  const kart = {};
  allStudents.forEach(s => { if (!s.navnMangler && s.navn) kart[s.id] = s.navn; });
  return kart;
}

// Sett navn på elevobjektene ut fra et navnekart
function hydrerNavn(kart) {
  allStudents.forEach(s => {
    const ekte = kart[s.id];
    if (ekte) { s.navn = ekte;              s.navnMangler = false; }
    else      { s.navn = fallbackNavn(s.id); s.navnMangler = true;  }
  });
}

function antallUtenNavn() {
  return allStudents.filter(s => s.navnMangler).length;
}

// Settes av loadFromStorage() når data ble migrert og må skrives tilbake
let maaSkrivesTilbake = false;

// ────────────────────────────────────────────
// LESSON DATA
// lessonData: key = `${eventId}_${isoDate}` → { tema, notes, attendance }
// attendance: { studentId: true/false }
// topicsBySubject: { 'Norsk': ['Eventyr', 'Lyrikk', ...] }
// ────────────────────────────────────────────
const lessonData = {};
const topicsBySubject = {};

function lessonKey(evId, dateStr) { return `${evId}_${dateStr}`; }
function getLesson(evId, dateStr) { return lessonData[lessonKey(evId, dateStr)] || null; }
function setLesson(evId, dateStr, data) { lessonData[lessonKey(evId, dateStr)] = data; }
function getTopicsForSubject(title) { return topicsBySubject[title] || []; }
function addTopic(title, tema) {
  if (!tema || !title) return;
  if (!topicsBySubject[title]) topicsBySubject[title] = [];
  if (!topicsBySubject[title].includes(tema)) topicsBySubject[title].push(tema);
}



// ────────────────────────────────────────────
// EVENTS
// ────────────────────────────────────────────
let nextId = 1;
let nextTodoId = 1;
let todos = []; // { id, text, linkedFag, linkedStudentId, frist, status }
// Gjøremål er skjult som standard — på mobil dekket sidebaren hele
// kalenderen, og på desktop er det uansett greit å slå den på ved behov.
let sidebarVisible = false;

// ── Smal skjerm ──
// Kalendergridet settes med inline-style fra JS, og inline slår enhver
// media query. Bredden må derfor bestemmes her, ikke i CSS.
function erSmalSkjerm() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 767px)').matches;
}

// minmax(0, 1fr) i stedet for 1fr: uten det får kolonnene minstebredde
// fra innholdet, og lange titler eller arbeidstid-chipen presser fredag
// utenfor skjermkanten.
function kalenderKolonner(antallDager) {
  const gutter = erSmalSkjerm() ? '32px' : '48px';
  return `${gutter} repeat(${antallDager}, minmax(0, 1fr))`;
}
let editingTodoId = null;
let events = []; // ingen seed-data

let fridager = []; // { id, fra, til, tittel, type }
let skoleaar = { start: '2025-08-13', slutt: '2026-06-19' };
const FRIDAGER_SEED = [
  { id: crypto.randomUUID(), fra: '2025-09-29', til: '2025-10-03', tittel: 'Høstferie',               type: 'ferie' },
  { id: crypto.randomUUID(), fra: '2025-11-05', til: '2025-11-07', tittel: 'Planleggingsdager',        type: 'planlegging' },
  { id: crypto.randomUUID(), fra: '2025-12-20', til: '2026-01-04', tittel: 'Juleferie',                type: 'ferie' },
  { id: crypto.randomUUID(), fra: '2026-02-16', til: '2026-02-20', tittel: 'Vinterferie',              type: 'ferie' },
  { id: crypto.randomUUID(), fra: '2026-03-30', til: '2026-04-06', tittel: 'Påskeferie',               type: 'ferie' },
  { id: crypto.randomUUID(), fra: '2026-05-01', til: '2026-05-01', tittel: '1. mai',                   type: 'fridag' },
  { id: crypto.randomUUID(), fra: '2026-05-14', til: '2026-05-14', tittel: 'Kristi Himmelfartsdag',    type: 'fridag' },
  { id: crypto.randomUUID(), fra: '2026-05-15', til: '2026-05-15', tittel: 'Inneklemt dag',            type: 'fridag' },
  { id: crypto.randomUUID(), fra: '2026-05-25', til: '2026-05-25', tittel: 'Andre pinsedag',           type: 'fridag' },
];

// ────────────────────────────────────────────
// WORK TIMES
// planfestetTid: standard daglig arbeidstid (gjelder alle ukedager)
// overtid: { 'YYYY-MM-DD': { start, end } } for dager med avvikende tid
// ────────────────────────────────────────────
let planfestetTid = [
  { start: '08:00', end: '15:30' }, // Mandag
  { start: '08:00', end: '15:30' }, // Tirsdag
  { start: '08:00', end: '15:30' }, // Onsdag
  { start: '08:00', end: '15:30' }, // Torsdag
  { start: '08:00', end: '15:30' }, // Fredag
];
const overtid = {};

function getWorkTimeForDate(key) {
  if (overtid[key]) return overtid[key];
  const d = new Date(key + 'T00:00:00');
  const wd = d.getDay() === 0 ? 6 : d.getDay() - 1;
  return planfestetTid[wd] || planfestetTid[0];
}

let workModalDayIdx  = null;
let workModalDateKey = null;

// ────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────
// Returnerer fridagen hvis dato faller innenfor fra–til, ellers null
function erFridag(dato) {
  const key = isoDate(dato);
  return fridager.find(f => key >= f.fra && key <= f.til) || null;
}

// Returnerer true hvis dato er utenfor skoleårets start–slutt
function erUtenforSkoleaar(dato) {
  const key = isoDate(dato);
  return key < skoleaar.start || key > skoleaar.slutt;
}

function getMonday(d) {
  const date = new Date(d); date.setHours(0,0,0,0);
  const day = date.getDay();
  date.setDate(date.getDate() - (day===0 ? 6 : day-1));
  return date;
}
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function isToday(d)      { return isoDate(d) === isoDate(TODAY); }
function isCurrentWeek() { return getMonday(TODAY).getTime() === currentWeekMonday.getTime(); }
function toDec(t)   { if(!t)return null; const[h,m]=t.split(':').map(Number); return h+m/60; }
function toPx(t)    { return (toDec(t)-GRID_START_H)*PX_PER_HOUR; }
function durPx(s,e) { return (toDec(e)-toDec(s))*PX_PER_HOUR; }
function fmtHours(h){ const hrs=Math.floor(h),m=Math.round((h-hrs)*60); return m===0?`${hrs}t`:`${hrs}t ${m}m`; }
function weekNumber(d) {
  const date=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  date.setUTCDate(date.getUTCDate()+4-(date.getUTCDay()||7));
  const ys=new Date(Date.UTC(date.getUTCFullYear(),0,1));
  return Math.ceil((((date-ys)/86400000)+1)/7);
}
function getDayOfWeekFromDate(dateStr) {
  const d=new Date(dateStr+'T00:00:00'); return d.getDay()===0?6:d.getDay()-1;
}
function eventsForDate(date) {
  const key=isoDate(date), wd=date.getDay()-1, wn=weekNumber(date);
  // Fridag- og skoleår-sjekk er konstant for alle events på samme dato
  const fridag = erFridag(date);
  const utenfor = erUtenforSkoleaar(date);
  return events.filter(ev => {
    // Gyldighetsfilter — skjul events utenfor aktiv periode
    if (ev.gyldigFra && key < ev.gyldigFra) return false;
    if (ev.gyldigTil && key > ev.gyldigTil)  return false;

    // Fridager og utenfor skoleår
    if (utenfor) return false;
    if (fridag) {
      if (fridag.type === 'ferie' || fridag.type === 'fridag') return false;
      if (fridag.type === 'planlegging') {
        // Skjul undervisning og vikar, behold møter
        if (ev.category === 'undervisning' || ev.category === 'vikar') return false;
      }
    }

    if (ev.recurs) {
      if (ev.weekday !== wd) return false;
      if (ev.startWeek && wn < ev.startWeek) return false;
      if (ev.weekPattern === 'odd'  && wn % 2 === 0) return false;
      if (ev.weekPattern === 'even' && wn % 2 !== 0) return false;
      return true;
    }
    return ev.date === key;
  });
}
function eventDisplayLabel(ev) {
  if (ev.category !== 'undervisning') return ev.title;
  if (ev.sessionType === 'enetime' && ev.students.length) {
    const s = studentById(ev.students[0]); return s ? s.navn : ev.title;
  }
  return ev.title;
}
function eventSubLabel(ev) {
  const room = ev.room ? ` · ${ev.room}` : '';
  if (ev.category === 'vikar') return `Vikar · ${ev.start}–${ev.end}`;
  if (ev.category !== 'undervisning') return `${ev.title}${room} · ${ev.start}–${ev.end}`;
  const ev_trinns_ = getEventTrinns(ev);
  const trinnStr = ev_trinns_.map(t=>t+'.').join('+')+( ev_trinns_.length ? ' trinn' : '');
  if (ev.sessionType === 'enetime')   return `Enetime${room} · ${ev.start}–${ev.end}`;
  if (ev.sessionType === 'parallell') return `${trinnStr} (parallell)${room} · ${ev.start}–${ev.end}`;
  return `${trinnStr}${room} · ${ev.start}–${ev.end}`;
}

// SFS2213 (hidden from UI)
function calcSFS() {
  let weekH=0;
  for(let i=0;i<5;i++){const d=new Date(currentWeekMonday);d.setDate(d.getDate()+i);const wt=getWorkTimeForDate(isoDate(d));if(wt&&wt.start){const e=wt.end?toDec(wt.end):toDec('15:30');weekH+=e-toDec(wt.start);}}
  return { week:{hours:weekH,norm:37.5}, year:{hours:412,norm:843.75}, teach:{hours:186,norm:370.5} };
}

function parseStudentId(v) {
  // Returner tall hvis v er et heltall (seed-elever), ellers behold strengen (UUID)
  if (v === '' || v == null) return null;
  const n = parseInt(v, 10);
  return (!isNaN(n) && String(n) === String(v).trim()) ? n : String(v).trim();
}

function finnSkoletimer(event) {
  // Returner PERIODS-objektene hendelsen overlapper med
  const evStart = toDec(event.start), evEnd = toDec(event.end);
  return PERIODS.filter(p => toDec(p.start) <= evEnd && toDec(p.end) >= evStart);
}

function calcAttendance(studentId) {
  // Returnerer { present, total, percent } for en gitt elev
  const student = allStudents.find(s => String(s.id) === String(studentId));
  const startDato = student ? (student.startDato || '2000-01-01') : '2000-01-01';
  let present = 0, total = 0;
  Object.keys(lessonData).forEach(key => {
    const ld = lessonData[key];
    const parts = key.split('_');
    const evIdStr = parts[0];
    const dateStr = parts.slice(1).join('_'); // ISO-dato er siste del
    if (dateStr < startDato) return;         // Kun timer etter startdato
    if (dateStr > isoDate(TODAY)) return;    // Ikke tell fremtidige timer
    // Ikke tell fridager (ferie/fridag) eller dager utenfor skoleåret
    const fd = erFridag(new Date(dateStr + 'T00:00:00'));
    if (fd && (fd.type === 'ferie' || fd.type === 'fridag')) return;
    if (erUtenforSkoleaar(new Date(dateStr + 'T00:00:00'))) return;
    const ev = events.find(e => String(e.id) === evIdStr);
    if (!ev || ev.category !== 'undervisning') return;
    // Tell bare timer eleven er knyttet til
    const inEvent = ev.students.some(sid => String(sid) === String(studentId));
    if (!inEvent) return;
    // Finn antall skoletimer hendelsen dekker
    const timer = finnSkoletimer(ev);
    if (timer.length === 0) return;
    total += timer.length;
    // Hent attendance-verdi — støtter nytt (array) og gammelt (boolean) format
    const att = ld.attendance || {};
    const a = att[studentId] ?? att[String(studentId)];
    if (Array.isArray(a))  present += a.filter(Boolean).length; // Nytt format: teller true-verdier
    else if (a === false)  present += 0;                        // Gammelt format: helt borte
    else                   present += timer.length;             // true eller undefined → fullt til stede
  });
  const percent = total > 0 ? Math.round((present / total) * 100) : null;
  return { present, total, percent };
}

function calcAttendancePerFag(studentId) {
  // Returnerer { fagNavn: { present, total, percent } } for en gitt elev
  const student = allStudents.find(s => String(s.id) === String(studentId));
  const startDato = student ? (student.startDato || '2000-01-01') : '2000-01-01';
  const perFag = {};
  Object.keys(lessonData).forEach(key => {
    const ld = lessonData[key];
    const parts = key.split('_');
    const evIdStr = parts[0];
    const dateStr = parts.slice(1).join('_');
    if (dateStr < startDato) return;
    if (dateStr > isoDate(TODAY)) return;
    const ev = events.find(e => String(e.id) === evIdStr);
    if (!ev || ev.category !== 'undervisning') return;
    const inEvent = ev.students.some(sid => String(sid) === String(studentId));
    if (!inEvent) return;
    const timer = finnSkoletimer(ev);
    if (timer.length === 0) return;
    // Initialiser fag-bucket
    if (!perFag[ev.title]) perFag[ev.title] = { present: 0, total: 0 };
    perFag[ev.title].total += timer.length;
    const att = ld.attendance || {};
    const a = att[studentId] ?? att[String(studentId)];
    if (Array.isArray(a))  perFag[ev.title].present += a.filter(Boolean).length;
    else if (a === false)  perFag[ev.title].present += 0;
    else                   perFag[ev.title].present += timer.length;
  });
  // Beregn prosent per fag
  Object.keys(perFag).forEach(fag => {
    const f = perFag[fag];
    f.percent = f.total > 0 ? Math.round((f.present / f.total) * 100) : null;
  });
  return perFag;
}

// ────────────────────────────────────────────
// RENDER
// ────────────────────────────────────────────
function render() {
  renderWeekLabel();
  const isElever    = currentView === 'elever';
  const isElevlogg  = currentView === 'elevlogg';
  const isMinSide   = currentView === 'minside';
  const isMonth     = currentView === 'month';
  const isKalender  = !isMonth && !isElever && !isElevlogg && !isMinSide;
  document.getElementById('weekDayView').style.display   = isKalender  ? '' : 'none';
  document.getElementById('monthView').style.display     = isMonth     ? '' : 'none';
  document.getElementById('elevAdminView').style.display = isElever    ? '' : 'none';
  document.getElementById('elevloggView').style.display  = isElevlogg  ? '' : 'none';
  document.getElementById('minSideView').style.display   = isMinSide   ? '' : 'none';
  if (isElever)        { renderElevView(); }
  else if (isElevlogg) { renderElevloggView(); }
  else if (isMinSide)  { renderMinSide(); }
  else if (isMonth)    { renderMonthView(); }
  else                 { renderDayHeaders(); renderGrid(); }
  renderLegend();
  renderTodoList();
}

function renderWeekLabel() {
  const el = document.getElementById('weekLabel');
  if (currentView === 'week') {
    const end=new Date(currentWeekMonday); end.setDate(end.getDate()+4);
    const wn=weekNumber(currentWeekMonday);
    const s=`${currentWeekMonday.getDate()}. ${MONTHS_SHORT[currentWeekMonday.getMonth()]}`;
    const e=`${end.getDate()}. ${MONTHS_SHORT[end.getMonth()]} ${end.getFullYear()}`;
    el.textContent=`Uke ${wn}  ·  ${s} – ${e}`;
  } else if (currentView === 'day') {
    const d=currentDay;
    const wd=d.getDay()===0?6:d.getDay()-1;
    el.textContent=`${DAYS_LONG[wd]} ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  } else {
    const mn=MONTHS[currentMonthStart.getMonth()];
    el.textContent=`${mn.charAt(0).toUpperCase()+mn.slice(1)} ${currentMonthStart.getFullYear()}`;
  }
}

function renderDayHeaders() {
  const el=document.getElementById('dayHeaders');
  const days = currentView==='day'
    ? [currentDay]
    : Array.from({length:5},(_,i)=>{ const d=new Date(currentWeekMonday); d.setDate(d.getDate()+i); return d; });
  el.style.gridTemplateColumns = kalenderKolonner(currentView==='day' ? 1 : 5);
  const wn__=currentView==='week'?weekNumber(currentWeekMonday):(currentView==='day'?weekNumber(currentDay):null);
  el.innerHTML=`<div class="time-gutter-top" style="display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--text-muted);letter-spacing:0.3px">${wn__!==null?'U'+wn__:''}</div>`;
  days.forEach((d,i)=>{
    const key=isoDate(d), today=isToday(d);
    const dayIdx = currentView==='day' ? (d.getDay()===0?6:d.getDay()-1) : i;
    const ot=overtid[key];
    let chip='';
    if(ot){
      const h=toDec(ot.end)-toDec(ot.start);
      chip=`<div class="work-chip"><span class="work-dot overtime"></span>${ot.start} – ${ot.end} (${fmtHours(h)})<button class="reg-btn" style="margin-left:6px" onclick="openOvertidModal('${key}')">Endre</button></div>`;
    } else {
      const pft=planfestetTid[dayIdx]||planfestetTid[0];
      chip=`<div class="work-chip"><span class="work-dot planned"></span>${pft.start} – ${pft.end}<button class="reg-btn" style="margin-left:6px" onclick="openOvertidModal('${key}')">+ Overtid</button></div>`;
    }
    const frigagHeader = erFridag(d);
    const frigagHeaderHtml = frigagHeader ? `<span class="fridag-label">${frigagHeader.tittel}</span>` : '';
    // Datoen sto tidligere to ganger — «Man 10.» og et stort «10» under.
    // Nå bare én gang.
    el.innerHTML+=`<div class="day-header ${today?'today':''}"><span class="day-name">${DAYS_SHORT[dayIdx]} ${d.getDate()}.</span>${frigagHeaderHtml}${chip}</div>`;
  });
}

// Beregn side-om-side-posisjon for overlappende hendelser i én dagkolonne.
// Returnerer array av { width, left } parallelt med input-arrayen.
function beregnKolonneposisjon(eventer) {
  const n = eventer.length;
  if (n === 0) return [];

  // Finn alle overlappende par (A og B overlapper hvis A.start < B.end og B.start < A.end)
  const overlapper = Array.from({length: n}, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = eventer[i], b = eventer[j];
      if (toDec(a.start) < toDec(b.end) && toDec(b.start) < toDec(a.end)) {
        overlapper[i].push(j);
        overlapper[j].push(i);
      }
    }
  }

  // Finn sammenhengende grupper (connected components) via BFS
  const gruppe = new Array(n).fill(-1);
  const grupper = [];
  for (let i = 0; i < n; i++) {
    if (gruppe[i] !== -1) continue;
    const kø = [i], members = [i];
    gruppe[i] = grupper.length;
    while (kø.length) {
      const curr = kø.shift();
      for (const nabo of overlapper[curr]) {
        if (gruppe[nabo] === -1) {
          gruppe[nabo] = grupper.length;
          members.push(nabo);
          kø.push(nabo);
        }
      }
    }
    grupper.push(members);
  }

  // Tildel kolonner innen hver gruppe — greedy, maks tre kolonner
  const pos = eventer.map(() => ({ width: '100%', left: '0%' }));
  grupper.forEach(members => {
    if (members.length === 1) return; // Ingen overlapp — full bredde
    const antall = Math.min(members.length, 3);
    members.sort((a, b) => toDec(eventer[a].start) - toDec(eventer[b].start));
    const kolonneSluttTid = new Array(antall).fill(-Infinity);
    members.forEach(idx => {
      const start = toDec(eventer[idx].start);
      let kol = 0;
      for (let k = 0; k < antall; k++) {
        if (kolonneSluttTid[k] <= start) { kol = k; break; }
      }
      kolonneSluttTid[kol] = toDec(eventer[idx].end);
      pos[idx] = {
        width: `${100 / antall}%`,
        left:  `${(kol * 100) / antall}%`
      };
    });
  });

  return pos;
}

function renderGrid() {
  const grid=document.getElementById('calGrid');
  grid.innerHTML=''; grid.style.height=TOTAL_PX+'px';
  const days = currentView==='day'
    ? [currentDay]
    : Array.from({length:5},(_,i)=>{ const d=new Date(currentWeekMonday); d.setDate(d.getDate()+i); return d; });
  grid.style.gridTemplateColumns = kalenderKolonner(currentView==='day' ? 1 : 5);

  const axis=document.createElement('div'); axis.className='time-axis';
  for(let h=GRID_START_H;h<GRID_END_H;h++){
    const tick=document.createElement('div'); tick.className='time-tick';
    tick.textContent=Number.isInteger(h)?`${String(h).padStart(2,'0')}:00`:'';
    axis.appendChild(tick);
  }
  grid.appendChild(axis);

  days.forEach((d,i)=>{
    const key=isoDate(d), today=isToday(d);
    const col=document.createElement('div');
    col.className=`day-col${today?' today':''}`;
    col.style.height=TOTAL_PX+'px';
    if(erUtenforSkoleaar(d)) col.style.background='var(--utenfor-skoleaar-bg)';
    else if(erFridag(d)) col.style.background='var(--fridag-bg)';

    // Fridag-label øverst i kolonnen
    const frigagGrid = erFridag(d);
    if(frigagGrid){
      const lbl=document.createElement('div'); lbl.className='fridag-label';
      lbl.textContent=frigagGrid.tittel;
      col.appendChild(lbl);
    }

    // Grid lines
    for(let h=0;h<=(GRID_END_H-GRID_START_H);h++){
      const l=document.createElement('div'); l.className='grid-line'; l.style.top=(h*PX_PER_HOUR)+'px'; col.appendChild(l);
      if(h<(GRID_END_H-GRID_START_H)){const hl=document.createElement('div');hl.className='grid-line half';hl.style.top=(h*PX_PER_HOUR+30)+'px';col.appendChild(hl);}
    }

    // Work shading
    const wt=getWorkTimeForDate(key);
    if(wt&&wt.start){
      const sp=Math.max(0,toPx(wt.start)), ep=wt.end?Math.min(TOTAL_PX,toPx(wt.end)):TOTAL_PX;
      if(sp>0){const b=document.createElement('div');b.className='offwork-block';b.style.top='0';b.style.height=sp+'px';col.appendChild(b);}
      const wb=document.createElement('div');wb.className='work-block';wb.style.top=sp+'px';wb.style.height=(ep-sp)+'px';col.appendChild(wb);
      if(ep<TOTAL_PX){const a=document.createElement('div');a.className='offwork-block';a.style.top=ep+'px';a.style.height=(TOTAL_PX-ep)+'px';col.appendChild(a);}
    }

    // Events — sorter på starttid og beregn overlapp-posisjoner
    const dagEventer = eventsForDate(d);
    dagEventer.sort((a, b) => toDec(a.start) - toDec(b.start));
    const kolPos = beregnKolonneposisjon(dagEventer);

    dagEventer.forEach((ev, evIdx)=>{
      const { width, left } = kolPos[evIdx];
      const c=eventColor(ev);
      const ld=getLesson(ev.id, key);
      const block=document.createElement('div');
      block.className=`event${ev.sessionType==='parallell'?' parallell':''}${ev.category==='vikar'?' vikar':''}` ;
      block.style.cssText=`top:${toPx(ev.start)}px;height:${Math.max(22,durPx(ev.start,ev.end))}px;width:${width};left:${left};background:${c.bg};color:${c.text};border-left-color:${c.border};`;

      let badge='';
      if(ev.sessionType==='enetime')   badge=`<span class="event-badge">1:1</span><br>`;
      if(ev.sessionType==='parallell') badge=`<span class="event-badge">↔ parallell</span><br>`;

      block.innerHTML=`${badge}<div class="event-title">${eventDisplayLabel(ev)}</div><div class="event-sub">${eventSubLabel(ev)}</div>`;

      // Plan indicator dot
      if(ld && ld.tema){
        const dot=document.createElement('div'); dot.className='event-plan-dot'; block.appendChild(dot);
      }

      block.addEventListener('click',()=>{
        if(ev.category==='undervisning') openLessonPlan(ev, d);
        else openEventForm(ev);
      });
      col.appendChild(block);
    });

    // Klikk på ledig flate → nytt arrangement på det tidspunktet.
    // Hendelsene er absolutt posisjonerte barn av kolonnen, så klikk på
    // dem bobler hit opp; de har sin egen håndtering og skal ignoreres.
    col.addEventListener('click', e => {
      if (e.target.closest('.event')) return;
      const rect = col.getBoundingClientRect();
      const dec  = GRID_START_H + (e.clientY - rect.top) / PX_PER_HOUR;
      openEventForm(null, {
        dato:    key,
        weekday: ukedagIndeks(d),
        periode: periodeFraKlokkeslett(dec)
      });
    });

    // Now line
    if(today){
      const nowDec = new Date().getHours() + new Date().getMinutes() / 60; // Dynamisk — nåværende tidspunkt
      if(nowDec>=GRID_START_H&&nowDec<=GRID_END_H){
        const nl=document.createElement('div');nl.className='now-line';nl.style.top=((nowDec-GRID_START_H)*PX_PER_HOUR)+'px';col.appendChild(nl);
      }
    }
    grid.appendChild(col);
  });
}

function renderLegend() {
  const el=document.getElementById('legend'); el.innerHTML='<span class="legend-heading">Fag:</span>';
  const seen=new Set();
  events.forEach(ev=>{
    if(ev.category==='undervisning'&&!seen.has(ev.title)){
      seen.add(ev.title);
      const c=getSubjectColor(ev.title);
      const item=document.createElement('div'); item.className='legend-item';
      item.innerHTML=`<div class="legend-swatch" style="background:${c.border}"></div>${ev.title}`;
      el.appendChild(item);
    }
  });
  [['Møte','mote'],['Foreldremøte','foreldre']].forEach(([label,key])=>{
    const c=SPECIAL_COLORS[key];
    const item=document.createElement('div'); item.className='legend-item';
    item.innerHTML=`<div class="legend-swatch" style="background:${c.border}"></div>${label}`;
    el.appendChild(item);
  });
}

// ────────────────────────────────────────────
// PLANFESTET TID
// ────────────────────────────────────────────
function calcPftSummary(inputs) {
  // inputs is NodeList of time inputs with dataset.idx and dataset.type
  const times = [{},{},[],[],[],{}]; // index → {start,end}
  const map = {};
  inputs.forEach(inp => {
    const i = inp.dataset.idx;
    if (!map[i]) map[i] = {};
    map[i][inp.dataset.type] = inp.value;
  });
  // Fall back to planfestetTid for missing values
  const DAYS = ['Man','Tir','Ons','Tor','Fre'];
  let totalMin = 0;
  const rows = DAYS.map((d, i) => {
    const s = (map[i]&&map[i].start) || planfestetTid[i].start;
    const e = (map[i]&&map[i].end)   || planfestetTid[i].end;
    const sm = toDec(s), em = toDec(e);
    const mins = (em - sm) * 60;
    totalMin += mins > 0 ? mins : 0;
    const h = Math.floor(mins/60), m = Math.round(mins%60);
    return `<span style="color:var(--text-primary);font-weight:500">${d}</span> ${s}–${e} (${h}t${m?(' '+m+'min'):''})`;
  });
  const th = Math.floor(totalMin/60), tm = Math.round(totalMin%60);
  return `<div style="display:flex;flex-direction:column;gap:4px;font-size:12px">${rows.map(r=>`<div>${r}</div>`).join('')}<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border);font-size:13px;font-weight:600;color:var(--text-primary)">Total per uke: ${th}t ${tm}min</div></div>`;
}
function openPlanfestetTidModal() {
  const days = ['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'];
  const tbody = document.getElementById('pfTableBody');
  tbody.innerHTML = '';
  days.forEach((dag, i) => {
    const pft = planfestetTid[i];
    const tr = document.createElement('tr');
    const tdDay = document.createElement('td');
    tdDay.style.cssText = 'padding:6px 0;color:var(--text-primary)';
    tdDay.textContent = dag;
    const makeTimeTd = (type) => {
      const td = document.createElement('td');
      td.style.padding = '4px 8px';
      const inp = document.createElement('input');
      inp.type = 'time';
      inp.dataset.idx = i;
      inp.dataset.type = type;
      inp.value = type === 'start' ? pft.start : pft.end;
      inp.style.cssText = 'padding:5px 8px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit;width:100%';
      inp.addEventListener('input', () => {
        const allInputs = document.getElementById('pfTableBody').querySelectorAll('input[type="time"]');
        document.getElementById('pfSummary').innerHTML = calcPftSummary(allInputs);
      });
      td.appendChild(inp);
      return td;
    };
    tr.appendChild(tdDay);
    tr.appendChild(makeTimeTd('start'));
    tr.appendChild(makeTimeTd('end'));
    tbody.appendChild(tr);
  });
  // Initial summary
  const allInputs = tbody.querySelectorAll('input[type="time"]');
  document.getElementById('pfSummary').innerHTML = calcPftSummary(allInputs);
  document.getElementById('planfestetOverlay').classList.add('open');
}
function savePlanfestetTid() {
  const inputs = document.getElementById('pfTableBody').querySelectorAll('input[type="time"]');
  inputs.forEach(inp => {
    const i = parseInt(inp.dataset.idx);
    if (inp.dataset.type === 'start') planfestetTid[i].start = inp.value || planfestetTid[i].start;
    else                              planfestetTid[i].end   = inp.value || planfestetTid[i].end;
  });
  saveToStorage();
  closeOverlay('planfestetOverlay'); render();
}

// ────────────────────────────────────────────
// OVERTID
// ────────────────────────────────────────────
function openOvertidModal(key) {
  workModalDateKey=key;
  const d=new Date(key+'T00:00:00');
  const wd=d.getDay()===0?6:d.getDay()-1;
  document.getElementById('overtidModalTitle').textContent=`Overtid – ${DAYS_LONG[wd]} ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
  const ot=overtid[key]||{};
  document.getElementById('otStartInput').value=ot.start||planfestetTid.start;
  document.getElementById('otSluttInput').value=ot.end||planfestetTid.end;
  document.getElementById('slettOvertidBtn').style.display=overtid[key]?'':'none';
  document.getElementById('overtidOverlay').classList.add('open');
}
function saveOvertid() {
  if(!workModalDateKey)return;
  const s=document.getElementById('otStartInput').value;
  const e=document.getElementById('otSluttInput').value;
  if(!s||!e){alert('Fyll inn både start og slutt.');return;}
  overtid[workModalDateKey]={start:s,end:e};
  workModalDateKey=null;
  saveToStorage();
  closeOverlay('overtidOverlay'); render();
}
function slettOvertid() {
  if(!workModalDateKey)return;
  delete overtid[workModalDateKey];
  workModalDateKey=null;
  saveToStorage();
  closeOverlay('overtidOverlay'); render();
}

// ────────────────────────────────────────────
// EVENT FORM
// ────────────────────────────────────────────
let editingEventId  = null;
let formCategory    = 'undervisning';
let formSessionType = 'gruppe';
let selectedStudentIds = new Set();

// forslag = { dato, weekday, periode } fra klikk i kalenderen.
// Brukes bare for nye hendelser; ved redigering styrer hendelsen selv.
function openEventForm(ev, forslag) {
  editingEventId = ev ? ev.id : null;
  document.getElementById('formTitle').textContent = ev ? 'Rediger time' : 'Ny time';
  // Vis/skjul sletteknapper kun ved redigering
  const visSlett = ev ? '' : 'none';
  document.getElementById('avsluttEventBtn').style.display = visSlett;
  document.getElementById('slettPermBtn').style.display    = visSlett;
  document.getElementById('avsluttPanel').style.display    = 'none';

  const cat = ev ? (ev.category==='undervisning'?'undervisning':ev.category==='vikar'?'vikar':'mote') : formCategory;
  setFormCategory(cat);

  if(cat==='undervisning'){
    document.getElementById('fagInput').value    = ev ? ev.title||'' : '';
    const ev_trinns2_ = getEventTrinns(ev);
    document.querySelectorAll('input[name="trinnCheck"]').forEach(cb => {
      cb.checked = ev_trinns2_.includes(parseInt(cb.value));
    });
    document.getElementById('romInput').value    = ev ? ev.room||'' : '';
    setSessionType(ev ? (ev.sessionType||'gruppe') : 'gruppe');
  } else if (cat === 'vikar') {
    document.getElementById('vikarNotesInput').value = ev ? ev.vikarNotes||'' : '';
  } else {
    document.getElementById('moteTittelInput').value = ev ? ev.title||'' : '';
    document.getElementById('moteKategori').value    = ev ? ev.category : 'mote';
    document.getElementById('stedInput').value       = ev ? ev.room||'' : '';
    document.getElementById('moteStartInput').value  = ev ? ev.start||'08:30' : '08:30';
    document.getElementById('moteSluttInput').value  = ev ? ev.end||'09:15'   : '09:15';
    // Dato: eksisterende dato ved redigering, dagens dato for nye møter
    document.getElementById('moteDatoInput').value   = ev ? (ev.date||isoDate(TODAY)) : isoDate(TODAY);
    // Forhåndsvelg elev ved redigering (populering skjer i setFormCategory)
    const elevSel = document.getElementById('moteElevSelect');
    if (ev && ev.elevId) {
      elevSel.value = ev.elevId;
    } else {
      elevSel.value = '';
    }
    // Nullstill gjøremål-felt
    document.getElementById('moteTodoTittel').value = '';
    document.getElementById('moteTodoBekreftelse').style.display = 'none';
  }

  const wd=ev?(ev.recurs?ev.weekday:getDayOfWeekFromDate(ev.date)):0;
  document.getElementById('dagSelect').value     = wd;
  document.getElementById('periodeSelect').value = ev ? String(periodFromStart(ev.start)) : '1';
  document.getElementById('periodeSluttSelect').value = ev ? String(periodNumFromEnd(ev.end)) : '1';
  document.getElementById('gjentasCheck').checked = ev ? ev.recurs : false;
  document.getElementById('startWeekInput').value = ev&&ev.startWeek ? ev.startWeek : '';
  const wp_ = (ev&&ev.weekPattern) ? ev.weekPattern : 'every';
  const wpEl_ = document.querySelector('input[name="weekPattern"][value="'+wp_+'"]');
  if(wpEl_) wpEl_.checked = true;
  onGjentasChange();

  // Fyll inn tidspunktet det ble klikket på. Settes etter blokka over,
  // slik at forslaget vinner over standardverdiene for nye hendelser.
  if (!ev && forslag) {
    const p = PERIODS[forslag.periode - 1] || PERIODS[0];
    document.getElementById('dagSelect').value          = String(forslag.weekday);
    document.getElementById('periodeSelect').value      = String(forslag.periode);
    document.getElementById('periodeSluttSelect').value = String(forslag.periode);
    document.getElementById('moteDatoInput').value      = forslag.dato;
    document.getElementById('moteStartInput').value     = p.start;
    document.getElementById('moteSluttInput').value     = p.end;
    onGjentasChange();
  }

  selectedStudentIds = new Set(ev ? ev.students||[] : []);
  document.getElementById('studentSearch').value = '';
  updateFagDatalist();
  renderStudentList();

  document.getElementById('eventFormOverlay').classList.add('open');
}

function setFormCategory(cat) {
  formCategory=cat;
  document.getElementById('tabUndervisning').className='type-tab'+(cat==='undervisning'?' active':'');
  document.getElementById('tabMote').className='type-tab'+(cat==='mote'?' active':'');
  document.getElementById('tabVikar').className='type-tab'+(cat==='vikar'?' active':'');
  document.getElementById('undervisningSection').style.display=cat==='undervisning'?'':'none';
  document.getElementById('moteSection').style.display=cat==='mote'?'':'none';
  document.getElementById('vikarSection').style.display=cat==='vikar'?'':'none';
  document.getElementById('studentSection').style.display=cat==='undervisning'?'':'none';
  document.getElementById('periodeField').style.display=(cat==='undervisning'||cat==='vikar')?'':'none';
  document.getElementById('moteStartField').style.display=cat==='mote'?'':'none';
  document.getElementById('moteSluttField').style.display=cat==='mote'?'':'none';
  // Møter bruker dato-input; undervisning/vikar bruker ukedag-select
  const erMote = cat==='mote';
  document.getElementById('dagField').style.display      = erMote ? 'none' : '';
  document.getElementById('motoDatoField').style.display = erMote ? '' : 'none';
  // Populer elev-dropdown hver gang møte-kategorien aktiveres
  if(cat==='mote'){
    const elevSel=document.getElementById('moteElevSelect');
    elevSel.innerHTML='<option value="">— Ingen elev —</option>';
    allStudents.filter(s=>!s.arkivert).sort((a,b)=>a.navn.localeCompare(b.navn,'nb')).forEach(s=>{
      const opt=document.createElement('option'); opt.value=s.id;
      opt.textContent=`${s.navn} (${s.trinn}. trinn)`;
      elevSel.appendChild(opt);
    });
  }
}

function setSessionType(type) {
  formSessionType=type;
  ['gruppe','enetime','parallell'].forEach(t=>{
    document.getElementById('pill'+t.charAt(0).toUpperCase()+t.slice(1)).className='session-pill'+(t===type?' active':'');
  });
  document.getElementById('parallellNote').style.display=type==='parallell'?'':'none';
  document.getElementById('selectAllBtn').style.display=type==='enetime'?'none':'';
  document.getElementById('studentSectionLabel').textContent=type==='enetime'?'Elev (velg én)':'Elever';
  renderStudentList();
}

function onGjentasChange() {
  const checked=document.getElementById('gjentasCheck').checked;
  document.getElementById('startWeekRow').style.display=checked?'':'none';
  document.getElementById('weekPatternRow').style.display=checked?'':'none';
}

function onTrinnChange() { renderStudentList(); }

function updateFagDatalist() {
  const dl=document.getElementById('fagList');
  const subjects=[...new Set(events.filter(e=>e.category==='undervisning').map(e=>e.title))];
  dl.innerHTML=subjects.map(s=>`<option value="${s}">`).join('');
}

function renderStudentList() {
  const list=document.getElementById('studentList'); if(!list)return;
  const selectedTrinns=getSelectedTrinns();
  const q=(document.getElementById('studentSearch')?.value||'').toLowerCase();
  if(!selectedTrinns.length){list.innerHTML='<div class="student-list-empty">Velg minst ett trinn for å se elever</div>';return;}
  let students=allStudents.filter(s=>!s.arkivert).filter(s=>selectedTrinns.includes(s.trinn));
  if(q)students=students.filter(s=>s.navn.toLowerCase().includes(q));
  if(!students.length){list.innerHTML='<div class="student-list-empty">Ingen elever funnet</div>';return;}
  const isEnetime=formSessionType==='enetime';
  list.innerHTML='';
  students.forEach(s=>{
    const checked=selectedStudentIds.has(s.id);
    const item=document.createElement('label'); item.className='student-item';
    item.innerHTML=`<input type="${isEnetime?'radio':'checkbox'}" name="studentPick" ${checked?'checked':''} data-id="${s.id}" style="width:15px;height:15px;accent-color:var(--accent);cursor:pointer;flex-shrink:0"><span class="student-name">${s.navn}</span><span class="student-trinn">${s.trinn}. trinn</span>`;
    item.querySelector('input').addEventListener('change',e=>{
      if(isEnetime){selectedStudentIds.clear();if(e.target.checked)selectedStudentIds.add(s.id);}
      else{if(e.target.checked)selectedStudentIds.add(s.id);else selectedStudentIds.delete(s.id);}
    });
    list.appendChild(item);
  });
}

function toggleAllStudents() {
  if(formSessionType==='enetime')return;
  const checks=[...document.getElementById('studentList').querySelectorAll('input')];
  const allOn=checks.every(c=>c.checked);
  checks.forEach(c=>{c.checked=!allOn;const id=parseStudentId(c.dataset.id);if(!allOn)selectedStudentIds.add(id);else selectedStudentIds.delete(id);});
}

// After-save state
let pendingPlanEventId = null;
let pendingPlanDate    = null;

function saveEvent() {
  const erMoteKat = (formCategory !== 'undervisning' && formCategory !== 'vikar');
  const recurs  = document.getElementById('gjentasCheck').checked;
  const weekday = erMoteKat ? 0 : parseInt(document.getElementById('dagSelect').value);
  let start, end, elevId = null;
  if(formCategory==='undervisning'||formCategory==='vikar'){
    const periodeStartIdx = parseInt(document.getElementById('periodeSelect').value)-1;
    const periodeSluttIdx = parseInt(document.getElementById('periodeSluttSelect').value)-1;
    const periodeStart = PERIODS[periodeStartIdx];
    const periodeSlutt = PERIODS[Math.max(periodeStartIdx, periodeSluttIdx)];
    start=periodeStart.start; end=periodeSlutt.end;
  } else {
    start=document.getElementById('moteStartInput').value||'08:00';
    end=document.getElementById('moteSluttInput').value||'09:00';
  }
  const startWeek = recurs ? (parseInt(document.getElementById('startWeekInput').value)||null) : null;
  const wpChecked = document.querySelector('input[name="weekPattern"]:checked');
  const weekPattern = recurs && wpChecked ? wpChecked.value : 'every';

  let title,trinn,trinns_,room,category,sessionType,vikarNotes;
  if(formCategory==='undervisning'){
    title=document.getElementById('fagInput').value.trim();
    trinns_=getSelectedTrinns();
    trinn=trinns_[0]||null;
    room=document.getElementById('romInput').value.trim();
    category='undervisning'; sessionType=formSessionType;
    if(!title){alert('Fyll inn fag.');return;}
    if(!trinns_.length){alert('Velg minst ett trinn.');return;}
    if(sessionType==='enetime'&&selectedStudentIds.size!==1){alert('Velg én elev for enetime.');return;}
  } else if(formCategory==='vikar'){
    vikarNotes=document.getElementById('vikarNotesInput').value.trim();
    title=vikarNotes.split('\n')[0].slice(0,40)||'Vikar';
    trinns_=[];
    trinn=null; room=''; category='vikar'; sessionType='gruppe';
  } else {
    title=document.getElementById('moteTittelInput').value.trim();
    trinn=null; room=document.getElementById('stedInput').value.trim();
    trinns_=[];
    category=document.getElementById('moteKategori').value; sessionType='gruppe';
    elevId=parseStudentId(document.getElementById('moteElevSelect').value)||null;
    if(!title){alert('Fyll inn tittel.');return;}
  }

  let date=null;
  if(erMoteKat){
    date=document.getElementById('moteDatoInput').value||isoDate(TODAY);
  } else if(!recurs){
    const d=new Date(currentWeekMonday);d.setDate(d.getDate()+weekday);date=isoDate(d);
  }

  const studentIds=category==='undervisning'?[...selectedStudentIds]:[];
  let savedId;

  if(editingEventId!==null){
    const idx=events.findIndex(e=>e.id===editingEventId);
    if(idx!==-1){events[idx]={...events[idx],title,trinn,trinns:trinns_,room,category,sessionType,start,end,startWeek,weekPattern,recurs,weekday:recurs?weekday:undefined,date:recurs?undefined:date,students:studentIds,vikarNotes,elevId};}
    savedId=editingEventId;
  } else {
    savedId=nextId++;
    events.push({id:savedId,recurs,weekday:recurs?weekday:undefined,date:recurs?undefined:date,title,trinn,trinns:trinns_,room,category,sessionType,start,end,startWeek,weekPattern,students:studentIds,vikarNotes,elevId,gyldigFra:isoDate(TODAY),gyldigTil:null});
  }

  if(category==='undervisning') getSubjectColor(title);
  closeOverlay('eventFormOverlay');
  render();
  saveToStorage();

  // Prompt for plan (only for undervisning)
  if(category==='undervisning'){
    const d=new Date(currentWeekMonday); d.setDate(d.getDate()+weekday);
    pendingPlanEventId=savedId;
    pendingPlanDate=isoDate(d);
    document.getElementById('afterSaveTitle').textContent=`${title} lagret`;
    document.getElementById('afterSaveText').textContent='Vil du legge inn plan for denne timen?';
    document.getElementById('afterSaveOverlay').classList.add('open');
  }
}

function avsluttEventVisModal() {
  // Skjul sletteknapper og Lagre-knapp, vis inline datovelger
  document.getElementById('avsluttEventBtn').style.display = 'none';
  document.getElementById('slettPermBtn').style.display    = 'none';
  document.getElementById('saveEventBtn').style.display    = 'none';
  document.getElementById('avbrytEventBtn').style.display  = 'none';
  document.getElementById('avsluttPanel').style.display    = 'flex';
  document.getElementById('avsluttDatoInput').value        = isoDate(TODAY);
}

function avsluttEventSkjul() {
  // Skjul datovelger og vis sletteknapper og Lagre-knapp igjen
  document.getElementById('avsluttPanel').style.display    = 'none';
  document.getElementById('avsluttEventBtn').style.display = '';
  document.getElementById('slettPermBtn').style.display    = '';
  document.getElementById('saveEventBtn').style.display    = '';
  document.getElementById('avbrytEventBtn').style.display  = '';
}

function avsluttEvent(dato) {
  if (!dato) { alert('Velg en dato.'); return; }
  if (editingEventId === null) return;
  const ev = events.find(e => e.id === editingEventId);
  if (ev) ev.gyldigTil = dato; // ISO-streng fra datovelgeren
  saveToStorage();
  closeOverlay('eventFormOverlay');
  render();
}

function slettEventPermanent() {
  if (editingEventId === null) return;
  const ev = events.find(e => e.id === editingEventId);
  const tittel = ev ? ev.title : 'denne timen';
  const ok = confirm(
    `Er du sikker? All historikk for ${tittel}, inkludert elevlogg og oppmøtedata, vil slettes permanent. Dette kan ikke angres.`
  );
  if (!ok) return;
  // Fjern event fra listen
  events = events.filter(e => e.id !== editingEventId);
  // Fjern alle tilhørende lessonData-nøkler
  const prefiks = String(editingEventId) + '_';
  Object.keys(lessonData).forEach(k => { if (k.startsWith(prefiks)) delete lessonData[k]; });
  saveToStorage();
  closeOverlay('eventFormOverlay');
  render();
}

function openPlanFromPrompt() {
  closeOverlay('afterSaveOverlay');
  const ev=events.find(e=>e.id===pendingPlanEventId);
  if(!ev)return;
  openLessonPlan(ev, new Date(pendingPlanDate+'T00:00:00'));
}

// ────────────────────────────────────────────
// LESSON PLAN MODAL
// ────────────────────────────────────────────
let planEventId = null;
let planDateStr = null;

function openLessonPlan(ev, date) {
  planEventId = ev.id;
  planDateStr = isoDate(date);
  const ld = getLesson(ev.id, planDateStr) || { tema:'', notes:'', attendance:{}, studentNotes:{} };

  // Header
  const ev_trinns3_ = getEventTrinns(ev);
  const trinnStr = ev_trinns3_.map(t=>t+'. trinn').join(' + ');
  document.getElementById('planTitle').textContent = [ev.title, trinnStr].filter(Boolean).join(' · ');
  const dayStr  = `${DAYS_LONG[date.getDay()-1]} ${date.getDate()}. ${MONTHS[date.getMonth()]}`;
  const roomStr = ev.room ? ` · ${ev.room}` : '';
  document.getElementById('planSubtitle').textContent = `${dayStr} · ${periodLabel(ev.start)}${roomStr}`;

  // Populate tema
  const topics = getTopicsForSubject(ev.title);
  document.getElementById('temaList').innerHTML = topics.map(t=>`<option value="${t}">`).join('');
  document.getElementById('temaInput').value  = ld.tema  || '';
  document.getElementById('planNotes').value  = ld.notes || '';

  // Populate attendance
  renderAttendanceList(ev, ld.attendance || {}, ld.studentNotes || {});

  document.getElementById('planOverlay').classList.add('open');
}


function renderAttendanceList(ev, attendance, studentNotes) {
  studentNotes = studentNotes || {};
  const list = document.getElementById('attendanceList');
  const students = (ev.students||[]).map(id=>studentById(id)).filter(Boolean);
  if(!students.length){list.innerHTML='<div class="student-list-empty">Ingen elever registrert for denne timen</div>';return;}
  list.innerHTML='';

  // Finn skoletimer hendelsen dekker — avgjør antall avkrysningsbokser per elev
  const timer = finnSkoletimer(ev);
  const flereTimer = timer.length > 1;

  students.forEach(s=>{
    // Les lagret verdi — støtter begge nøkkelformater
    const raw = attendance[s.id] ?? attendance[String(s.id)];

    // Wrapper div (column layout)
    const item=document.createElement('div'); item.className='student-item';
    item.style.cssText='flex-direction:column;align-items:stretch;gap:4px;';

    if (!flereTimer) {
      // ── Én skoletime: én avkrysningsboks uten etikett (som tidligere) ──
      const present = Array.isArray(raw) ? raw[0] !== false : raw !== false;
      const row=document.createElement('label'); row.style.cssText='display:flex;align-items:center;gap:10px;cursor:pointer';
      const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=present;
      cb.dataset.id=s.id; cb.dataset.periodIdx='0';
      const nameSpan=document.createElement('span'); nameSpan.className='student-name'; nameSpan.textContent=s.navn;
      row.appendChild(cb); row.appendChild(nameSpan);
      if(!present){const al=document.createElement('span');al.className='absent-label';al.textContent='Fraværende';row.appendChild(al);}
      cb.addEventListener('change',e=>{
        const lbl=row.querySelector('.absent-label');
        if(e.target.checked){if(lbl)lbl.remove();}
        else{if(!lbl){const l=document.createElement('span');l.className='absent-label';l.textContent='Fraværende';row.appendChild(l);}}
      });
      item.appendChild(row);
    } else {
      // ── Flere skoletimer: elevnavn + én boks per time med periodenummer ──
      const nameRow=document.createElement('div'); nameRow.style.cssText='font-weight:600;font-size:13px;color:var(--text-primary);padding-bottom:2px;';
      nameRow.textContent=s.navn;
      const cbRow=document.createElement('div'); cbRow.style.cssText='display:flex;flex-wrap:wrap;gap:10px;';
      timer.forEach((p, i) => {
        const checked = Array.isArray(raw) ? (raw[i] !== false) : (raw !== false);
        const lbl=document.createElement('label'); lbl.style.cssText='display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px;color:var(--text-secondary);';
        const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=checked;
        cb.dataset.id=s.id; cb.dataset.periodIdx=String(i);
        const txt=document.createTextNode(`${p.n}. t`);
        lbl.appendChild(cb); lbl.appendChild(txt);
        cbRow.appendChild(lbl);
      });
      item.appendChild(nameRow); item.appendChild(cbRow);
    }

    // Notatfelt per elev — textarea for lengre notater
    const noteInp=document.createElement('textarea');
    noteInp.className='student-note-input'; noteInp.placeholder='Notat for denne timen…';
    noteInp.value=studentNotes[s.id]||''; noteInp.dataset.sid=s.id;
    noteInp.addEventListener('click',e=>e.stopPropagation());
    item.appendChild(noteInp);
    list.appendChild(item);
  });
}

function toggleAllAttendance() {
  const checks=[...document.getElementById('attendanceList').querySelectorAll('input[type="checkbox"]')];
  const allOn=checks.every(c=>c.checked);
  checks.forEach(c=>{
    c.checked=!allOn;
    const row=c.closest('label');
    const lbl=row?row.querySelector('.absent-label'):null;
    if(!allOn){if(lbl)lbl.remove();}
    else{if(row&&!lbl){const l=document.createElement('span');l.className='absent-label';l.textContent='Fraværende';row.appendChild(l);}}
  });
}

function saveLessonPlan() {
  const tema  = document.getElementById('temaInput').value.trim();
  const notes = document.getElementById('planNotes').value.trim();
  // Grupper avkrysningsbokser per elev-id og lagre som boolean[]
  const attendance = {};
  document.getElementById('attendanceList').querySelectorAll('input[type="checkbox"]').forEach(cb=>{
    const id = parseStudentId(cb.dataset.id);
    const idx = parseInt(cb.dataset.periodIdx, 10);
    if (!attendance[id]) attendance[id] = [];
    attendance[id][idx] = cb.checked;
  });
  const studentNotes_={};
  document.getElementById('attendanceList').querySelectorAll('textarea[data-sid]').forEach(inp=>{
    if(inp.value.trim()) studentNotes_[parseStudentId(inp.dataset.sid)]=inp.value.trim();
  });
  setLesson(planEventId, planDateStr, { tema, notes, attendance, studentNotes: studentNotes_ });
  const ev=events.find(e=>e.id===planEventId);
  if(ev&&tema) addTopic(ev.title, tema);
  saveToStorage();
  closeOverlay('planOverlay');
  render();
}

function openEditFromPlan() {
  const ev=events.find(e=>e.id===planEventId);
  closeOverlay('planOverlay');
  if(ev) openEventForm(ev);
}

function kopierEvent() {
  const ev=events.find(e=>e.id===planEventId);
  if(!ev)return;
  closeOverlay('planOverlay');
  openEventForm(ev);
  editingEventId=null;
  document.getElementById('formTitle').textContent='Kopier time';
  document.getElementById('deleteEventBtn').style.display='none';
}

// ────────────────────────────────────────────
// ELEVLOGG
// ────────────────────────────────────────────
function openElevlogg(studentId = null) {
  // Fyll elevselektor
  const sel=document.getElementById('elevloggSelect');
  sel.innerHTML='<option value="">— Velg elev —</option>';
  allStudents.forEach(s=>{
    const opt=document.createElement('option');
    opt.value=s.id; opt.textContent=`${s.navn} (${s.trinn}. trinn)`;
    sel.appendChild(opt);
  });
  document.getElementById('elevloggOverlay').classList.add('open');
  if (studentId !== null) {
    // Forhåndsvelg eleven og vis loggen umiddelbart
    sel.value = studentId;
    renderElevlogg();
  } else {
    document.getElementById('elevloggContent').innerHTML='<div class="empty-state">Velg en elev for å se logg over deltakelse og tema.</div>';
  }
}

function renderElevlogg() {
  // Modal-fallback — bruker felles innholdsbygger
  const studentId=parseStudentId(document.getElementById('elevloggSelect').value);
  renderElevloggInnhold(studentId, document.getElementById('elevloggContent'));
}

// Felles innholdsbygger for elevlogg — brukes av både modal og fullskjerm-visning
function renderElevloggInnhold(studentId, container) {
  if(!studentId){container.innerHTML='<div class="empty-state">Velg en elev for å se logg.</div>';return;}

  // Samle alle timer der eleven er registrert — inkludert fravær
  const entries = [];
  Object.keys(lessonData).forEach(key=>{
    const ld=lessonData[key];
    const [evIdStr, dateStr]=key.split('_');
    const ev=events.find(e=>e.id===parseInt(evIdStr));
    if(!ev||ev.category!=='undervisning') return;
    if(!ev.students.includes(studentId)) return;

    // Nærvær: håndter boolean[], boolean og undefined
    const att=ld.attendance||{};
    const raw=att[studentId]??att[String(studentId)];
    let attendanceBadge=null; // null = fullt til stede / ikke registrert
    if(Array.isArray(raw)){
      const total=raw.length;
      const present=raw.filter(Boolean).length;
      if(total>0&&present<total){
        if(present===0){
          attendanceBadge={label:'Fraværende',style:'background:var(--danger,#e74c3c);color:#fff'};
        } else {
          attendanceBadge={label:`${present}/${total} t`,style:'background:var(--warning,#f39c12);color:#fff'};
        }
      }
    } else if(raw===false){
      attendanceBadge={label:'Fraværende',style:'background:var(--danger,#e74c3c);color:#fff'};
    }
    // raw===true eller undefined → ingen badge

    // Per-elev-notat
    const sn=ld.studentNotes||{};
    const studentNote=(sn[studentId]??sn[String(studentId)])||'';

    entries.push({ date:dateStr, ev, tema:ld.tema, notes:ld.notes, attendanceBadge, studentNote });
  });

  if(!entries.length){
    container.innerHTML='<div class="empty-state">Ingen registrerte timer for denne eleven ennå.</div>';
    return;
  }

  // Grupper per fag
  const bySubject = {};
  entries.forEach(e=>{
    if(!bySubject[e.ev.title]) bySubject[e.ev.title]=[];
    bySubject[e.ev.title].push(e);
  });

  container.innerHTML='';
  Object.entries(bySubject).forEach(([subject, items])=>{
    const c=getSubjectColor(subject);
    const block=document.createElement('div'); block.className='logg-subject-block';
    block.innerHTML=`<div class="logg-subject-title"><span class="logg-subject-dot" style="background:${c.border}"></span>${subject}</div>`;

    // Sorter etter dato, nyeste først
    items.sort((a,b)=>b.date.localeCompare(a.date)).forEach(item=>{
      const d=new Date(item.date+'T00:00:00');
      const dateLabel=`${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      const badgeHtml=item.attendanceBadge
        ?`<span class="logg-attendance-badge" style="${item.attendanceBadge.style};padding:1px 6px;border-radius:4px;font-size:0.75rem;white-space:nowrap">${item.attendanceBadge.label}</span>`
        :'';
      const entry=document.createElement('div'); entry.className='logg-entry';
      entry.innerHTML=`
        <div style="flex:1">
          <div style="display:flex;align-items:baseline;gap:8px">
            <span class="logg-tema">${item.tema||'(uten tema)'}</span>
            ${badgeHtml}
          </div>
          ${item.notes?`<div class="logg-notes">${item.notes}</div>`:''}
          ${item.studentNote?`<div class="logg-student-note"><strong>Notat:</strong> ${item.studentNote}</div>`:''}
        </div>
        <span class="logg-date">${dateLabel}</span>`;
      block.appendChild(entry);
    });
    container.appendChild(block);
  });
}

// ────────────────────────────────────────────
// ELEVLOGG VIEW
// ────────────────────────────────────────────
function renderElevloggView() {
  // Fyll elevselektor og behold ev. valgt elev ved re-render
  const sel = document.getElementById('elevloggViewSelect');
  const valgt = sel.value;
  sel.innerHTML = '<option value="">— Velg elev —</option>';
  allStudents.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id; opt.textContent = `${s.navn} (${s.trinn}. trinn)`;
    sel.appendChild(opt);
  });
  sel.value = valgt;
  const studentId = parseStudentId(sel.value);
  const container = document.getElementById('elevloggViewContent');
  if (!studentId) {
    container.innerHTML = '<div class="empty-state">Velg en elev for å se logg over deltakelse og tema.</div>';
    return;
  }
  renderElevloggInnhold(studentId, container);
}

function elevloggViewChanged() {
  const studentId = parseStudentId(document.getElementById('elevloggViewSelect').value);
  renderElevloggInnhold(studentId, document.getElementById('elevloggViewContent'));
}

// ────────────────────────────────────────────
// ELEVADMIN
// ────────────────────────────────────────────
let editingStudentId = null;
let ekspandertElevId = null; // ID til elev med åpen detaljrad
let visArkiverte     = false; // Vis/skjul arkivert-seksjon

function renderElevView() {
  const container = document.getElementById('elevAdminView');
  if (!container) return;

  // Kun aktive elever i hovudtabellen
  const sorted = [...allStudents]
    .filter(s => s.arkivert !== true)
    .sort((a, b) => a.trinn !== b.trinn ? a.trinn - b.trinn : a.navn.localeCompare(b.navn, 'nb'));
  const arkiverte = [...allStudents]
    .filter(s => s.arkivert === true)
    .sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));

  let html = `
    <div class="elev-admin-header">
      <h2>Elever</h2>
      <button class="btn-primary" onclick="openStudentForm(null)">+ Legg til elev</button>
    </div>
    <div class="bulk-panel">
      <div class="bulk-panel-tittel">Legg til flere elever</div>
      <textarea id="bulkNavnInput" class="bulk-textarea" placeholder="Ett navn per linje&#10;Ola Nordmann&#10;Kari Nordmann"></textarea>
      <div class="bulk-panel-rad">
        <select id="bulkTrinn" class="bulk-select">
          <option value="">Velg trinn</option>
          <option value="8">8. trinn</option>
          <option value="9">9. trinn</option>
          <option value="10">10. trinn</option>
        </select>
        <input type="date" id="bulkStartDato" class="bulk-dato" value="${isoDate(TODAY)}">
        <button class="btn-primary" onclick="leggTilFlereElever()">Legg til alle</button>
      </div>
    </div>
    ${antallUtenNavn() ? `<div class="navn-mangler-banner">
      ${antallUtenNavn()} elev${antallUtenNavn() !== 1 ? 'er' : ''} mangler navn på denne enheten.
      Elevnavn synkes ikke — klikk «Rediger» for å legge dem inn her.
    </div>` : ''}
    <table class="elev-table">
      <thead>
        <tr>
          <th>Navn</th>
          <th>Trinn</th>
          <th>Startet</th>
          <th>Oppmøte</th>
          <th></th>
          <th>Handlinger</th>
        </tr>
      </thead>
      <tbody>`;

  sorted.forEach(s => {
    const att = calcAttendance(s.id);
    const pctStr = att.percent !== null ? att.percent + '%' : '—';
    const pctClass = att.percent === null ? '' : att.percent < 80 ? 'att-low' : att.percent < 90 ? 'att-mid' : 'att-ok';
    const startStr = s.startDato || '—';
    html += `
        <tr class="elev-table-row elev-hovud-rad" data-student-id="${s.id}">
          <td><span class="elv-pil">▶</span> <span class="${s.navnMangler ? 'navn-mangler' : ''}">${s.navn}</span></td>
          <td>${s.trinn}. trinn</td>
          <td>${startStr}</td>
          <td class="${pctClass}">${pctStr} <span class="att-detail">(${att.present}/${att.total})</span></td>
          <td><button class="btn-small" data-action="logg" data-student-id="${s.id}">Elevlogg</button></td>
          <td>
            <button class="btn-small" data-action="rediger" data-student-id="${s.id}">Rediger</button>
            <button class="btn-small" data-action="arkiver" data-student-id="${s.id}">Arkiver</button>
            <button class="btn-small btn-danger" data-action="slett" data-student-id="${s.id}">Slett</button>
          </td>
        </tr>
        <tr class="elev-detalj-rad" data-student-id="${s.id}" style="display:none">
          <td colspan="6" class="elev-detalj-celle"></td>
        </tr>`;
  });

  html += `
      </tbody>
    </table>`;

  // Lenke for å vise/skjule arkiverte elever
  const arkivertLabel = visArkiverte ? 'Skjul arkiverte elever' : `Vis arkiverte elever${arkiverte.length ? ' (' + arkiverte.length + ')' : ''}`;
  html += `<div class="arkivert-toggle-rad"><button class="arkivert-toggle-btn" onclick="toggleVisArkiverte()">${arkivertLabel}</button></div>`;

  if (visArkiverte && arkiverte.length > 0) {
    html += `
    <div class="arkivert-seksjon">
      <table class="elev-table">
        <thead>
          <tr>
            <th>Navn</th>
            <th>Trinn</th>
            <th>Arkivert</th>
            <th>Handlinger</th>
          </tr>
        </thead>
        <tbody>`;
    arkiverte.forEach(s => {
      const datoStr = s.arkivertDato || '—';
      html += `
          <tr>
            <td>${s.navn}</td>
            <td>${s.trinn}. trinn</td>
            <td>${datoStr}</td>
            <td>
              <button class="btn-small" data-action="gjenaktiver" data-student-id="${s.id}">Gjenaktiver</button>
              <button class="btn-small btn-danger" data-action="slett" data-student-id="${s.id}">Slett permanent</button>
            </td>
          </tr>`;
    });
    html += `
        </tbody>
      </table>
    </div>`;
  } else if (visArkiverte && arkiverte.length === 0) {
    html += `<div class="arkivert-seksjon"><div class="empty-state">Ingen arkiverte elever.</div></div>`;
  }

  container.innerHTML = html;

  // Unified action-lytter — leser data-action og data-student-id
  container.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id     = parseStudentId(btn.dataset.studentId);
    const action = btn.dataset.action;
    if      (action === 'rediger')         openStudentForm(id);
    else if (action === 'logg')            openElevlogg(id);
    else if (action === 'arkiver')         arkiverElev(id);
    else if (action === 'gjenaktiver')     gjenaktiverElev(id);
    else if (action === 'slett')           deleteStudent(id);
  });

  // Rad-klikk: ekspander/kollaps detaljrad (ikke ved klikk på knapper)
  container.querySelectorAll('tr.elev-hovud-rad').forEach(tr => {
    tr.addEventListener('click', e => {
      if (e.target.closest('button')) return; // Ignorer knappeklikk
      toggleElevDetalj(parseStudentId(tr.dataset.studentId));
    });
  });
}

function toggleElevDetalj(id) {
  const container = document.getElementById('elevAdminView');
  const idStr = String(id);

  // Lukk forrige ekspanderte rad hvis en annen rad klikkes
  if (ekspandertElevId !== null && String(ekspandertElevId) !== idStr) {
    const forrigeDetalj = container.querySelector(`.elev-detalj-rad[data-student-id="${CSS.escape(String(ekspandertElevId))}"]`);
    const forrigePil    = container.querySelector(`.elev-hovud-rad[data-student-id="${CSS.escape(String(ekspandertElevId))}"] .elv-pil`);
    if (forrigeDetalj) forrigeDetalj.style.display = 'none';
    if (forrigePil)    forrigePil.textContent = '▶';
    ekspandertElevId = null;
  }

  const detalj = container.querySelector(`.elev-detalj-rad[data-student-id="${CSS.escape(idStr)}"]`);
  const pil    = container.querySelector(`.elev-hovud-rad[data-student-id="${CSS.escape(idStr)}"] .elv-pil`);
  if (!detalj) return;

  const erApen = detalj.style.display !== 'none';
  if (erApen) {
    // Kollaps
    detalj.style.display = 'none';
    if (pil) pil.textContent = '▶';
    ekspandertElevId = null;
  } else {
    // Ekspander — bygg fag-tabellen på forespørsel
    const perFag = calcAttendancePerFag(id);
    const fag = Object.keys(perFag).sort((a, b) => a.localeCompare(b, 'nb'));
    let inner = `<table class="fag-detalj-tabell">
      <thead><tr><th>Fag</th><th>Til stede</th><th>Totalt</th><th>Oppmøte</th></tr></thead>
      <tbody>`;
    if (!fag.length) {
      inner += `<tr><td colspan="4" style="color:var(--text-muted);font-style:italic">Ingen registrerte timer</td></tr>`;
    } else {
      fag.forEach(f => {
        const a = perFag[f];
        const cls = a.percent === null ? '' : a.percent < 80 ? 'att-low' : a.percent < 90 ? 'att-mid' : 'att-ok';
        const pct = a.percent !== null ? a.percent + '%' : '—';
        inner += `<tr><td>${f}</td><td>${a.present}</td><td>${a.total}</td><td class="${cls}">${pct}</td></tr>`;
      });
    }
    inner += `</tbody></table>`;
    detalj.querySelector('td').innerHTML = inner;
    detalj.style.display = '';
    if (pil) pil.textContent = '▼';
    ekspandertElevId = id;
  }
}

function leggTilFlereElever() {
  const textarea  = document.getElementById('bulkNavnInput');
  const trinnVal  = parseInt(document.getElementById('bulkTrinn').value, 10);
  const startDato = document.getElementById('bulkStartDato').value || isoDate(TODAY);

  if (!textarea.value.trim()) { alert('Lim inn minst ett navn.'); return; }
  if (isNaN(trinnVal))        { alert('Velg trinn.'); return; }

  // Split på linjeskift, trim og filtrer tomme linjer
  const navn = textarea.value.split('\n').map(n => n.trim()).filter(n => n.length > 0);
  if (!navn.length) { alert('Ingen gyldige navn funnet.'); return; }

  // Opprett elevobjekter med samme struktur som saveStudent()
  navn.forEach(n => {
    allStudents.push({
      id:          crypto.randomUUID(),
      navn:        n,
      navnMangler: false,
      trinn:       trinnVal,
      startDato:   startDato,
      arkivert:    false,
      arkivertDato: null
    });
  });

  saveToStorage();
  textarea.value = '';
  renderElevView();
  alert(`${navn.length} elev${navn.length !== 1 ? 'er' : ''} lagt til.`);
}

function openStudentForm(id) {
  editingStudentId = (id !== null && id !== undefined) ? id : null;
  const overlay = document.getElementById('studentFormOverlay');
  const title   = document.getElementById('studentFormTitle');
  const navn    = document.getElementById('sfNavn');
  const trinn   = document.getElementById('sfTrinn');
  const start   = document.getElementById('sfStartDato');

  if (editingStudentId !== null) {
    const s = allStudents.find(st => String(st.id) === String(editingStudentId));
    title.textContent = 'Rediger elev';
    // Fallback-navn skal ikke fylles inn i skjemaet — feltet står tomt
    // slik at det ekte navnet kan skrives inn på denne enheten
    navn.value  = s ? (s.navnMangler ? '' : s.navn) : '';
    trinn.value = s ? s.trinn   : '';
    start.value = s ? (s.startDato || '') : '';
  } else {
    title.textContent = 'Legg til elev';
    navn.value  = '';
    trinn.value = '';
    start.value = '';
  }
  overlay.classList.add('open');
}

function saveStudent() {
  const navn   = document.getElementById('sfNavn').value.trim();
  const trinn  = parseInt(document.getElementById('sfTrinn').value, 10);
  const start  = document.getElementById('sfStartDato').value || '';

  if (!navn) { alert('Navn er påkrevd.'); return; }
  if (isNaN(trinn) || trinn < 1 || trinn > 13) { alert('Ugyldig trinn.'); return; }

  if (editingStudentId !== null) {
    const s = allStudents.find(st => String(st.id) === String(editingStudentId));
    if (s) { s.navn = navn; s.navnMangler = false; s.trinn = trinn; s.startDato = start; }
  } else {
    allStudents.push({
      id:          crypto.randomUUID(),
      navn:        navn,
      navnMangler: false,
      trinn:       trinn,
      startDato:   start,
      arkivert:    false,
      arkivertDato: null
    });
  }

  saveToStorage();
  closeOverlay('studentFormOverlay');
  renderElevView();
}

function deleteStudent(id) {
  const s = allStudents.find(st => String(st.id) === String(id));
  if (!s) return;
  if (!confirm(`Slett ${s.navn}? Dette kan ikke angres.`)) return;

  // Fjern fra allStudents
  const idx = allStudents.findIndex(st => String(st.id) === String(id));
  if (idx !== -1) allStudents.splice(idx, 1);

  // Fjern fra events.students
  events.forEach(ev => {
    if (ev.students) {
      const si = ev.students.findIndex(sid => String(sid) === String(id));
      if (si !== -1) ev.students.splice(si, 1);
    }
  });

  saveToStorage();
  renderElevView();
}


function arkiverElev(id) {
  const s = allStudents.find(st => String(st.id) === String(id));
  if (!s) return;
  s.arkivert     = true;
  s.arkivertDato = isoDate(TODAY);
  saveToStorage();
  renderElevView();
}

function gjenaktiverElev(id) {
  const s = allStudents.find(st => String(st.id) === String(id));
  if (!s) return;
  s.arkivert     = false;
  s.arkivertDato = null;
  saveToStorage();
  renderElevView();
}

function toggleVisArkiverte() {
  visArkiverte = !visArkiverte;
  renderElevView();
}

// ────────────────────────────────────────────
// VIEW SWITCHING
// ────────────────────────────────────────────
function setView(v) {
  currentView = v;
  // Header-toggle (Dag/Uke/Måned) gjelder kun kalendervisningen
  ['Day','Week','Month'].forEach(name => {
    const el = document.getElementById('vbtn'+name);
    if (el) el.classList.toggle('active', v===name.toLowerCase());
  });
  // Sidemeny: marker aktivt menyvalg
  const erKalender = v==='day' || v==='week' || v==='month';
  const menyStatus = {
    menyUkesoversikt: erKalender,
    menyElever:       v==='elever',
    menyElevlogg:     v==='elevlogg',
    menyMinSide:      v==='minside'
  };
  Object.entries(menyStatus).forEach(([id, aktiv]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', aktiv);
  });
  render();
}

function changeNav(dir) {
  if (currentView==='week') {
    currentWeekMonday=new Date(currentWeekMonday);
    currentWeekMonday.setDate(currentWeekMonday.getDate()+dir*7);
  } else if (currentView==='day') {
    currentDay=new Date(currentDay);
    currentDay.setDate(currentDay.getDate()+dir);
  } else {
    currentMonthStart=new Date(currentMonthStart);
    currentMonthStart.setMonth(currentMonthStart.getMonth()+dir);
  }
  render();
}

function goToDayView(dateStr) {
  currentDay = new Date(dateStr+'T00:00:00');
  setView('day');
}

// ────────────────────────────────────────────
// MONTH VIEW
// ────────────────────────────────────────────
function renderMonthView() {
  const grid = document.getElementById('monthGrid');
  const dowRow = document.getElementById('monthDowRow');
  const year = currentMonthStart.getFullYear();
  const month = currentMonthStart.getMonth();

  // Add week-number column to header row
  dowRow.style.gridTemplateColumns = '28px repeat(7, 1fr)';
  dowRow.innerHTML = '<div class="month-week-num-header">Uke</div><div class="month-dow-header">Man</div><div class="month-dow-header">Tir</div><div class="month-dow-header">Ons</div><div class="month-dow-header">Tor</div><div class="month-dow-header">Fre</div><div class="month-dow-header">Lør</div><div class="month-dow-header">Søn</div>';
  grid.style.gridTemplateColumns = '28px repeat(7, 1fr)';

  // First Monday at or before the 1st of the month
  const firstDay = new Date(year, month, 1);
  const startDow = firstDay.getDay()===0 ? 6 : firstDay.getDay()-1;
  const gridStart = new Date(firstDay);
  gridStart.setDate(gridStart.getDate()-startDow);

  // Last Sunday at or after last day of month
  const lastDay = new Date(year, month+1, 0);
  const endDow = lastDay.getDay()===0 ? 6 : lastDay.getDay()-1;
  const gridEnd = new Date(lastDay);
  gridEnd.setDate(gridEnd.getDate()+(6-endDow));

  grid.innerHTML='';
  let colIdx = 0;
  const cursor = new Date(gridStart);
  while(cursor <= gridEnd) {
    // Insert week-number cell at start of each row (Monday)
    if(colIdx % 7 === 0) {
      const wnCell = document.createElement('div');
      wnCell.className = 'month-week-num-cell';
      wnCell.textContent = weekNumber(cursor);
      grid.appendChild(wnCell);
    }

    const isThisMonth = cursor.getMonth()===month;
    const key = isoDate(cursor);
    const todayCls = isoDate(cursor)===isoDate(TODAY) ? ' today' : '';
    const otherCls = !isThisMonth ? ' other-month' : '';
    const fridagCls = erFridag(cursor) ? ' fridag-cell' : '';
    const utenforCls = !erFridag(cursor) && erUtenforSkoleaar(cursor) ? ' utenfor-skoleaar-cell' : '';
    const cell = document.createElement('div');
    cell.className = `month-cell${todayCls}${otherCls}${fridagCls}${utenforCls}`;
    cell.onclick = () => goToDayView(key);
    const frigagMonth = erFridag(cursor);
    cell.innerHTML = `<span class="month-day-num">${cursor.getDate()}</span>${frigagMonth ? `<span class="fridag-label">${frigagMonth.tittel}</span>` : ''}`;

    const dayEvs = eventsForDate(cursor);
    let pillCount = 0;
    dayEvs.slice(0,3).forEach(ev=>{
      const c=eventColor(ev);
      const pill=document.createElement('div');
      pill.className=`month-event-pill${ev.category==='vikar'?' vikar':''}`;
      pill.style.cssText=`background:${c.bg};color:${c.text};border-left:2px solid ${c.border}`;
      pill.textContent=ev.title||'Vikar';
      pill.onclick = e => {
        e.stopPropagation();
        const d=new Date(key+'T00:00:00');
        if(ev.category==='undervisning') openLessonPlan(ev,d);
        else openEventForm(ev);
      };
      cell.appendChild(pill);
      pillCount++;
    });

    // Todo deadlines
    const todayStr2 = isoDate(TODAY);
    todos.filter(t=>t.frist===key&&t.status!=='ferdig').slice(0, Math.max(0,3-pillCount)).forEach(t=>{
      const tp=document.createElement('div');
      tp.className='todo-month-pill';
      const tLabel=t.tittel||t.text||'';
      tp.textContent='☑ '+(tLabel.length>18?tLabel.slice(0,16)+'…':tLabel);
      tp.title=tLabel;
      tp.onclick=e=>{e.stopPropagation();openTodoForm(t.id);};
      cell.appendChild(tp);
    });

    if(dayEvs.length>3){
      const more=document.createElement('div');
      more.className='month-more';
      more.textContent=`+${dayEvs.length-3} til`;
      cell.appendChild(more);
    }

    grid.appendChild(cell);
    cursor.setDate(cursor.getDate()+1);
    colIdx++;
  }
}


// ────────────────────────────────────────────
// SIDEBAR / GJØR EMÅL
// ────────────────────────────────────────────
function toggleSidebar() {
  sidebarVisible = !sidebarVisible;
  document.getElementById('sidebarContent').classList.toggle('collapsed', !sidebarVisible);
}

function openTodoForm(editId) {
  editingTodoId = (editId !== undefined) ? editId : null;
  const todo = (editingTodoId !== null) ? todos.find(t=>t.id===editingTodoId) : null;
  document.getElementById('todoFormTitle').textContent = todo ? 'Rediger gjøremål' : 'Nytt gjøremål';
  document.getElementById('todoTittelInput').value = todo ? (todo.tittel||'') : '';
  document.getElementById('todoTextInput').value = todo ? (todo.tekst||'') : '';
  document.getElementById('todoFristInput').value = todo ? (todo.frist||'') : '';
  document.getElementById('todoSaveBtn').textContent = todo ? 'Lagre endringer' : 'Lagre';

  const fagSel = document.getElementById('todoFagSelect');
  const subjects = [...new Set(events.filter(e=>e.category==='undervisning').map(e=>e.title))];
  fagSel.innerHTML = '<option value="">— Ingen —</option>';
  subjects.forEach(s=>{
    const opt=document.createElement('option'); opt.value=s; opt.textContent=s;
    if(todo&&todo.linkedFag===s) opt.selected=true;
    fagSel.appendChild(opt);
  });

  const stuSel = document.getElementById('todoStudentSelect');
  stuSel.innerHTML = '<option value="">— Ingen —</option>';
  allStudents.forEach(s=>{
    const opt=document.createElement('option'); opt.value=s.id;
    opt.textContent=s.navn+' ('+s.trinn+'. trinn)';
    if(todo&&todo.linkedStudentId===s.id) opt.selected=true;
    stuSel.appendChild(opt);
  });

  document.getElementById('todoFormOverlay').classList.add('open');
}

function leggTilGjøremålFraMøte() {
  const tittel = document.getElementById('moteTodoTittel').value.trim();
  if (!tittel) return;
  // Hent elevId fra møte-dropdown og dato fra det aktive event-objektet
  const elevId = parseStudentId(document.getElementById('moteElevSelect').value) || null;
  const ev = editingEventId !== null ? events.find(e => e.id === editingEventId) : null;
  const frist = (ev && ev.date) ? ev.date : isoDate(TODAY);
  todos.push({
    id: nextTodoId++,
    tittel,
    tekst: '',
    status: 'ikke_startet',
    linkedFag: null,
    linkedStudentId: elevId,
    frist
  });
  saveToStorage();
  renderTodoList();
  document.getElementById('moteTodoTittel').value = '';
  // Vis bekreftelse i 2 sekunder
  const bkr = document.getElementById('moteTodoBekreftelse');
  bkr.style.display = 'block';
  setTimeout(() => { bkr.style.display = 'none'; }, 2000);
}

function saveTodo() {
  const tittel=document.getElementById('todoTittelInput').value.trim();
  if(!tittel){alert('Fyll inn tittel.');return;}
  const tekst=document.getElementById('todoTextInput').value.trim();
  const linkedFag=document.getElementById('todoFagSelect').value||null;
  const linkedStudentId=parseStudentId(document.getElementById('todoStudentSelect').value)||null;
  const frist=document.getElementById('todoFristInput').value||null;

  if(editingTodoId!==null){
    const idx=todos.findIndex(t=>t.id===editingTodoId);
    if(idx!==-1) todos[idx]={...todos[idx],tittel,tekst,linkedFag,linkedStudentId,frist};
  } else {
    todos.push({id:nextTodoId++,tittel,tekst,linkedFag,linkedStudentId,frist,status:'ikke_startet'});
  }
  saveToStorage();
  closeOverlay('todoFormOverlay');
  renderTodoList();
  if(currentView==='month') renderMonthView();
}

function cycleTodoStatus(id) {
  const todo=todos.find(t=>t.id===id); if(!todo)return;
  const cycle=['ikke_startet','startet','ferdig'];
  todo.status=cycle[(cycle.indexOf(todo.status)+1)%cycle.length];
  saveToStorage();
  renderTodoList();
  if(currentView==='month') renderMonthView();
}

function deleteTodo(id) {
  const todo=todos.find(t=>t.id===id); if(!todo)return;
  todo.slettet=true;
  saveToStorage();
  renderTodoList();
  if(currentView==='month') renderMonthView();
}

function renderTodoList() {
  const container=document.getElementById('todoList'); if(!container)return;
  const aktive=todos.filter(t=>!t.slettet&&t.status!=='ferdig');
  if(!aktive.length){container.innerHTML='<div class="todo-empty">Ingen gjøremål ennå<br><span style="font-size:11px">Trykk + under for å legge til</span></div>';return;}
  container.innerHTML='';
  const todayStr=isoDate(TODAY);
  const sorted=[...aktive].sort((a,b)=>{
    if(a.frist&&b.frist) return a.frist.localeCompare(b.frist);
    if(a.frist)return -1; if(b.frist)return 1;
    return a.id-b.id;
  });
  sorted.forEach(todo=>{
    const overdue=todo.frist&&todo.frist<todayStr&&todo.status!=='ferdig';
    const item=document.createElement('div');
    item.className='todo-item'+(todo.status==='ferdig'?' ferdig':'')+(overdue?' overdue-item':'');

    const statusBtn=document.createElement('button');
    statusBtn.className='todo-status-circle '+todo.status;
    statusBtn.title='Klikk for å endre status';
    statusBtn.onclick=()=>cycleTodoStatus(todo.id);

    const body=document.createElement('div'); body.className='todo-body';
    body.style.cursor='pointer';
    body.onclick=()=>openTodoForm(todo.id);
    const textDiv=document.createElement('div'); textDiv.className='todo-text';
    textDiv.textContent=todo.tittel||todo.text||'';
    body.appendChild(textDiv);
    if(todo.tekst){
      const descDiv=document.createElement('div'); descDiv.className='todo-desc';
      descDiv.textContent=todo.tekst;
      body.appendChild(descDiv);
    }

    const meta=document.createElement('div'); meta.className='todo-meta';
    if(todo.linkedFag){const t=document.createElement('span');t.className='todo-tag';t.textContent=todo.linkedFag;meta.appendChild(t);}
    if(todo.linkedStudentId){
      const s=studentById(todo.linkedStudentId);
      if(s){const t=document.createElement('span');t.className='todo-tag student-tag';t.textContent=s.navn;meta.appendChild(t);}
    }
    if(todo.frist){
      const fd=new Date(todo.frist+'T00:00:00');
      const fs=fd.getDate()+'. '+MONTHS_SHORT[fd.getMonth()];
      const fe=document.createElement('span');
      fe.className='todo-frist'+(overdue?' overdue':'');
      fe.textContent=(overdue?'⚠ ':'')+fs;
      meta.appendChild(fe);
    }
    const statusLbl=document.createElement('span'); statusLbl.className='todo-status-btn';
    statusLbl.textContent={ikke_startet:'Ikke startet',startet:'Startet',ferdig:'Ferdig'}[todo.status];
    statusLbl.onclick=()=>cycleTodoStatus(todo.id);
    meta.appendChild(statusLbl);
    body.appendChild(meta);

    const del=document.createElement('button'); del.className='todo-del-btn';
    del.textContent='×'; del.title='Slett'; del.onclick=()=>deleteTodo(todo.id);

    item.appendChild(statusBtn); item.appendChild(body); item.appendChild(del);
    container.appendChild(item);
  });
}

// ────────────────────────────────────────────
// SKJULTE GJØREMÅL
// ────────────────────────────────────────────
function openSkjulteGjøremål() {
  renderSkjulteGjøremål();
  document.getElementById('skjulteGjøremålOverlay').classList.add('open');
}

function renderSkjulteGjøremål() {
  const container = document.getElementById('skjulteGjøremålListe');
  if (!container) return;
  const fullforte = todos.filter(t => t.status === 'ferdig' && !t.slettet);
  const slettede  = todos.filter(t => t.slettet === true);

  function lagRad(t, type) {
    const fristTekst = t.frist ? ` · ${new Date(t.frist+'T00:00:00').getDate()}. ${MONTHS_SHORT[new Date(t.frist+'T00:00:00').getMonth()]}` : '';
    const rad = document.createElement('div'); rad.className = 'skjult-rad';
    rad.innerHTML = `
      <div class="skjult-rad-info">
        <span class="skjult-rad-tittel">${t.tittel||t.text||''}</span>
        <span class="skjult-rad-meta">${type}${fristTekst}</span>
      </div>
      <div class="skjult-rad-handlinger">
        <button class="btn btn-secondary skjult-btn-gjenopprett">Gjenopprett</button>
        <button class="btn btn-slett-perm skjult-btn-slett">Slett permanent</button>
      </div>`;
    rad.querySelector('.skjult-btn-gjenopprett').onclick = () => {
      if (t.slettet) { t.slettet = false; }
      else           { t.status = 'ikke_startet'; }
      saveToStorage(); renderTodoList(); renderSkjulteGjøremål();
    };
    rad.querySelector('.skjult-btn-slett').onclick = () => {
      if (!confirm(`Slette "${t.tittel||t.text||''}" permanent? Dette kan ikke angres.`)) return;
      todos = todos.filter(x => x.id !== t.id);
      saveToStorage(); renderTodoList(); renderSkjulteGjøremål();
      if (currentView === 'month') renderMonthView();
    };
    return rad;
  }

  container.innerHTML = '';

  const fullfortSeksjon = document.createElement('div');
  fullfortSeksjon.innerHTML = '<div class="skjult-seksjon-tittel">Fullførte</div>';
  if (fullforte.length) {
    fullforte.forEach(t => fullfortSeksjon.appendChild(lagRad(t, 'Ferdig')));
  } else {
    fullfortSeksjon.innerHTML += '<div class="skjult-tom">Ingen fullførte gjøremål</div>';
  }
  container.appendChild(fullfortSeksjon);

  const slettetSeksjon = document.createElement('div'); slettetSeksjon.style.marginTop = '16px';
  slettetSeksjon.innerHTML = '<div class="skjult-seksjon-tittel">Slettede</div>';
  if (slettede.length) {
    slettede.forEach(t => slettetSeksjon.appendChild(lagRad(t, 'Slettet')));
  } else {
    slettetSeksjon.innerHTML += '<div class="skjult-tom">Ingen slettede gjøremål</div>';
  }
  container.appendChild(slettetSeksjon);
}

// ────────────────────────────────────────────
// MISC
// ────────────────────────────────────────────
function changeWeek(dir){ changeNav(dir); } // backwards compat
function goToToday(){
  currentWeekMonday=getMonday(TODAY);
  currentDay=new Date(TODAY);
  currentMonthStart=new Date(TODAY.getFullYear(),TODAY.getMonth(),1);
  render();
}

function closeOverlay(id){ document.getElementById(id).classList.remove('open'); }

// medNavn = true  → full lokal backup, inneholder elevnavn
// medNavn = false → pseudonymisert: bare elev-IDer, trygg å dele
function exportData(medNavn = true) {
  const data = {
    events, todos, planfestetTid, overtid, lessonData, topicsBySubject,
    fridager, skoleaar,
    allStudents: elevlisteUtenNavn()
  };
  if (medNavn) data.studentNames = navnekart();

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'laererplanlegger-' + (medNavn ? '' : 'anonym-') + isoDate(TODAY) + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

function exportDataUtenNavn() {
  if (!confirm('Eksporterer uten elevnavn. Filen inneholder fravær, tema og notater knyttet til anonyme elev-IDer.\n\nHusk at fritekstnotater kan inneholde navn du selv har skrevet inn.\n\nFortsette?')) return;
  exportData(false);
}

function importData() {
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Dette vil overskrive all eksisterende data. Er du sikker?')) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const data = JSON.parse(evt.target.result);
        if (!data.events && !data.todos && !data.allStudents) { alert('Ugyldig fil'); return; }
        if (data.events)          localStorage.setItem('lp_events',          JSON.stringify(data.events));
        if (data.todos)           localStorage.setItem('lp_todos',           JSON.stringify(data.todos));
        if (data.planfestetTid)   localStorage.setItem('lp_planfestetTid',   JSON.stringify(data.planfestetTid));
        if (data.overtid)         localStorage.setItem('lp_overtid',         JSON.stringify(data.overtid));
        if (data.lessonData)      localStorage.setItem('lp_lessonData',      JSON.stringify(data.lessonData));
        if (data.topicsBySubject) localStorage.setItem('lp_topicsBySubject', JSON.stringify(data.topicsBySubject));
        if (data.fridager)        localStorage.setItem('lp_fridager',        JSON.stringify(data.fridager));
        if (data.skoleaar)        localStorage.setItem('lp_skoleaar',        JSON.stringify(data.skoleaar));

        if (data.allStudents) {
          // Elevliste lagres alltid uten navn
          const utenNavn = data.allStudents.map(({ navn, navnMangler, ...rest }) => rest);
          localStorage.setItem('lp_students', JSON.stringify(utenNavn));

          // Navn kan komme fra eget felt (nytt format) eller ligge på
          // elevobjektene (eksport fra før pseudonymiseringen).
          let navnKart = data.studentNames || null;
          if (!navnKart) {
            navnKart = {};
            data.allStudents.forEach(s => { if (s.navn) navnKart[s.id] = s.navn; });
          }
          // Behold navn vi allerede har lokalt for elever fila ikke dekker
          const eksisterende = JSON.parse(localStorage.getItem('lp_studentNames') || '{}');
          localStorage.setItem('lp_studentNames', JSON.stringify({ ...eksisterende, ...navnKart }));
        }
        location.reload();
      } catch(err) { alert('Kunne ikke lese filen. Kontroller at det er en gyldig JSON-fil.'); }
    };
    reader.readAsText(file);
  };
  input.click();
}
document.querySelectorAll('.overlay').forEach(el=>{ el.addEventListener('click',e=>{if(e.target===el)closeOverlay(el.id);}); });
// ────────────────────────────────────────────
// MIN SIDE (innstillinger som fullskjerm-visning)
// ────────────────────────────────────────────
function renderMinSide() {
  document.getElementById('skoleaarStart').value = skoleaar.start;
  document.getElementById('skoleaarSlutt').value = skoleaar.slutt;
  renderSkolerute();
}

function lagreSkoleaar() {
  const start = document.getElementById('skoleaarStart').value;
  const slutt = document.getElementById('skoleaarSlutt').value;
  if (!start || !slutt) { alert('Fyll inn både start- og sluttdato.'); return; }
  if (start >= slutt) { alert('Startdato må være før sluttdato.'); return; }
  skoleaar = { start, slutt };
  saveToStorage();
  render();
}

function renderSkolerute() {
  const container = document.getElementById('skoleruteTabell');
  if (!container) return;
  const typeLabel = { ferie: 'Ferie', fridag: 'Fridag', planlegging: 'Planleggingsdag' };
  const sorted = [...fridager].sort((a, b) => a.fra.localeCompare(b.fra));

  let html = `<table class="innst-tabell">
    <thead><tr>
      <th>Navn</th><th>Type</th><th>Fra</th><th>Til</th><th></th>
    </tr></thead><tbody>`;
  if (!sorted.length) {
    html += '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">Ingen fridager registrert</td></tr>';
  }
  sorted.forEach(f => {
    const fra = f.fra.split('-').reverse().join('.');
    const til = f.til !== f.fra ? f.til.split('-').reverse().join('.') : '—';
    html += `<tr>
      <td>${f.tittel}</td>
      <td>${typeLabel[f.type] || f.type}</td>
      <td>${fra}</td>
      <td>${til}</td>
      <td><button class="btn-icon-slett" data-fridag-id="${f.id}" title="Slett">×</button></td>
    </tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;

  // Slett-knapper
  container.querySelectorAll('[data-fridag-id]').forEach(btn => {
    btn.onclick = () => slettFridag(btn.dataset.frigagId || btn.getAttribute('data-fridag-id'));
  });
}

function leggTilFridag() {
  const tittel = document.getElementById('frigagTittel').value.trim();
  const type   = document.getElementById('frigagType').value;
  const fra    = document.getElementById('frigagFra').value;
  const til    = document.getElementById('frigagTil').value || fra;
  if (!tittel || !fra) { alert('Fyll inn navn og fra-dato.'); return; }
  fridager.push({ id: crypto.randomUUID(), fra, til, tittel, type });
  saveToStorage();
  // Nullstill skjema
  document.getElementById('frigagTittel').value = '';
  document.getElementById('frigagFra').value    = '';
  document.getElementById('frigagTil').value    = '';
  renderSkolerute();
  render();
}

function slettFridag(id) {
  fridager = fridager.filter(f => f.id !== id);
  saveToStorage();
  renderSkolerute();
  render();
}

// ────────────────────────────────────────────
// LAGRING (localStorage)
// ────────────────────────────────────────────
function saveToStorage() {
  try {
    localStorage.setItem('lp_events',          JSON.stringify(events));
    localStorage.setItem('lp_todos',           JSON.stringify(todos));
    localStorage.setItem('lp_planfestetTid',   JSON.stringify(planfestetTid));
    localStorage.setItem('lp_overtid',         JSON.stringify(overtid));
    localStorage.setItem('lp_lessonData',      JSON.stringify(lessonData));
    localStorage.setItem('lp_topicsBySubject', JSON.stringify(topicsBySubject));
    // Elever splittes: struktur kan synkes, navn blir liggende lokalt
    localStorage.setItem('lp_students',        JSON.stringify(elevlisteUtenNavn()));
    localStorage.setItem('lp_studentNames',    JSON.stringify(navnekart()));
    localStorage.setItem('lp_fridager',        JSON.stringify(fridager));
    localStorage.setItem('lp_skoleaar',        JSON.stringify(skoleaar));
  } catch(e) {
    console.warn('Kunne ikke lagre til localStorage:', e);
  }

  // Skyv endringene til skyen hvis synk er satt opp (sync.js).
  // Funksjonen finnes ikke hvis sync.js ikke er lastet — appen skal
  // fungere like godt uten.
  if (typeof syncPushDebounced === 'function') syncPushDebounced();
}

function loadFromStorage() {
  try {
    const storedEvents = localStorage.getItem('lp_events');
    if (storedEvents) {
      events = JSON.parse(storedEvents);
      // Migrer gamle events uten gyldigFra/gyldigTil
      events.forEach(ev => {
        if (!ev.gyldigFra) ev.gyldigFra = '2025-08-18';
        if (ev.gyldigTil === undefined) ev.gyldigTil = null;
      });
      // Gjenoppbygg fargekartet og synkroniser ID-teller
      events.forEach(ev => { if (ev.category === 'undervisning') getSubjectColor(ev.title); });
      if (events.length) nextId = Math.max(...events.map(e => e.id)) + 1;
    }

    const storedTodos = localStorage.getItem('lp_todos');
    if (storedTodos) {
      todos = JSON.parse(storedTodos);
      // Migrering: gamle todos har text i stedet for tittel+tekst
      todos.forEach(t => {
        if (!t.tittel) { t.tittel = t.text || ''; t.tekst = ''; }
        if (t.slettet === undefined) t.slettet = false;
      });
      if (todos.length) nextTodoId = Math.max(...todos.map(t => t.id)) + 1;
    }

    const storedPft = localStorage.getItem('lp_planfestetTid');
    if (storedPft) planfestetTid = JSON.parse(storedPft);

    // overtid er const — tøm og fyll på nytt
    const storedOt = localStorage.getItem('lp_overtid');
    if (storedOt) {
      Object.keys(overtid).forEach(k => delete overtid[k]);
      Object.assign(overtid, JSON.parse(storedOt));
    }

    // lessonData er const — tøm og fyll på nytt
    const storedLd = localStorage.getItem('lp_lessonData');
    if (storedLd) {
      Object.keys(lessonData).forEach(k => delete lessonData[k]);
      Object.assign(lessonData, JSON.parse(storedLd));
      // Migrer attendance fra boolean til boolean[] per skoletime
      for (const key in lessonData) {
        const att = lessonData[key].attendance || {};
        const evIdStr = key.split('_')[0];
        const ev = events.find(e => String(e.id) === evIdStr);
        if (!ev) continue;
        const antall = finnSkoletimer(ev).length || 1;
        for (const sid in att) {
          if (typeof att[sid] === 'boolean') att[sid] = Array(antall).fill(att[sid]);
        }
      }
    }

    // topicsBySubject er const — tøm og fyll på nytt
    const storedTs = localStorage.getItem('lp_topicsBySubject');
    if (storedTs) {
      Object.keys(topicsBySubject).forEach(k => delete topicsBySubject[k]);
      Object.assign(topicsBySubject, JSON.parse(storedTs));
    }

    // allStudents er const — tøm og fyll på nytt
    const storedStudents = localStorage.getItem('lp_students');
    if (storedStudents) {
      allStudents.splice(0);
      JSON.parse(storedStudents).forEach(s => allStudents.push(s));
      // Migrer elever uten arkiverings-felt
      allStudents.forEach(s => {
        if (s.arkivert    === undefined) s.arkivert    = false;
        if (s.arkivertDato === undefined) s.arkivertDato = null;
      });
    }

    // Elevnavn fra egen nøkkel. Mangler nøkkelen, er dette et gammelt
    // oppsett der navnene lå i lp_students — da bygger vi kartet derfra.
    const storedNames = localStorage.getItem('lp_studentNames');
    let navnKart;
    if (storedNames) {
      navnKart = JSON.parse(storedNames);
    } else {
      navnKart = {};
      allStudents.forEach(s => { if (s.navn) navnKart[s.id] = s.navn; });
      // Gammelt format: navnene ligger fortsatt i lp_students. Skriv tilbake
      // med én gang — venter vi på neste mutasjon, blir navnene liggende
      // i den synkbare nøkkelen i mellomtiden.
      maaSkrivesTilbake = true;
    }
    hydrerNavn(navnKart);

    // Fridager — bruk seed-data som fallback
    const storedFridager = localStorage.getItem('lp_fridager');
    if (storedFridager) {
      fridager = JSON.parse(storedFridager);
    } else {
      fridager = FRIDAGER_SEED.map(f => ({ ...f }));
    }

    // Skoleår — bruk standardverdier som fallback
    const storedSkoleaar = localStorage.getItem('lp_skoleaar');
    if (storedSkoleaar) {
      skoleaar = JSON.parse(storedSkoleaar);
    }

  } catch(e) {
    console.warn('Kunne ikke laste fra localStorage:', e);
  }
}

// Kolonnebredden avhenger av skjermbredden, og settes fra JS. Ved
// rotasjon eller endret vindusbredde må gridet derfor tegnes på nytt.
let resizeTimer = null;
let sisteSmal   = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const smal = erSmalSkjerm();
    if (smal !== sisteSmal) { sisteSmal = smal; render(); }
  }, 150);
});

// Init: last lagret data og tegn første visning
loadFromStorage();
if (maaSkrivesTilbake) saveToStorage();
sisteSmal = erSmalSkjerm();
render();