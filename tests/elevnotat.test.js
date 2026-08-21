// Overordnet notat om eleven.
//
// Fritekst som gjelder eleven generelt, ikke en enkelt time. Tre ting
// voktes her, og alle tre er ting som ville gått galt i det stille:
//
//   1. **Egen lagringsnøkkel, ikke et felt på elevobjektet.**
//      `elevlisteUtenNavn()` er en spread — alt som legges på eleven blir
//      med i `lp_students` av seg selv, og dermed inn i synken og i
//      «Eksporter uten navn» uten at noen har tatt stilling til det.
//   2. **Feltet tegnes før den tidlige returen.** Har eleven ingen timer
//      ennå, gikk renderElevloggInnhold() ut med «Ingen registrerte timer»
//      — og notatet ville vært usynlig akkurat når man har mest å skrive.
//   3. **Notatet følger med i papirkurven.** Ellers gir en angret sletting
//      eleven tilbake uten det som var skrevet om ham.

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
  const s = {
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; }
  };
  s._data = data;
  return s;
}

const ELEV = { id: 's1', trinn: 9, startDato: '2020-01-01', arkivert: false, arkivertDato: null };
const TIME = {
  id: 1, title: 'Norsk', category: 'undervisning', recurs: true, weekday: 0,
  start: '08:30', end: '09:15', room: '204', trinn: 9, trinns: [9],
  sessionType: 'gruppe', students: ['s1'], weekPattern: 'every',
  gyldigFra: '2020-01-01', gyldigTil: null
};

function lagDom({ notater = {}, events = [], lessonData = {} } = {}) {
  const store = lagStore({
    lp_students:     JSON.stringify([ELEV]),
    lp_studentNames: JSON.stringify({ s1: 'Kari Nordmann' }),
    lp_elevNotater:  JSON.stringify(notater),
    lp_events:       JSON.stringify(events),
    lp_lessonData:   JSON.stringify(lessonData),
    lp_fridager:     JSON.stringify([]),
    lp_skoleaar:     JSON.stringify({ start: '2020-01-01', slutt: '2030-12-31' })
  });
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

// Tegn elevloggen for s1 og gi tilbake beholderen
function tegn(w) {
  const c = w.document.getElementById('elevloggViewContent');
  w.renderElevloggInnhold('s1', c);
  return c;
}
const felt = w => tegn(w).querySelector('.elevnotat-felt');

// ══════════════════════════════════════════════════════════════
// LAGRING
// ══════════════════════════════════════════════════════════════

test('notatet lagres under sin egen nøkkel', () => {
  const dom = lagDom(); const w = dom.window;
  w.setElevNotat('s1', 'Trenger tett oppfølging i skriving.');
  like(JSON.parse(w.lager.getItem('lp_elevNotater')), { s1: 'Trenger tett oppfølging i skriving.' }, 'lagret');
  dom.window.close();
});

test('notatet havner ALDRI på elevobjektet', () => {
  // elevlisteUtenNavn() er en spread. Et felt på eleven ville blitt med i
  // lp_students av seg selv — inn i synken og i «Eksporter uten navn»
  // uten at noen valgte det.
  const dom = lagDom(); const w = dom.window;
  w.setElevNotat('s1', 'Mor tok kontakt om situasjonen hjemme.');

  const lagretElev = JSON.parse(w.lager.getItem('lp_students'))[0];
  sant(!JSON.stringify(lagretElev).includes('Mor tok kontakt'),
       'notatet lekket inn i lp_students: ' + JSON.stringify(lagretElev));
  like(Object.keys(lagretElev).sort(), ['arkivert', 'arkivertDato', 'id', 'startDato', 'trinn'],
       'elevobjektet har fått et felt det ikke skal ha');
  dom.window.close();
});

test('tomt notat fjerner nøkkelen framfor å lagre tom tekst', () => {
  const dom = lagDom({ notater: { s1: 'Noe' } }); const w = dom.window;
  w.setElevNotat('s1', '   ');
  like(JSON.parse(w.lager.getItem('lp_elevNotater')), {}, 'nøkkelen skulle vært borte');
  dom.window.close();
});

test('notatet overlever en ny last', () => {
  const dom1 = lagDom(); const w1 = dom1.window;
  w1.setElevNotat('s1', 'Sitter best foran.');
  const lagret = w1.lager.getItem('lp_elevNotater');
  dom1.window.close();

  const dom2 = lagDom({ notater: JSON.parse(lagret) }); const w2 = dom2.window;
  sant(felt(w2).value === 'Sitter best foran.', 'notatet kom ikke tilbake');
  dom2.window.close();
});

test('en ødelagt lagret verdi gir tom tilstand, ikke krasj', () => {
  const dom = lagDom(); const w = dom.window;
  w.lager.setItem('lp_elevNotater', '["ikke et objekt"]');
  w.loadFromStorage();
  like(w.eval('elevNotater'), {}, 'skulle falt tilbake til tomt');
  sant(felt(w), 'feltet skal fortsatt tegnes');
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// VISNING
// ══════════════════════════════════════════════════════════════

test('feltet vises selv når eleven ikke har timer ennå', () => {
  // Den tidlige returen i renderElevloggInnhold() tømte containeren før.
  const dom = lagDom({ notater: { s1: 'Ny elev, kommer fra Bjørnhaug.' } });
  const w = dom.window;
  const c = tegn(w);

  sant(/Ingen registrerte timer/.test(c.textContent), 'ventet tom-meldingen for timer');
  const f = c.querySelector('.elevnotat-felt');
  sant(f, 'notatfeltet forsvant sammen med timelista');
  sant(f.value === 'Ny elev, kommer fra Bjørnhaug.', 'notatet mangler innhold');
  dom.window.close();
});

test('feltet står øverst, over timelista', () => {
  const dom = lagDom({
    events: [TIME],
    lessonData: { '1_2026-08-17': { tema: 'Brøk', notes: '', attendance: {}, studentNotes: {} } }
  });
  const w = dom.window;
  const c = tegn(w);
  sant(c.querySelector('.logg-subject-block'), 'timelista mangler — testen tester ikke det den tror');
  sant(c.firstElementChild.classList.contains('elevnotat'), 'notatet skal være første element');
  dom.window.close();
});

test('feltet finnes i begge visningene', () => {
  // renderElevloggInnhold() deles av modalen og fullskjermvisningen
  const dom = lagDom(); const w = dom.window;
  ['elevloggViewContent', 'elevloggContent'].forEach(id => {
    const c = w.document.getElementById(id);
    sant(c, 'fant ikke #' + id);
    w.renderElevloggInnhold('s1', c);
    sant(c.querySelector('.elevnotat-felt'), 'notatfeltet mangler i #' + id);
  });
  dom.window.close();
});

test('uten valgt elev vises ingen boks', () => {
  const dom = lagDom(); const w = dom.window;
  const c = w.document.getElementById('elevloggViewContent');
  w.renderElevloggInnhold('', c);
  sant(!c.querySelector('.elevnotat-felt'), 'feltet skal ikke stå der uten elev');
  dom.window.close();
});

test('fritekst tolkes ikke som markup', () => {
  const dom = lagDom({ notater: { s1: '<img src=x onerror=alert(1)>' } });
  const w = dom.window;
  const c = tegn(w);
  sant(c.querySelector('.elevnotat-felt').value.includes('<img'), 'teksten skal være med som ren tekst');
  sant(!c.querySelector('img'), 'fritekst ble tolket som markup');
  dom.window.close();
});

test('feltet lagrer når det mister fokus', () => {
  const dom = lagDom(); const w = dom.window;
  const f = felt(w);
  f.value = 'Avtalt med mor: ukentlig melding.';
  f.dispatchEvent(new w.Event('blur'));
  like(JSON.parse(w.lager.getItem('lp_elevNotater')), { s1: 'Avtalt med mor: ukentlig melding.' }, 'ikke lagret ved blur');
  dom.window.close();
});

test('lagring rendrer ikke loggen på nytt', () => {
  // En re-render ville bygget textareaen om igjen og kastet markøren og
  // det halvskrevne ordet.
  const dom = lagDom(); const w = dom.window;
  const f = felt(w);
  f.value = 'Første';
  f.dispatchEvent(new w.Event('blur'));
  sant(f.isConnected, 'textareaen ble byttet ut under lagring');
  sant(f.value === 'Første', 'innholdet ble kastet');
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// SYNK, BACKUP OG PAPIRKURV
// ══════════════════════════════════════════════════════════════

test('nøkkelen synkes og følger med i backup', () => {
  const blokk = sync.slice(sync.indexOf('SYNK_NOKLER'), sync.indexOf('];', sync.indexOf('SYNK_NOKLER')));
  sant(/lp_elevNotater/.test(blokk), 'lp_elevNotater mangler i SYNK_NOKLER');
  sant(/\n\s*elevNotater,/.test(js), 'elevNotater mangler i exportData()');
  sant(/data\.elevNotater\)\s*localStorage\.setItem\('lp_elevNotater'/.test(js),
       'importData() leser ikke elevNotater');
});

test('sletting tar notatet med i papirkurven, og gjenoppretting gir det tilbake', () => {
  const dom = lagDom(); const w = dom.window;
  w.setElevNotat('s1', 'Skal ikke gå tapt.');

  w.deleteStudent('s1');
  like(w.eval('elevNotater'), {}, 'notatet skulle vært fjernet sammen med eleven');
  const post = w.eval('papirkurv')[0];
  sant(post && post.data.notat === 'Skal ikke gå tapt.', 'notatet mangler i papirkurven');

  w.gjenopprettFraPapirkurv(post.id);
  sant(w.getElevNotat('s1') === 'Skal ikke gå tapt.', 'notatet kom ikke tilbake');
  dom.window.close();
});

// ── Kjør ───────────────────────────────────────────────────────
console.log('\nOverordnet notat om eleven\n');
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK   ' + navn); }
  catch (e) { alle = false; console.log('  FEIL ' + navn + '\n       ' + e.message); }
}
console.log('\n' + (alle ? 'Alle tester passerte.' : 'Noen tester feilet.') + '\n');
process.exit(alle ? 0 : 1);
