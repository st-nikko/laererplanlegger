// Hvem var med på timen? (19. okt 2026)
//
// Elevlista ligger på hendelsen. Ble en elev lagt til en eksisterende
// time, sto han på alle tidligere datoer også — og et manglende kryss ble
// lest som «til stede». Han fikk godskrevet timer han aldri var i.
//
// Regelen nå: for en holdt time er det lagrede oppmøtet fasit. Se
// eleverPaaTime() i app.js og «Hvem var med på timen» i CONTEXT.md.

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

function dagerFra(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const elev = id => ({ id, trinn: 9, startDato: '2000-01-01', arkivert: false, arkivertDato: null });

// Én enkel time hver dag, så alle datoer under er gyldige forekomster
function norsk(students) {
  return { id: 1, title: 'Norsk', category: 'undervisning', recurs: false, start: '08:30', end: '09:15',
           room: '', trinn: 9, trinns: [9], sessionType: 'gruppe', students,
           weekPattern: 'every', gyldigFra: '2000-01-01', gyldigTil: null };
}

// Oppmøte slik saveLessonPlan() lagrer det: ett kryss per elev på lista
function post(tilstede, lagret) {
  const attendance = {};
  Object.entries(tilstede).forEach(([id, v]) => { attendance[id] = [v]; });
  return { tema: 'Tema', notes: '', attendance, studentNotes: {}, ...(lagret ? { lagret } : {}) };
}

function lagDom({ events, lessonData = {} }) {
  const store = lagStore({
    lp_students:     JSON.stringify([elev('a'), elev('b'), elev('ny')]),
    lp_studentNames: JSON.stringify({ a: 'Ada', b: 'Bo', ny: 'Nora' }),
    lp_events:       JSON.stringify(events),
    lp_lessonData:   JSON.stringify(lessonData),
    lp_skoleaar:     JSON.stringify({ start: '2000-01-01', slutt: '2099-12-31' })
  });
  const dom = new JSDOM(htmlInline, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { value: store, writable: false });
      if (!w.crypto) w.crypto = {};
      w.crypto.randomUUID = () => 'uuid-test';
      w.alert = () => {}; w.confirm = () => true;
    }
  });
  dom.store = store;
  return dom;
}

const tester = [];
function test(navn, fn) { tester.push([navn, fn]); }
function sant(v, hva) { if (!v) throw new Error(hva); }
function like(a, b, hva) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(hva + ': ventet ' + JSON.stringify(b) + ', fikk ' + JSON.stringify(a));
}
const tall = (w, id) => { const d = w.calcAttendance(id); return [d.present, d.total]; };
function loggDatoer(w, id) {
  const c = w.document.getElementById('elevloggViewContent');
  w.renderElevloggInnhold(id, c);
  return c.querySelectorAll('.logg-entry').length;
}

// To holdte timer med a og b. Så er «ny» lagt til i timen.
const TO_GAMLE = {
  ['1_' + dagerFra(-14)]: post({ a: true, b: false }),
  ['1_' + dagerFra(-7)]:  post({ a: true, b: true })
};

// ══════════════════════════════════════════════════════════════
// SAKEN SOM MELDTE SEG: NY ELEV I EKSISTERENDE TIME
// ══════════════════════════════════════════════════════════════

test('ny elev får ikke godskrevet timer fra før han kom', () => {
  const dom = lagDom({ events: [norsk(['a', 'b', 'ny'])], lessonData: TO_GAMLE });
  like(tall(dom.window, 'ny'), [0, 0], 'ny elev skal ha null timer bakover');
  dom.window.close();
});

test('de andre elevene telles som før', () => {
  const dom = lagDom({ events: [norsk(['a', 'b', 'ny'])], lessonData: TO_GAMLE });
  like(tall(dom.window, 'a'), [2, 2], 'a');
  like(tall(dom.window, 'b'), [1, 2], 'b');
  dom.window.close();
});

test('ny elev telles fra første time han er ført på', () => {
  const dom = lagDom({ events: [norsk(['a', 'b', 'ny'])], lessonData: {
    ...TO_GAMLE,
    ['1_' + dagerFra(-1)]: post({ a: true, b: true, ny: false })
  } });
  like(tall(dom.window, 'ny'), [0, 1], 'én time, borte');
  dom.window.close();
});

test('de gamle timene står ikke i elevloggen til den nye eleven', () => {
  const dom = lagDom({ events: [norsk(['a', 'b', 'ny'])], lessonData: TO_GAMLE });
  like(loggDatoer(dom.window, 'ny'), 0, 'loggposter for ny');
  like(loggDatoer(dom.window, 'a'), 2, 'loggposter for a');
  dom.window.close();
});

test('en gammel time viser oppmøtelista slik den var', () => {
  const dom = lagDom({ events: [norsk(['a', 'b', 'ny'])], lessonData: TO_GAMLE });
  const w = dom.window;
  const dato = new Date(dagerFra(-7) + 'T00:00:00');
  w.openLessonPlan(w.eval('events')[0], dato);
  const navn = [...w.document.querySelectorAll('#attendanceList .student-name')].map(e => e.textContent);
  like(navn.sort(), ['Ada', 'Bo'], 'Nora skal ikke dukke opp i en time fra før hun kom');
  dom.window.close();
});

test('å lagre en gammel time på nytt gir ikke den nye eleven timen', () => {
  const dom = lagDom({ events: [norsk(['a', 'b', 'ny'])], lessonData: TO_GAMLE });
  const w = dom.window;
  w.openLessonPlan(w.eval('events')[0], new Date(dagerFra(-7) + 'T00:00:00'));
  w.saveLessonPlan();
  like(tall(w, 'ny'), [0, 0], 'ny elev etter ny lagring');
  dom.window.close();
});

test('dagens time viser den nye eleven, selv om oppmøtet ble lagret tidligere i dag', () => {
  const dom = lagDom({ events: [norsk(['a', 'b', 'ny'])], lessonData: {
    ['1_' + dagerFra(0)]: post({ a: true, b: true }, dagerFra(0))
  } });
  const w = dom.window;
  w.openLessonPlan(w.eval('events')[0], new Date(dagerFra(0) + 'T00:00:00'));
  const navn = [...w.document.querySelectorAll('#attendanceList .student-name')].map(e => e.textContent);
  like(navn.sort(), ['Ada', 'Bo', 'Nora'], 'i dag gjelder lista');
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// SPEILBILDET: ELEV FJERNET FRA TIMEN
// ══════════════════════════════════════════════════════════════

test('en elev som tas ut av timen, beholder historikken sin', () => {
  const dom = lagDom({ events: [norsk(['a'])], lessonData: TO_GAMLE });   // b er fjernet
  like(tall(dom.window, 'b'), [1, 2], 'b sine gamle timer');
  like(loggDatoer(dom.window, 'b'), 2, 'b sine loggposter');
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// OPPMØTE FØRT PÅ FORHÅND
// ══════════════════════════════════════════════════════════════

test('oppmøte lagret før timen er ikke fasit', () => {
  // Tema skrevet for en uke siden, før «ny» kom inn. Timen var i går, og
  // ble aldri åpnet igjen. Da gjelder lista, ikke de gamle krysset.
  const dom = lagDom({ events: [norsk(['a', 'b', 'ny'])], lessonData: {
    ['1_' + dagerFra(-1)]: post({ a: true, b: true }, dagerFra(-8))
  } });
  like(tall(dom.window, 'ny'), [1, 1], 'ny er på lista, og timen er holdt');
  dom.window.close();
});

test('lagring stempler datoen', () => {
  const dom = lagDom({ events: [norsk(['a'])] });
  const w = dom.window;
  w.openLessonPlan(w.eval('events')[0], new Date(dagerFra(3) + 'T00:00:00'));
  w.saveLessonPlan();
  const ld = JSON.parse(dom.store.getItem('lp_lessonData'))['1_' + dagerFra(3)];
  like(ld.lagret, dagerFra(0), 'lagret-stempel');
  dom.window.close();
});

test('gamle forhåndsførte poster uten stempel stemples ved lasting', () => {
  const dom = lagDom({ events: [norsk(['a'])], lessonData: {
    ['1_' + dagerFra(5)]:  post({ a: true }),
    ['1_' + dagerFra(-5)]: post({ a: true })
  } });
  const ld = JSON.parse(dom.store.getItem('lp_lessonData'));
  like(ld['1_' + dagerFra(5)].lagret, dagerFra(0), 'framtidig post stemplet');
  sant(!('lagret' in ld['1_' + dagerFra(-5)]), 'holdt time røres ikke');
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// UTEN OPPMØTE
// ══════════════════════════════════════════════════════════════

test('tomt oppmøte faller tilbake på lista, som før', () => {
  const dom = lagDom({ events: [norsk(['a'])], lessonData: {
    ['1_' + dagerFra(-2)]: { tema: 'T', notes: '', attendance: {}, studentNotes: {} }
  } });
  like(tall(dom.window, 'a'), [1, 1], 'a på lista');
  dom.window.close();
});

// ── Kjør ───────────────────────────────────────────────────────
console.log('\nHvem var med på timen — ny elev, fjernet elev, forhåndsført\n');
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK   ' + navn); }
  catch (e) { alle = false; console.log('  FEIL ' + navn + '\n       ' + e.message); }
}
console.log('\n' + (alle ? 'Alle tester passerte.' : 'Noen tester feilet.') + '\n');
process.exit(alle ? 0 : 1);
