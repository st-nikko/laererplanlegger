// Forsentkomming i nærværsføringen (veikart 30, 5. nov 2026).
// Lagres som 'sen' i stedet for true, per skoletime. Teller som til stede
// overalt ellers. Vises i hover, elevloggen og Elever-tabellen.

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

const hent = (w, u) => w.eval(u);
const ev = (w, id) => hent(w, 'events').find(e => e.id === id);
const knapper = w => [...w.document.querySelectorAll('#attendanceList .sen-knapp')];
const boks = (w, id, i) => w.document.querySelector(`#attendanceList input[data-id="${id}"][data-period-idx="${i}"]`);
const knapp = (w, id, i) => w.document.querySelector(`#attendanceList .sen-knapp[data-id="${id}"][data-period-idx="${i}"]`);
const aapne = (w, id, d) => w.openLessonPlan(ev(w, id), new w.Date(d + 'T00:00:00'));
const lagret = (w, id, d, elev) => hent(w, 'lessonData')[`${id}_${d}`].attendance[elev];

// ══════════════════════════════════════════════════════════════
// NÆRVÆRSLISTA
// ══════════════════════════════════════════════════════════════

test('en enkelttime har én sen-knapp per elev, en dobbelttime én per skoletime', () => {
  const w = lagDom().window;
  aapne(w, 1, D1);
  like(knapper(w).length, 2, 'enkelttime, to elever');
  aapne(w, 5, D2);
  like(knapper(w).length, 4, 'dobbelttime, to elever');
});

test('knappen viser tydelig om den er på: tekst, klasse og aria-pressed', () => {
  const w = lagDom().window;
  aapne(w, 1, D1);
  const b = knapp(w, 's1', 0);
  like([b.textContent, b.classList.contains('paa'), b.getAttribute('aria-pressed')], ['Sen', false, 'false'], 'av');
  b.click();
  like([b.textContent, b.classList.contains('paa'), b.getAttribute('aria-pressed')], ['✓ Kom sent', true, 'true'], 'på');
  sant(boks(w, 's1', 0).checked, 'klikket på knappen skal ikke ta av avkrysningsboksen');
});

test('sen lagres som \'sen\' for akkurat den skoletimen', () => {
  const w = lagDom().window;
  aapne(w, 5, D2);
  boks(w, 's1', 0).checked = true; boks(w, 's1', 0).dispatchEvent(new w.Event('change'));
  knapp(w, 's1', 0).click();
  w.saveLessonPlan();
  like(lagret(w, 5, D2, 's1'), ['sen', true], 'sen i 1. time, til stede i 2.');
});

test('en elev som er borte kan ikke være sen', () => {
  const w = lagDom().window;
  aapne(w, 1, D1);
  const b = knapp(w, 's2', 0);
  b.click();
  const c = boks(w, 's2', 0);
  c.checked = false; c.dispatchEvent(new w.Event('change'));
  sant(b.disabled, 'knappen skal være låst');
  like(b.getAttribute('aria-pressed'), 'false', 'og slått av');
  b.click();
  like(b.getAttribute('aria-pressed'), 'false', 'klikk på låst knapp gjør ingenting');
  w.saveLessonPlan();
  like(lagret(w, 1, D1, 's2'), [false], 'lagres som borte');
});

test('lagret sen vises igjen når timen åpnes', () => {
  const w = lagDom().window;
  hent(w, 'lessonData')[`1_${D1}`] = { attendance: { s1: ['sen'], s2: [true] } };
  aapne(w, 1, D1);
  like(knapp(w, 's1', 0).getAttribute('aria-pressed'), 'true', 's1');
  like(knapp(w, 's2', 0).getAttribute('aria-pressed'), 'false', 's2');
  w.saveLessonPlan();
  like(lagret(w, 1, D1, 's1'), ['sen'], 'beholdes ved ny lagring');
});

test('«Alle til stede / ingen» slår av sen når alle settes borte', () => {
  const w = lagDom().window;
  hent(w, 'lessonData')[`1_${D1}`] = { attendance: { s1: ['sen'], s2: [true] } };
  aapne(w, 1, D1);
  w.toggleAllAttendance();   // alle var til stede → ingen
  sant(knapper(w).every(b => b.disabled && b.getAttribute('aria-pressed') === 'false'), 'alle låst og av');
  w.toggleAllAttendance();   // → alle til stede
  sant(knapper(w).every(b => !b.disabled), 'kan brukes igjen');
});

// ══════════════════════════════════════════════════════════════
// SEN ER TIL STEDE OVERALT ELLERS
// ══════════════════════════════════════════════════════════════

test('sen teller som til stede i deltakelse, fravær og timestatistikk', () => {
  const w = lagDom().window;
  hent(w, 'lessonData')[`2_${D1}`] = { attendance: { s1: ['sen'], s2: [false] } };
  like(w.skoletimeKategorier(ev(w, 2), D1).map(x => x.kategori), ['medElever'], 'ikke «ingen møtte»');
  sant(!w.fravaerendeIEvent(ev(w, 2), hent(w, 'lessonData')[`2_${D1}`], ['s1', 's2']).includes('s1'), 'ikke fraværende');
  like(w.tilstedeISkoletimer(['sen', true], 2), 2, 'tilstedeISkoletimer');
});

// ══════════════════════════════════════════════════════════════
// VISNING
// ══════════════════════════════════════════════════════════════

test('etiketten sier hvilken skoletime', () => {
  const w = lagDom().window;
  like(w.senEtikett(ev(w, 1), ['sen']), 'sen', 'enkelttime');
  like(w.senEtikett(ev(w, 5), ['sen', true]), 'sen 1. t', 'første i dobbelttime');
  like(w.senEtikett(ev(w, 5), ['sen', 'sen']), 'sen 1.+2. t', 'begge');
  like(w.senEtikett(ev(w, 5), [true, true]), '', 'ingen');
  like(w.senEtikett(ev(w, 1), true), '', 'gammel boolean');
});

test('hover sier hvem som kom sent', () => {
  const w = lagDom().window;
  hent(w, 'lessonData')[`5_${D2}`] = { attendance: { s1: ['sen', true], s2: [false, false] } };
  const t = w.eventHoverTekst(ev(w, 5), new w.Date(D2 + 'T00:00:00'));
  sant(/1 fraværende, 1 kom sent/.test(t), 'tellelinje: ' + t);
  sant(/Kari Nordmann \(sen 1\. t\)/.test(t), 'elevlinje');
});

test('antall forsentkomminger telles per skoletime, bare fram til i dag', () => {
  const w = lagDom().window;
  const ld = hent(w, 'lessonData');
  ld[`1_${D1}`] = { attendance: { s1: ['sen'] } };
  ld[`5_${D2}`] = { attendance: { s1: ['sen', 'sen'], s2: [false, false] } };
  ld[`9_${dagerFra(3)}`] = { attendance: { s1: ['sen'] } };     // framtidig — ikke med
  ld[`7_${D3}`] = { attendance: { s1: ['sen'] } };              // møte — ikke med
  like(w.forsentForElev('s1'), 3, 's1');
  like(w.forsentForElev('s2'), 0, 's2');
  like(w.forsentForElev('s1', D2, D2), 2, 'bare én dag');
});

test('en lagret verdi utenfor timens skoletimer telles ikke', () => {
  // Timen var dobbel da oppmøtet ble ført, og er senere gjort enkel
  const w = lagDom().window;
  hent(w, 'lessonData')[`1_${D1}`] = { attendance: { s1: ['sen', 'sen'] } };
  like(w.forsentForElev('s1'), 1, 'bare den ene skoletimen timen dekker');
});

test('elevloggen viser antallet øverst og «Sen» på timen', () => {
  const w = lagDom().window;
  const ld = hent(w, 'lessonData');
  ld[`1_${D1}`] = { tema: 'Brøk', attendance: { s1: ['sen'] } };
  ld[`5_${D2}`] = { tema: 'Likninger', attendance: { s1: ['sen', true], s2: [false, false] } };
  const el = w.document.createElement('div');
  w.renderElevloggInnhold('s1', el);
  like(el.querySelector('.elev-deltakelse-sen').textContent, '2 ganger sen i skoleåret', 'topp');
  const merker = [...el.querySelectorAll('.logg-sen-merke')].map(m => m.textContent).sort();
  like(merker, ['Sen', 'Sen 1. t'], 'på timene');
  const el2 = w.document.createElement('div');
  w.renderElevloggInnhold('s2', el2);
  sant(!el2.querySelector('.elev-deltakelse-sen'), 'ingen linje for en elev som aldri kom sent');
});

test('Elever-tabellen viser antallet ved oppmøtet', () => {
  const w = lagDom().window;
  hent(w, 'lessonData')[`1_${D1}`] = { attendance: { s1: ['sen'] } };
  w.setView('elever');
  const rad = w.document.querySelector('.elev-hovud-rad[data-student-id="s1"]');
  like(rad.querySelector('.att-sen').textContent, '1× sen', 's1');
  sant(!w.document.querySelector('.elev-hovud-rad[data-student-id="s2"] .att-sen'), 'ikke s2');
});

test('med terminskille telles bare terminen vi er i', () => {
  const w = lagDom({ start: dagerFra(-60), slutt: dagerFra(200), terminskille: dagerFra(-9) }).window;
  const ld = hent(w, 'lessonData');
  ld[`1_${D1}`] = { attendance: { s1: ['sen'] } };            // 1. termin
  ld[`5_${D2}`] = { attendance: { s1: ['sen', true] } };      // 2. termin (terminskillet)
  like(w.forsentDenneTerminen('s1'), { antall: 1, navn: 'denne terminen' }, 'bare 2. termin');
});

// ══════════════════════════════════════════════════════════════
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK  ', navn); }
  catch (e) { alle = false; console.log('  FEIL', navn, '\n       ', e.message); }
}
console.log(alle ? '\nAlle tester passerte.' : '\nNoen tester feilet.');
process.exit(alle ? 0 : 1);
