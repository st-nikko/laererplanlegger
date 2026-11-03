// Ekstralærer (veikart post 29, 3. nov 2026): timer der du er med uten å
// ha hovedansvaret for det pedagogiske. Fast på hendelsen, eller for én
// dag på timeposten. Telles som egen kategori i statistikken på Min side.

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

const ELEVER = [
  { id: 's1', trinn: 9, startDato: '2000-01-01', arkivert: false, arkivertDato: null },
  { id: 's2', trinn: 9, startDato: '2000-01-01', arkivert: false, arkivertDato: null }
];

// Enkelthendelser på faste datoer bakover i tid — da spiller ukedagen
// ingen rolle.
const en = (id, dato, extra) => ({ id, title: 'Matematikk', category: 'undervisning', recurs: false,
  date: dato, start: '08:30', end: '09:15', room: '204', trinn: 9, trinns: [9], sessionType: 'gruppe',
  students: ['s1', 's2'], weekPattern: 'every', gyldigFra: '2000-01-01', gyldigTil: null, ...extra });

const D1 = dagerFra(-10), D2 = dagerFra(-9), D3 = dagerFra(-8), FERIE = dagerFra(-6);

const EVENTS = [
  en(1, D1),                                                  // med elever, oppmøte aldri åpnet
  en(2, D1, { start: '09:25', end: '10:10' }),                // ingen møtte
  en(3, D1, { start: '10:20', end: '11:05' }),                // én borte, én til stede → med elever
  en(4, D2, { students: [], title: 'Kroppsøving', trinns: [8, 9, 10] }), // uten elever
  en(5, D2, { start: '08:30', end: '10:10' }),                // dobbelttime, borte bare første halvdel → med
  en(6, D2, { start: '10:20', end: '12:20' }),                // dobbelttime, borte begge → ingen møtte
  en(7, D3, { category: 'mote', title: 'Trinnmøte', students: [] }),     // møte — ikke med
  en(8, D3, { category: 'vikar', title: 'Vikar', tellSomUndervisning: true }), // vikar — ikke med
  en(9, dagerFra(3)),                                         // framtidig — ikke med
  en(10, FERIE),                                              // i ferien — ikke med
  // Har ingen elever i dag, men s1 sto på lista da oppmøtet ble ført
  en(11, D3, { students: [] }),
];

const LESSONS = {
  [`2_${D1}`]:  { attendance: { s1: [false], s2: [false] } },
  [`3_${D1}`]:  { attendance: { s1: [false], s2: [true] } },
  [`5_${D2}`]:  { attendance: { s1: [false, true], s2: [false, true] } },
  [`6_${D2}`]:  { attendance: { s1: [false, false], s2: [false, false] } },
  [`11_${D3}`]: { attendance: { s1: [true] } },
};

function lagDom(skoleaar) {
  const store = lagStore({
    lp_students:     JSON.stringify(ELEVER),
    lp_studentNames: JSON.stringify({ s1: 'Kari Nordmann', s2: 'Ola Nordmann' }),
    lp_events:       JSON.stringify(EVENTS),
    lp_lessonData:   JSON.stringify(LESSONS),
    lp_fridager:     JSON.stringify([{ id: 'f1', fra: FERIE, til: FERIE, tittel: 'Høstferie', type: 'ferie' }]),
    lp_skoleaar:     JSON.stringify(skoleaar || { start: '2000-01-01', slutt: '2099-12-31' })
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

const tell = (w, a, b) => w.tellUndervisningstimer(a || dagerFra(-30), b || dagerFra(-1));
const hent = (w, u) => w.eval(u);
const kat = (w, id, d) => w.skoletimeKategorier(hent(w, 'events').find(e => e.id === id), d).map(x => x.kategori);

// ══════════════════════════════════════════════════════════════
// FAST EKSTRALÆRERTIME — PÅ HENDELSEN
// ══════════════════════════════════════════════════════════════

test('en fast ekstralærertime telles som ekstralærer, også uten elevliste', () => {
  const w = lagDom().window;
  const ev = w.Object.assign({}, en(70, D3, { title: 'Naturfag', students: [], ekstralaerer: true, start: '09:25', end: '11:05' }));
  hent(w, 'events').push(ev);
  like(w.skoletimeKategorier(ev, D3).map(x => x.kategori), ['ekstralaerer', 'ekstralaerer'], 'dobbelttime, to skoletimer');
  const t = tell(w, D3, D3);
  like(t.ekstralaerer, 2, 'telt');
  like(t.utenElever, 0, 'ikke uten elever');
});

test('ekstralærer går foran oppmøtet', () => {
  const w = lagDom().window;
  hent(w, 'events').find(e => e.id === 2).ekstralaerer = true;   // alle var borte
  like(kat(w, 2, D1), ['ekstralaerer'], 'ikke ingen møtte');
});

test('en fast ekstralærertime får ikke ikonet for timer uten elever', () => {
  const w = lagDom().window;
  sant(w.erUtenElever(en(1, D1, { students: [] })), 'vanlig tom time har ikonet');
  sant(!w.erUtenElever(en(1, D1, { students: [], ekstralaerer: true })), 'ekstralærertimen skal ikke ha det');
});

test('haken lagres fra skjemaet, og vises igjen når timen åpnes', () => {
  const w = lagDom().window;
  w.openEventForm(null);
  w.setFormCategory('undervisning');
  w.document.getElementById('fagInput').value = 'Naturfag';
  w.document.querySelector('input[name="trinnCheck"][value="9"]').checked = true;
  w.document.getElementById('dagSelect').value = '0';
  w.document.getElementById('gjentasCheck').checked = true;
  w.document.getElementById('ekstralaererInput').checked = true;
  w.saveEvent();
  w.closeOverlay('afterSaveOverlay');
  const ev = hent(w, 'events').slice(-1)[0];
  like(ev.ekstralaerer, true, 'lagret');
  w.openEventForm(null); w.setFormCategory('undervisning');
  sant(!w.document.getElementById('ekstralaererInput').checked, 'ny time starter uten hake');
  w.openEventForm(ev);
  sant(w.document.getElementById('ekstralaererInput').checked, 'haken står på ved redigering');
});

test('en time gjort om til møte mister flagget', () => {
  const w = lagDom().window;
  const ev = hent(w, 'events').find(e => e.id === 1);
  ev.ekstralaerer = true;
  w.openEventForm(ev);
  w.setFormCategory('mote');
  w.document.getElementById('moteTittelInput').value = 'Teammøte';
  w.document.getElementById('moteDatoInput').value = D1;
  w.saveEvent();
  like(hent(w, 'events').find(e => e.id === 1).ekstralaerer, false, 'flagget');
});

test('kalenderblokka, hover og Outlook sier ekstralærer', () => {
  const w = lagDom().window;
  const ev = en(1, D1, { ekstralaerer: true });
  sant(/ekstralærer/.test(w.eventSubLabel(ev)), 'undertittel: ' + w.eventSubLabel(ev));
  sant(/Ekstralærer/.test(w.eventHoverTekst(ev, new w.Date(D1 + 'T00:00:00'))), 'hover');
  sant(/Ekstralærer/.test(w.icsBeskrivelse(ev)), 'Outlook-beskrivelsen');
});

// ══════════════════════════════════════════════════════════════
// ÉN DAG — PÅ TIMEPOSTEN
// ══════════════════════════════════════════════════════════════

test('ekstralærer én dag gjelder bare den dagen', () => {
  const w = lagDom().window;
  hent(w, 'lessonData')[`2_${D1}`].ekstralaerer = true;
  like(kat(w, 2, D1), ['ekstralaerer'], 'den dagen');
  const t = tell(w);
  like([t.ekstralaerer, t.ingenMotte], [1, 3], 'én flyttet fra ingen møtte');
  like(t.medElever + t.ekstralaerer + t.ingenMotte + t.utenElever, t.total, 'summen holder');
});

test('haken i timemodalen lagres og leses igjen', () => {
  const w = lagDom().window;
  const ev = hent(w, 'events').find(e => e.id === 1);
  w.openLessonPlan(ev, new w.Date(D1 + 'T00:00:00'));
  const boks = w.document.getElementById('planEkstralaererInput');
  sant(!boks.checked, 'starter av');
  sant(w.document.getElementById('planEkstralaererSeksjon').style.display !== 'none', 'synlig');
  boks.checked = true;
  w.saveLessonPlan();
  like(hent(w, 'lessonData')[`1_${D1}`].ekstralaerer, true, 'lagret');
  like(kat(w, 1, D1), ['ekstralaerer'], 'telt');
  w.openLessonPlan(ev, new w.Date(D1 + 'T00:00:00'));
  sant(w.document.getElementById('planEkstralaererInput').checked, 'står på igjen');
  w.document.getElementById('planEkstralaererInput').checked = false;
  w.saveLessonPlan();
  sant(!('ekstralaerer' in hent(w, 'lessonData')[`1_${D1}`]), 'tatt av igjen — feltet lagres ikke som false');
});

test('haken skjules når hele timen allerede er ekstralærer', () => {
  const w = lagDom().window;
  const ev = hent(w, 'events').find(e => e.id === 1);
  ev.ekstralaerer = true;
  w.openLessonPlan(ev, new w.Date(D1 + 'T00:00:00'));
  like(w.document.getElementById('planEkstralaererSeksjon').style.display, 'none', 'skjult');
});

test('ekstralærer vises på Min side', () => {
  const w = lagDom().window;
  hent(w, 'lessonData')[`2_${D1}`].ekstralaerer = true;
  w.setView('minside');
  w.velgStatistikkPeriode('aar');
  const el = w.document.getElementById('undervisningStatistikk');
  like(el.querySelector('[data-stat="ekstralaerer"]').textContent, '1', 'tallet');
  sant([...el.querySelectorAll('.stat-tabell th')].some(th => th.textContent === 'Ekstralærer'), 'kolonnen');
});

// ══════════════════════════════════════════════════════════════
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK  ', navn); }
  catch (e) { alle = false; console.log('  FEIL', navn, '\n       ', e.message); }
}
console.log(alle ? '\nAlle tester passerte.' : '\nNoen tester feilet.');
process.exit(alle ? 0 : 1);
