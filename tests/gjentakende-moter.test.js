// Gjentakende møter skal havne på ukedagen man valgte.
//
// Meldt fra i bruk: alle ukentlige møter la seg på mandag. Årsaken var at
// saveEvent() hardkodet weekday = 0 for alle møtekategorier — undervisning
// velger ukedag i en nedtrekksliste, møter velger dato, og datoen ble aldri
// oversatt til en ukedag. Datoen ble derimot lagret riktig, så gamle møter
// kan repareres ved lasting.

const fs = require('fs');
const path = require('node:path').join(__dirname, '..') + '/';
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path + 'index.html', 'utf8');
const js   = fs.readFileSync(path + 'app.js', 'utf8');

const htmlInline = html
  .replace(/<script src="app\.js"><\/script>/, '<script>' + js + '</script>')
  .replace(/<script type="module">[\s\S]*?<\/script>/g, '')
  .replace(/<script src="sync\.js"><\/script>/, '')
  .replace(/<script>\s*if \(window\.supabaseJs\)[\s\S]*?<\/script>/, '');

function kjor(navn, seed, sjekk) {
  const data = { ...(seed || {}) };
  const store = {
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; }
  };
  const varsler = [];
  const dom = new JSDOM(htmlInline, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { value: store, writable: false });
      if (!w.crypto) w.crypto = {};
      let n = 0;
      w.crypto.randomUUID = () => 'uuid-test-' + (++n);
      w.alert = m => varsler.push(m);
      w.confirm = () => true;
    }
  });
  try {
    dom.window.hent = u => dom.window.eval(u);
    sjekk(dom.window, varsler);
    console.log('  OK   ' + navn);
    return true;
  } catch (e) {
    console.log('  FEIL ' + navn + '\n       ' + e.message);
    return false;
  } finally {
    dom.window.close();
  }
}

function like(a, b, hva) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${hva}: ventet ${B}, fikk ${A}`);
}
function sant(v, hva) { if (!v) throw new Error(hva); }

// Fyller ut møteskjemaet og lagrer. 2026-09-09 er en onsdag.
function lagreMote(w, dato, gjentas) {
  w.eval(`
    openEventForm(null);
    setFormCategory('mote');
    document.getElementById('moteTittelInput').value = 'Teammøte';
    document.getElementById('moteDatoInput').value   = '${dato}';
    document.getElementById('moteStartInput').value  = '14:00';
    document.getElementById('moteSluttInput').value  = '15:00';
    document.getElementById('gjentasCheck').checked  = ${gjentas};
    saveEvent();
  `);
}

console.log('\nGjentakende møter\n');
let alle = true;

// ── 1. Ukedagen følger datoen man valgte ───────────────────────
alle &= kjor('ukentlig møte havner på valgt ukedag', {}, (w) => {
  lagreMote(w, '2026-09-09', true);          // onsdag
  const ev = w.hent('events').find(e => e.title === 'Teammøte');
  sant(ev, 'møtet skal være lagret');
  sant(ev.recurs, 'og være gjentakende');
  like(ev.weekday, 2, 'onsdag er ukedag 2 når mandag er 0');
});

// ── 2. Hver hverdag gir sin egen ukedag ────────────────────────
alle &= kjor('alle hverdager gir riktig ukedag', {}, (w) => {
  // 2026-09-07 er mandag
  const forventet = { '2026-09-07': 0, '2026-09-08': 1, '2026-09-09': 2,
                      '2026-09-10': 3, '2026-09-11': 4 };
  Object.entries(forventet).forEach(([dato, dag]) => {
    w.eval('events.length = 0;');
    lagreMote(w, dato, true);
    like(w.hent('events')[0].weekday, dag, `${dato} skal gi ukedag ${dag}`);
  });
});

// ── 3. Møtet dukker faktisk opp på riktig dag i kalenderen ─────
//
// Datoene regnes ut fra i dag, ikke skrevet inn. saveEvent() setter
// `gyldigFra: isoDate(TODAY)` på nye hendelser, og eventsForDate() viser
// ingenting før den datoen. Med faste datoer ble testen derfor rød av seg
// selv den dagen kalenderen passerte dem — den sto rød 10. september 2026
// fordi den var skrevet rundt 2026-09-09.
function nesteUke() {
  const m = new Date();
  const wd = m.getDay() === 0 ? 6 : m.getDay() - 1;
  m.setDate(m.getDate() - wd + 7);           // mandag i uka etter denne
  const iso = x => {
    const k = new Date(m); k.setDate(k.getDate() + x);
    return k.getFullYear() + '-' + String(k.getMonth() + 1).padStart(2, '0')
                           + '-' + String(k.getDate()).padStart(2, '0');
  };
  return { mandag: iso(0), onsdag: iso(2), onsdagUkenEtter: iso(9), aarSlutt: iso(300) };
}

alle &= kjor('møtet vises på onsdag, ikke mandag', {}, (w) => {
  const u = nesteUke();
  w.eval(`skoleaar = { start: '2000-01-01', slutt: '${u.aarSlutt}' };`);
  lagreMote(w, u.onsdag, true);
  const paaMandag = w.hent(`eventsForDate(new Date('${u.mandag}T00:00:00')).length`);
  const paaOnsdag = w.hent(`eventsForDate(new Date('${u.onsdag}T00:00:00')).length`);
  like(paaMandag, 0, 'ingenting på mandag');
  like(paaOnsdag, 1, 'møtet på onsdag');
  // Og uken etter, siden det gjentar seg
  like(w.hent(`eventsForDate(new Date('${u.onsdagUkenEtter}T00:00:00')).length`), 1, 'gjentar seg uken etter');
});

// ── 4. Helg blokkeres for gjentakende møter ────────────────────
alle &= kjor('ukentlig møte i helga avvises med beskjed', {}, (w, varsler) => {
  lagreMote(w, '2026-09-12', true);          // lørdag
  like(w.hent('events').length, 0, 'møtet skal ikke lagres');
  sant(varsler.some(m => /mandag–fredag/.test(m)), 'brukeren skal få vite hvorfor');
});

// ── 5. Engangsmøte i helga er fortsatt lov ─────────────────────
alle &= kjor('engangsmøte i helga går gjennom', {}, (w) => {
  lagreMote(w, '2026-09-12', false);         // lørdag, uten gjentakelse
  like(w.hent('events').length, 1, 'engangsmøter skal ikke blokkeres');
  like(w.hent('events')[0].date, '2026-09-12', 'med datoen i behold');
});

// ── 6. Gamle, feillagrede møter repareres ved lasting ──────────
alle &= kjor('møter lagret med weekday 0 rettes fra datoen', {
  lp_events: JSON.stringify([
    // Lagret av den gamle koden: dato onsdag, men weekday 0
    { id: 1, title: 'Teammøte', category: 'mote', recurs: true, weekday: 0,
      date: '2026-09-09', start: '14:00', end: '15:00' },
    // Ekte mandagsmøte — skal stå urørt
    { id: 2, title: 'Ledermøte', category: 'mote', recurs: true, weekday: 0,
      date: '2026-09-07', start: '08:00', end: '09:00' },
    // Undervisning bruker nedtrekkslista og var aldri berørt
    { id: 3, title: 'Norsk', category: 'undervisning', recurs: true, weekday: 0,
      start: '08:30', end: '09:15' }
  ])
}, (w) => {
  const ev = id => w.hent('events').find(e => e.id === id);
  like(ev(1).weekday, 2, 'onsdagsmøtet flyttet til onsdag');
  like(ev(2).weekday, 0, 'mandagsmøtet står urørt');
  like(ev(3).weekday, 0, 'undervisning røres ikke av migreringen');
});

// ── 7. Trinnet i kortform til mobilvisningen ───────────────────
alle &= kjor('trinn-merket viser bare undervisning', {}, (w) => {
  like(w.hent(`trinnKortEtikett({category:'undervisning', trinns:[8]})`), '8', 'ett trinn');
  like(w.hent(`trinnKortEtikett({category:'undervisning', trinns:[8,9]})`), '8+9', 'to trinn');
  like(w.hent(`trinnKortEtikett({category:'undervisning', trinn:10})`), '10', 'gammelt enkeltfelt');
  like(w.hent(`trinnKortEtikett({category:'mote', trinns:[8]})`), '', 'møter har ikke trinn');
  like(w.hent(`trinnKortEtikett({category:'undervisning', trinns:[]})`), '', 'uten trinn blir det tomt');
});

console.log('\n' + (alle ? 'Alle tester passerte.' : 'Noen tester feilet.') + '\n');
process.exit(alle ? 0 : 1);
