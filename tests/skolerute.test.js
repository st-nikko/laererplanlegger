// Redigering av oppføringer i skoleruta.
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

const FRIDAGER = [
  { id: 'f1', fra: '2026-10-05', til: '2026-10-09', tittel: 'Hsutferie', type: 'ferie' },
  { id: 'f2', fra: '2026-12-24', til: '2027-01-02', tittel: 'Juleferie',  type: 'ferie' }
];

function lagDom(fridager = FRIDAGER, bekreftSvar = true) {
  const store = lagStore({ lp_fridager: JSON.stringify(fridager) });
  const dom = new JSDOM(htmlInline, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { value: store, writable: false });
      if (!w.crypto) w.crypto = {};
      let n = 0;
      w.crypto.randomUUID = () => 'ny-' + (++n);
      w.alert = () => {};
      w.confirm = () => bekreftSvar;
    }
  });
  dom.window.hent = u => dom.window.eval(u);
  dom.window.setView('minside');
  dom.window.renderSkolerute();
  return { dom, w: dom.window, store };
}

const tester = [];
function test(navn, fn) { tester.push([navn, fn]); }
function like(a, b, hva) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(hva + ': ventet ' + JSON.stringify(b) + ', fikk ' + JSON.stringify(a));
}
function sant(v, hva) { if (!v) throw new Error(hva); }

test('hver rad har en rediger-knapp', () => {
  const { dom, w } = lagDom();
  const knapper = w.document.querySelectorAll('[data-rediger-fridag]');
  like(knapper.length, 2, 'antall rediger-knapper');
  dom.window.close();
});

test('rediger fyller skjemaet med oppføringen', () => {
  const { dom, w } = lagDom();
  w.redigerFridag('f1');

  like(w.document.getElementById('frigagTittel').value, 'Hsutferie', 'tittel');
  like(w.document.getElementById('frigagType').value,   'ferie',     'type');
  like(w.document.getElementById('frigagFra').value,    '2026-10-05', 'fra');
  like(w.document.getElementById('frigagTil').value,    '2026-10-09', 'til');
  like(w.document.getElementById('fridagLagreBtn').textContent, 'Lagre endring',
       'knappeteksten skal vise modus');
  dom.window.close();
});

test('skrivefeil kan rettes uten å lage duplikat', () => {
  const { dom, w, store } = lagDom();
  w.redigerFridag('f1');
  w.document.getElementById('frigagTittel').value = 'Høstferie';
  w.leggTilFridag();

  const lagret = JSON.parse(store.getItem('lp_fridager'));
  like(lagret.length, 2, 'antall oppføringer skal være uendret');
  const f = lagret.find(x => x.id === 'f1');
  like(f.tittel, 'Høstferie', 'tittelen skal være rettet');
  like(f.fra, '2026-10-05', 'datoene skal være uendret');
  like(f.til, '2026-10-09', 'datoene skal være uendret');
  dom.window.close();
});

test('skjemaet går tilbake til «legg til» etter lagring', () => {
  const { dom, w } = lagDom();
  w.redigerFridag('f1');
  w.leggTilFridag();

  like(w.hent('redigererFridagId'), null, 'redigeringsmodus skal være avsluttet');
  like(w.document.getElementById('fridagLagreBtn').textContent, 'Legg til', 'knappetekst');
  like(w.document.getElementById('frigagTittel').value, '', 'skjemaet skal være tomt');
  like(w.document.getElementById('fridagAvbrytBtn').style.display, 'none', 'avbryt skjules');
  dom.window.close();
});

test('avbryt forlater oppføringen urørt', () => {
  const { dom, w, store } = lagDom();
  w.redigerFridag('f1');
  w.document.getElementById('frigagTittel').value = 'Noe annet';
  w.avbrytFridagRedigering();

  const lagret = JSON.parse(store.getItem('lp_fridager') || '[]');
  const f = (lagret.length ? lagret : FRIDAGER).find(x => x.id === 'f1');
  like(f.tittel, 'Hsutferie', 'tittelen skal være uendret');
  like(w.hent('redigererFridagId'), null, 'modus nullstilt');
  dom.window.close();
});

test('nye oppføringer legges fortsatt til', () => {
  const { dom, w, store } = lagDom();
  w.document.getElementById('frigagTittel').value = 'Planleggingsdag';
  w.document.getElementById('frigagType').value   = 'planlegging';
  w.document.getElementById('frigagFra').value    = '2026-08-17';
  w.leggTilFridag();

  const lagret = JSON.parse(store.getItem('lp_fridager'));
  like(lagret.length, 3, 'ny oppføring skal være lagt til');
  const ny = lagret.find(x => x.tittel === 'Planleggingsdag');
  like(ny.til, '2026-08-17', 'tom til-dato skal settes lik fra-dato');
  dom.window.close();
});

test('endagsoppføring gir tomt til-felt ved redigering', () => {
  const { dom, w } = lagDom([
    { id: 'f3', fra: '2026-08-17', til: '2026-08-17', tittel: 'Planleggingsdag', type: 'planlegging' }
  ]);
  w.redigerFridag('f3');
  like(w.document.getElementById('frigagTil').value, '', 'til = fra skal vises som tomt');
  dom.window.close();
});

test('sletting av raden som redigeres avslutter redigeringen', () => {
  const { dom, w, store } = lagDom();
  w.redigerFridag('f1');
  w.slettFridag('f1');

  like(w.hent('redigererFridagId'), null, 'modus nullstilt');
  const lagret = JSON.parse(store.getItem('lp_fridager'));
  like(lagret.length, 1, 'oppføringen skal være slettet');
  like(w.document.getElementById('fridagLagreBtn').textContent, 'Legg til', 'knappetekst');
  dom.window.close();
});

test('sletting kan avbrytes', () => {
  const { dom, w, store } = lagDom(FRIDAGER, false);   // confirm svarer nei
  w.slettFridag('f1');
  const lagret = JSON.parse(store.getItem('lp_fridager') || 'null');
  like((lagret || FRIDAGER).length, 2, 'ingenting skal være slettet');
  dom.window.close();
});

// ── Kjør ───────────────────────────────────────────────────────
console.log('\nSkolerute — redigering\n');
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK   ' + navn); }
  catch (e) { alle = false; console.log('  FEIL ' + navn + '\n       ' + e.message); }
}
console.log('\n' + (alle ? 'Alle tester passerte.' : 'Noen tester feilet.') + '\n');
process.exit(alle ? 0 : 1);
