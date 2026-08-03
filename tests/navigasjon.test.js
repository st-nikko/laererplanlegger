// «I dag» og logoen som vei tilbake til kalenderen.
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
  dom.window.hent = u => dom.window.eval(u);
  return dom;
}

const tester = [];
function test(navn, fn) { tester.push([navn, fn]); }
function like(a, b, hva) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(hva + ': ventet ' + JSON.stringify(b) + ', fikk ' + JSON.stringify(a));
}
function sant(v, hva) { if (!v) throw new Error(hva); }

test('«I dag» henter deg ut av Elever', () => {
  const dom = lagDom(); const w = dom.window;
  w.setView('elever');
  like(w.hent('currentView'), 'elever', 'utgangspunkt');

  w.goToToday();
  like(w.hent('currentView'), 'week', 'skal lande i ukesvisning');
  sant(w.document.getElementById('weekDayView').style.display !== 'none',
       'kalenderen skal være synlig');
  sant(w.document.getElementById('elevAdminView').style.display === 'none',
       'elevlista skal være skjult');
  dom.window.close();
});

test('«I dag» henter deg ut av Elevlogg og Min side', () => {
  const dom = lagDom(); const w = dom.window;
  ['elevlogg', 'minside'].forEach(v => {
    w.setView(v);
    w.goToToday();
    like(w.hent('currentView'), 'week', 'fra ' + v);
  });
  dom.window.close();
});

test('kalendervisningen beholdes når du allerede er der', () => {
  const dom = lagDom(); const w = dom.window;
  // Det ville vært rart om «I dag» kastet deg fra måned til uke
  w.setView('month');
  w.goToToday();
  like(w.hent('currentView'), 'month', 'månedsvisning skal bestå');

  w.setView('day');
  w.goToToday();
  like(w.hent('currentView'), 'day', 'dagsvisning skal bestå');
  dom.window.close();
});

test('datoene nullstilles uansett visning', () => {
  const dom = lagDom(); const w = dom.window;
  w.setView('week');
  w.changeNav(5);                       // fem uker fram
  const langtFram = w.hent('currentWeekMonday').getTime();

  w.goToToday();
  const naa = w.hent('currentWeekMonday').getTime();
  sant(naa !== langtFram, 'uken skal være tilbakestilt');
  like(naa, w.getMonday(w.hent('TODAY')).getTime(), 'skal stå på inneværende uke');
  dom.window.close();
});

test('sidemenyen markerer kalenderen etterpå', () => {
  const dom = lagDom(); const w = dom.window;
  w.setView('elever');
  sant(w.document.getElementById('menyElever').classList.contains('active'),
       'Elever skal være markert først');

  w.goToToday();
  sant(w.document.getElementById('menyUkesoversikt').classList.contains('active'),
       'Timeplan skal være markert etterpå');
  sant(!w.document.getElementById('menyElever').classList.contains('active'),
       'Elever skal ikke lenger være markert');
  dom.window.close();
});

test('klikk på logoen gjør det samme', () => {
  const dom = lagDom(); const w = dom.window;
  w.setView('minside');
  const logo = w.document.querySelector('.logo');
  sant(logo, 'fant ingen logo');
  sant(logo.getAttribute('onclick'), 'logoen mangler klikkhåndtering');

  logo.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  like(w.hent('currentView'), 'week', 'logoen skal ta deg til kalenderen');
  dom.window.close();
});

test('erKalendervisning skiller riktig', () => {
  const dom = lagDom(); const w = dom.window;
  ['day', 'week', 'month'].forEach(v => sant(w.erKalendervisning(v), v + ' er kalender'));
  ['elever', 'elevlogg', 'minside'].forEach(v => sant(!w.erKalendervisning(v), v + ' er ikke kalender'));
  dom.window.close();
});

// ── Kjør ───────────────────────────────────────────────────────
console.log('\nNavigasjon — vei tilbake til kalenderen\n');
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK   ' + navn); }
  catch (e) { alle = false; console.log('  FEIL ' + navn + '\n       ' + e.message); }
}
console.log('\n' + (alle ? 'Alle tester passerte.' : 'Noen tester feilet.') + '\n');
process.exit(alle ? 0 : 1);
