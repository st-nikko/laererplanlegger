// Gjøremål: egen rekkefølge med hold og dra (16. okt 2026, «løsning 1»).
//
// Selve musebevegelsen kan jsdom ikke måle (ingen layout), så her testes
// logikken: ordneTodos() og flyttTodo(). Draget i ekte nettleser er
// sjekket med Playwright — se CONTEXT.md, «Egen rekkefølge».

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
    removeItem: k => { delete data[k]; },
    _data: data
  };
}

function lagDom(todos) {
  const store = lagStore({
    lp_todos:    JSON.stringify(todos),
    lp_skoleaar: JSON.stringify({ start: '2020-01-01', slutt: '2030-12-31' })
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
  dom.store = store;
  return dom;
}

const gj = (id, o) => ({ id, tittel: 'Sak ' + id, tekst: '', merke: null,
  linkedFag: null, linkedStudentId: null, frist: null, status: 'ikke_startet', ...o });

// Rekkefølgen slik den faktisk står i lista på skjermen
const vist = w => [...w.document.querySelectorAll('#todoList .todo-item')]
  .map(el => Number(el.dataset.todoId));

const tester = [];
function test(navn, fn) { tester.push([navn, fn]); }
function sant(v, hva) { if (!v) throw new Error(hva); }
function like(a, b, hva) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(hva + ': ventet ' + JSON.stringify(b) + ', fikk ' + JSON.stringify(a));
}

const FIRE = [
  gj(1, { frist: '2026-10-20' }),
  gj(2, { frist: '2026-10-18' }),
  gj(3),                              // uten frist
  gj(4, { frist: '2026-10-25' })
];

test('uten dragning er lista sortert på frist som før', () => {
  const dom = lagDom(FIRE); const w = dom.window;
  w.renderTodoList();
  like(vist(w), [2, 1, 4, 3], 'frist først, så uten frist');
  dom.window.close();
});

test('et dratt gjøremål blir stående der du slapp det', () => {
  const dom = lagDom(FIRE); const w = dom.window;
  w.renderTodoList();
  w.flyttTodo(3, 2, false);                // «uten frist» helt øverst
  like(vist(w), [3, 2, 1, 4], 'etter flytting');
  w.flyttTodo(2, 4, true);                 // og 2 nederst
  like(vist(w), [3, 1, 4, 2], 'etter andre flytting');
  dom.window.close();
});

test('rekkefølgen lagres og overlever omlasting', () => {
  const dom = lagDom(FIRE); const w = dom.window;
  w.renderTodoList();
  w.flyttTodo(4, 2, false);
  const lagret = JSON.parse(dom.store.getItem('lp_todos'));
  sant(lagret.every(t => typeof t.rekkefolge === 'number'), 'alle aktive skal ha fått plass');
  const dom2 = lagDom(lagret);
  dom2.window.renderTodoList();
  like(vist(dom2.window), [4, 2, 1, 3], 'samme rekkefølge etter omlasting');
  dom.window.close(); dom2.window.close();
});

test('et nytt gjøremål havner der fristen tilsier', () => {
  // Egen rekkefølge: 4 (25.), 2 (18.), 1 (20.), 3 (ingen frist)
  const ordnet = [
    gj(4, { frist: '2026-10-25', rekkefolge: 0 }),
    gj(2, { frist: '2026-10-18', rekkefolge: 1 }),
    gj(1, { frist: '2026-10-20', rekkefolge: 2 }),
    gj(3, { rekkefolge: 3 })
  ];
  const dom = lagDom([...ordnet,
    gj(5, { frist: '2026-10-19' }),        // nytt, med frist
    gj(6)                                  // nytt, uten frist
  ]);
  const w = dom.window;
  w.renderTodoList();
  // 5 (19.) skal foran første ordnede med senere frist: det er 4 (25.)
  // 6 (ingen frist) skal nederst
  like(vist(w), [5, 4, 2, 1, 3, 6], 'nye flettes inn på frist');
  dom.window.close();
});

test('med filter på stokkes ikke de skjulte om', () => {
  const dom = lagDom([
    gj(1, { merke: 'IOP', frist: '2026-10-18' }),
    gj(2, {               frist: '2026-10-19' }),
    gj(3, { merke: 'IOP', frist: '2026-10-20' }),
    gj(4, {               frist: '2026-10-21' })
  ]);
  const w = dom.window;
  w.eval("todoFilter = { type: 'merke', verdi: 'IOP' }");
  w.renderTodoList();
  like(vist(w), [1, 3], 'filteret viser bare IOP');
  w.flyttTodo(3, 1, false);                // bytt de to IOP-ene
  like(vist(w), [3, 1], 'byttet i filtrert visning');
  w.eval('todoFilter = null');
  w.renderTodoList();
  like(vist(w), [3, 1, 2, 4], '2 og 4 står fortsatt i samme innbyrdes rekkefølge');
  dom.window.close();
});

test('ferdige og slettede teller ikke med', () => {
  const dom = lagDom([gj(1), gj(2, { status: 'ferdig' }), gj(3, { slettet: true }), gj(4)]);
  const w = dom.window;
  w.renderTodoList();
  w.flyttTodo(4, 1, false);
  like(vist(w), [4, 1], 'bare de aktive');
  const lagret = JSON.parse(dom.store.getItem('lp_todos'));
  sant(lagret.find(t => t.id === 2).rekkefolge === undefined, 'ferdig fikk ikke plass');
  dom.window.close();
});

test('slipp på samme sted lagrer ingenting', () => {
  const dom = lagDom(FIRE); const w = dom.window;
  w.flyttTodo(1, 1, false);
  sant(!dom.store.getItem('lp_todos').includes('rekkefolge'), 'ingen rekkefolge skal være satt');
  dom.window.close();
});

test('draget gjelder bare mus — berøring er som før', () => {
  sant(/e\.pointerType!=='mouse'/.test(js), 'todoHoldStart må avvise annet enn mus');
});

test('knappene i kortet starter aldri et dra', () => {
  sant(/e\.target\.closest\('button, \.todo-status-btn'\)/.test(js), 'status og × skal unntas');
});

test('kortet som dras har en egen stil', () => {
  sant(/\.todo-item\.drar\s*\{/.test(css), 'mangler .todo-item.drar');
});

// ── Kjør ───────────────────────────────────────────────────────
console.log('\nGjøremål — egen rekkefølge (hold og dra)\n');
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK   ' + navn); }
  catch (e) { alle = false; console.log('  FEIL ' + navn + '\n       ' + e.message); }
}
console.log('\n' + (alle ? 'Alle tester passerte.' : 'Noen tester feilet.') + '\n');
process.exit(alle ? 0 : 1);
