// Tester at brukertekst aldri tolkes som HTML (5. nov 2026).
//
// Mange visninger bygger markup med maler og innerHTML. Et elevnavn, et
// fag, en fridag eller et gjøremål med «<» i ble derfor tolket som HTML.
// Det ødela visningen, og en importert eller synket fil kunne kjøre kode
// på siden der passfrasen og elevnavnene ligger. Nå går alt gjennom esc().
//
// Testen fyller hver kilde med samme ondsinnede tekst, tegner visningene
// og sjekker to ting:
//   1. det finnes ingen <img onerror> og ingen <b> i dokumentet, og
//   2. teksten står der som tekst, så esc() ikke bare har slukt den.
//
// Bekreftet ved å bryte: fjern esc() fra én mal, og testen for den
// visningen slår ut.

const fs   = require('fs');
const path = require('node:path').join(__dirname, '..') + '/';
const { JSDOM } = require('jsdom');
const crypto = require('crypto');

const html = fs.readFileSync(path + 'index.html', 'utf8');
const js   = fs.readFileSync(path + 'app.js', 'utf8');
const sync = fs.readFileSync(path + 'sync.js', 'utf8');

const htmlInline = html
  .replace(/<script src="app\.js"><\/script>/, '<script>' + js + '</script>')
  .replace(/<script type="module">[\s\S]*?<\/script>/g, '')
  .replace(/<script src="sync\.js"><\/script>/, '')
  .replace(/<script>\s*if \(window\.supabaseJs\)[\s\S]*?<\/script>/, '');

// Én streng som bryter alt den kan: en tagg med kode, en tagg til, og
// tegn som må escapes i både tekst og attributter.
const FARLIG = `<img src=x onerror="window.__xss=1"><b>fet</b> & "sitat" 'apo'`;

function lagStore(seed = {}) {
  const data = { ...seed };
  return {
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; },
    clear: () => { Object.keys(data).forEach(k => delete data[k]); },
    key: i => Object.keys(data)[i] ?? null,
    get length() { return Object.keys(data).length; },
    _alt: () => data
  };
}

function kjor(navn, sjekk) {
  const dom = new JSDOM(htmlInline, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { value: lagStore(), writable: false });
      w.alert = () => {};
      w.confirm = () => true;
    }
  });
  try {
    dom.window.hent = uttrykk => dom.window.eval(uttrykk);
    sjekk(dom.window);
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

// Ingen tagger fra den farlige teksten, og teksten synlig som tekst
function rent(el, hva) {
  sant(el, `${hva}: fant ikke elementet`);
  sant(!el.querySelector('img'), `${hva}: <img> fra brukertekst ble tolket som HTML`);
  sant(!el.querySelector('b'), `${hva}: <b> fra brukertekst ble tolket som HTML`);
}
function synlig(el, hva) {
  sant(el.textContent.includes('<b>fet</b>'), `${hva}: teksten vises ikke som tekst`);
}

// Data med farlig tekst i alle kilder, lagt inn før visningene tegnes
function fyll(w) {
  w.eval(`
    const H = ${JSON.stringify(FARLIG)};
    const idag = isoDate(TODAY);
    // Standardskoleåret har passert — uten dette tegnes ingen timer
    skoleaar.start = '2000-01-01'; skoleaar.slutt = '2099-12-31';
    allStudents.push({ id: 's1', navn: H, trinn: 9, startDato: '2000-01-01' });
    for (let d = 0; d < 7; d++) {
      events.push({ id: 100 + d, title: H, category: 'undervisning', recurs: true,
                    weekday: d, start: '08:30', end: '09:15', students: ['s1'],
                    room: H, gyldigFra: '2000-01-01' });
      events.push({ id: 200 + d, title: 'Norsk', category: 'undervisning', recurs: true,
                    weekday: d, sessionType: 'enetime', start: '10:00', end: '10:45',
                    students: ['s1'], gyldigFra: '2000-01-01' });
    }
    setLesson(100 + ukedagIndeks(TODAY), idag, { tema: H, notes: H, attendance: { s1: [true] }, studentNotes: {} });
    // Fridagen legges på en annen dag i samme uke — på en fridag tegnes
    // ingen timer, og da ville testen av timetittelen ikke sett noe
    const man = getMonday(TODAY);
    const friDato = new Date(man); friDato.setDate(man.getDate() + (isoDate(man) === idag ? 1 : 0));
    fridager.push({ id: 'f1', tittel: H, type: 'fridag', fra: isoDate(friDato), til: isoDate(friDato) });
    todos.push({ id: 't1', tittel: H, text: H, status: 'ferdig', merke: H });
    todos.push({ id: 't2', tittel: H, text: H, status: 'ikke_startet', merke: H });
    leggIPapirkurv('gjøremål', H, { todo: { id: 't3', tittel: H } });
  `);
}

console.log('\nEscaping av brukertekst\n');
let alle = true;

alle &= kjor('esc() gjør om alle fem tegnene og tåler null', w => {
  sant(w.hent(`esc('<a href="x">&\\'</a>')`) === '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;', 'feil utdata fra esc()');
  sant(w.hent('esc(null)') === '' && w.hent('esc(undefined)') === '', 'null og undefined skal bli tom streng');
  sant(w.hent('esc(9)') === '9', 'tall skal bli tekst');
});

alle &= kjor('ukesvisning, dagshoder og legende', w => {
  fyll(w);
  w.eval('render()');
  const grid = w.document.getElementById('calGrid');
  rent(grid, 'kalendergridet');
  sant(grid.querySelectorAll('.event').length > 0, 'ingen hendelser tegnet — testen ser ikke det den skal');
  synlig(grid.querySelector('.event-title'), 'timetittelen');
  rent(w.document.getElementById('dayHeaders'), 'dagshodene');
  synlig(w.document.getElementById('dayHeaders'), 'fridagen i dagshodet');
  rent(w.document.getElementById('legend'), 'legenden');
  synlig(w.document.getElementById('legend'), 'faget i legenden');
});

alle &= kjor('månedsvisning', w => {
  fyll(w);
  w.eval(`setView('month')`);
  const m = w.document.getElementById('monthView');
  rent(m, 'månedsvisningen');
  synlig(m, 'fridagen i månedsvisningen');
});

alle &= kjor('elevtabell og fagdetaljer', w => {
  fyll(w);
  w.eval(`setView('elever'); renderElevView(); toggleElevDetalj('s1')`);
  const v = w.document.getElementById('elevAdminView');
  rent(v, 'elevtabellen');
  synlig(v, 'elevnavnet');
});

alle &= kjor('elevlogg', w => {
  fyll(w);
  const c = w.document.createElement('div');
  w.document.body.appendChild(c);
  w.renderElevloggInnhold('s1', c);
  rent(c, 'elevloggen');
  synlig(c.querySelector('.logg-subject-title'), 'fagtittelen i elevloggen');
});

alle &= kjor('datalister for fag, tema og merker', w => {
  fyll(w);
  w.eval(`updateFagDatalist(); openTodoForm()`);
  const fag = w.document.querySelector('#fagList option');
  sant(fag && fag.value === FARLIG, 'fagforslaget skal ha teksten uendret som verdi');
  const merke = w.document.querySelector('#todoMerkeListe option');
  sant(merke && merke.value === FARLIG, 'merkeforslaget skal ha teksten uendret som verdi');
  rent(w.document.getElementById('fagList'), 'fagforslagene');
  rent(w.document.getElementById('todoMerkeListe'), 'merkeforslagene');
});

alle &= kjor('Min side: skolerute, papirkurv, skjulte gjøremål og statistikk', w => {
  fyll(w);
  w.eval(`renderSkolerute(); renderPapirkurv(); renderSkjulteGjøremål(); renderUndervisningStatistikk()`);
  const rute = w.document.getElementById('skoleruteTabell');
  rent(rute, 'skoleruta'); synlig(rute, 'fridagen i skoleruta');
  const pk = w.document.getElementById('papirkurvListe');
  rent(pk, 'papirkurven'); synlig(pk, 'tittelen i papirkurven');
  const skjult = w.document.getElementById('skjulteGjøremålListe');
  rent(skjult, 'skjulte gjøremål'); synlig(skjult, 'tittelen på det fullførte gjøremålet');
  rent(w.document.getElementById('undervisningStatistikk'), 'statistikken');
});

alle &= kjor('synkstatus viser serverens feilmelding som tekst', w => {
  w.eval(sync.replace(/^const /gm, 'var ').replace(/^let /gm, 'var '));
  w.eval(`settStatus('feil', ${JSON.stringify(FARLIG)})`);
  const boks = w.document.getElementById('synkStatus');
  rent(boks, 'synkstatusen');
  synlig(boks, 'feilmeldingen');
});

alle &= kjor('ingen <img onerror> fra brukertekst noe sted etter alt over', w => {
  fyll(w);
  w.eval(`render(); setView('month'); setView('elever'); renderSkolerute(); renderPapirkurv(); renderSkjulteGjøremål()`);
  sant(!w.document.querySelector('img[onerror]'), 'en <img onerror> fra brukerdata står i dokumentet');
});

// ── Supabase lastes fra repoet, med fast versjon ──
alle &= kjor('ingen skript hentes fra andre adresser', () => {
  const eksterne = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(m => m[1]).filter(s => /^(https?:)?\/\//.test(s));
  sant(!eksterne.length, 'eksterne skript i index.html: ' + eksterne.join(', '));
  const importer = [...html.matchAll(/import\s[^;]*?from\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
  sant(importer.length > 0, 'fant ingen import av Supabase — har lastemåten endret seg?');
  importer.forEach(i => sant(i.startsWith('./vendor/'), 'import fra utenfor vendor/: ' + i));
});

alle &= kjor('vendor-fila finnes og stemmer med sjekksummen i vendor/README.md', () => {
  const imp = html.match(/from\s+'\.\/(vendor\/[^']+)'/)[1];
  const fil = fs.readFileSync(path + imp);
  const readme = fs.readFileSync(path + 'vendor/README.md', 'utf8');
  const sum = crypto.createHash('sha256').update(fil).digest('hex');
  sant(readme.includes(sum), `sjekksummen til ${imp} (${sum}) står ikke i vendor/README.md`);
  sant(/export\s*\{[^}]*createClient/.test(fil.toString('utf8').slice(-400)), 'vendor-fila eksporterer ikke createClient');
});

console.log('\n' + (alle ? 'Alle tester passerte.' : 'Noen tester feilet.') + '\n');
process.exit(alle ? 0 : 1);
