// Gjøremålsskjemaet.
//
// Beskrivelsesfeltet sto på 90 px i en modal som er 90vh høy (100dvh på
// mobil), så mesteparten av skjemaet var tom flate. Det er ren layout, og
// sandkassen har ingen nettleser som kan måle den — men kjeden som gjør
// veksten mulig kan sjekkes, og det er den som ryker hvis noen endrer
// strukturen uten å tenke på det.

const fs   = require('fs');
const path = require('node:path').join(__dirname, '..') + '/';

const html = fs.readFileSync(path + 'index.html', 'utf8');
const css  = fs.readFileSync(path + 'app.css', 'utf8');

const tester = [];
function test(navn, fn) { tester.push([navn, fn]); }
function sant(v, hva) { if (!v) throw new Error(hva); }

// Hent kroppen til én regel, uten kommentarer.
// Selektoren må stemme *helt*: et delvis søk på «.form-section» ville
// også truffet «#todoFormOverlay .form-section», og da tester man en
// annen regel enn den man tror.
const REGLER = (() => {
  const rein = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const ut = new Map();
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(rein))) {
    const sel = m[1].trim().replace(/\s+/g, ' ');
    if (!ut.has(sel)) ut.set(sel, m[2]);
  }
  return ut;
})();
function regel(selektor) {
  return REGLER.has(selektor) ? REGLER.get(selektor) : null;
}

test('beskrivelsesfeltet har kroken CSS-en henger veksten på', () => {
  sant(/class="form-field todo-tekst-felt"/.test(html),
       'todo-tekst-felt mangler på feltet i index.html');
  sant(/todo-tekst-felt[\s\S]{0,200}id="todoTextInput"/.test(html),
       'klassen sitter ikke på feltet som inneholder #todoTextInput');
});

test('flex-kjeden går hele veien ned til textareaen', () => {
  // .modal-body og .form-section er flex-kolonner fra grunn-CSS-en.
  // Uten flex: 1 på hvert ledd stopper veksten på veien.
  sant(/flex-direction:\s*column/.test(regel('.modal-body') || ''),
       '.modal-body er ikke lenger en flex-kolonne — da kan ingenting vokse i den');
  sant(/flex-direction:\s*column/.test(regel('.form-section') || ''),
       '.form-section er ikke lenger en flex-kolonne');

  const ledd = [
    '#todoFormOverlay .form-section',
    '#todoFormOverlay .todo-tekst-felt',
    '#todoFormOverlay .todo-tekst-felt textarea'
  ];
  ledd.forEach(s => {
    const kropp = regel(s);
    sant(kropp !== null, 'mangler regel for ' + s);
    sant(/flex:\s*1/.test(kropp), s + ' mangler flex: 1');
  });
});

test('textareaen har fortsatt en bunn å stå på', () => {
  // Uten min-height kollapser den til ingenting i en kort modal
  sant(/min-height:\s*\d+px/.test(regel('#todoFormOverlay .todo-tekst-felt textarea') || ''),
       'textareaen mangler min-height');
});

test('modalbreddene er klasser, ikke inline stil', () => {
  // Inline stil slår enhver regel i stilarket, også mobilblokka. Sto
  // width:420px inline, kjempet den mot fullskjermregelen på mobil.
  const modaler = html.match(/<div class="(event-modal|plan-modal|elevlogg-modal)[^"]*"[^>]*>/g) || [];
  const medInline = modaler.filter(m => /style="[^"]*width\s*:/.test(m));
  sant(medInline.length === 0,
       'inline bredde på modal: ' + medInline.join(' '));

  sant(regel('.event-modal--smal'),   '.event-modal--smal mangler i app.css');
  sant(regel('.event-modal--medium'), '.event-modal--medium mangler i app.css');
});

// ── Kjør ───────────────────────────────────────────────────────
console.log('\nGjøremålsskjemaet — beskrivelsen fyller modalen\n');
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK   ' + navn); }
  catch (e) { alle = false; console.log('  FEIL ' + navn + '\n       ' + e.message); }
}
console.log('\n' + (alle ? 'Alle tester passerte.' : 'Noen tester feilet.') + '\n');
process.exit(alle ? 0 : 1);
