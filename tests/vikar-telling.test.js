// Vikartimer som kan telles som undervisningstimer.

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

const time = x => ({ id: 1, title: 'Norsk', category: 'undervisning', recurs: true, weekday: 0,
  start: '08:30', end: '09:15', room: '', trinn: 9, trinns: [9], sessionType: 'gruppe', students: [],
  weekPattern: 'every', gyldigFra: '2000-01-01', gyldigTil: null, ...x });
const vikar = x => time({ category: 'vikar', title: 'Vikar', trinns: [], trinn: null, sessionType: 'gruppe', ...x });

function lagDom(events = []) {
  const store = lagStore({
    lp_students: '[]', lp_studentNames: '{}', lp_lessonData: '{}', lp_fridager: '[]',
    lp_events: JSON.stringify(events),
    lp_skoleaar: JSON.stringify({ start: '2000-01-01', slutt: '2099-12-31' })
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
const antall = w => w.ukensUndervisningstimer(w.getMonday(new w.Date()));
const hent = (w, u) => w.eval(u);

function lagreVikar(w, { tell, ev = null }) {
  w.openEventForm(ev);
  w.setFormCategory('vikar');
  w.document.getElementById('vikarNotesInput').value = '9B matte, rom 204';
  w.document.getElementById('dagSelect').value = '0';
  w.document.getElementById('gjentasCheck').checked = true;
  w.document.getElementById('vikarTellInput').checked = tell;
  w.saveEvent();
  w.closeOverlay('afterSaveOverlay');
  return hent(w, 'events').slice(-1)[0];
}
const tester = [];
function test(navn, fn) { tester.push([navn, fn]); }
function sant(v, hva) { if (!v) throw new Error(hva); }
function like(a, b, hva) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(hva + ': ventet ' + JSON.stringify(b) + ', fikk ' + JSON.stringify(a));
}

// En vikartime kan merkes «Tell som undervisningstime». Da kommer den med
// i «N undervisningstimer denne uka» nederst i kalenderen. Uten merket
// telles den ikke, som før.

test('en vikartime telles bare når den er merket', () => {
  const dom = lagDom([time({ id: 1 }), vikar({ id: 2 }), vikar({ id: 3, weekday: 1, tellSomUndervisning: true })]);
  like(antall(dom.window), 2, 'undervisning + merket vikar');
  dom.window.close();
});

test('en merket vikardobbelttime teller som to', () => {
  const dom = lagDom([vikar({ id: 2, end: '10:10', tellSomUndervisning: true })]);
  like(antall(dom.window), 2, 'dobbelttime');
  dom.window.close();
});

test('haken lagres fra skjemaet, og vises igjen når timen åpnes', () => {
  const dom = lagDom(); const w = dom.window;
  const ev = lagreVikar(w, { tell: true });
  like(ev.tellSomUndervisning, true, 'lagret');
  like(antall(w), 1, 'telt');
  w.openEventForm(ev);
  sant(w.document.getElementById('vikarTellInput').checked, 'haken står ikke på ved redigering');
  w.openEventForm(null); w.setFormCategory('vikar');
  sant(!w.document.getElementById('vikarTellInput').checked, 'ny vikartime skal starte uten hake');
  dom.window.close();
});

test('å ta av haken slutter å telle timen', () => {
  const dom = lagDom([vikar({ id: 2, tellSomUndervisning: true })]); const w = dom.window;
  lagreVikar(w, { tell: false, ev: hent(w, 'events')[0] });
  like(hent(w, 'events')[0].tellSomUndervisning, false, 'flagget');
  like(antall(w), 0, 'telling');
  dom.window.close();
});

test('en vikartime gjort om til møte mister flagget', () => {
  const dom = lagDom([vikar({ id: 2, tellSomUndervisning: true })]); const w = dom.window;
  w.openEventForm(hent(w, 'events')[0]);
  w.setFormCategory('mote');
  w.document.getElementById('moteTittelInput').value = 'Teammøte';
  w.document.getElementById('moteDatoInput').value = w.isoDate(w.getMonday(new w.Date()));
  w.saveEvent();
  like(hent(w, 'events')[0].tellSomUndervisning, false, 'flagget skal forsvinne');
  dom.window.close();
});

test('kalenderblokka og hover sier at timen telles', () => {
  const dom = lagDom(); const w = dom.window;
  like(w.eventSubLabel(vikar({ tellSomUndervisning: true })), 'Vikar · telles · 08:30–09:15', 'merket');
  like(w.eventSubLabel(vikar({})), 'Vikar · 08:30–09:15', 'umerket');
  sant(/Telles som undervisningstime/.test(w.eventHoverTekst(vikar({ tellSomUndervisning: true }), new w.Date())), 'hover');
  dom.window.close();
});

// ── Kjør ───────────────────────────────────────────────────────
console.log('\nVikartimer som telles som undervisning\n');
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK   ' + navn); }
  catch (e) { alle = false; console.log('  FEIL ' + navn + '\n       ' + e.message); }
}
console.log(alle ? '\nAlle tester passerte.\n' : '\nNoen tester feilet.\n');
process.exit(alle ? 0 : 1);
