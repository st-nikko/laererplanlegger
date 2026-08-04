// Papirkurv: sletting skal kunne angres.
//
// Det som gjør sletting dyr i denne appen er ikke selve hendelsen, men at
// all elevlogg og oppmøtehistorikk for den forsvinner samtidig. Testene her
// sjekker at historikken faktisk følger med tilbake, og at papirkurven ikke
// lekker inn i det som synkes — den inneholder både elevnavn og data
// brukeren har valgt å slette.

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

function lagStore(seed) {
  const data = { ...(seed || {}) };
  return {
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; },
    _alt: () => data
  };
}

function kjor(navn, seed, sjekk) {
  const store = lagStore(seed);
  const dom = new JSDOM(htmlInline, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { value: store, writable: false });
      if (!w.crypto) w.crypto = {};
      let n = 0;
      w.crypto.randomUUID = () => 'uuid-test-' + (++n).toString().padStart(4, '0');
      w.alert = () => {};
      w.confirm = () => true;
    }
  });
  try {
    dom.window.hent = uttrykk => dom.window.eval(uttrykk);
    sjekk(dom.window, store);
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

console.log('\nPapirkurv\n');
let alle = true;

// ── 1. Slettet time kommer tilbake med elevloggen ──────────────
alle &= kjor('slettet time gjenopprettes med elevlogg og oppmøte', {}, (w) => {
  w.eval(`
    events.push({ id: 'ev1', title: 'Norsk', category: 'undervisning', recurs: true,
                  weekday: 1, start: '08:30', end: '09:15', students: ['s1'] });
    setLesson('ev1', '2026-09-08', { tema: 'Novelleanalyse', notes: 'Kom godt i gang',
                                     attendance: { s1: [true] }, studentNotes: {} });
    setLesson('ev1', '2026-09-15', { tema: 'Skriveøkt', notes: '',
                                     attendance: { s1: [false] }, studentNotes: {} });
    editingEventId = 'ev1';
    slettEventPermanent();
  `);

  like(w.hent('events').length, 0, 'timen skal være fjernet');
  like(Object.keys(w.hent('lessonData')).length, 0, 'elevloggen skal være fjernet');
  like(w.hent('papirkurv').length, 1, 'én oppføring i papirkurven');
  like(w.hent('papirkurv')[0].type, 'hendelse', 'riktig type');

  w.eval(`gjenopprettFraPapirkurv(papirkurv[0].id)`);

  like(w.hent('events').length, 1, 'timen skal være tilbake');
  like(w.hent('events')[0].title, 'Norsk', 'med tittelen i behold');
  like(Object.keys(w.hent('lessonData')).length, 2, 'begge loggførte timene tilbake');
  like(w.hent(`getLesson('ev1','2026-09-08').tema`), 'Novelleanalyse', 'temaet bevart');
  like(w.hent(`getLesson('ev1','2026-09-15').attendance.s1`), [false], 'fraværet bevart');
  like(w.hent('papirkurv').length, 0, 'oppføringen forbrukt');
});

// ── 2. Slettet elev meldes inn igjen i timene sine ─────────────
alle &= kjor('slettet elev gjenopprettes med navn og timetilhørighet', {}, (w) => {
  w.eval(`
    allStudents.push({ id: 's1', navn: 'Kari Nordmann', trinn: 8, startDato: '2026-08-17' });
    events.push({ id: 'ev1', title: 'Norsk', category: 'undervisning', recurs: true,
                  weekday: 1, start: '08:30', end: '09:15', students: ['s1'] });
    events.push({ id: 'ev2', title: 'Matte', category: 'undervisning', recurs: true,
                  weekday: 3, start: '10:20', end: '11:05', students: ['s1'] });
    deleteStudent('s1');
  `);

  like(w.hent('allStudents').length, 0, 'eleven fjernet');
  like(w.hent(`events.map(e => e.students.length)`), [0, 0], 'meldt ut av begge timene');
  like(w.hent('papirkurv')[0].tittel, 'Kari Nordmann', 'navnet står i papirkurven');

  w.eval(`gjenopprettFraPapirkurv(papirkurv[0].id)`);

  like(w.hent('allStudents').length, 1, 'eleven tilbake');
  like(w.hent('allStudents')[0].navn, 'Kari Nordmann', 'med navnet — ikke som «Elev s1»');
  like(w.hent(`events.map(e => e.students)`), [['s1'], ['s1']], 'meldt inn igjen i begge timene');
});

// ── 3. Sletting av en time eleven sto i skal ikke gi dobbel ────
// Gjenoppretting må tåle at verden har endret seg i mellomtiden.
alle &= kjor('gjenoppretting hopper over timer som ikke finnes lenger', {}, (w) => {
  w.eval(`
    allStudents.push({ id: 's1', navn: 'Ola', trinn: 9, startDato: '2026-08-17' });
    events.push({ id: 'ev1', title: 'Norsk', category: 'undervisning', recurs: true,
                  weekday: 1, start: '08:30', end: '09:15', students: ['s1'] });
    deleteStudent('s1');
    events = [];              // timen slettes mens eleven ligger i papirkurven
    gjenopprettFraPapirkurv(papirkurv[0].id);
  `);
  like(w.hent('allStudents').length, 1, 'eleven kommer tilbake likevel');
  like(w.hent('events').length, 0, 'ingen time gjenoppstår som bieffekt');
});

// ── 4. Utløpte oppføringer kastes ved oppstart ─────────────────
alle &= kjor('oppføringer eldre enn 30 dager kastes ved lasting', {
  lp_papirkurv: JSON.stringify([
    { id: 'gammel', type: 'gjøremål', tittel: 'For gammel',
      tidspunkt: new Date(Date.now() - 31 * 86400000).toISOString(),
      data: { todo: { id: 1, tittel: 'For gammel' } } },
    { id: 'fersk', type: 'gjøremål', tittel: 'Fersk nok',
      tidspunkt: new Date(Date.now() - 3 * 86400000).toISOString(),
      data: { todo: { id: 2, tittel: 'Fersk nok' } } }
  ])
}, (w) => {
  like(w.hent('papirkurv').length, 1, 'bare den ferske overlever');
  like(w.hent('papirkurv')[0].id, 'fersk', 'og det er riktig oppføring');
});

// ── 5. Papirkurven forlater ikke enheten ───────────────────────
alle &= kjor('papirkurven lagres lokalt og står utenfor synknøklene', {}, (w, store) => {
  w.eval(`
    allStudents.push({ id: 's1', navn: 'Kari Nordmann', trinn: 8, startDato: '2026-08-17' });
    deleteStudent('s1');
  `);

  sant(store.getItem('lp_papirkurv'), 'papirkurven skal lagres lokalt');
  sant(store.getItem('lp_papirkurv').includes('Kari Nordmann'),
       'navnet ligger med, ellers hjelper ikke gjenopprettingen');

  // Samme liste som sync.js bruker. Står lp_papirkurv her, lekker både
  // elevnavn og slettet data ut av enheten.
  const SYNK_NOKLER = [
    'lp_events', 'lp_todos', 'lp_planfestetTid', 'lp_overtid',
    'lp_lessonData', 'lp_topicsBySubject', 'lp_students',
    'lp_fridager', 'lp_skoleaar',
    'lp_ics_token', 'lp_ics_publiser',
    'lp_jobb_token', 'lp_jobb_publiser'
  ];
  const sync = fs.readFileSync(path + 'sync.js', 'utf8');
  sant(!sync.includes('lp_papirkurv'), 'sync.js skal ikke nevne lp_papirkurv i det hele tatt');
  sant(!SYNK_NOKLER.includes('lp_papirkurv'), 'lp_papirkurv skal ikke være en synknøkkel');

  // Og lista i testen må stemme med den i sync.js, ellers vokter vi ingenting
  const iFila = sync.match(/const SYNK_NOKLER = \[([\s\S]*?)\]/)[1];
  SYNK_NOKLER.forEach(k => sant(iFila.includes(k), `synknøkkelen ${k} finnes ikke lenger i sync.js — oppdater testen`));
});

console.log('\n' + (alle ? 'Alle tester passerte.' : 'Noen tester feilet.') + '\n');
process.exit(alle ? 0 : 1);
