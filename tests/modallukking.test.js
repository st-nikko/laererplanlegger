// Hvordan modaler lukkes.
//
// Klikk utenfor lukket tidligere alle overlegg. På arbeidsmodalene — der
// man skriver — var det for lett å bomme, og et bomklikk kostet det man
// hadde skrevet. Nå gjelder klikk-utenfor bare de små dialogene, og
// Escape er lagt til som vei ut av resten.
//
// Testene her vokter begge halvdeler, og at ingen modal blir umulig å
// lukke: fjernes Escape-lytteren uten at klikk-utenfor kommer tilbake,
// slår «Escape lukker …» ut.

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

function lagDom() {
  const dom = new JSDOM(htmlInline, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { value: lagStore(), writable: false });
      if (!w.crypto) w.crypto = {};
      w.crypto.randomUUID = () => 'uuid-test';
      w.alert = () => {}; w.confirm = () => true;
    }
  });
  return dom;
}

// Klikk på selve overlegget, altså utenfor den hvite boksen
function klikkUtenfor(w, id) {
  const el = w.document.getElementById(id);
  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
}

function trykkEscape(w) {
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

const apen = (w, id) => w.document.getElementById(id).classList.contains('open');

const tester = [];
function test(navn, fn) { tester.push([navn, fn]); }
function sant(v, hva) { if (!v) throw new Error(hva); }

// Overleggene delt etter hvilken modal de inneholder. Rekkefølgen speiler
// index.html.
const SMAADIALOGER  = ['planfestetOverlay', 'overtidOverlay', 'afterSaveOverlay'];
const ARBEIDSMODALER = ['eventFormOverlay', 'planOverlay', 'elevloggOverlay',
                        'todoFormOverlay', 'skjulteGjøremålOverlay', 'studentFormOverlay'];

test('klikk utenfor lukker de små dialogene', () => {
  const dom = lagDom(); const w = dom.window;
  SMAADIALOGER.forEach(id => {
    w.document.getElementById(id).classList.add('open');
    klikkUtenfor(w, id);
    sant(!apen(w, id), id + ' skulle lukket seg — der går ingenting tapt');
  });
  dom.window.close();
});

test('klikk utenfor lukker IKKE arbeidsmodalene', () => {
  const dom = lagDom(); const w = dom.window;
  ARBEIDSMODALER.forEach(id => {
    w.document.getElementById(id).classList.add('open');
    klikkUtenfor(w, id);
    sant(apen(w, id), id + ' skal bli stående — det er her man skriver');
  });
  dom.window.close();
});

test('Escape lukker uansett hvilken modal det er', () => {
  const dom = lagDom(); const w = dom.window;
  [...SMAADIALOGER, ...ARBEIDSMODALER].forEach(id => {
    w.document.getElementById(id).classList.add('open');
    trykkEscape(w);
    sant(!apen(w, id), id + ' skal kunne lukkes med Escape');
  });
  dom.window.close();
});

test('Escape tar det øverste når to står åpne', () => {
  const dom = lagDom(); const w = dom.window;
  // eventFormOverlay står før planOverlay i index.html
  w.document.getElementById('eventFormOverlay').classList.add('open');
  w.document.getElementById('planOverlay').classList.add('open');

  trykkEscape(w);
  sant(!apen(w, 'planOverlay'), 'den øverste skal lukkes først');
  sant(apen(w, 'eventFormOverlay'), 'den under skal bli stående');

  trykkEscape(w);
  sant(!apen(w, 'eventFormOverlay'), 'neste Escape tar den under');
  dom.window.close();
});

test('Escape uten noe åpent gjør ingenting', () => {
  const dom = lagDom(); const w = dom.window;
  trykkEscape(w);   // skal ikke kaste
  sant(w.document.querySelectorAll('.overlay.open').length === 0, 'ingenting skal ha åpnet seg');
  dom.window.close();
});

test('hver modal har fortsatt en synlig vei ut', () => {
  // Musefri lukking er én ting; knappen må finnes også. Uten denne kunne
  // man fjerne × fra en modal og bare Escape ville stå igjen.
  const dom = lagDom(); const w = dom.window;
  [...SMAADIALOGER, ...ARBEIDSMODALER].forEach(id => {
    const el = w.document.getElementById(id);
    const knapper = [...el.querySelectorAll('button')];
    const lukker = knapper.some(b => (b.getAttribute('onclick') || '').includes("closeOverlay('" + id + "')"));
    sant(lukker, id + ' mangler en knapp som lukker den');
  });
  dom.window.close();
});

// ── Kjør ───────────────────────────────────────────────────────
console.log('\nModallukking — klikk utenfor og Escape\n');
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK   ' + navn); }
  catch (e) { alle = false; console.log('  FEIL ' + navn + '\n       ' + e.message); }
}
console.log('\n' + (alle ? 'Alle tester passerte.' : 'Noen tester feilet.') + '\n');
process.exit(alle ? 0 : 1);
