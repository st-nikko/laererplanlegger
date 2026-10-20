// Vurderinger, koblet til elevene (veikart 14, bygget 19. okt 2026).
//
// Det som voktes:
//   - elevlista: hentet fra timene du krysser av (veikart 26), justerbar
//     for hånd, lagret på vurderingen, og de med resultat blir alltid
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

// Norsk har to timer med a og b (mandag og onsdag) og én med d (10. trinn).
const NORSK_ONS = { ...time(5, 'Norsk', ['b', 'a']), weekday: 2, start: '10:15', room: '204' };
const MED_ONS = () => [...EVENTS, NORSK_ONS];

test('timer med samme elever slås sammen til én linje', () => {
  const dom = lagDom({ events: MED_ONS() }); const w = dom.window;
  const linjer = w.timeLinjerForFag('Norsk');
  like(linjer.length, 2, 'to linjer: a+b og d');
  like(linjer[0].elever, ['a', 'b'], 'første linje');
  like(linjer[0].evIds, ['1', '5'], 'mandag og onsdag');
  like(linjer[1].elever, ['d'], 'andre linje');
  dom.window.close();
});

test('linja viser dager, rom, antall og navn', () => {
  const dom = lagDom({ events: MED_ONS() }); const w = dom.window;
  const t = w.timeLinjeTekst(w.timeLinjerForFag('Norsk')[0]);
  like(t.tider, 'Man 08:30 · Ons 10:15', 'tider');
  like(t.rom, '204', 'rom');
  like(t.antall, '2 elever', 'antall');
  like(t.navn, 'Ada, Bo', 'navn');
  dom.window.close();
});

test('arkiverte elever er ikke med på linja', () => {
  const dom = lagDom(); const w = dom.window;
  sant(!w.timeLinjerForFag('Norsk').some(l => l.elever.includes('e')), 'arkivert elev kom med');
  dom.window.close();
});

test('en time som sluttet før vurderingsdatoen er ikke med', () => {
  const ferdig = { ...time(6, 'Matematikk', ['a']), gyldigTil: '2026-09-01' };
  const dom = lagDom({ events: [...EVENTS, ferdig] }); const w = dom.window;
  like(w.timeLinjerForFag('Matematikk', '2026-10-20').length, 1, 'bare c sin time');
  like(w.timeLinjerForFag('Matematikk', '2026-08-20').length, 2, 'gjaldt i august');
  dom.window.close();
});

test('elevlista er lista på vurderingen, pluss de med resultat', () => {
  const dom = lagDom(); const w = dom.window;
  const ider = w.eleverForVurdering({ elever: ['b', 'a'], resultater: { c: { verdi: 3 }, d: { verdi: null, status: null, kommentar: '' } } }).map(s => s.id);
  like(ider, ['a', 'b', 'c'], 'a og b fra lista, c fordi hun har resultat, ikke d (tom rad)');
  dom.window.close();
});

const KROPPSOVING = { ...time(4, 'Kroppsøving', ['a', 'c', 'd']), trinns: [8, 9, 10] };

test('trinnene leses ut fra elevene ved lagring', () => {
  const dom = lagDom({ events: [...EVENTS, KROPPSOVING] }); const w = dom.window;
  w.lagreVurdering({ tittel: 'Volleyball', dato: '2026-10-19', fag: 'Kroppsøving', elever: ['a', 'd'], form: 'maal',
    resultater: { a: { verdi: 'hoy' } } });
  like(dom.lagret()[0].trinns, [9, 10], 'a er på 9., d på 10.');
  like(dom.lagret()[0].elever, ['a', 'd'], 'lista er lagret, også d uten resultat');
  dom.window.close();
});

test('en lagret vurdering med ett trinn gjøres om til liste ved lasting', () => {
  const dom = lagDom({ vurderinger: [PROVE] }); const w = dom.window;
  const v = w.eval('vurderinger')[0];
  like(v.trinns, [9], 'trinns');
  sant(!('trinn' in v), 'gammelt felt skal bort');
  dom.window.close();
});

test('en vurdering fra før 20. okt får elevlista fra resultatene', () => {
  const dom = lagDom({ vurderinger: [PROVE] }); const w = dom.window;
  const v = w.eval('vurderinger')[0];
  like(v.elever, ['a', 'b'], 'a og b har resultat');
  like(v.timeIds, [], 'ingen timer valgt');
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
  w.lagreVurdering({ tittel: 'Prøve', dato: '2026-10-19', fag: 'Norsk', form: 'karakter',
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

test('uten tittel, dato eller fag lagres ingenting', () => {
  const dom = lagDom(); const w = dom.window;
  const hode = { tittel: 'P', dato: '2026-10-19', fag: 'Norsk', form: 'tekst' };
  ['tittel', 'dato', 'fag'].forEach(k => {
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

const rader  = doc => [...doc.querySelectorAll('#vuElever .vu-rad')].map(r => r.dataset.elevId);
const linjeCb = doc => [...doc.querySelectorAll('input[name="vuTimeCheck"]')];
function kryss(w, cb, paa) { cb.checked = paa; cb.dispatchEvent(new w.Event('change')); }
function velgFag(w, fag) { w.document.getElementById('vuFag').value = fag; w.vurderingFagEndret(); }

test('modalen viser én linje per elevliste, og ingen elever før du krysser av', () => {
  const dom = lagDom({ events: MED_ONS() }); const w = dom.window; const doc = w.document;
  w.nyVurdering();
  velgFag(w, 'Norsk');
  like(linjeCb(doc).length, 2, 'to linjer');
  sant(!linjeCb(doc).some(c => c.checked), 'ingen krysset av når det er flere');
  like(rader(doc), [], 'tom elevliste');
  kryss(w, linjeCb(doc)[0], true);
  like(rader(doc), ['a', 'b'], 'a og b hentet');
  kryss(w, linjeCb(doc)[1], true);
  like(rader(doc), ['a', 'b', 'd'], 'begge linjene');
  dom.window.close();
});

test('har faget bare én linje, krysses den av med en gang', () => {
  const dom = lagDom(); const w = dom.window; const doc = w.document;
  w.nyVurdering();
  velgFag(w, 'Matematikk');
  sant(linjeCb(doc)[0].checked, 'krysset av');
  like(rader(doc), ['c'], 'c er med');
  dom.window.close();
});

test('kryss av igjen: elevene går ut, men ikke de som har fått noe ført', () => {
  const dom = lagDom({ events: MED_ONS() }); const w = dom.window; const doc = w.document;
  w.nyVurdering();
  velgFag(w, 'Norsk');
  doc.getElementById('vuForm').value = 'karakter'; w.vurderingHodeEndret();
  kryss(w, linjeCb(doc)[0], true);
  doc.querySelector('.vu-rad[data-elev-id="a"] .vu-valg[data-verdi="5"]').click();
  kryss(w, linjeCb(doc)[0], false);
  like(rader(doc), ['a'], 'a har karakter og blir stående, b går ut');
  dom.window.close();
});

test('en elev på to avkryssede linjer blir stående når den ene tas av', () => {
  const felles = { ...time(7, 'Norsk', ['a', 'd'], 10), weekday: 4 };
  const dom = lagDom({ events: [...EVENTS, felles] }); const w = dom.window; const doc = w.document;
  w.nyVurdering();
  velgFag(w, 'Norsk');
  const ab = linjeCb(doc).find(c => c.value === 'a|b');
  const ad = linjeCb(doc).find(c => c.value === 'a|d');
  kryss(w, ab, true); kryss(w, ad, true);
  like(rader(doc), ['a', 'b', 'd'], 'alle tre');
  kryss(w, linjeCb(doc).find(c => c.value === 'a|b'), false);
  like(rader(doc), ['a', 'd'], 'a står på a|d og blir');
  dom.window.close();
});

test('legg til og ta ut elever for hånd', () => {
  const dom = lagDom(); const w = dom.window; const doc = w.document;
  w.nyVurdering();
  velgFag(w, 'Matematikk');
  const sel = doc.getElementById('vuLeggTil');
  sant(![...sel.options].some(o => o.value === 'c'), 'c står allerede i lista');
  sant(![...sel.options].some(o => o.value === 'e'), 'arkivert elev skal ikke kunne legges til');
  sel.value = 'd'; sel.dispatchEvent(new w.Event('change'));
  like(rader(doc), ['c', 'd'], 'd lagt til');
  doc.querySelector('.vu-rad[data-elev-id="c"] .vu-fjern').click();
  like(rader(doc), ['d'], 'c tatt ut');
  doc.getElementById('vuTittel').value = 'Prøve';
  w.lagreVurderingFraModal();
  like(dom.lagret()[0].elever, ['d'], 'lista er lagret');
  like(dom.lagret()[0].trinns, [10], 'trinnet følger eleven');
  dom.window.close();
});

test('å ta ut en elev med resultat sletter resultatet, etter spørsmål', () => {
  const dom = lagDom({ vurderinger: [PROVE] }); const w = dom.window; const doc = w.document;
  let spurt = 0;
  w.confirm = () => { spurt++; return false; };
  w.openVurdering('v1');
  doc.querySelector('.vu-rad[data-elev-id="a"] .vu-fjern').click();
  like(spurt, 1, 'spurte'); like(rader(doc), ['a', 'b'], 'nei → står');
  w.confirm = () => true;
  doc.querySelector('.vu-rad[data-elev-id="a"] .vu-fjern').click();
  w.lagreVurderingFraModal();
  sant(!('a' in dom.lagret()[0].resultater), 'resultatet er borte');
  sant(!dom.lagret()[0].elever.includes('a'), 'og eleven');
  dom.window.close();
});

test('timevalget huskes når vurderingen åpnes igjen', () => {
  const dom = lagDom({ events: MED_ONS() }); const w = dom.window; const doc = w.document;
  w.nyVurdering();
  doc.getElementById('vuTittel').value = 'Muntlig';
  velgFag(w, 'Norsk');
  kryss(w, linjeCb(doc)[1], true);
  w.lagreVurderingFraModal();
  w.openVurdering(dom.lagret()[0].id);
  like(linjeCb(doc).map(c => c.checked), [false, true], 'd sin linje er krysset av');
  like(rader(doc), ['d'], 'og d er i lista');
  dom.window.close();
});

test('elevlista får en overskrift per trinn når den spenner over flere', () => {
  const dom = lagDom({ events: [...EVENTS, KROPPSOVING] }); const w = dom.window; const doc = w.document;
  w.nyVurdering();
  velgFag(w, 'Kroppsøving');
  like([...doc.querySelectorAll('#vuElever .vu-trinn-hdr')].map(h => h.textContent), ['9. trinn', '10. trinn'], 'overskrifter');
  velgFag(w, 'Matematikk');
  like(doc.querySelectorAll('#vuElever .vu-trinn-hdr').length, 0, 'ingen overskrift med ett trinn');
  dom.window.close();
});

test('karakterknapp, status og lagring gjennom modalen', () => {
  const dom = lagDom(); const w = dom.window; const doc = w.document;
  w.nyVurdering();
  doc.getElementById('vuTittel').value = 'Kapittelprøve';
  velgFag(w, 'Norsk');
  kryss(w, linjeCb(doc).find(c => c.value === 'a|b'), true);
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
  like(v.trinns, [9], 'trinnet er lest ut');
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
  sant(!dom.lagret()[0].elever.includes('a'), 'og ut av elevlista');
  const pk = w.eval('papirkurv');
  w.gjenopprettFraPapirkurv(pk[0].id);
  like(w.eval('vurderinger')[0].resultater.a.verdi, 4, 'resultatet er tilbake');
  sant(w.eval('vurderinger')[0].elever.includes('a'), 'og plassen på lista');
  dom.window.close();
});

test('en elev uten resultat får plassen på lista tilbake etter sletting', () => {
  const v = { ...PROVE, elever: ['a', 'b', 'c'] };
  const dom = lagDom({ vurderinger: [v] }); const w = dom.window;
  w.deleteStudent('c');
  sant(!dom.lagret()[0].elever.includes('c'), 'ute');
  w.gjenopprettFraPapirkurv(w.eval('papirkurv')[0].id);
  sant(w.eval('vurderinger')[0].elever.includes('c'), 'tilbake');
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
console.log('\nVurderinger — timevalg og elevliste, lagring, låst form, elevlogg, synk og papirkurv\n');
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK   ' + navn); }
  catch (e) { alle = false; console.log('  FEIL ' + navn + '\n       ' + e.message); }
}
console.log('\n' + (alle ? 'Alle tester passerte.' : 'Noen tester feilet.') + '\n');
process.exit(alle ? 0 : 1);
