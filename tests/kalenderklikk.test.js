// Klikk på ledig flate i kalenderen skal åpne hendelsesskjemaet med
// dag, dato og skoletime fylt ut — og klikk på en eksisterende
// hendelse skal ikke gjøre det.
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

function lagDom(seed) {
  const store = lagStore(seed);
  const dom = new JSDOM(htmlInline, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { value: store, writable: false });
      if (!w.crypto) w.crypto = {};
      w.crypto.randomUUID = () => 'uuid-test';
      w.alert = () => {}; w.confirm = () => true;
    }
  });
  dom.window.hent = u => dom.window.eval(u);
  return dom;
}

// jsdom regner ikke layout — getBoundingClientRect gir nuller. Vi later
// som kolonnen starter på y = 0, slik at clientY blir piksler ned i gridet.
function klikkIKolonne(w, kolonne, yPiksler) {
  kolonne.getBoundingClientRect = () => ({ top: 0, left: 0, width: 100, height: 1000 });
  const ev = new w.MouseEvent('click', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clientY', { value: yPiksler });
  kolonne.dispatchEvent(ev);
}

const tester = [];
function test(navn, fn) { tester.push([navn, fn]); }
function like(a, b, hva) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(hva + ': ventet ' + JSON.stringify(b) + ', fikk ' + JSON.stringify(a));
}
function sant(v, hva) { if (!v) throw new Error(hva); }

// ── Ren utregning ──────────────────────────────────────────────
test('klokkeslett innenfor en time gir den timen', () => {
  const dom = lagDom({});
  const w = dom.window;
  // 1. time er 08:30–09:15
  like(w.periodeFraKlokkeslett(8.75), 1, 'midt i første time');
  // 3. time er 10:20–11:05
  like(w.periodeFraKlokkeslett(10.5), 3, 'midt i tredje time');
  // 7. time er 14:15–15:00
  like(w.periodeFraKlokkeslett(14.5), 7, 'midt i sjuende time');
  dom.window.close();
});

test('klokkeslett i en pause gir nærmeste time', () => {
  const dom = lagDom({});
  const w = dom.window;
  // Pause mellom 3. time (slutt 11:05) og 4. time (start 11:35)
  like(w.periodeFraKlokkeslett(11.1), 3, 'like etter tredje time');
  like(w.periodeFraKlokkeslett(11.5), 4, 'like før fjerde time');
  // Før skoledagen og etter
  like(w.periodeFraKlokkeslett(6), 1, 'tidlig morgen');
  like(w.periodeFraKlokkeslett(20), 7, 'sen kveld');
  dom.window.close();
});

test('ukedagsindeks har mandag først', () => {
  const dom = lagDom({});
  const w = dom.window;
  like(w.ukedagIndeks(new w.Date(2026, 7, 3)), 0, 'mandag 3. august');
  like(w.ukedagIndeks(new w.Date(2026, 7, 7)), 4, 'fredag 7. august');
  like(w.ukedagIndeks(new w.Date(2026, 7, 9)), 6, 'søndag 9. august');
  dom.window.close();
});

// ── Klikk i gridet ─────────────────────────────────────────────
test('klikk på ledig flate åpner skjemaet med riktig time', () => {
  const dom = lagDom({});
  const w = dom.window;
  w.setView('week');

  const kolonner = w.document.querySelectorAll('.day-col');
  sant(kolonner.length === 5, 'ukesvisning skal ha fem dagkolonner');

  // GRID_START_H + y / PX_PER_HOUR. Sikt mot midt i 3. time (10:20–11:05)
  const start = w.hent('GRID_START_H'), pxTime = w.hent('PX_PER_HOUR');
  const y = (10.5 - start) * pxTime;

  klikkIKolonne(w, kolonner[2], y);   // onsdag

  sant(w.document.getElementById('eventFormOverlay').classList.contains('open'),
       'skjemaet skal være åpent');
  like(w.document.getElementById('dagSelect').value, '2', 'onsdag');
  like(w.document.getElementById('periodeSelect').value, '3', 'tredje time');
  like(w.document.getElementById('moteStartInput').value, '10:20', 'starttid for møte');
  like(w.document.getElementById('moteSluttInput').value, '11:05', 'sluttid for møte');
  dom.window.close();
});

test('datoen følger kolonnen det klikkes i', () => {
  const dom = lagDom({});
  const w = dom.window;
  w.setView('week');

  const mandag = w.hent('currentWeekMonday');
  const kolonner = w.document.querySelectorAll('.day-col');
  klikkIKolonne(w, kolonner[4], 0);   // fredag

  const ventet = new w.Date(mandag);
  ventet.setDate(ventet.getDate() + 4);
  like(w.document.getElementById('moteDatoInput').value, w.isoDate(ventet),
       'dato skal være fredag i valgt uke');
  dom.window.close();
});

test('klikk på en hendelse oppretter ikke ny', () => {
  const dom = lagDom({
    // Uten et skoleår som dekker dagens dato filtrerer eventsForDate()
    // bort alt, og kolonnen blir tom.
    lp_skoleaar: JSON.stringify({ start: '2020-01-01', slutt: '2099-12-31' }),
    lp_fridager: JSON.stringify([]),
    lp_events: JSON.stringify([{
      id: 1, title: 'Norsk', category: 'undervisning', recurs: true,
      weekday: 0, start: '08:30', end: '09:15', students: [],
      gyldigFra: '2020-01-01', gyldigTil: null, weekPattern: 'every'
    }])
  });
  const w = dom.window;
  w.setView('week');

  const hendelse = w.document.querySelector('.day-col .event');
  sant(hendelse, 'fant ingen hendelse å klikke på');

  const kolonne = w.document.querySelectorAll('.day-col')[0];
  kolonne.getBoundingClientRect = () => ({ top: 0, left: 0, width: 100, height: 1000 });
  const ev = new w.MouseEvent('click', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clientY', { value: 100 });
  hendelse.dispatchEvent(ev);

  // Undervisning åpner timeplanen, ikke hendelsesskjemaet
  sant(!w.document.getElementById('eventFormOverlay').classList.contains('open'),
       'klikk på hendelse skal ikke åpne skjemaet for ny hendelse');
  dom.window.close();
});

test('redigering av hendelse påvirkes ikke av forslaget', () => {
  const dom = lagDom({});
  const w = dom.window;
  w.openEventForm({
    id: 9, title: 'Møte', category: 'mote', recurs: false,
    date: '2026-08-05', start: '12:30', end: '13:15', students: []
  }, { dato: '2026-01-01', weekday: 0, periode: 1 });

  like(w.document.getElementById('moteDatoInput').value, '2026-08-05',
       'hendelsens egen dato skal vinne');
  like(w.document.getElementById('periodeSelect').value, '5',
       'hendelsens egen time skal vinne');
  dom.window.close();
});

// ── Kjør ───────────────────────────────────────────────────────
console.log('\nKlikk i kalenderen\n');
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK   ' + navn); }
  catch (e) { alle = false; console.log('  FEIL ' + navn + '\n       ' + e.message); }
}
console.log('\n' + (alle ? 'Alle tester passerte.' : 'Noen tester feilet.') + '\n');
process.exit(alle ? 0 : 1);
