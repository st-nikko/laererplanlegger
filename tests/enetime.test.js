// Enetimer: faget skal stå på blokka.

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
// Hver ukedag, så blokka alltid står i uka som vises
const ENETIME = [0,1,2,3,4].map(wd => ({ id: 10 + wd, title: 'Norsk', category: 'undervisning', recurs: true,
  weekday: wd, start: '08:30', end: '09:15', room: '204', trinn: 8, trinns: [8], sessionType: 'enetime',
  students: ['s1'], weekPattern: 'every', gyldigFra: '2000-01-01', gyldigTil: null }));
const GRUPPE = { ...ENETIME[0], id: 20, title: 'Matte', start: '10:20', end: '11:05', sessionType: 'gruppe' };

function lagDom() {
  const store = lagStore({
    lp_students:     JSON.stringify([ELEV]),
    lp_studentNames: JSON.stringify({ s1: 'Kari Nordmann' }),
    lp_events:       JSON.stringify([...ENETIME, GRUPPE]),
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

// Enetimer har elevnavnet som tittel. Faget må da stå et annet sted på
// blokka — i undertittelen på PC, og på linja under navnet på mobil, der
// undertittelen er skjult. Fram til 21. september 2026 sto faget ingen steder.

test('undertittelen på en enetime har faget først', () => {
  const dom = lagDom(); const w = dom.window;
  like(w.eventSubLabel(ENETIME[0]), 'Norsk · enetime · 204 · 08:30–09:15', 'undertittel');
  dom.window.close();
});

test('mobillinja viser faget på enetimer og trinnet på andre timer', () => {
  const dom = lagDom(); const w = dom.window;
  like(w.trinnKortEtikett(ENETIME[0]), 'Norsk', 'enetime');
  like(w.trinnKortEtikett(GRUPPE), '8', 'gruppetime');
  dom.window.close();
});

test('tittelen er fortsatt elevnavnet', () => {
  const dom = lagDom(); const w = dom.window;
  like(w.eventDisplayLabel(ENETIME[0]), 'Kari Nordmann', 'tittel');
  dom.window.close();
});

test('blokka i kalenderen har både elevnavn og fag', () => {
  const dom = lagDom(); const w = dom.window;
  w.setView('week');
  const blokk = [...w.document.querySelectorAll('.event')].find(b => /Kari Nordmann/.test(b.textContent));
  sant(blokk, 'fant ingen enetime i uka');
  like(blokk.querySelector('.event-trinn-kort').textContent, 'Norsk', 'mobillinja');
  sant(!/trinn/.test(blokk.querySelector('.event-trinn-kort').textContent), 'mobillinja skal ikke si «trinn»');
  sant(/^Norsk · enetime/.test(blokk.querySelector('.event-sub').textContent), 'undertittelen');
  const gruppe = [...w.document.querySelectorAll('.event')].find(b => /Matte/.test(b.textContent));
  like(gruppe.querySelector('.event-trinn-kort').textContent, '8. trinn', 'gruppetimen skal være uendret');
  dom.window.close();
});

// ── Kjør ───────────────────────────────────────────────────────
console.log('\nEnetimer — faget på blokka\n');
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK   ' + navn); }
  catch (e) { alle = false; console.log('  FEIL ' + navn + '\n       ' + e.message); }
}
console.log(alle ? '\nAlle tester passerte.\n' : '\nNoen tester feilet.\n');
process.exit(alle ? 0 : 1);
