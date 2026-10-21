// Fem små poster fra veikartet, bygget 21. okt 2026:
//   28  rull kalenderen til nå ved oppstart
//    9  trinn i Outlook-tittelen (testet i ics.test.js)
//    6  frist én uke etter møtet, vist ved knappen
//   11  lagret fargekart og trinnmerke på PC
//   15  klikkbare adresser i fritekst

const fs   = require('fs');
const path = require('node:path').join(__dirname, '..') + '/';
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path + 'index.html', 'utf8');
const js   = fs.readFileSync(path + 'app.js', 'utf8');
const sync = fs.readFileSync(path + 'sync.js', 'utf8');

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
    removeItem: k => { delete data[k]; },
    data
  };
}

// Én fast time hver ukedag, så uka som vises alltid har noe å tegne
const time = (id, title, weekday, o) => ({
  id, title, category: 'undervisning', recurs: true, weekday, start: '08:30', end: '09:15',
  room: '', trinn: 9, trinns: [9], sessionType: 'gruppe', students: ['a'],
  weekPattern: 'every', gyldigFra: '2000-01-01', gyldigTil: null, ...o
});
const UKA = [0, 1, 2, 3, 4].map(d => time(d + 1, 'Norsk', d));

function lagDom(seed = {}) {
  const store = lagStore({
    lp_students:     JSON.stringify([{ id: 'a', trinn: 9, startDato: '2000-01-01', arkivert: false, arkivertDato: null }]),
    lp_studentNames: JSON.stringify({ a: 'Ada' }),
    lp_events:       JSON.stringify(UKA),
    lp_fridager:     '[]',
    lp_skoleaar:     JSON.stringify({ start: '2000-01-01', slutt: '2099-12-31' }),
    ...seed
  });
  const dom = new JSDOM(htmlInline, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { value: store, writable: false });
      if (!w.crypto) w.crypto = {};
      w.crypto.randomUUID = () => 'uuid-' + Math.random();
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

// ══════════════════════════════════════════════════════════════
// 28. RULL TIL NÅ
// ══════════════════════════════════════════════════════════════

test('rullTilNaa setter nå-linja en tredjedel ned', () => {
  const dom = lagDom(); const w = dom.window; const doc = w.document;
  // Nå-linja tegnes bare på dagens dato i uka som vises — legg den inn selv,
  // så testen ikke avhenger av hvilken ukedag den kjøres
  if (!doc.querySelector('#calGrid .now-line')) {
    const nl = doc.createElement('div'); nl.className = 'now-line';
    doc.getElementById('calGrid').appendChild(nl);
  }
  const rulle = doc.querySelector('.calendar-scroll');
  Object.defineProperty(rulle, 'clientHeight', { value: 300, configurable: true });
  // 13:00 → (13 − 7,5) × 60 = 330 px, minus 300/3 = 230
  like(w.rullTilNaa(new w.Date(2026, 9, 21, 13, 0)), 230, '13:00');
  like(rulle.scrollTop, 230, 'scrollTop');
  // Tidlig på dagen: ikke under null
  like(w.rullTilNaa(new w.Date(2026, 9, 21, 7, 45)), 0, '07:45');
  dom.window.close();
});

test('utenfor skoledagen, eller uten nå-linje, rulles det ikke', () => {
  const dom = lagDom(); const w = dom.window; const doc = w.document;
  doc.querySelectorAll('#calGrid .now-line').forEach(n => n.remove());
  like(w.rullTilNaa(new w.Date(2026, 9, 21, 13, 0)), null, 'ingen nå-linje');
  const nl = doc.createElement('div'); nl.className = 'now-line';
  doc.getElementById('calGrid').appendChild(nl);
  like(w.rullTilNaa(new w.Date(2026, 9, 21, 20, 0)), null, 'klokka 20');
  like(w.rullTilNaa(new w.Date(2026, 9, 21, 6, 0)), null, 'klokka 6');
  dom.window.close();
});

test('rullTilNaa kalles ved oppstart, etter første render', () => {
  sant(/render\(\);\s*\nrullTilNaa\(\);/.test(js), 'rullTilNaa() skal stå rett etter render() i init');
});

// ══════════════════════════════════════════════════════════════
// 6. FRIST ÉN UKE ETTER MØTET
// ══════════════════════════════════════════════════════════════

test('gjøremål fra møtet får frist sju dager etter møtedatoen', () => {
  const dom = lagDom(); const w = dom.window; const doc = w.document;
  doc.getElementById('moteDatoInput').value = '2026-03-02';
  like(w.moteTodoFrist(), '2026-03-09', 'mandag + 7');
  doc.getElementById('moteTodoTittel').value = 'Send referat';
  w.leggTilGjøremålFraMøte();
  const t = JSON.parse(dom.store.getItem('lp_todos')).find(x => x.tittel === 'Send referat');
  sant(t, 'gjøremålet ble ikke lagret');
  like(t.frist, '2026-03-09', 'fristen');
  dom.window.close();
});

test('fristen vises ved knappen og følger datofeltet', () => {
  const dom = lagDom(); const w = dom.window; const doc = w.document;
  const felt = doc.getElementById('moteDatoInput');
  felt.value = '2026-10-20';
  felt.dispatchEvent(new w.Event('change'));
  like(doc.getElementById('moteTodoFrist').textContent, 'Frist: tir. 27. okt', 'tirsdag');
  felt.value = '2026-12-28';
  felt.dispatchEvent(new w.Event('change'));
  like(doc.getElementById('moteTodoFrist').textContent, 'Frist: man. 4. jan', 'over nyttår');
  dom.window.close();
});

test('et gjentakende møte får fristen fra forekomsten som ble åpnet', () => {
  const MOTE = { id: 50, title: 'Teammøte', category: 'mote', recurs: true, weekday: 1, start: '14:15', end: '15:00',
    room: '', students: [], weekPattern: 'every', gyldigFra: '2000-01-01', gyldigTil: null };
  const dom = lagDom({ lp_events: JSON.stringify([...UKA, MOTE]) }); const w = dom.window; const doc = w.document;
  w.openEventForm(w.eval('events').find(e => e.id === 50), null, '2026-11-10');
  like(doc.getElementById('moteDatoInput').value, '2026-11-10', 'forekomsten');
  like(doc.getElementById('moteTodoFrist').textContent, 'Frist: tir. 17. nov', 'vist');
  like(w.moteTodoFrist(), '2026-11-17', 'regnet');
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// 11. FAGFARGER
// ══════════════════════════════════════════════════════════════

test('fargekartet lagres og leses inn igjen', () => {
  const dom = lagDom({ lp_events: '[]' }); const w = dom.window;
  const a = w.getSubjectColor('Norsk'), b = w.getSubjectColor('Matematikk');
  sant(a !== b, 'to fag fikk samme farge');
  const lagret = JSON.parse(dom.store.getItem('lp_fagfarger'));
  like(Object.keys(lagret).sort(), ['Matematikk', 'Norsk'], 'begge lagret');
  dom.window.close();

  // Ny last, fagene møtes i motsatt rekkefølge — fargene skal stå
  const dom2 = lagDom({ lp_events: '[]', lp_fagfarger: JSON.stringify(lagret) }); const w2 = dom2.window;
  like(w2.getSubjectColor('Matematikk'), b, 'matte beholdt fargen');
  like(w2.getSubjectColor('Norsk'), a, 'norsk beholdt fargen');
  dom2.window.close();
});

test('et nytt fag tar en ledig farge, ikke en som er i bruk', () => {
  // Fargene 0 og 2 er tatt (fag 1 er slettet en gang) — neste skal få 1
  const dom = lagDom({ lp_events: '[]', lp_fagfarger: JSON.stringify({ Norsk: 0, Engelsk: 2 }) }); const w = dom.window;
  like(w.eval('subjectColorMap').Norsk, 0, 'lest inn');
  w.getSubjectColor('Matematikk');
  like(w.eval('subjectColorMap').Matematikk, 1, 'ledig plass');
  dom.window.close();
});

test('ugyldige indekser i lagret kart kastes', () => {
  const dom = lagDom({ lp_events: '[]', lp_fagfarger: JSON.stringify({ Norsk: 99, Musikk: -1, Tysk: 'x', Engelsk: 3 }) }); const w = dom.window;
  like(Object.keys(w.eval('subjectColorMap')).sort(), ['Engelsk'], 'bare Engelsk');
  dom.window.close();
});

test('fagfargene synkes og er med i backup', () => {
  sant(/'lp_fagfarger'/.test(sync.match(/const SYNK_NOKLER = \[[\s\S]*?\];/)[0]), 'mangler i SYNK_NOKLER');
  sant(/fagfarger: subjectColorMap/.test(js), 'eksport');
  sant(/data\.fagfarger\)\s+localStorage\.setItem\('lp_fagfarger'/.test(js), 'import');
});

test('trinnmerket står på timene på PC, ikke på enetimer', () => {
  const ENE = time(20, 'Ada', 0, { start: '10:15', end: '11:00', sessionType: 'enetime', trinns: [10] });
  const FLERE = time(21, 'Kroppsøving', 0, { start: '12:00', end: '12:45', trinns: [8, 9] });
  const dom = lagDom({ lp_events: JSON.stringify([...UKA, ENE, FLERE]) }); const w = dom.window; const doc = w.document;
  like(w.trinnMerkeTekst(UKA[0]), '9.', 'ett trinn');
  like(w.trinnMerkeTekst(FLERE), '8.+9.', 'to trinn');
  like(w.trinnMerkeTekst(ENE), '', 'enetime');
  like(w.trinnMerkeTekst({ ...FLERE, trinns: [8, 9, 10] }), '8.–10.', 'sammenhengende');
  like(w.trinnMerkeTekst({ ...FLERE, trinns: [10, 8] }), '8.+10.', 'hull, sortert');
  like(w.trinnMerkeTekst({ category: 'mote' }), '', 'møte');
  w.setView('week'); w.render();
  const merker = [...doc.querySelectorAll('#calGrid .event-trinn-merke')].map(m => m.textContent);
  sant(merker.length >= 5, 'fant ' + merker.length + ' merker');
  sant(merker.includes('8.+9.'), 'kroppsøving');
  sant(doc.querySelectorAll('#calGrid .event.har-trinn-merke').length === merker.length, 'klassen følger merket');
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// 15. KLIKKBARE ADRESSER
// ══════════════════════════════════════════════════════════════

test('adresser finnes, tegnsetting bakerst er ikke med', () => {
  const dom = lagDom(); const w = dom.window;
  const f = t => w.finnAdresser(t).map(a => a.href);
  like(f('Se https://nrk.no/skole.'), ['https://nrk.no/skole'], 'punktum');
  like(f('(se https://udir.no/lk20)'), ['https://udir.no/lk20'], 'parentes');
  like(f('https://no.wikipedia.org/wiki/Brøk_(matematikk)'), ['https://no.wikipedia.org/wiki/Brøk_(matematikk)'], 'parentes i adressen');
  like(f('www.matematikk.org, og http://a.no/b?c=1&d=2!'), ['https://www.matematikk.org', 'http://a.no/b?c=1&d=2'], 'www og spørrestreng');
  like(f('javascript:alert(1) ftp://x.no mail@x.no localhost:3000'), [], 'bare http(s)');
  like(f('https://nrk'), [], 'uten domene');
  dom.window.close();
});

test('teksten blir tekst, ikke markup — og adressen blir en lenke', () => {
  const dom = lagDom(); const w = dom.window; const doc = w.document;
  const div = doc.createElement('div');
  div.appendChild(w.tekstMedLenker('<b>fet</b> se https://nrk.no. <img src=x onerror=alert(1)>'));
  sant(!div.querySelector('b') && !div.querySelector('img'), 'markup ble tolket');
  sant(div.textContent.includes('<b>fet</b>'), 'teksten skal stå som den er');
  const a = div.querySelector('a');
  like(a.getAttribute('href'), 'https://nrk.no', 'href');
  like(a.target, '_blank', 'ny fane');
  sant(/noopener/.test(a.rel), 'noopener');
  sant(div.textContent.endsWith('<img src=x onerror=alert(1)>'), 'resten av teksten');
  dom.window.close();
});

test('elevloggen viser lenker i notatene, og tema som ren tekst', () => {
  const lessonData = { '1_2026-10-12': { tema: '<i>Brøk</i>', notes: 'Video: https://nrk.no/brok', attendance: { a: true },
    studentNotes: { a: 'Øv på www.matematikk.org' }, lagret: '2026-10-12' } };
  const dom = lagDom({ lp_lessonData: JSON.stringify(lessonData) }); const w = dom.window; const doc = w.document;
  const c = doc.getElementById('elevloggViewContent');
  w.renderElevloggInnhold('a', c);
  const entry = c.querySelector('.logg-entry');
  sant(entry, 'ingen loggpost');
  like(entry.querySelector('.logg-tema').textContent, '<i>Brøk</i>', 'tema som tekst');
  sant(!entry.querySelector('.logg-tema i'), 'tema ble tolket som markup');
  like(entry.querySelector('.logg-notes a').getAttribute('href'), 'https://nrk.no/brok', 'notatlenke');
  like(entry.querySelector('.logg-student-note a').getAttribute('href'), 'https://www.matematikk.org', 'elevnotatlenke');
  // Klikk på lenken skal ikke åpne timen
  let aapnet = false; entry.onclick = () => { aapnet = true; };
  entry.querySelector('.logg-notes a').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  sant(!aapnet, 'klikk på lenken åpnet timen');
  dom.window.close();
});

test('gjøremålslista: lenken i beskrivelsen åpner ikke skjemaet', () => {
  const todos = [{ id: 1, tittel: 'Les', tekst: 'Se https://udir.no/lk20 før møtet', status: 'ikke_startet', frist: null }];
  const dom = lagDom({ lp_todos: JSON.stringify(todos) }); const w = dom.window; const doc = w.document;
  w.renderTodoList();
  const a = doc.querySelector('.todo-desc a');
  sant(a, 'ingen lenke i beskrivelsen');
  like(a.getAttribute('href'), 'https://udir.no/lk20', 'href');
  let aapnet = false;
  const orig = w.openTodoForm; w.openTodoForm = () => { aapnet = true; };
  a.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  sant(!aapnet, 'skjemaet ble åpnet');
  w.openTodoForm = orig;
  dom.window.close();
});

test('lenkeraden under et tekstfelt følger teksten', () => {
  const dom = lagDom(); const w = dom.window; const doc = w.document;
  const felt = doc.getElementById('planNotes');
  felt.value = 'Bruk https://nrk.no/skole og https://nrk.no/skole igjen, og www.udir.no';
  felt.dispatchEvent(new w.Event('input'));
  const rad = felt.nextElementSibling;
  sant(rad && rad.classList.contains('lenkerad'), 'ingen lenkerad');
  like([...rad.querySelectorAll('a')].map(a => a.textContent), ['nrk.no/skole', 'udir.no'], 'unike, korte');
  felt.value = 'ingen adresser her';
  felt.dispatchEvent(new w.Event('input'));
  like(rad.querySelectorAll('a').length, 0, 'tom');
  like(rad.style.display, 'none', 'skjult');
  dom.window.close();
});

test('«Om eleven» og gjøremålsskjemaet har lenkerad', () => {
  const dom = lagDom({ lp_elevNotater: JSON.stringify({ a: 'Avtale: https://skole.no/avtale' }) }); const w = dom.window; const doc = w.document;
  const blokk = w.byggElevNotatFelt('a');
  like(blokk.querySelector('.lenkerad a').getAttribute('href'), 'https://skole.no/avtale', 'om eleven');
  const todos = [{ id: 1, tittel: 'Les', tekst: 'https://udir.no', status: 'ikke_startet', frist: null }];
  dom.window.close();
  const dom2 = lagDom({ lp_todos: JSON.stringify(todos) }); const w2 = dom2.window; const doc2 = w2.document;
  w2.openTodoForm(1);
  const rad = doc2.getElementById('todoTextInput').nextElementSibling;
  like(rad.querySelector('a').getAttribute('href'), 'https://udir.no', 'gjøremål');
  dom2.window.close();
});

// ── Kjør ───────────────────────────────────────────────────────
console.log('\nSmå forbedringer 21. okt — rull til nå, møtefrist, fagfarger og lenker\n');
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK   ' + navn); }
  catch (e) { alle = false; console.log('  FEIL ' + navn + '\n       ' + e.message); }
}
console.log('\n' + (alle ? 'Alle tester passerte.' : 'Noen tester feilet.') + '\n');
process.exit(alle ? 0 : 1);
