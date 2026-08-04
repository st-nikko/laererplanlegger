// Test av pseudonymisering: elevnavn skal ligge i lp_studentNames,
// ikke i lp_students.
const fs = require('fs');
const path = require('node:path').join(__dirname, '..') + '/';
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path + 'index.html', 'utf8');
const js   = fs.readFileSync(path + 'app.js', 'utf8');

// Bytt <script src="app.js"> mot inline-kode, og fjern synk-oppsettet —
// det krever nettverk og modulstøtte jsdom ikke har. Synken testes for
// seg i tests/synk.test.js.
const htmlInline = html
  .replace(/<script src="app\.js"><\/script>/, '<script>' + js + '</script>')
  .replace(/<script type="module">[\s\S]*?<\/script>/g, '')
  .replace(/<script src="sync\.js"><\/script>/, '')
  .replace(/<script>\s*if \(window\.supabaseJs\)[\s\S]*?<\/script>/, '');

function lagStore(seed) {
  const data = { ...seed };
  return {
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; },
    clear: () => { Object.keys(data).forEach(k => delete data[k]); },
    _dump: () => data
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
    // const/let på toppnivå havner ikke på window — hent dem via eval
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
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(hva + ': ventet ' + sb + ', fikk ' + sa);
}
function sant(v, hva) { if (!v) throw new Error(hva); }

console.log('\nPseudonymisering av elevnavn\n');
let alle = true;

// ── 1. Migrering fra gammelt format ────────────────────────────
alle &= kjor('migrerer navn ut av lp_students', {
  lp_students: JSON.stringify([
    { id: 'a1', navn: 'Emma',   trinn: 9,  startDato: '2025-08-18', arkivert: false, arkivertDato: null },
    { id: 'b2', navn: 'Jakob',  trinn: 10, startDato: '2025-08-18', arkivert: false, arkivertDato: null }
  ])
}, (w, store) => {
  like(w.hent('allStudents').map(s => s.navn), ['Emma', 'Jakob'], 'navn i minnet');
  like(w.antallUtenNavn(), 0, 'ingen skal mangle navn');

  w.saveToStorage();
  const lagret = JSON.parse(store.getItem('lp_students'));
  sant(lagret.every(s => !('navn' in s)), 'lp_students skal ikke inneholde navn');
  sant(lagret.every(s => !('navnMangler' in s)), 'lp_students skal ikke inneholde navnMangler');
  like(JSON.parse(store.getItem('lp_studentNames')), { a1: 'Emma', b2: 'Jakob' }, 'navnekart');
});

// ── 2. Ny enhet: struktur uten navn ────────────────────────────
alle &= kjor('faller tilbake til Elev-xxxx uten navnekart', {
  lp_students: JSON.stringify([
    { id: 'abc123', trinn: 9, startDato: '2025-08-18', arkivert: false, arkivertDato: null }
  ])
}, (w, store) => {
  like(w.hent('allStudents')[0].navn, 'Elev c123', 'fallback-navn');
  like(w.hent('allStudents')[0].navnMangler, true, 'navnMangler-flagg');
  like(w.antallUtenNavn(), 1, 'antall uten navn');

  // Fallback skal aldri lagres som ekte navn
  w.saveToStorage();
  like(JSON.parse(store.getItem('lp_studentNames')), {}, 'navnekart skal være tomt');
});

// ── 3. Navn lagt inn lokalt overlever lagring ──────────────────
alle &= kjor('navn skrevet inn lokalt persisteres', {
  lp_students: JSON.stringify([
    { id: 'abc123', trinn: 9, startDato: '2025-08-18', arkivert: false, arkivertDato: null }
  ])
}, (w, store) => {
  const s = w.hent('allStudents')[0];
  s.navn = 'Nora'; s.navnMangler = false;
  w.saveToStorage();
  like(JSON.parse(store.getItem('lp_studentNames')), { abc123: 'Nora' }, 'navnekart etter redigering');
  sant(!('navn' in JSON.parse(store.getItem('lp_students'))[0]), 'navn skal fortsatt være ute av lp_students');
});

// ── 4. Ny elev via skjema ──────────────────────────────────────
alle &= kjor('ny elev havner i riktig nøkkel', {}, (w, store) => {
  w.document.getElementById('sfNavn').value      = 'Oliver';
  w.document.getElementById('sfTrinn').value     = '8';
  w.document.getElementById('sfStartDato').value = '2025-08-18';
  w.editingStudentId = null;
  w.saveStudent();

  const lagret = JSON.parse(store.getItem('lp_students'));
  like(lagret.length, 1, 'antall elever');
  sant(!('navn' in lagret[0]), 'lp_students uten navn');
  like(Object.values(JSON.parse(store.getItem('lp_studentNames'))), ['Oliver'], 'navnet i navnekartet');
});

// ── 5. Eksport uten navn ───────────────────────────────────────
alle &= kjor('eksport uten navn utelater navnekartet', {
  lp_students: JSON.stringify([
    { id: 'a1', navn: 'Emma', trinn: 9, startDato: '2025-08-18', arkivert: false, arkivertDato: null }
  ])
}, (w) => {
  let fanget = null;
  w.Blob = class { constructor(deler) { fanget = JSON.parse(deler[0]); } };
  w.URL.createObjectURL = () => 'blob:test';
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = () => {};

  w.exportData(false);
  sant(!fanget.studentNames, 'studentNames skal ikke være med');
  sant(fanget.allStudents.every(s => !('navn' in s)), 'elever skal være uten navn');

  w.exportData(true);
  like(fanget.studentNames, { a1: 'Emma' }, 'full eksport skal ha navn');
});

// ── 6. Migreringen skrives tilbake med én gang ─────────────────
// Uten dette blir navnene liggende i lp_students helt til neste
// mutasjon utløser en lagring.
alle &= kjor('gammelt format skrives tilbake ved oppstart', {
  lp_students: JSON.stringify([
    { id: 'a1', navn: 'Esekiel', trinn: 10, startDato: '2026-06-08', arkivert: false, arkivertDato: null }
  ])
}, (w, store) => {
  // Ingen saveToStorage() her — dette skal ha skjedd under init
  const lagret = JSON.parse(store.getItem('lp_students'));
  sant(!('navn' in lagret[0]), 'lp_students skal være renset rett etter lasting');
  like(JSON.parse(store.getItem('lp_studentNames')), { a1: 'Esekiel' }, 'navnet flyttet til eget kart');
});

// ── 7. Ingen unødig skriving når formatet allerede er nytt ─────
alle &= kjor('nytt format skrives ikke tilbake i unødig grad', {
  lp_students: JSON.stringify([
    { id: 'a1', trinn: 10, startDato: '2026-06-08', arkivert: false, arkivertDato: null }
  ]),
  lp_studentNames: JSON.stringify({ a1: 'Esekiel' })
}, (w) => {
  like(w.hent('maaSkrivesTilbake'), false, 'flagget skal ikke settes');
  like(w.hent('allStudents')[0].navn, 'Esekiel', 'navn hydrert fra kartet');
});

// ── 8. Elev-ID-lappen er gjenopprettingsveien for navn ─────────
// Navnene synkes ikke. Mister man dem, er lappen det eneste som knytter
// «Elev 4f2a» på én enhet til «Kari Nordmann» på en annen. Da må de to
// enhetene vise nøyaktig samme tegn, og lappen må ikke dubleres for elever
// som allerede vises med fallback-navnet.
alle &= kjor('elev-ID-lappen er lik på tvers av enheter', {
  lp_students: JSON.stringify([
    { id: 'aaaa-bbbb-cccc-4f2a', trinn: 8, startDato: '2026-08-17', arkivert: false, arkivertDato: null },
    { id: 'dddd-eeee-ffff-0d1e', trinn: 9, startDato: '2026-08-17', arkivert: false, arkivertDato: null }
  ]),
  // Bare den første er kjent på denne enheten
  lp_studentNames: JSON.stringify({ 'aaaa-bbbb-cccc-4f2a': 'Kari Nordmann' })
}, (w) => {
  const lapp = w.hent('elevLapp');
  const fallback = w.hent('fallbackNavn');

  // Samme utsnitt begge steder — ellers stemmer ikke skjermene overens
  ['aaaa-bbbb-cccc-4f2a', 7, 'abc'].forEach(id => {
    like(fallback(id), 'Elev ' + lapp(id), 'fallbackNavn må bygge på elevLapp for ' + id);
  });

  w.renderElevView();
  const rader = [...w.document.querySelectorAll('.elev-table tbody tr')]
    .map(r => r.querySelector('td'))
    .filter(td => td && td.textContent.trim());

  const medNavn  = rader.find(td => td.textContent.includes('Kari'));
  const utenNavn = rader.find(td => td.textContent.includes('Elev '));

  sant(medNavn && medNavn.querySelector('.elev-lapp'),
       'elev med navn må vise lappen — den er nøkkelen den andre enheten leser av');
  like(medNavn.querySelector('.elev-lapp').textContent, '4f2a', 'lappen skal være de fire siste tegnene');
  sant(utenNavn && !utenNavn.querySelector('.elev-lapp'),
       'elev uten navn viser lappen i fallback-navnet allerede — den skal ikke dubleres');
  sant(utenNavn.textContent.includes('0d1e'), 'fallback-navnet inneholder lappen');
});

console.log('\n' + (alle ? 'Alle tester passerte.' : 'Noen tester feilet.') + '\n');
process.exit(alle ? 0 : 1);
