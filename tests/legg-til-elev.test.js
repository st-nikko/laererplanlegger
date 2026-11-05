// Legg til en elev i en time som er holdt (5. nov 2026).
//
// For en holdt time er det lagrede oppmøtet fasit (se elev-paa-time.test.js),
// så en elev lagt til timen etterpå vises ikke. Timemodalen tilbyr derfor
// elever som står på timen nå, men ikke ble ført, med en «Legg til»-knapp.
// Startdato etter timen gir en advarsel — den flyttes ikke.

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

const D = dagerFra(-3);   // timen som er holdt
const elev = (id, extra) => ({ id, trinn: 9, startDato: '2000-01-01', arkivert: false, arkivertDato: null, ...extra });
const time = (extra) => ({ id: 1, title: 'Matematikk', category: 'undervisning', recurs: false, date: D,
  start: '08:30', end: '09:15', room: '204', trinn: 9, trinns: [9], sessionType: 'gruppe',
  students: ['s1', 's2'], weekPattern: 'every', gyldigFra: '2000-01-01', gyldigTil: null, ...extra });

// s1 ble ført på timen. s2 ble lagt til timen etterpå.
function lagDom({ elever, events, lessons } = {}) {
  const store = lagStore({
    lp_students:     JSON.stringify(elever || [elev('s1'), elev('s2')]),
    lp_studentNames: JSON.stringify({ s1: 'Kari Nordmann', s2: 'Ola Nordmann', s3: 'Per Arkiv' }),
    lp_events:       JSON.stringify(events || [time()]),
    lp_lessonData:   JSON.stringify(lessons || { [`1_${D}`]: { tema: 'Brøk', attendance: { s1: [true] }, lagret: D } }),
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
const hent = (w, u) => w.eval(u);
const aapne = (w, d = D) => w.openLessonPlan(hent(w, 'events')[0], new w.Date(d + 'T00:00:00'));
const iLista = w => [...new Set([...w.document.querySelectorAll('#attendanceList input[type=checkbox]')].map(c => c.dataset.id))];
const mangler = w => w.document.getElementById('planManglerElever');
const leggTil = (w, id) => w.document.querySelector(`#planManglerElever [data-legg-til="${id}"]`);

// ══════════════════════════════════════════════════════════════

test('en holdt time viser fortsatt bare dem som ble ført', () => {
  const w = lagDom().window;
  aapne(w);
  like(iLista(w), ['s1'], 'lista');
});

test('eleven som ikke ble ført, tilbys i en egen rad', () => {
  const w = lagDom().window;
  aapne(w);
  sant(mangler(w).style.display !== 'none', 'raden vises');
  sant(/Ola Nordmann/.test(mangler(w).textContent), 'navnet');
  sant(leggTil(w, 's2'), 'knappen');
});

test('«Legg til» setter eleven inn som til stede, og raden forsvinner', () => {
  const w = lagDom().window;
  aapne(w);
  leggTil(w, 's2').click();
  like(iLista(w), ['s1', 's2'], 'lista');
  sant(w.document.querySelector('#attendanceList input[data-id="s2"]').checked, 'til stede');
  sant(w.document.querySelector('#attendanceList .sen-knapp[data-id="s2"]'), 'har sen-knapp');
  like(mangler(w).style.display, 'none', 'raden skjules når ingen er igjen');
});

test('det du har endret i lista, blir stående når du legger til', () => {
  const w = lagDom().window;
  aapne(w);
  const c = w.document.querySelector('#attendanceList input[data-id="s1"]');
  c.checked = false; c.dispatchEvent(new w.Event('change'));
  leggTil(w, 's2').click();
  sant(!w.document.querySelector('#attendanceList input[data-id="s1"]').checked, 's1 er fortsatt borte');
});

test('lagret: eleven er med på timen og i deltakelsen', () => {
  const w = lagDom().window;
  aapne(w);
  leggTil(w, 's2').click();
  w.saveLessonPlan();
  like(hent(w, 'lessonData')[`1_${D}`].attendance.s2, [true], 'oppmøtet');
  sant(w.varPaaTime(hent(w, 'events')[0], D, 's2'), 'på timen');
  like(w.calcAttendance('s2').total, 1, 'telles');
  aapne(w);
  like(mangler(w).style.display, 'none', 'ikke tilbudt igjen');
});

test('uten «Legg til» holdes eleven utenfor, som før', () => {
  const w = lagDom().window;
  aapne(w);
  w.saveLessonPlan();
  sant(!w.varPaaTime(hent(w, 'events')[0], D, 's2'), 'ikke på timen');
  like(w.calcAttendance('s2').total, 0, 'ikke telt');
});

test('dagens og framtidige timer har ingen slik rad', () => {
  const iDag = dagerFra(0), fram = dagerFra(4);
  const w = lagDom({ events: [time({ date: iDag })], lessons: { [`1_${iDag}`]: { attendance: { s1: [true] }, lagret: iDag } } }).window;
  aapne(w, iDag);
  like(mangler(w).style.display, 'none', 'i dag');
  like(iLista(w), ['s1', 's2'], 'begge i lista i dag');
  const w2 = lagDom({ events: [time({ date: fram })], lessons: {} }).window;
  aapne(w2, fram);
  like(mangler(w2).style.display, 'none', 'fram i tid');
});

test('arkiverte elever tilbys ikke', () => {
  const w = lagDom({ elever: [elev('s1'), elev('s2'), elev('s3', { arkivert: true })],
                     events: [time({ students: ['s1', 's2', 's3'] })] }).window;
  aapne(w);
  sant(!leggTil(w, 's3'), 'ikke s3');
  sant(leggTil(w, 's2'), 'men s2');
});

test('startdato etter timen gir en advarsel, og flyttes ikke', () => {
  const start = dagerFra(0);
  const w = lagDom({ elever: [elev('s1'), elev('s2', { startDato: start })] }).window;
  aapne(w);
  leggTil(w, 's2').click();
  const item = w.document.querySelector('#attendanceList input[data-id="s2"]').closest('.student-item');
  const adv = item.querySelector('.naervaer-advarsel');
  sant(adv, 'advarsel');
  sant(/Startdatoen er/.test(adv.textContent) && /endre den under Elever/.test(adv.textContent), adv && adv.textContent);
  w.saveLessonPlan();
  like(hent(w, 'allStudents').find(s => s.id === 's2').startDato, start, 'startdatoen står');
  like(w.calcAttendance('s2').total, 0, 'telles ikke før startdatoen');
});

test('ingen advarsel når startdatoen er før timen', () => {
  const w = lagDom().window;
  aapne(w);
  leggTil(w, 's2').click();
  sant(!w.document.querySelector('#attendanceList .naervaer-advarsel'), 'ingen');
});

test('en time der ingen ble ført: tom liste byttes ut med eleven', () => {
  // Den eneste som ble ført, er slettet siden — lista er tom
  const w = lagDom({ events: [time({ students: ['s2'] })],
                     lessons: { [`1_${D}`]: { attendance: { s9: [true] }, lagret: D } } }).window;
  aapne(w);
  sant(w.document.querySelector('#attendanceList .student-list-empty'), 'tom før');
  leggTil(w, 's2').click();
  sant(!w.document.querySelector('#attendanceList .student-list-empty'), 'tomt-teksten er borte');
});

// ══════════════════════════════════════════════════════════════
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK  ', navn); }
  catch (e) { alle = false; console.log('  FEIL', navn, '\n       ', e.message); }
}
console.log(alle ? '\nAlle tester passerte.' : '\nNoen tester feilet.');
process.exit(alle ? 0 : 1);
