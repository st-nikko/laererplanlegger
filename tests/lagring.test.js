// Tester hva som skjer når lagringen svikter, og forespørselen om varig
// lagring (5. nov 2026).
//
// Før svelget saveToStorage() feilen og skrev den bare til konsollen.
// Ble localStorage full, jobbet man videre uten å vite at ingenting ble
// lagret. Nå:
//   - vises et varsel øverst, og det forsvinner ved neste vellykkede lagring
//   - lastes ingenting opp etter en halvveis lagring (sync.js leser fra
//     localStorage, og skykopien skal ikke overskrives med en blanding)
//   - ber appen nettleseren om varig lagring ved oppstart, og viser svaret
//     på Min side

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

// localStorage som kan slås over til å være full
function lagStore() {
  const data = {};
  const s = {
    full: false,
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => {
      if (s.full) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; }
      data[k] = String(v);
    },
    removeItem: k => { delete data[k]; },
    key: i => Object.keys(data)[i] ?? null,
    get length() { return Object.keys(data).length; },
    _alt: () => data
  };
  return s;
}

async function kjor(navn, oppsett, sjekk) {
  const store = lagStore();
  const dom = new JSDOM(htmlInline, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { value: store, writable: false });
      w.alert = () => {};
      w.confirm = () => true;
      if (oppsett) oppsett(w);
    }
  });
  try {
    await new Promise(r => setTimeout(r, 0));   // la beOmVarigLagring() bli ferdig
    await sjekk(dom.window, store);
    console.log('  OK   ' + navn);
    return true;
  } catch (e) {
    console.log('  FEIL ' + navn + '\n       ' + e.message);
    return false;
  } finally {
    dom.window.close();
  }
}

function sant(v, hva) { if (!v) throw new Error(hva); }

// navigator.storage finnes ikke i jsdom — lag en
function medStorage(persisted, persist) {
  return w => {
    w.__spurt = 0;
    Object.defineProperty(w.navigator, 'storage', {
      value: {
        persisted: async () => persisted,
        persist: async () => { w.__spurt++; return persist; }
      }
    });
  };
}

(async () => {
  console.log('\nLagring\n');
  let alle = true;

  alle &= await kjor('varselet er skjult når lagringen virker', null, (w) => {
    w.eval('saveToStorage()');
    sant(w.document.getElementById('lagringsVarsel').hidden, 'varselet skal være skjult');
  });

  alle &= await kjor('full lagring gir et synlig varsel som sier hva som skjedde', null, (w, store) => {
    store.full = true;
    w.eval(`todos.push({ id: 't1', tittel: 'Ny', status: 'ikke_startet' }); saveToStorage()`);
    const boks = w.document.getElementById('lagringsVarsel');
    sant(!boks.hidden, 'varselet skal vises når lagringen feiler');
    const tekst = boks.textContent;
    sant(/full/.test(tekst), 'teksten skal si at lagringen er full');
    sant(/IKKE lagret/.test(tekst), 'teksten skal si at det ikke er lagret');
    sant(/Eksporter data/.test(tekst), 'teksten skal si hva man gjør');
  });

  alle &= await kjor('varselet forsvinner ved neste vellykkede lagring', null, (w, store) => {
    store.full = true;  w.eval('saveToStorage()');
    store.full = false; w.eval('saveToStorage()');
    sant(w.document.getElementById('lagringsVarsel').hidden, 'varselet skal forsvinne når lagringen virker igjen');
  });

  alle &= await kjor('ingen opplasting etter en lagring som feilet', null, (w, store) => {
    w.eval('var __push = 0; function syncPushDebounced() { __push++; }');
    w.eval('saveToStorage()');
    sant(w.eval('__push') === 1, 'en vellykket lagring skal fortsatt laste opp');
    store.full = true;
    w.eval('saveToStorage()');
    sant(w.eval('__push') === 1, 'en feilet lagring skal ikke laste opp en halvveis skrevet tilstand');
  });

  alle &= await kjor('ber om varig lagring ved oppstart, og viser at den er gitt', medStorage(false, true), (w) => {
    sant(w.__spurt === 1, 'persist() skal kalles én gang ved oppstart');
    sant(w.eval('lagringVarig') === true, 'svaret skal huskes');
    sant(/varig/.test(w.document.getElementById('lagringStatus').textContent), 'Min side skal si at lagringen er varig');
  });

  alle &= await kjor('spør ikke på nytt når lagringen allerede er varig', medStorage(true, true), (w) => {
    sant(w.__spurt === 0, 'persist() skal ikke kalles når persisted() allerede er sann');
  });

  alle &= await kjor('avslag vises på Min side med råd', medStorage(false, false), (w) => {
    const t = w.document.getElementById('lagringStatus').textContent;
    sant(/rydde bort/.test(t) && /hjemskjermen/.test(t), 'Min side skal forklare risikoen og hva man gjør');
  });

  alle &= await kjor('nettleser uten API-et: ingen feil og ingen tekst', null, (w) => {
    sant(w.eval('lagringVarig') === null, 'lagringVarig skal være null uten API');
    sant(w.document.getElementById('lagringStatus').textContent === '', 'ingen statustekst uten API');
  });

  console.log('\n' + (alle ? 'Alle tester passerte.' : 'Noen tester feilet.') + '\n');
  process.exit(alle ? 0 : 1);
})();
