// Lunsjskillet i kalenderen.
//
// Poenget er å dele dagen i formiddag og ettermiddag uten at klokkeslettet
// skrives inn noe sted: lunsjen er den lengste luka mellom to skoletimer,
// og lunsjLuke() finner den ut fra PERIODS. Endrer skolen timeplanen,
// flytter båndet seg med — og PERIODS forblir eneste sted tidene står.
//
// Testen som vokter dette er den første: fasiten regnes ut her, uavhengig
// av implementasjonen, så en hardkodet 11:05–11:35 slår ut.

const fs   = require('fs');
const path = require('node:path').join(__dirname, '..') + '/';
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path + 'index.html', 'utf8');
const js   = fs.readFileSync(path + 'app.js', 'utf8');
const css  = fs.readFileSync(path + 'app.css', 'utf8');

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

const tester = [];
function test(navn, fn) { tester.push([navn, fn]); }
function sant(v, hva) { if (!v) throw new Error(hva); }
function nær(a, b, hva) {
  if (Math.abs(a - b) > 0.5) throw new Error(hva + ': ventet ' + b + ', fikk ' + a);
}

test('lunsjLuke finner den lengste luka, ikke en fast tid', () => {
  const dom = lagDom(); const w = dom.window;
  const perioder = w.eval('PERIODS');

  // Regn ut fasiten her, uavhengig av implementasjonen
  let fasit = null;
  for (let i = 0; i < perioder.length - 1; i++) {
    const fra = w.toDec(perioder[i].end), til = w.toDec(perioder[i + 1].start);
    if (!fasit || til - fra > fasit.til - fasit.fra) fasit = { fra, til };
  }

  const luke = w.lunsjLuke();
  sant(luke, 'lunsjLuke() ga null');
  nær(luke.fra, fasit.fra, 'start');
  nær(luke.til, fasit.til, 'slutt');
  nær(luke.midt, (fasit.fra + fasit.til) / 2, 'midtpunkt');

  // Og med dagens timeplan er det pausen etter 3. time
  nær(luke.fra, w.toDec('11:05'), 'skal treffe pausen etter 3. time');
  nær(luke.til, w.toDec('11:35'), 'skal treffe starten på 4. time');
  dom.window.close();
});

test('båndet dekker hele luka, i hver dagkolonne', () => {
  const dom = lagDom(); const w = dom.window;
  w.setView('week');

  const kolonner = w.document.querySelectorAll('#calGrid .day-col');
  sant(kolonner.length === 5, 'ventet fem dagkolonner, fikk ' + kolonner.length);

  const luke = w.lunsjLuke();
  const px = w.eval('PX_PER_HOUR');
  const ventetTop = (luke.fra - w.eval('GRID_START_H')) * px;
  const ventetHoyde = (luke.til - luke.fra) * px;

  kolonner.forEach((col, i) => {
    const band = col.querySelectorAll('.lunsj-band');
    sant(band.length === 1, 'kolonne ' + i + ' har ' + band.length + ' lunsjbånd, ventet 1');
    nær(parseFloat(band[0].style.top), ventetTop, 'toppen i kolonne ' + i);
    nær(parseFloat(band[0].style.height), ventetHoyde, 'høyden i kolonne ' + i);
  });
  dom.window.close();
});

test('dagsvisningen får den også', () => {
  const dom = lagDom(); const w = dom.window;
  w.setView('day');
  const kolonner = w.document.querySelectorAll('#calGrid .day-col');
  sant(kolonner.length === 1, 'dagsvisning skal ha én kolonne');
  sant(kolonner[0].querySelectorAll('.lunsj-band').length === 1, 'båndet mangler i dagsvisning');
  dom.window.close();
});

test('tidsaksen merker den med ord', () => {
  const dom = lagDom(); const w = dom.window;
  w.setView('week');
  const merker = w.document.querySelectorAll('#calGrid .time-axis .lunsj-merke');
  sant(merker.length === 1, 'ventet ett merke i aksen, fikk ' + merker.length);
  sant(merker[0].textContent.trim() === 'Lunsj', 'merket skal si «Lunsj»');
  dom.window.close();
});

test('merket skjules på mobil, båndet blir', () => {
  // Aksen er 32 px på smal skjerm og har ikke plass til et ord. Båndet er
  // hele poenget og skal stå igjen alene.
  const mobilblokk = css.slice(css.indexOf('@media (max-width: 767px)'));
  sant(/\.lunsj-merke[^}]*display:\s*none/.test(mobilblokk),
       '.lunsj-merke skjules ikke på mobil');
  sant(!/\.lunsj-band[^}]*display:\s*none/.test(mobilblokk),
       '.lunsj-band skal ikke skjules på mobil');
});

test('båndet ligger over de andre flatene og under hendelsene', () => {
  // Ellers deler det en time som krysser lunsjen i to, eller forsvinner
  // under arbeidstidsskyggen.
  const zIndex = (selektor) => {
    const m = css.match(new RegExp('\\' + selektor + '\\s*\\{[^}]*z-index:\\s*(\\d+)'));
    return m ? Number(m[1]) : null;
  };
  const lunsj = zIndex('.lunsj-band');
  sant(lunsj !== null, '.lunsj-band mangler z-index');
  sant(lunsj > zIndex('.work-block'), 'skal ligge over .work-block');
  sant(lunsj > zIndex('.period-band'), 'skal ligge over .period-band');
  sant(lunsj < zIndex('.event'), 'skal ligge under .event');
});

// ── Kjør ───────────────────────────────────────────────────────
console.log('\nLunsjskillet i kalenderen\n');
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK   ' + navn); }
  catch (e) { alle = false; console.log('  FEIL ' + navn + '\n       ' + e.message); }
}
console.log('\n' + (alle ? 'Alle tester passerte.' : 'Noen tester feilet.') + '\n');
process.exit(alle ? 0 : 1);
