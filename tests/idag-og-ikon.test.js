// «I dag» etter en natt med appen åpen, og ikonet for timer uten elever.

const fs   = require('fs');
const path = require('node:path').join(__dirname, '..') + '/';
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path + 'index.html', 'utf8');
const js   = fs.readFileSync(path + 'app.js', 'utf8');

const htmlInline = html
  .replace(/<script src="app\.js"><\/script>/, '<script>' + js + '</script>')
  .replace(/<script type="module">[\s\S]*?<\/script>/g, '')
  .replace(/<script src="sync\.js"><\/script>/, '')
  .replace(/<script>\s*if \(window\.supabaseJs\)[\s\S]*?<\/script>/, '');

function lagStore(seed = {}) {
  const data = { ...seed };
  return {
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; }
  };
}

// Datoer regnes ut fra i dag — se tests/README.md
function dagerFra(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const ELEV = { id: 's1', trinn: 8, startDato: '2000-01-01', arkivert: false, arkivertDato: null };
// Hver ukedag, så blokkene alltid står i uka som vises
const lag = (id, wd, extra) => ({ id, title: 'Norsk', category: 'undervisning', recurs: true, weekday: wd,
  start: '08:30', end: '09:15', room: '204', trinn: 8, trinns: [8], sessionType: 'gruppe',
  students: ['s1'], weekPattern: 'every', gyldigFra: '2000-01-01', gyldigTil: null, ...extra });
const MED   = [0,1,2,3,4].map(wd => lag(10 + wd, wd, { title: 'Norsk' }));
const UTEN  = [0,1,2,3,4].map(wd => lag(20 + wd, wd, { title: 'Matte', start: '10:20', end: '11:05', students: [] }));
const MOTE  = [0,1,2,3,4].map(wd => lag(30 + wd, wd, { title: 'Trinnmøte', category: 'mote', start: '14:15', end: '15:00', students: [] }));

function lagDom() {
  const store = lagStore({
    lp_students:     JSON.stringify([ELEV]),
    lp_studentNames: JSON.stringify({ s1: 'Kari Nordmann' }),
    lp_events:       JSON.stringify([...MED, ...UTEN, ...MOTE]),
    lp_lessonData:   '{}', lp_fridager: '[]',
    lp_skoleaar:     JSON.stringify({ start: '2000-01-01', slutt: '2099-12-31' })
  });
  return new JSDOM(htmlInline, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { value: store, writable: false });
      if (!w.crypto) w.crypto = {};
      w.crypto.randomUUID = () => 'uuid-test';
      w.alert = () => {}; w.confirm = () => true;
    }
  });
}

const tester = [];
function test(navn, fn) { tester.push([navn, fn]); }
function sant(v, hva) { if (!v) throw new Error(hva); }
function like(a, b, hva) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(hva + ': ventet ' + JSON.stringify(b) + ', fikk ' + JSON.stringify(a));
}

// ══════════════════════════════════════════════════════════════
// «I DAG» NÅR APPEN HAR STÅTT ÅPEN OVER NATTA
// ══════════════════════════════════════════════════════════════
// TODAY ble satt én gang ved lasting. Sto fanen åpen over natta, sendte
// «I dag» deg til gårsdagen. Testene spoler TODAY tilbake, slik den ville
// stått dagen etter.

const iGaar = w => w.eval('TODAY = new Date(Date.now() - 3 * 86400000)');
const idag  = w => w.isoDate(new w.Date());

test('«I dag» går til dagens dato selv om TODAY er fra en tidligere dag', () => {
  const dom = lagDom(); const w = dom.window;
  w.setView('day');
  iGaar(w);
  w.goToToday();
  like(w.isoDate(w.eval('currentDay')), idag(w), 'dagsvisningen');
  like(w.isoDate(w.eval('TODAY')), idag(w), 'TODAY');
  dom.window.close();
});

test('å komme tilbake til fanen oppdaterer datoen og tegner på nytt', () => {
  const dom = lagDom(); const w = dom.window;
  iGaar(w);
  w.eval('render = function () { window.__tegnet = (window.__tegnet || 0) + 1; }');
  w.document.dispatchEvent(new w.Event('visibilitychange'));
  like(w.isoDate(w.eval('TODAY')), idag(w), 'TODAY etter visibilitychange');
  sant(w.__tegnet === 1, 'kalenderen ble ikke tegnet på nytt');
  // Samme dag: ingen ny tegning
  w.document.dispatchEvent(new w.Event('visibilitychange'));
  sant(w.__tegnet === 1, 'tegnet på nytt uten at datoen skiftet');
  dom.window.close();
});

test('datoskiftet flytter ikke visningen du står i', () => {
  const dom = lagDom(); const w = dom.window;
  w.setView('week');
  w.changeNav(3);
  const foer = w.eval('currentWeekMonday').getTime();
  iGaar(w);
  w.sjekkDatoskifte();
  like(w.eval('currentWeekMonday').getTime(), foer, 'uka du bladde til');
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// IKON FOR TIMER UTEN ELEVER
// ══════════════════════════════════════════════════════════════

function blokker(w, tekst) {
  return [...w.document.querySelectorAll('.event')].filter(b => b.querySelector('.event-title').textContent.includes(tekst));
}

test('en undervisningstime uten elever har ikonet i uke- og dagsvisning', () => {
  const dom = lagDom(); const w = dom.window;
  for (const v of ['week', 'day']) {
    w.setView(v);
    const b = blokker(w, 'Matte');
    sant(b.length, 'fant ingen Matte-blokk i ' + v);
    b.forEach(x => sant(x.querySelector('.event-title .ikon-uten-elever svg'), 'ikonet mangler i ' + v));
  }
  dom.window.close();
});

test('timer med elever, og møter, har ikke ikonet', () => {
  const dom = lagDom(); const w = dom.window;
  w.setView('week');
  const med = blokker(w, 'Norsk'), mote = blokker(w, 'Trinnmøte');
  sant(med.length && mote.length, 'fant ikke blokkene');
  [...med, ...mote].forEach(x => sant(!x.querySelector('.ikon-uten-elever'), 'ikon der det ikke skal være'));
  dom.window.close();
});

test('ikonet forklarer seg selv og følger tekstfargen', () => {
  const dom = lagDom(); const w = dom.window;
  w.setView('week');
  const ikon = blokker(w, 'Matte')[0].querySelector('.ikon-uten-elever');
  like(ikon.getAttribute('title'), 'Ingen elever registrert', 'title');
  like(ikon.getAttribute('aria-label'), 'Ingen elever registrert', 'aria-label');
  like(ikon.querySelector('path').getAttribute('fill'), 'currentColor', 'fyllfarge');
  dom.window.close();
});

// ── Kjør ───────────────────────────────────────────────────────
console.log('\n«I dag» over natta, og ikon for timer uten elever\n');
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK   ' + navn); }
  catch (e) { alle = false; console.log('  FEIL ' + navn + '\n       ' + e.message); }
}
console.log(alle ? '\nAlle tester passerte.\n' : '\nNoen tester feilet.\n');
process.exit(alle ? 0 : 1);
