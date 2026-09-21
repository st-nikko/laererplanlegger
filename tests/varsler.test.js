// Varsler: manglende vurderingsgrunnlag, orden og atferd (veikart post 25).
//
// En oversikt over hva du har sendt — skolens system er arkivet. Det som
// voktes, er ting som ville gått galt i det stille:
//
//   1. **Egen nøkkel, aldri på elevobjektet.** Ellers følger varslene med
//      i lp_students, og dermed overalt.
//   2. **Utenfor «Eksporter uten navn».** Den anonyme filen er den som
//      deles. Varslene er med i full backup og i synken.
//   3. **Terminen regnes ut av datoen**, mot skoleaar.terminskille.
//   4. **Å registrere et varsel tegner ikke elevloggen på nytt.** Et
//      halvskrevet elevnotat over ville mistet markøren.

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
    removeItem: k => { delete data[k]; }
  };
}

// Datoer regnes ut fra i dag — se tests/README.md
function dagerFra(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const ELEV  = { id: 's1', trinn: 9, startDato: '2000-01-01', arkivert: false, arkivertDato: null };
const ELEV2 = { id: 's2', trinn: 9, startDato: '2000-01-01', arkivert: false, arkivertDato: null };
function time(id, title) {
  return { id, title, category: 'undervisning', recurs: true, weekday: 0, start: '08:30', end: '09:15',
           room: '204', trinn: 9, trinns: [9], sessionType: 'gruppe', students: ['s1'],
           weekPattern: 'every', gyldigFra: '2000-01-01', gyldigTil: null };
}
const EVENTS = [time(1, 'Norsk'), time(2, 'Matte'), { ...time(3, 'Tysk'), students: ['s2'] }];

function lagDom({ varsler, skoleaar } = {}) {
  const seed = {
    lp_students:     JSON.stringify([ELEV, ELEV2]),
    lp_studentNames: JSON.stringify({ s1: 'Kari Nordmann', s2: 'Ola Hansen' }),
    lp_events:       JSON.stringify(EVENTS),
    lp_lessonData:   JSON.stringify({}),
    lp_fridager:     JSON.stringify([]),
    lp_skoleaar:     JSON.stringify(skoleaar || { start: dagerFra(-60), slutt: dagerFra(200) })
  };
  if (varsler !== undefined) seed.lp_varsler = typeof varsler === 'string' ? varsler : JSON.stringify(varsler);
  const store = lagStore(seed);
  const dom = new JSDOM(htmlInline, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { value: store, writable: false });
      if (!w.crypto) w.crypto = {};
      w.crypto.randomUUID = () => 'uuid-test';
      w.alert = () => {}; w.confirm = () => true;
    }
  });
  dom.window.lager = store;
  return dom;
}

const tester = [];
function test(navn, fn) { tester.push([navn, fn]); }
function sant(v, hva) { if (!v) throw new Error(hva); }
function like(a, b, hva) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(hva + ': ventet ' + JSON.stringify(b) + ', fikk ' + JSON.stringify(a));
}
const lagret = w => JSON.parse(w.lager.getItem('lp_varsler') || '{}');
const MED_TERMIN = { start: dagerFra(-60), slutt: dagerFra(200), terminskille: dagerFra(10) };

// ══════════════════════════════════════════════════════════════
// LAGRING
// ══════════════════════════════════════════════════════════════

test('et varsel lagres under sin egen nøkkel', () => {
  const dom = lagDom(); const w = dom.window;
  sant(w.leggTilVarsel('s1', { type: 'orden', dato: dagerFra(-2) }), 'skulle blitt lagret');
  const v = lagret(w).s1;
  sant(Array.isArray(v) && v.length === 1, 'lista mangler: ' + JSON.stringify(lagret(w)));
  like([v[0].type, v[0].fag, v[0].dato], ['orden', null, dagerFra(-2)], 'innholdet');
  dom.window.close();
});

test('varselet havner ALDRI på elevobjektet', () => {
  const dom = lagDom(); const w = dom.window;
  w.leggTilVarsel('s1', { type: 'grunnlag', fag: 'Norsk', dato: dagerFra(-2) });
  const elev = JSON.parse(w.lager.getItem('lp_students')).find(s => s.id === 's1');
  like(Object.keys(elev).sort(), ['arkivert', 'arkivertDato', 'id', 'startDato', 'trinn'], 'elevobjektet har fått et felt');
  dom.window.close();
});

test('vurderingsgrunnlag krever fag, orden og atferd har ikke fag', () => {
  const dom = lagDom(); const w = dom.window;
  sant(!w.leggTilVarsel('s1', { type: 'grunnlag', dato: dagerFra(-1) }), 'grunnlag uten fag ble godtatt');
  sant(w.leggTilVarsel('s1', { type: 'atferd', fag: 'Norsk', dato: dagerFra(-1) }), 'atferd ble avvist');
  like(lagret(w).s1[0].fag, null, 'atferd skal ikke ha fag');
  sant(!w.leggTilVarsel('s1', { type: 'tull', dato: dagerFra(-1) }), 'ukjent type ble godtatt');
  sant(!w.leggTilVarsel('s1', { type: 'orden', dato: '12.11.2026' }), 'ugyldig dato ble godtatt');
  dom.window.close();
});

test('samme varsel to ganger er ett varsel', () => {
  const dom = lagDom(); const w = dom.window;
  w.leggTilVarsel('s1', { type: 'grunnlag', fag: 'Norsk', dato: dagerFra(-1) });
  sant(!w.leggTilVarsel('s1', { type: 'grunnlag', fag: 'Norsk', dato: dagerFra(-1) }), 'duplikat godtatt');
  sant(w.leggTilVarsel('s1', { type: 'grunnlag', fag: 'Matte', dato: dagerFra(-1) }), 'annet fag avvist');
  like(lagret(w).s1.length, 2, 'antall');
  dom.window.close();
});

test('siste varsel slettet fjerner nøkkelen', () => {
  const dom = lagDom(); const w = dom.window;
  w.leggTilVarsel('s1', { type: 'orden', dato: dagerFra(-1) });
  w.slettVarsel('s1', lagret(w).s1[0].id);
  like(lagret(w), {}, 'eleven skulle vært borte fra lista');
  dom.window.close();
});

test('en ødelagt lagret verdi gir tom tilstand, ikke krasj', () => {
  const dom = lagDom({ varsler: '["ikke et objekt"]' }); const w = dom.window;
  like(w.eval('varsler'), {}, 'liste på toppnivå');
  w.lager.setItem('lp_varsler', JSON.stringify({ s1: 'tekst', s2: [{ id: 'a', type: 'orden', fag: null, dato: dagerFra(-1) }] }));
  w.loadFromStorage();
  like(Object.keys(w.eval('varsler')), ['s2'], 'en verdi som ikke er liste skal kastes');
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// SYNK, EKSPORT OG PAPIRKURV
// ══════════════════════════════════════════════════════════════

test('nøkkelen synkes og leses ved import', () => {
  const blokk = sync.slice(sync.indexOf('SYNK_NOKLER'), sync.indexOf('];', sync.indexOf('SYNK_NOKLER')));
  sant(/'lp_varsler'/.test(blokk), 'lp_varsler mangler i SYNK_NOKLER');
  sant(/data\.varsler\)\s*localStorage\.setItem\('lp_varsler'/.test(js), 'importData() leser ikke varsler');
});

function eksporter(w, medNavn) {
  let innhold = null;
  w.Blob = class { constructor(deler) { innhold = deler.join(''); } };
  w.URL.createObjectURL = () => 'blob:test';
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = () => {};
  w.exportData(medNavn);
  return JSON.parse(innhold);
}

test('varslene er med i full backup, men ALDRI i «Eksporter uten navn»', () => {
  const dom = lagDom(); const w = dom.window;
  w.leggTilVarsel('s1', { type: 'grunnlag', fag: 'Norsk', dato: dagerFra(-1) });
  const full = eksporter(w, true);
  sant(full.varsler && full.varsler.s1, 'mangler i full backup');
  const anonym = eksporter(w, false);
  sant(!('varsler' in anonym), 'varslene lekket inn i den anonyme eksporten');
  sant(!JSON.stringify(anonym).includes('grunnlag'), 'spor av varselet i den anonyme eksporten');
  dom.window.close();
});

test('sletting tar varslene med i papirkurven, og gjenoppretting gir dem tilbake', () => {
  const dom = lagDom(); const w = dom.window;
  w.leggTilVarsel('s1', { type: 'orden', dato: dagerFra(-1) });
  w.deleteStudent('s1');
  like(w.getVarsler('s1'), [], 'varslene skulle vært fjernet sammen med eleven');
  const post = w.eval('papirkurv')[0];
  w.gjenopprettFraPapirkurv(post.id);
  like(w.getVarsler('s1').length, 1, 'varselet kom ikke tilbake');
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// TERMIN
// ══════════════════════════════════════════════════════════════

test('terminen regnes ut av datoen mot terminskillet', () => {
  const dom = lagDom({ skoleaar: MED_TERMIN }); const w = dom.window;
  like(w.terminFor(dagerFra(-1)), 1, 'før skillet');
  like(w.terminFor(dagerFra(10)), 2, 'skilledagen er første dag i 2. termin');
  like(w.terminFor(dagerFra(-61)), null, 'før skolestart');
  like(w.terminGrenser(1).slutt, dagerFra(9), '1. termin slutter dagen før skillet');
  dom.window.close();
});

test('uten terminskille er hele året én termin, og det telles ikke ned', () => {
  const dom = lagDom(); const w = dom.window;
  like(w.terminFor(dagerFra(-1)), 0, 'termin uten skille');
  like(w.terminNedtelling(), null, 'nedtelling uten skille');
  dom.window.close();
});

test('nedtellingen regner hele uker og dager', () => {
  const dom = lagDom({ skoleaar: MED_TERMIN }); const w = dom.window;
  const n = w.terminNedtelling();
  like([n.nr, n.dager], [1, 9], 'dager igjen');
  sant(/^1 uke til 1\. termin slutter/.test(n.tekst), n.tekst);
  dom.window.close();
  const dom2 = lagDom({ skoleaar: { ...MED_TERMIN, terminskille: dagerFra(4) } });
  sant(/^3 dager til/.test(dom2.window.terminNedtelling().tekst), dom2.window.terminNedtelling().tekst);
  dom2.window.close();
});

test('terminskillet lagres, og må ligge inne i skoleåret', () => {
  const dom = lagDom(); const w = dom.window;
  const d = w.document;
  w.renderMinSide();
  d.getElementById('skoleaarTerminskille').value = dagerFra(300);
  w.lagreSkoleaar();
  sant(!w.eval('skoleaar').terminskille, 'et skille etter skoleslutt ble godtatt');
  d.getElementById('skoleaarTerminskille').value = dagerFra(30);
  w.lagreSkoleaar();
  like(JSON.parse(w.lager.getItem('lp_skoleaar')).terminskille, dagerFra(30), 'skillet ble ikke lagret');
  d.getElementById('skoleaarTerminskille').value = '';
  w.lagreSkoleaar();
  sant(!('terminskille' in w.eval('skoleaar')), 'et tømt felt skal fjerne skillet');
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// VISNINGENE
// ══════════════════════════════════════════════════════════════

test('Min side viser bare denne terminens varsler, gruppert på type', () => {
  const dom = lagDom({ skoleaar: MED_TERMIN }); const w = dom.window;
  w.leggTilVarsel('s1', { type: 'grunnlag', fag: 'Norsk', dato: dagerFra(-5) });
  w.leggTilVarsel('s2', { type: 'orden', dato: dagerFra(-3) });
  w.leggTilVarsel('s1', { type: 'atferd', dato: dagerFra(15) });   // 2. termin
  w.renderMinSide();
  const el = w.document.getElementById('varselOversikt');
  const titler = [...el.querySelectorAll('.varsel-gruppe-tittel')].map(t => t.textContent);
  like(titler, ['Manglende vurderingsgrunnlag (1)', 'Nedsatt karakter i orden (1)'], 'grupper');
  const rader = [...el.querySelectorAll('.varsel-rad')].map(r => r.textContent);
  sant(/Kari Nordmann · Norsk/.test(rader[0]), rader[0]);
  sant(/Ola Hansen/.test(rader[1]), rader[1]);
  const ned = w.document.getElementById('varselNedtelling');
  sant(/1 uke til 1\. termin slutter/.test(ned.textContent), ned.textContent);
  sant(ned.classList.contains('naer'), 'under tre uker igjen skal markeres');
  dom.window.close();
});

test('uten terminskille viser Min side hele året og ber om skillet', () => {
  const dom = lagDom(); const w = dom.window;
  w.leggTilVarsel('s1', { type: 'orden', dato: dagerFra(-5) });
  w.leggTilVarsel('s1', { type: 'atferd', dato: dagerFra(15) });
  w.renderMinSide();
  like(w.document.querySelectorAll('#varselOversikt .varsel-rad').length, 2, 'hele året');
  sant(/2\. termin starter/.test(w.document.getElementById('varselNedtelling').textContent), 'oppfordringen mangler');
  dom.window.close();
});

function tegn(w, id = 's1') {
  const c = w.document.getElementById('elevloggViewContent');
  w.renderElevloggInnhold(id, c);
  return c;
}

test('elevloggen tilbyr bare fagene eleven har i timeplanen', () => {
  const dom = lagDom(); const w = dom.window;
  const fag = [...tegn(w).querySelectorAll('.elevvarsel-fag option')].map(o => o.value);
  like(fag, ['Matte', 'Norsk'], 'fag for s1');
  dom.window.close();
});

test('fagvelgeren vises bare for vurderingsgrunnlag', () => {
  const dom = lagDom(); const w = dom.window;
  const c = tegn(w);
  const type = c.querySelector('.elevvarsel-type'), fag = c.querySelector('.elevvarsel-fag');
  like(type.value, 'grunnlag', 'forvalgt type');
  sant(fag.style.display !== 'none', 'fag skal vises for grunnlag');
  type.value = 'orden'; type.onchange();
  like(fag.style.display, 'none', 'fag skal skjules for orden');
  dom.window.close();
});

test('å registrere i elevloggen lagrer og tegner bare varselblokka på nytt', () => {
  const dom = lagDom(); const w = dom.window;
  const c = tegn(w);
  const notat = c.querySelector('.elevnotat-felt');
  notat.value = 'Halvskrevet';
  c.querySelector('.elevvarsel-datofelt').value = dagerFra(-2);
  c.querySelector('.elevvarsel-fag').value = 'Norsk';
  c.querySelector('.elevvarsel-knapp').click();
  like(lagret(w).s1.map(v => [v.type, v.fag, v.dato]), [['grunnlag', 'Norsk', dagerFra(-2)]], 'lagret');
  sant(c.querySelector('.elevnotat-felt') === notat, 'notatfeltet ble bygget om — markøren ville gått tapt');
  like(notat.value, 'Halvskrevet', 'halvskrevet tekst');
  const rader = c.querySelectorAll('.elevvarsel-rad');
  like(rader.length, 1, 'raden mangler');
  sant(/Vurderingsgrunnlag · Norsk/.test(rader[0].textContent), rader[0].textContent);
  dom.window.close();
});

test('slett-knappen i elevloggen fjerner varselet', () => {
  const dom = lagDom(); const w = dom.window;
  w.leggTilVarsel('s1', { type: 'orden', dato: dagerFra(-2) });
  const c = tegn(w);
  c.querySelector('.elevvarsel-slett').click();
  like(lagret(w), {}, 'varselet ble ikke slettet');
  like(c.querySelectorAll('.elevvarsel-rad').length, 0, 'raden står igjen');
  dom.window.close();
});

test('varsler fra en annen termin dempes i elevloggen', () => {
  const dom = lagDom({ skoleaar: MED_TERMIN }); const w = dom.window;
  w.leggTilVarsel('s1', { type: 'orden', dato: dagerFra(-2) });
  w.leggTilVarsel('s1', { type: 'atferd', dato: dagerFra(15) });
  const rader = [...tegn(w).querySelectorAll('.elevvarsel-rad')];
  like(rader.map(r => r.classList.contains('elevvarsel-rad--tidligere')), [true, false], 'nyeste først, 2. termin dempet');
  sant(/1\. termin/.test(rader[1].textContent), rader[1].textContent);
  dom.window.close();
});

test('varselfeltet vises også for en elev uten timer', () => {
  const dom = lagDom(); const w = dom.window;
  sant(tegn(w, 's2').querySelector('.elevvarsler'), 'mangler for elev uten førte timer');
  dom.window.close();
});

// ── Kjør ───────────────────────────────────────────────────────
console.log('\nVarsler om vurderingsgrunnlag, orden og atferd\n');
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK   ' + navn); }
  catch (e) { alle = false; console.log('  FEIL ' + navn + '\n       ' + e.message); }
}
console.log(alle ? '\nAlle tester passerte.\n' : '\nNoen tester feilet.\n');
process.exit(alle ? 0 : 1);
