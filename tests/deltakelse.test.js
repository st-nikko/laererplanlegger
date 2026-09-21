// Deltakelse i prosent, øverst i elevloggen og per fag.
//
// Enheten er skoletimer, ikke hendelser: en dobbelttime teller som to, og
// er eleven borte fra den ene halvdelen, er det én av to. Tre ting voktes:
//
//   1. **Nevneren er skoletimene timen dekker, ikke lengden på lista.**
//      attendance er boolean[] per skoletime. En time som var enkel da
//      oppmøtet ble ført, og senere ble gjort til dobbelttime, har én
//      verdi lagret. `filter(Boolean)` ga da 1 av 2.
//   2. **Skoletimene regnes strengt.** En time som slutter 09:25 har ikke
//      vært i 2. time, som starter 09:25. Før var det <= / >=.
//   3. **Totalen og tallene per fag kommer fra samme løkke.** Før var det
//      to kopier, og bare den ene hoppet over ferier.

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

const ELEV = { id: 's1', trinn: 9, startDato: '2000-01-01', arkivert: false, arkivertDato: null };
function time(id, title, start, end) {
  return { id, title, category: 'undervisning', recurs: true, weekday: 0, start, end,
           room: '204', trinn: 9, trinns: [9], sessionType: 'gruppe', students: ['s1'],
           weekPattern: 'every', gyldigFra: '2000-01-01', gyldigTil: null };
}
const ENKEL   = time(1, 'Norsk', '08:30', '09:15');
const DOBBEL  = time(2, 'Matte', '08:30', '10:10');   // 1. og 2. time
const KANTTID = time(3, 'Engelsk', '08:30', '09:25'); // slutter når 2. time starter

function post(att) { return { tema: 'Tema', notes: '', attendance: att === undefined ? {} : { s1: att }, studentNotes: {} }; }

function lagDom({ events = [], lessonData = {}, fridager = [] } = {}) {
  const store = lagStore({
    lp_students:     JSON.stringify([ELEV]),
    lp_studentNames: JSON.stringify({ s1: 'Kari Nordmann' }),
    lp_events:       JSON.stringify(events),
    lp_lessonData:   JSON.stringify(lessonData),
    lp_fridager:     JSON.stringify(fridager),
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
const tall = (w, id = 's1') => { const d = w.calcAttendance(id); return [d.present, d.total]; };

// ══════════════════════════════════════════════════════════════
// DOBBELTTIMER
// ══════════════════════════════════════════════════════════════

test('en dobbelttime teller som to skoletimer', () => {
  const dom = lagDom({ events: [DOBBEL], lessonData: { ['2_' + dagerFra(-3)]: post([true, true]) } });
  like(tall(dom.window), [2, 2], 'dobbelttime, til stede i begge');
  dom.window.close();
});

test('borte fra den ene halvdelen er én av to', () => {
  const dom = lagDom({ events: [DOBBEL], lessonData: { ['2_' + dagerFra(-3)]: post([true, false]) } });
  like(tall(dom.window), [1, 2], 'halvt borte');
  like(dom.window.calcAttendance('s1').percent, 50, 'prosent');
  dom.window.close();
});

test('gammel boolean false på en dobbelttime er borte fra begge', () => {
  const dom = lagDom({ events: [DOBBEL], lessonData: { ['2_' + dagerFra(-3)]: post(false) } });
  like(tall(dom.window), [0, 2], 'gammelt format');
  dom.window.close();
});

test('en liste kortere enn timen teller ikke det som mangler som fravær', () => {
  // Timen var enkel da oppmøtet ble ført, og ble senere gjort til
  // dobbelttime. Boksen for 2. time ble aldri tatt av — den tegnes avkrysset.
  const dom = lagDom({ events: [DOBBEL], lessonData: { ['2_' + dagerFra(-3)]: post([true]) } });
  like(tall(dom.window), [2, 2], 'kort liste');
  dom.window.close();
});

test('en liste lengre enn timen gir aldri over 100 %', () => {
  const dom = lagDom({ events: [ENKEL], lessonData: { ['1_' + dagerFra(-3)]: post([true, true, true]) } });
  like(tall(dom.window), [1, 1], 'lang liste');
  dom.window.close();
});

test('en time som slutter når neste starter, dekker ikke neste', () => {
  const dom = lagDom({ events: [KANTTID], lessonData: { ['3_' + dagerFra(-3)]: post([true]) } });
  like(tall(dom.window), [1, 1], 'kanttid');
  like(dom.window.finnSkoletimer(KANTTID).length, 1, 'finnSkoletimer');
  dom.window.close();
});

test('oppmøteskjemaet og prosenten er enige om antall skoletimer', () => {
  // Boksene i timeplanmodalen og nevneren i prosenten bygger på samme
  // funksjon. Står de ulikt, kan man ikke føre det prosenten teller.
  const dom = lagDom({ events: [KANTTID, DOBBEL] });
  const w = dom.window;
  [KANTTID, DOBBEL].forEach(ev => {
    w.renderAttendanceList(ev, {}, {});
    const bokser = w.document.querySelectorAll('#attendanceList input[type="checkbox"]').length;
    like(bokser, w.finnSkoletimer(ev).length, ev.title);
  });
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// HVA SOM TELLES
// ══════════════════════════════════════════════════════════════

test('timer fram i tid telles ikke', () => {
  const dom = lagDom({ events: [ENKEL], lessonData: {
    ['1_' + dagerFra(-3)]: post([true]), ['1_' + dagerFra(4)]: post([false]) } });
  like(tall(dom.window), [1, 1], 'framtidig time');
  dom.window.close();
});

test('summen av fagene er totalen — også når en time lå i en ferie', () => {
  const ferie = dagerFra(-10);
  const dom = lagDom({
    events: [ENKEL, DOBBEL],
    fridager: [{ id: 'f1', navn: 'Ferie', type: 'ferie', fra: ferie, til: ferie }],
    lessonData: {
      ['1_' + dagerFra(-3)]: post([false]),
      ['2_' + dagerFra(-3)]: post([true, false]),
      ['2_' + ferie]:        post([true, true])
    }
  });
  const w = dom.window;
  const total = w.calcAttendance('s1');
  const perFag = w.calcAttendancePerFag('s1');
  const sum = Object.values(perFag).reduce((a, f) => [a[0] + f.present, a[1] + f.total], [0, 0]);
  like(sum, [total.present, total.total], 'fagene summerer ikke til totalen');
  like([total.present, total.total], [1, 3], 'ferien skal ikke telles');
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// ELEVLOGGEN
// ══════════════════════════════════════════════════════════════

function tegn(w) {
  const c = w.document.getElementById('elevloggViewContent');
  w.renderElevloggInnhold('s1', c);
  return c;
}

test('elevloggen viser prosenten øverst, og per fag i fagtittelen', () => {
  const dom = lagDom({ events: [ENKEL, DOBBEL], lessonData: {
    ['1_' + dagerFra(-3)]: post([true]),
    ['2_' + dagerFra(-3)]: post([true, false]) } });
  const c = tegn(dom.window);
  const topp = c.querySelector('.elev-deltakelse');
  sant(topp, 'deltakelsen mangler');
  sant(c.firstElementChild === topp, 'deltakelsen skal stå øverst');
  like(topp.querySelector('.elev-deltakelse-prosent').textContent, '67 %', 'prosent');
  sant(/2 av 3 skoletimer/.test(topp.textContent), 'teksten skal si 2 av 3: ' + topp.textContent);
  const fag = [...c.querySelectorAll('.logg-subject-title')].map(t => t.textContent);
  sant(fag.some(t => /Matte/.test(t) && /50 % · 1\/2 t/.test(t)), 'Matte skal ha 50 % · 1/2 t: ' + fag);
  sant(fag.some(t => /Norsk/.test(t) && /100 % · 1\/1 t/.test(t)), 'Norsk skal ha 100 %: ' + fag);
  dom.window.close();
});

test('ingen prosent før noen timer er ført', () => {
  // «0 %» for en ny elev ville lest som at han aldri har vært der
  const dom = lagDom({ events: [ENKEL], lessonData: { ['1_' + dagerFra(5)]: post() } });
  sant(!tegn(dom.window).querySelector('.elev-deltakelse'), 'skal ikke vises uten førte timer');
  dom.window.close();
});

test('brikken i loggen regner også i skoletimer', () => {
  // [false] på en dobbelttime: borte fra 1. time, 2. time ble aldri tatt
  // av. Det er 1/2, ikke «Fraværende».
  const dom = lagDom({ events: [DOBBEL], lessonData: { ['2_' + dagerFra(-3)]: post([false]) } });
  const brikke = tegn(dom.window).querySelector('.logg-attendance-badge');
  sant(brikke, 'brikken mangler');
  like(brikke.textContent, '1/2 t', 'brikke');
  dom.window.close();
});

// ── Kjør ───────────────────────────────────────────────────────
console.log('\nDeltakelse i skoletimer\n');
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK   ' + navn); }
  catch (e) { alle = false; console.log('  FEIL ' + navn + '\n       ' + e.message); }
}
console.log(alle ? '\nAlle tester passerte.\n' : '\nNoen tester feilet.\n');
process.exit(alle ? 0 : 1);
