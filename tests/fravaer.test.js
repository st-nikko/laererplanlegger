// Haken for «fravær ført i det andre systemet».
//
// Det viktigste denne fila vokter er at haken **ikke** blandes med appens
// egen nærværsføring. `attendance` i lessonData er hvem som var til stede
// i en time; haken er bare en bekreftelse på at du har gjort unna
// føringen i skolens eget system. Blandes de, blir begge feil.
//
// Ellers: at raden står i flukt med kalenderkolonnene (den er verdiløs
// hvis haken havner under feil dag), at dager uten elever ikke får hake,
// og at oversikten på Min side bare ser tre uker tilbake.

const fs   = require('fs');
const path = require('node:path').join(__dirname, '..') + '/';
const { JSDOM } = require('jsdom');

const html  = fs.readFileSync(path + 'index.html', 'utf8');
const js    = fs.readFileSync(path + 'app.js', 'utf8');
const sync  = fs.readFileSync(path + 'sync.js', 'utf8');

const htmlInline = html
  .replace(/<script src="app\.js"><\/script>/, '<script>' + js + '</script>')
  .replace(/<script type="module">[\s\S]*?<\/script>/g, '')
  .replace(/<script src="sync\.js"><\/script>/, '')
  .replace(/<script>\s*if \(window\.supabaseJs\)[\s\S]*?<\/script>/, '');

function lagStore(seed = {}) {
  const data = { ...seed };
  const store = {
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; }
  };
  store._data = data;
  return store;
}

// Skoleåret settes vidt, så testene ikke faller på at dagens dato ligger
// utenfor standardåret 2025/26.
function lagDom(seed = {}) {
  const store = lagStore({
    lp_skoleaar: JSON.stringify({ start: '2020-01-01', slutt: '2030-12-31' }),
    lp_fridager: JSON.stringify([]),
    ...seed
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

// Mandag i uka som vises, som ISO-dato
const mandag = w => w.isoDate(w.eval('currentWeekMonday'));
const rad    = w => w.document.getElementById('fravaerRad');

test('raden har én celle per dag, pluss en tom over tidsaksen', () => {
  const dom = lagDom(); const w = dom.window;
  w.setView('week');
  const celler = rad(w).querySelectorAll('.fravaer-celle');
  sant(celler.length === 5, 'ventet fem dagceller, fikk ' + celler.length);
  sant(rad(w).querySelectorAll('.fravaer-gutter').length === 1, 'mangler tom celle over tidsaksen');
  dom.window.close();
});

test('kolonnene står i flukt med kalenderen', () => {
  // Havner haken under feil dag, er hele raden verre enn ingenting.
  const dom = lagDom(); const w = dom.window;

  w.setView('week');
  const grid = w.document.getElementById('calGrid').style.gridTemplateColumns;
  like(rad(w).style.gridTemplateColumns, grid, 'ukesvisning');

  w.setView('day');
  const gridDag = w.document.getElementById('calGrid').style.gridTemplateColumns;
  like(rad(w).style.gridTemplateColumns, gridDag, 'dagsvisning');
  sant(rad(w).querySelectorAll('.fravaer-celle').length === 1, 'dagsvisning skal ha én celle');
  dom.window.close();
});

test('haken lagres, og bare det som er huket av', () => {
  const dom = lagDom(); const w = dom.window;
  w.setView('week');
  const dato = mandag(w);

  const boks = rad(w).querySelector(`input[data-dato="${dato}"]`);
  sant(boks, 'fant ingen boks for mandag');
  sant(!boks.checked, 'skal starte uhuket');

  boks.checked = true;
  boks.dispatchEvent(new w.Event('change'));
  like(JSON.parse(w.lager.getItem('lp_fravaerFort')), { [dato]: true }, 'etter huking');

  boks.checked = false;
  boks.dispatchEvent(new w.Event('change'));
  like(JSON.parse(w.lager.getItem('lp_fravaerFort')), {}, 'fjernes helt, ikke lagret som false');
  dom.window.close();
});

test('haken overlever en ny last', () => {
  const dom1 = lagDom(); const w1 = dom1.window;
  w1.setView('week');
  const dato = mandag(w1);
  const boks = rad(w1).querySelector(`input[data-dato="${dato}"]`);
  boks.checked = true; boks.dispatchEvent(new w1.Event('change'));
  const lagret = w1.lager.getItem('lp_fravaerFort');
  dom1.window.close();

  const dom2 = lagDom({ lp_fravaerFort: lagret }); const w2 = dom2.window;
  w2.setView('week');
  const boks2 = rad(w2).querySelector(`input[data-dato="${dato}"]`);
  sant(boks2.checked, 'haken skal være satt etter ny last');
  sant(boks2.closest('.fravaer-merke').classList.contains('fort'), 'merket skal vise ført-tilstand');
  dom2.window.close();
});

test('en ødelagt lagret verdi gir tom tilstand, ikke krasj', () => {
  const dom = lagDom({ lp_fravaerFort: '["ikke et objekt"]' }); const w = dom.window;
  w.setView('week');
  like(w.eval('fravaerFort'), {}, 'skal falle tilbake til tomt');
  sant(rad(w).querySelectorAll('.fravaer-celle').length === 5, 'raden skal fortsatt tegnes');
  dom.window.close();
});

test('dager uten elever får ingen hake', () => {
  // Ferie, fridag og planleggingsdag: det finnes ikke noe fravær å føre.
  // Cellen blir stående tom, så kolonnene fortsatt står i flukt.
  const dom = lagDom(); const w = dom.window;
  w.setView('week');
  const man = mandag(w);
  const tir = w.isoDate(new Date(new Date(man + 'T00:00:00').getTime() + 86400000));
  const ons = w.isoDate(new Date(new Date(man + 'T00:00:00').getTime() + 2 * 86400000));

  w.eval(`fridager = ${JSON.stringify([
    { id: 'a', fra: '@MAN@', til: '@MAN@', tittel: 'Ferie',      type: 'ferie' },
    { id: 'b', fra: '@TIR@', til: '@TIR@', tittel: 'Fridag',     type: 'fridag' },
    { id: 'c', fra: '@ONS@', til: '@ONS@', tittel: 'Planlegging', type: 'planlegging' }
  ]).replace('@MAN@', man).replace('@MAN@', man)
    .replace('@TIR@', tir).replace('@TIR@', tir)
    .replace('@ONS@', ons).replace('@ONS@', ons)}`);
  w.render();

  const celler = rad(w).querySelectorAll('.fravaer-celle');
  sant(celler.length === 5, 'cellene skal fortsatt være fem — ellers glir kolonnene');
  [0, 1, 2].forEach(i =>
    sant(!celler[i].querySelector('input'), 'dag ' + i + ' skulle ikke hatt hake'));
  [3, 4].forEach(i =>
    sant(celler[i].querySelector('input'), 'dag ' + i + ' skulle hatt hake'));
  dom.window.close();
});

test('utenfor skoleåret gir ingen haker', () => {
  const dom = lagDom({ lp_skoleaar: JSON.stringify({ start: '2000-01-01', slutt: '2000-06-01' }) });
  const w = dom.window;
  w.setView('week');
  sant(rad(w).querySelectorAll('input').length === 0, 'ingen haker utenfor skoleåret');
  dom.window.close();
});

test('haken er ikke koblet til nærværsføringen i timene', () => {
  // Det bærende skillet: å hake av her skal ikke røre lessonData, og en
  // ført time skal ikke sette haken.
  const dom = lagDom(); const w = dom.window;
  w.setView('week');
  const dato = mandag(w);

  const boks = rad(w).querySelector(`input[data-dato="${dato}"]`);
  boks.checked = true; boks.dispatchEvent(new w.Event('change'));
  like(w.eval('lessonData'), {}, 'haken skal ikke skrive til lessonData');

  w.eval(`setLesson(1, '${dato}', { tema:'Brøk', notes:'', attendance:{ 7:[false] }, studentNotes:{} })`);
  w.render();
  like(Object.keys(w.eval('fravaerFort')), [dato],
       'å føre nærvær i en time skal ikke endre fraværshaken');
  dom.window.close();
});

test('vinduet er kort, og det er med vilje', () => {
  // Denne testen er den eneste som fanger *hvorfor* vinduet finnes.
  //
  // Haken ble innført 19. august 2026. Ser oversikten lenger tilbake enn
  // noen uker, dukker hver eneste skoledag siden august 2025 opp som
  // «mangler» — formelt sant, praktisk verdiløst: fraværet er ført, det er
  // bare ikke huket av her. Skrus FRAVAER_TILBAKE opp til et helt skoleår,
  // er lista ubrukelig igjen.
  //
  // Skal vinduet virkelig utvides, er svaret å lagre datoen funksjonen ble
  // slått på og aldri se forbi den — ikke å heve tallet her.
  const dom = lagDom(); const w = dom.window;
  const vindu = w.eval('FRAVAER_TILBAKE');
  sant(vindu >= 7,  'et vindu under en uke fanger ikke «jeg glemte det forrige torsdag»');
  sant(vindu <= 31, 'vinduet er for langt — se kommentaren i denne testen før du hever det');
  dom.window.close();
});

test('oversikten ser tre uker tilbake, ikke lenger, og ikke i dag', () => {
  const dom = lagDom(); const w = dom.window;
  const dager = w.fravaerSomMangler();
  sant(dager.length > 0, 'ventet noen dager i vinduet');

  const iDag = w.isoDate(w.eval('TODAY'));
  sant(!dager.includes(iDag), 'i dag skal ikke stå på lista');

  const grense = new Date(w.eval('TODAY'));
  grense.setDate(grense.getDate() - w.eval('FRAVAER_TILBAKE'));
  sant(dager.every(k => k >= w.isoDate(grense)), 'ingen dager eldre enn vinduet');
  sant(dager.every(k => w.skalFoereFravaer(new Date(k + 'T00:00:00'))),
       'bare dager det faktisk skal føres på');
  sant(dager.every((k, i) => i === 0 || k < dager[i - 1]), 'nyeste først');
  dom.window.close();
});

test('en huket dag forsvinner fra oversikten', () => {
  const dom = lagDom(); const w = dom.window;
  const forst = w.fravaerSomMangler()[0];
  sant(forst, 'ventet minst én dag');

  w.settFravaerFort(forst, true, null);
  sant(!w.fravaerSomMangler().includes(forst), 'dagen skal være borte fra lista');

  w.setView('minside');
  const knapper = [...w.document.querySelectorAll('#fravaerOversikt .fravaer-mangler-rad')];
  sant(knapper.length === w.fravaerSomMangler().length, 'oversikten skal speile lista');
  dom.window.close();
});

test('tom oversikt sier fra framfor å stå blank', () => {
  const dom = lagDom(); const w = dom.window;
  const alle = {};
  w.fravaerSomMangler().forEach(k => { alle[k] = true; });
  w.eval(`fravaerFort = ${JSON.stringify(alle)}`);
  w.setView('minside');
  const el = w.document.getElementById('fravaerOversikt');
  sant(/Ingenting mangler/.test(el.textContent), 'ventet en tom-melding, fikk: ' + el.textContent);
  dom.window.close();
});

test('nøkkelen synkes og følger med i backup', () => {
  // Uten dette ville PC-en ikke visst hva du huket av på telefonen, og en
  // gjenoppretting fra fil ville nullstilt alt.
  sant(/'lp_fravaerFort'/.test(sync.slice(sync.indexOf('SYNK_NOKLER'), sync.indexOf('];', sync.indexOf('SYNK_NOKLER')))),
       'lp_fravaerFort mangler i SYNK_NOKLER i sync.js');
  sant(/fridager, skoleaar, fravaerFort/.test(js), 'fravaerFort mangler i exportData()');
  sant(/data\.fravaerFort\)\s*localStorage\.setItem\('lp_fravaerFort'/.test(js),
       'importData() leser ikke fravaerFort');
});

// ── Kjør ───────────────────────────────────────────────────────
console.log('\nFravær ført i det andre systemet\n');
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK   ' + navn); }
  catch (e) { alle = false; console.log('  FEIL ' + navn + '\n       ' + e.message); }
}
console.log('\n' + (alle ? 'Alle tester passerte.' : 'Noen tester feilet.') + '\n');
process.exit(alle ? 0 : 1);
