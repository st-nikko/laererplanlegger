// Vurderinger, koblet til elevene (veikart 14, bygget 19. okt 2026).
//
// Det som voktes:
//   - elevlista: trinnet + faget, og de som allerede har resultat blir
//   - en tom rad lagres ikke, status fortrenger verdi
//   - formen låses når første verdi er ført
//   - lagring, synk, backup (bare full) og papirkurv
//   - elevloggen viser resultatet under faget

const fs   = require('fs');
const path = require('node:path').join(__dirname, '..') + '/';
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path + 'index.html', 'utf8');
const js   = fs.readFileSync(path + 'app.js', 'utf8');
const css  = fs.readFileSync(path + 'app.css', 'utf8');
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
    removeItem: k => { delete data[k]; }
  };
}

const elev = (id, trinn, o) => ({ id, trinn, startDato: '2000-01-01', arkivert: false, arkivertDato: null, ...o });
const time = (id, title, students, trinn = 9) => ({
  id, title, category: 'undervisning', recurs: true, weekday: 0, start: '08:30', end: '09:15',
  room: '', trinn, trinns: [trinn], sessionType: 'gruppe', students,
  weekPattern: 'every', gyldigFra: '2000-01-01', gyldigTil: null
});

// 9. trinn: a og b i norsk, c bare i matte. d er på 10. trinn i norsk. e er arkivert.
const ELEVER = [elev('a', 9), elev('b', 9), elev('c', 9), elev('d', 10), elev('e', 9, { arkivert: true })];
const NAVN   = { a: 'Ada', b: 'Bo', c: 'Cato', d: 'Dina', e: 'Eli' };
const EVENTS = [time(1, 'Norsk', ['a', 'b', 'e']), time(2, 'Matematikk', ['c']), time(3, 'Norsk', ['d'], 10)];

function lagDom({ vurderinger = [], elever = ELEVER, events = EVENTS } = {}) {
  const store = lagStore({
    lp_students:     JSON.stringify(elever),
    lp_studentNames: JSON.stringify(NAVN),
    lp_events:       JSON.stringify(events),
    lp_vurderinger:  JSON.stringify(vurderinger),
    lp_skoleaar:     JSON.stringify({ start: '2000-01-01', slutt: '2099-12-31' })
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
  dom.lagret = () => JSON.parse(store.getItem('lp_vurderinger'));
  return dom;
}

const tester = [];
function test(navn, fn) { tester.push([navn, fn]); }
function sant(v, hva) { if (!v) throw new Error(hva); }
function like(a, b, hva) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(hva + ': ventet ' + JSON.stringify(b) + ', fikk ' + JSON.stringify(a));
}

const PROVE = { id: 'v1', dato: '2026-10-12', fag: 'Norsk', trinn: 9, tittel: 'Novelleprøve', form: 'karakter', notis: '',
  resultater: { a: { verdi: 4, status: null, kommentar: 'God struktur' }, b: { verdi: null, status: 'ikke_levert', kommentar: '' } } };

// ══════════════════════════════════════════════════════════════
// ELEVLISTA
// ══════════════════════════════════════════════════════════════

test('elevlista er trinnet som har faget', () => {
  const dom = lagDom(); const w = dom.window;
  like(w.eleverForVurdering('Norsk', [9], {}).map(s => s.id), ['a', 'b'], 'norsk 9');
  like(w.eleverForVurdering('Matematikk', [9], {}).map(s => s.id), ['c'], 'matte 9');
  like(w.eleverForVurdering('Norsk', [10], {}).map(s => s.id), ['d'], 'norsk 10');
  dom.window.close();
});

test('arkiverte elever er ikke med', () => {
  const dom = lagDom(); const w = dom.window;
  sant(!w.eleverForVurdering('Norsk', [9], {}).some(s => s.id === 'e'), 'arkivert elev kom med');
  dom.window.close();
});

test('en elev med resultat blir stående, selv om hun har byttet gruppe', () => {
  const dom = lagDom(); const w = dom.window;
  const liste = w.eleverForVurdering('Norsk', [9], { c: { verdi: 3 } }).map(s => s.id);
  like(liste, ['a', 'b', 'c'], 'c har resultat');
  dom.window.close();
});


// ══════════════════════════════════════════════════════════════
// FLERE TRINN
// ══════════════════════════════════════════════════════════════

const KROPPSOVING = { ...time(4, 'Kroppsøving', ['a', 'c', 'd']), trinns: [8, 9, 10] };

test('elevlista dekker alle valgte trinn, sortert per trinn', () => {
  const dom = lagDom({ events: [...EVENTS, KROPPSOVING] }); const w = dom.window;
  like(w.eleverForVurdering('Kroppsøving', [9, 10], {}).map(s => s.id), ['a', 'c', 'd'], 'a, c (9) og d (10)');
  like(w.eleverForVurdering('Kroppsøving', [10], {}).map(s => s.id), ['d'], 'bare 10');
  dom.window.close();
});

test('valg av fag krysser av trinnene fagets timer har', () => {
  const dom = lagDom({ events: [...EVENTS, KROPPSOVING] }); const w = dom.window; const doc = w.document;
  w.nyVurdering();
  doc.getElementById('vuFag').value = 'Kroppsøving';
  w.vurderingFagEndret();
  const valgt = [...doc.querySelectorAll('input[name="vuTrinnCheck"]:checked')].map(c => c.value);
  like(valgt, ['8', '9', '10'], 'alle tre');
  doc.getElementById('vuFag').value = 'Matematikk';
  w.vurderingFagEndret();
  like([...doc.querySelectorAll('input[name="vuTrinnCheck"]:checked')].map(c => c.value), ['9'], 'matte er bare 9');
  dom.window.close();
});

test('elevlista får en overskrift per trinn når den spenner over flere', () => {
  const dom = lagDom({ events: [...EVENTS, KROPPSOVING] }); const w = dom.window; const doc = w.document;
  w.nyVurdering();
  doc.getElementById('vuFag').value = 'Kroppsøving';
  w.vurderingFagEndret();
  like([...doc.querySelectorAll('#vuElever .vu-trinn-hdr')].map(h => h.textContent), ['9. trinn', '10. trinn'], 'overskrifter');
  doc.getElementById('vuFag').value = 'Matematikk';
  w.vurderingFagEndret();
  like(doc.querySelectorAll('#vuElever .vu-trinn-hdr').length, 0, 'ingen overskrift med ett trinn');
  dom.window.close();
});

test('flere trinn lagres som liste', () => {
  const dom = lagDom({ events: [...EVENTS, KROPPSOVING] }); const w = dom.window;
  w.lagreVurdering({ tittel: 'Volleyball', dato: '2026-10-19', fag: 'Kroppsøving', trinns: ['10', 8, 9, 9], form: 'maal',
    resultater: { a: { verdi: 'hoy' }, d: { verdi: 'lav' } } });
  like(dom.lagret()[0].trinns, [8, 9, 10], 'sortert og uten dobbel');
  dom.window.close();
});

test('en lagret vurdering med ett trinn gjøres om til liste ved lasting', () => {
  const dom = lagDom({ vurderinger: [PROVE] }); const w = dom.window;
  const v = w.eval('vurderinger')[0];
  like(v.trinns, [9], 'trinns');
  sant(!('trinn' in v), 'gammelt felt skal bort');
  dom.window.close();
});

test('trinnene skrives kort i oversikten', () => {
  const dom = lagDom(); const w = dom.window;
  like(w.trinnTekst([9]), '9. trinn', 'ett');
  like(w.trinnTekst([8, 10]), '8. + 10. trinn', 'hull');
  like(w.trinnTekst([10, 8, 9]), '8.–10. trinn', 'sammenhengende');
  like(w.trinnTekst([8, 9]), '8. + 9. trinn', 'to');
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// LAGRING
// ══════════════════════════════════════════════════════════════

test('tomme rader lagres ikke', () => {
  const dom = lagDom(); const w = dom.window;
  w.lagreVurdering({ tittel: 'Prøve', dato: '2026-10-19', fag: 'Norsk', trinn: '9', form: 'karakter',
    resultater: { a: { verdi: 5 }, b: { verdi: null, status: null, kommentar: '  ' } } });
  like(Object.keys(dom.lagret()[0].resultater), ['a'], 'bare a');
  like(dom.lagret()[0].trinns, [9], 'trinn som liste av tall');
  dom.window.close();
});

test('status fortrenger verdi', () => {
  const dom = lagDom(); const w = dom.window;
  w.lagreVurdering({ tittel: 'P', dato: '2026-10-19', fag: 'Norsk', trinn: 9, form: 'maal',
    resultater: { a: { verdi: 'hoy', status: 'borte', kommentar: 'syk' } } });
  like(dom.lagret()[0].resultater.a, { verdi: null, status: 'borte', kommentar: 'syk' }, 'a');
  dom.window.close();
});

test('verdier som ikke passer formen kastes', () => {
  const dom = lagDom(); const w = dom.window;
  w.lagreVurdering({ tittel: 'P', dato: '2026-10-19', fag: 'Norsk', trinn: 9, form: 'karakter',
    resultater: { a: { verdi: 7 }, b: { verdi: 'hoy' } } });
  like(dom.lagret()[0].resultater, {}, 'karakter 7 og «hoy» er ikke karakterer');
  dom.window.close();
});

test('fritekst: teksten er verdien, og det er ingen kommentar', () => {
  const dom = lagDom(); const w = dom.window;
  w.lagreVurdering({ tittel: 'P', dato: '2026-10-19', fag: 'Norsk', trinn: 9, form: 'tekst',
    resultater: { a: { verdi: '  Sterk muntlig  ', kommentar: 'skal bort' } } });
  like(dom.lagret()[0].resultater.a, { verdi: 'Sterk muntlig', status: null, kommentar: '' }, 'a');
  dom.window.close();
});

test('uten tittel, dato, fag eller trinn lagres ingenting', () => {
  const dom = lagDom(); const w = dom.window;
  const hode = { tittel: 'P', dato: '2026-10-19', fag: 'Norsk', trinn: 9, form: 'tekst' };
  ['tittel', 'dato', 'fag', 'trinn'].forEach(k => {
    sant(w.lagreVurdering({ ...hode, [k]: '' }) === null, 'lagret uten ' + k);
  });
  like(dom.store.getItem('lp_vurderinger'), '[]', 'ingenting lagret');
  dom.window.close();
});

test('formen låses når første verdi er ført', () => {
  const dom = lagDom({ vurderinger: [PROVE] }); const w = dom.window;
  sant(w.vurderingFormLaast(PROVE), 'karakter ført → låst');
  w.lagreVurdering({ ...PROVE, form: 'maal' });
  like(dom.lagret()[0].form, 'karakter', 'formen ble ikke byttet');
  like(dom.lagret()[0].resultater.a.verdi, 4, 'karakteren står');
  dom.window.close();
});

test('bare status og kommentar låser ikke formen', () => {
  const dom = lagDom(); const w = dom.window;
  sant(!w.vurderingFormLaast({ resultater: { a: { verdi: null, status: 'borte', kommentar: 'x' } } }), 'skulle ikke låses');
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// MODALEN
// ══════════════════════════════════════════════════════════════

test('modalen gir én rad per elev på trinnet med faget', () => {
  const dom = lagDom(); const w = dom.window; const doc = w.document;
  w.nyVurdering();
  doc.getElementById('vuFag').value = 'Norsk';
  w.vurderingFagEndret();
  doc.querySelectorAll('input[name="vuTrinnCheck"]').forEach(cb => { cb.checked = cb.value === '9'; });
  w.vurderingTrinnEndret();
  const rader = [...doc.querySelectorAll('#vuElever .vu-rad')].map(r => r.dataset.elevId);
  like(rader, ['a', 'b'], 'radene');
  dom.window.close();
});

test('karakterknapp, status og lagring gjennom modalen', () => {
  const dom = lagDom(); const w = dom.window; const doc = w.document;
  w.nyVurdering();
  doc.getElementById('vuTittel').value = 'Kapittelprøve';
  doc.getElementById('vuFag').value = 'Norsk';
  w.vurderingFagEndret();
  doc.querySelectorAll('input[name="vuTrinnCheck"]').forEach(cb => { cb.checked = cb.value === '9'; });
  doc.getElementById('vuForm').value = 'karakter';
  w.vurderingHodeEndret();
  doc.querySelector('.vu-rad[data-elev-id="a"] .vu-valg[data-verdi="5"]').click();
  sant(doc.getElementById('vuForm').disabled, 'formen skal låses straks en verdi er valgt');
  const st = doc.querySelector('.vu-rad[data-elev-id="b"] .vu-status');
  st.value = 'fritatt'; st.dispatchEvent(new w.Event('change'));
  sant(doc.querySelector('.vu-rad[data-elev-id="b"] .vu-valg').disabled, 'verdiknappene skal være av når status er satt');
  w.lagreVurderingFraModal();
  const v = dom.lagret()[0];
  like(v.resultater, { a: { verdi: 5, status: null, kommentar: '' }, b: { verdi: null, status: 'fritatt', kommentar: '' } }, 'resultater');
  sant(!doc.getElementById('vurderingOverlay').classList.contains('open'), 'modalen skal lukkes');
  dom.window.close();
});

test('klikk på valgt karakter fjerner den igjen', () => {
  const dom = lagDom({ vurderinger: [PROVE] }); const w = dom.window; const doc = w.document;
  w.openVurdering('v1');
  doc.querySelector('.vu-rad[data-elev-id="a"] .vu-valg[data-verdi="4"]').click();
  sant(!doc.querySelector('.vu-rad[data-elev-id="a"] .vu-valg.valgt'), 'ingen valgt');
  dom.window.close();
});

test('Avbryt endrer ingenting', () => {
  const dom = lagDom({ vurderinger: [PROVE] }); const w = dom.window; const doc = w.document;
  w.openVurdering('v1');
  doc.querySelector('.vu-rad[data-elev-id="a"] .vu-valg[data-verdi="6"]').click();
  w.closeOverlay('vurderingOverlay');
  like(w.eval('vurderinger')[0].resultater.a.verdi, 4, 'utkastet nådde ikke dataene');
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// ELEVLOGGEN
// ══════════════════════════════════════════════════════════════

test('elevloggen viser resultatet under faget, også uten førte timer', () => {
  const dom = lagDom({ vurderinger: [PROVE] }); const w = dom.window; const doc = w.document;
  const c = doc.getElementById('elevloggViewContent');
  w.renderElevloggInnhold('a', c);
  const blokk = [...c.querySelectorAll('.logg-subject-block')].find(b => b.textContent.includes('Norsk'));
  sant(blokk, 'fant ingen Norsk-blokk');
  const rad = blokk.querySelector('.logg-vurdering');
  sant(rad && rad.textContent.includes('Novelleprøve'), 'tittelen mangler');
  sant(rad.textContent.includes('Karakter 4'), 'karakteren mangler');
  sant(rad.textContent.includes('God struktur'), 'kommentaren mangler');
  w.renderElevloggInnhold('b', c);
  sant(c.textContent.includes('Ikke levert'), 'statusen mangler hos b');
  dom.window.close();
});

test('en elev uten resultat får ingen vurderingsrad', () => {
  const dom = lagDom({ vurderinger: [PROVE] }); const w = dom.window; const doc = w.document;
  const c = doc.getElementById('elevloggViewContent');
  w.renderElevloggInnhold('c', c);
  sant(!c.querySelector('.logg-vurdering'), 'c var ikke med');
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// SYNK, BACKUP OG PAPIRKURV
// ══════════════════════════════════════════════════════════════

test('vurderingene synkes', () => {
  sant(/'lp_vurderinger'/.test(sync.match(/const SYNK_NOKLER = \[[\s\S]*?\];/)[0]), 'mangler i SYNK_NOKLER');
});

test('bare full backup tar med vurderingene', () => {
  sant(/if \(medNavn\) data\.vurderinger = vurderinger;/.test(js), 'full backup');
  sant(/data\.vurderinger\)\s+localStorage\.setItem\('lp_vurderinger'/.test(js), 'import');
});

test('en slettet vurdering går i papirkurven og kan hentes tilbake', () => {
  const dom = lagDom({ vurderinger: [PROVE] }); const w = dom.window;
  w.slettVurdering('v1');
  like(dom.lagret(), [], 'slettet');
  const pk = w.eval('papirkurv');
  like(pk[0].type, 'vurdering', 'i papirkurven');
  w.gjenopprettFraPapirkurv(pk[0].id);
  like(w.eval('vurderinger')[0].resultater.a.verdi, 4, 'tilbake med resultatene');
  dom.window.close();
});

test('slettes eleven, følger resultatene med til papirkurven og tilbake', () => {
  const dom = lagDom({ vurderinger: [PROVE] }); const w = dom.window;
  w.deleteStudent('a');
  sant(!('a' in dom.lagret()[0].resultater), 'resultatet skal ut av vurderingen');
  const pk = w.eval('papirkurv');
  w.gjenopprettFraPapirkurv(pk[0].id);
  like(w.eval('vurderinger')[0].resultater.a.verdi, 4, 'resultatet er tilbake');
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// BARE PC
// ══════════════════════════════════════════════════════════════

test('menypunktet er bare på PC', () => {
  sant(/class="meny-item desktop-kun" id="menyVurderinger"/.test(html), 'menypunktet må ha desktop-kun');
});

test('visningen byttes inn og ut', () => {
  const dom = lagDom({ vurderinger: [PROVE] }); const w = dom.window; const doc = w.document;
  w.setView('vurderinger');
  sant(doc.getElementById('vurderingerView').style.display === '', 'synlig');
  sant(doc.getElementById('weekDayView').style.display === 'none', 'kalenderen skjult');
  sant(doc.getElementById('menyVurderinger').classList.contains('active'), 'menyen markert');
  like(doc.querySelectorAll('.vu-liste-rad').length, 1, 'én vurdering i lista');
  w.setView('week');
  sant(doc.getElementById('vurderingerView').style.display === 'none', 'skjult igjen');
  dom.window.close();
});

test('modalen blir stående ved klikk utenfor (arbeidsmodal)', () => {
  sant(/id="vurderingOverlay">\s*<div class="event-modal/.test(html), 'må være en .event-modal');
});

// ── Kjør ───────────────────────────────────────────────────────
console.log('\nVurderinger — elevliste, lagring, låst form, elevlogg, synk og papirkurv\n');
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK   ' + navn); }
  catch (e) { alle = false; console.log('  FEIL ' + navn + '\n       ' + e.message); }
}
console.log('\n' + (alle ? 'Alle tester passerte.' : 'Noen tester feilet.') + '\n');
process.exit(alle ? 0 : 1);
