// Gjøremål: skjemaet, merkene, filteret og kalenderfeeden.
//
// Layoutdelen er statisk — sandkassen har ingen nettleser som kan måle
// flex, men kjeden som gjør veksten mulig kan sjekkes, og det er den som
// ryker hvis noen endrer strukturen uten å tenke på det.
//
// Resten kjøres i jsdom. Det viktigste som voktes her er hva
// gjøremålsfeeden IKKE inneholder: filen ligger lesbar for den som har
// adressen, og verken elevnavn eller fritekst skal kunne havne i den.

const fs   = require('fs');
const path = require('node:path').join(__dirname, '..') + '/';
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path + 'index.html', 'utf8');
const css  = fs.readFileSync(path + 'app.css', 'utf8');
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

function lagDom({ todos = [], elever = [], navn = {} } = {}) {
  const store = lagStore({
    lp_todos:        JSON.stringify(todos),
    lp_students:     JSON.stringify(elever),
    lp_studentNames: JSON.stringify(navn),
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
  return dom;
}

const gj = (id, o) => ({ id, tittel: 'Sak ' + id, tekst: '', merke: null,
  linkedFag: null, linkedStudentId: null, frist: null, status: 'ikke_startet', ...o });

const tester = [];
function test(navn, fn) { tester.push([navn, fn]); }
function sant(v, hva) { if (!v) throw new Error(hva); }
function like(a, b, hva) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(hva + ': ventet ' + JSON.stringify(b) + ', fikk ' + JSON.stringify(a));
}

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

// ══════════════════════════════════════════════════════════════
// MERKER
// ══════════════════════════════════════════════════════════════

test('merket lagres, og vises som merkelapp i lista', () => {
  const dom = lagDom(); const w = dom.window;
  w.openTodoForm();
  w.document.getElementById('todoTittelInput').value = 'Skrive referat';
  w.document.getElementById('todoMerkeInput').value  = 'Referat';
  w.saveTodo();

  const t = w.eval('todos')[0];
  sant(t.merke === 'Referat', 'merket ble ikke lagret: ' + JSON.stringify(t.merke));
  const lapp = w.document.querySelector('#todoList .todo-tag.merke-tag');
  sant(lapp && lapp.textContent === 'Referat', 'merkelappen mangler i lista');
  dom.window.close();
});

test('skrivemåten arves fra merket som allerede finnes', () => {
  // Uten dette blir «IOP» og «iop» to ulike merkelapper i lista, selv om
  // filteret behandler dem som ett. Verdien som LAGRES er poenget —
  // alleMerker() slår dem sammen uansett, så den sier ikke fra.
  const dom = lagDom({ todos: [gj(1, { merke: 'IOP' })] }); const w = dom.window;

  w.openTodoForm();
  w.document.getElementById('todoTittelInput').value = 'Ny sak';
  w.document.getElementById('todoMerkeInput').value  = '  iop ';
  w.saveTodo();

  const lagret = w.eval('todos').map(t => t.merke);
  like(lagret, ['IOP', 'IOP'], 'den nye skulle arvet skrivemåten fra den gamle');

  const lapper = [...w.document.querySelectorAll('#todoList .merke-tag')].map(e => e.textContent);
  like(lapper, ['IOP', 'IOP'], 'lista skal vise samme merke på begge');
  like(w.alleMerker(), ['IOP'], 'og bare én filterknapp');
  dom.window.close();
});

test('tomt merke blir null, ikke tom streng', () => {
  const dom = lagDom(); const w = dom.window;
  w.openTodoForm();
  w.document.getElementById('todoTittelInput').value = 'Uten merke';
  w.document.getElementById('todoMerkeInput').value  = '   ';
  w.saveTodo();
  like(w.eval('todos')[0].merke, null, 'tomt felt skal gi null');
  sant(!w.document.querySelector('#todoList .merke-tag'), 'ingen tom merkelapp');
  dom.window.close();
});

test('skjemaet foreslår merkene som er i bruk', () => {
  const dom = lagDom({ todos: [gj(1, { merke: 'IKT' }), gj(2, { merke: 'Referat' })] });
  const w = dom.window;
  w.openTodoForm();
  const forslag = [...w.document.querySelectorAll('#todoMerkeListe option')].map(o => o.value);
  like(forslag, ['IKT', 'Referat'], 'datalisten skal ha merkene sortert');
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// FILTER
// ══════════════════════════════════════════════════════════════

test('filteret snevrer inn lista, og andre klikk viser alt igjen', () => {
  const dom = lagDom({ todos: [
    gj(1, { merke: 'IOP' }), gj(2, { merke: 'IKT' }), gj(3, { merke: 'IOP' })
  ]});
  const w = dom.window;

  const rader = () => w.document.querySelectorAll('#todoList .todo-item').length;
  sant(rader() === 3, 'alle tre skal vises først');

  w.settTodoFilter('merke', 'IOP');
  sant(rader() === 2, 'ventet to IOP-saker, fikk ' + rader());

  w.settTodoFilter('merke', 'IOP');
  sant(rader() === 3, 'andre klikk skal vise alt igjen');
  dom.window.close();
});

test('knappen markeres, og bare én om gangen', () => {
  const dom = lagDom({ todos: [gj(1, { merke: 'IOP' }), gj(2, { merke: 'IKT' })] });
  const w = dom.window;
  w.settTodoFilter('merke', 'IOP');
  const aktive = [...w.document.querySelectorAll('#todoFilter .aktiv')].map(k => k.textContent);
  like(aktive, ['IOP'], 'nøyaktig én knapp skal være markert');
  dom.window.close();
});

test('det finnes knapper for merke, fag og elev', () => {
  const dom = lagDom({
    todos: [gj(1, { merke: 'IOP' }), gj(2, { linkedFag: 'Norsk' }), gj(3, { linkedStudentId: 's1' })],
    elever: [{ id: 's1', trinn: 9, startDato: '2020-01-01', arkivert: false, arkivertDato: null }],
    navn: { s1: 'Kari' }
  });
  const w = dom.window;
  const knapper = [...w.document.querySelectorAll('#todoFilter .todo-filter-knapp')];
  like(knapper.map(k => k.textContent), ['IOP', 'Norsk', 'Kari'], 'merke, så fag, så elev');
  like(knapper.map(k => k.className.split(' ')[1]), ['merke', 'fag', 'elev'], 'hver knapp merkes med type');

  w.settTodoFilter('fag', 'Norsk');
  sant(w.document.querySelectorAll('#todoList .todo-item').length === 1, 'fagfilteret virker');
  w.settTodoFilter('elev', 's1');
  sant(w.document.querySelectorAll('#todoList .todo-item').length === 1, 'elevfilteret virker');
  dom.window.close();
});

test('et filter som ikke gir treff lenger nullstilles', () => {
  // Ellers står lista tom uten forklaring når siste IOP-sak blir ferdig.
  const dom = lagDom({ todos: [gj(1, { merke: 'IOP' }), gj(2, { merke: 'IKT' })] });
  const w = dom.window;
  w.settTodoFilter('merke', 'IOP');
  sant(w.eval('todoFilter'), 'filteret skal være satt');

  w.cycleTodoStatus(1); w.cycleTodoStatus(1);   // → ferdig
  like(w.eval('todoFilter'), null, 'filteret skulle nullstilt seg');
  sant(w.document.querySelectorAll('#todoList .todo-item').length === 1, 'resten skal vises');
  dom.window.close();
});

test('filterraden skjules når det ikke er noe å velge mellom', () => {
  const dom = lagDom({ todos: [gj(1)] }); const w = dom.window;
  sant(w.document.getElementById('todoFilter').style.display === 'none',
       'raden skal ikke ta plass når den er tom');
  dom.window.close();
});

test('filterraden ligger inni rulleflaten, ikke over den', () => {
  // To rulleflater i samme panel er fella mobiltilpasningen ryddet bort.
  const dom = lagDom(); const w = dom.window;
  const filter = w.document.getElementById('todoFilter');
  sant(filter.closest('.sidebar-body'), '#todoFilter må ligge inni .sidebar-body');
  sant(w.document.getElementById('todoList').closest('.sidebar-body'), '#todoList også');
  sant(/position:\s*sticky/.test(regel('.todo-filter') || ''), '.todo-filter må være sticky');
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// KALENDERFEED
// ══════════════════════════════════════════════════════════════

const feltIFeed = (ics, navn) =>
  ics.split('\r\n').filter(l => l.startsWith(navn + ':') || l.startsWith(navn + ';'));

test('feeden gir én heldagshendelse per frist', () => {
  const dom = lagDom({ todos: [
    gj(1, { tittel: 'Levere referat', frist: '2026-08-19' }),
    gj(2, { tittel: 'Uten frist' })
  ]});
  const w = dom.window;
  const { ics, antall } = w.byggGjoeremaalICS();

  sant(antall === 1, 'bare gjøremål med frist skal med, fikk ' + antall);
  like(feltIFeed(ics, 'DTSTART'), ['DTSTART;VALUE=DATE:20260819'], 'heldagsformat');
  like(feltIFeed(ics, 'DTEND'),   ['DTEND;VALUE=DATE:20260820'],   'DTEND er dagen etter — den er eksklusiv');
  sant(/SUMMARY:Levere referat/.test(ics), 'tittelen mangler');
  sant(/BEGIN:VCALENDAR/.test(ics) && /END:VCALENDAR/.test(ics), 'ugyldig kalenderfil');
  dom.window.close();
});

test('merket står foran tittelen', () => {
  const dom = lagDom({ todos: [gj(1, { tittel: 'Møtereferat', merke: 'Referat', frist: '2026-08-19' })] });
  const w = dom.window;
  sant(/SUMMARY:Referat: Møtereferat/.test(w.byggGjoeremaalICS().ics), 'merket mangler i tittelen');
  dom.window.close();
});

test('ferdige og slettede er ikke med', () => {
  const dom = lagDom({ todos: [
    gj(1, { frist: '2026-08-19', status: 'ferdig' }),
    gj(2, { frist: '2026-08-19', slettet: true }),
    gj(3, { frist: '2026-08-19' })
  ]});
  const w = dom.window;
  sant(w.byggGjoeremaalICS().antall === 1, 'bare den aktive skal med');
  dom.window.close();
});

test('ELEVNAVN KOMMER ALDRI MED', () => {
  // Filen ligger lesbar for den som har adressen. Dette er den testen som
  // gjør feeden forsvarlig — ryker den, skal ingenting publiseres.
  const dom = lagDom({
    todos: [gj(1, { tittel: 'Ringe hjem', frist: '2026-08-19', linkedStudentId: 's1' })],
    elever: [{ id: 's1', trinn: 9, startDato: '2020-01-01', arkivert: false, arkivertDato: null }],
    navn: { s1: 'Esekiel' }
  });
  const w = dom.window;
  const ics = w.byggGjoeremaalICS().ics;
  sant(!/Esekiel/.test(ics), 'ELEVNAVN I FEEDEN:\n' + ics);
  sant(!/s1/.test(ics), 'elev-id skal heller ikke være med');
  dom.window.close();
});

test('beskrivelsen kommer aldri med', () => {
  // Fritekst inneholder det brukeren skrev — ofte navn.
  const dom = lagDom({ todos: [
    gj(1, { tittel: 'Sak', tekst: 'Snakke med Esekiel om timen', frist: '2026-08-19' })
  ]});
  const w = dom.window;
  sant(!/Esekiel/.test(w.byggGjoeremaalICS().ics), 'fritekst lekket ut i feeden');
  dom.window.close();
});

test('faget er med, det er trygt', () => {
  const dom = lagDom({ todos: [gj(1, { frist: '2026-08-19', linkedFag: 'Norsk' })] });
  const w = dom.window;
  sant(/DESCRIPTION:Norsk/.test(w.byggGjoeremaalICS().ics), 'faget mangler');
  dom.window.close();
});

test('UID er stabil, så Outlook oppdaterer framfor å duplisere', () => {
  const dom = lagDom({ todos: [gj(7, { frist: '2026-08-19' })] }); const w = dom.window;
  const forst = feltIFeed(w.byggGjoeremaalICS().ics, 'UID');
  w.eval("todos[0].frist = '2026-08-26'");
  like(feltIFeed(w.byggGjoeremaalICS().ics, 'UID'), forst, 'UID skal ikke endre seg når fristen flytter seg');
  dom.window.close();
});

test('feeden er registrert med egne nøkler, og de synkes', () => {
  sant(/gjoeremaal:\s*\{[\s\S]*?byggGjoeremaalICS/.test(sync), 'feeden mangler i ICS_FEEDS');
  const noklerBlokk = sync.slice(sync.indexOf('SYNK_NOKLER'), sync.indexOf('];', sync.indexOf('SYNK_NOKLER')));
  sant(/lp_gjoeremaal_token/.test(noklerBlokk) && /lp_gjoeremaal_publiser/.test(noklerBlokk),
       'nøklene mangler i SYNK_NOKLER — da ville hver enhet publisert til sin egen adresse');
  // Egen adresse, ikke gjenbruk av en annen feed sin. Deler to feeder
  // token, får den som abonnerer på fristene også timeplanen.
  const feedBlokk = sync.slice(sync.indexOf('const ICS_FEEDS'), sync.indexOf('\n};', sync.indexOf('const ICS_FEEDS')));
  const tokens = [...feedBlokk.matchAll(/tokenKey:\s*'([^']+)'/g)].map(m => m[1]);
  sant(tokens.length === 3, 'ventet tre feeder, fant ' + tokens.length);
  sant(new Set(tokens).size === tokens.length,
       'to feeder deler tokenKey — da får abonnenten begge kalenderne: ' + tokens.join(', '));
});

test('markupen har feltene sync.js leter etter', () => {
  // tegnICSStatus() slår opp på id, og gjør ingenting hvis de mangler —
  // kortet ville da stått tomt uten feilmelding.
  ['av-gjoeremaal', 'paa-gjoeremaal', 'adresse-gjoeremaal', 'kopier-gjoeremaal']
    .forEach(id => sant(html.includes('id="' + id + '"'), 'mangler #' + id + ' i index.html'));
});

// ══════════════════════════════════════════════════════════════
// SAMARBEIDSMØTE
// ══════════════════════════════════════════════════════════════

test('etiketten er byttet, men den lagrede verdien står', () => {
  // Verdien «foreldre» ligger på hendelser som alt er lagret og synket.
  // Byttes den uten migrering, mister de fargen og kategorien sin.
  sant(!/Foreldremøte/.test(html), 'gammel etikett igjen i index.html');
  sant(!/Foreldremøte/.test(js),   'gammel etikett igjen i app.js');
  sant(/Samarbeidsmøte/.test(html), 'ny etikett mangler i index.html');
  sant(/Samarbeidsmøte/.test(js),   'ny etikett mangler i fargeforklaringen');
  sant(/<option value="foreldre">/.test(html), 'verdien skal fortsatt være «foreldre»');
  sant(/ev\.category === 'foreldre'/.test(js), 'eventColor() må fortsatt kjenne igjen «foreldre»');
});

// ── Kjør ───────────────────────────────────────────────────────
console.log('\nGjøremål — skjema, merker, filter og feed\n');
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK   ' + navn); }
  catch (e) { alle = false; console.log('  FEIL ' + navn + '\n       ' + e.message); }
}
console.log('\n' + (alle ? 'Alle tester passerte.' : 'Noen tester feilet.') + '\n');
process.exit(alle ? 0 : 1);
