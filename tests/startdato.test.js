// Når en hendelse begynner å gjelde, og Lagre-knappen i hendelsesskjemaet.

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

// Datoer regnes ut fra i dag — se tests/README.md
function dagerFra(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const time = x => ({ id: 1, title: 'Norsk', category: 'undervisning', recurs: true, weekday: 0,
  start: '08:30', end: '09:15', room: '', trinn: 9, trinns: [9], sessionType: 'gruppe', students: [],
  weekPattern: 'every', gyldigFra: '2000-01-01', gyldigTil: null, ...x });

function lagDom(events = []) {
  const store = lagStore({
    lp_students: '[]', lp_studentNames: '{}', lp_lessonData: '{}', lp_fridager: '[]',
    lp_events: JSON.stringify(events),
    lp_skoleaar: JSON.stringify({ start: '2000-01-01', slutt: '2099-12-31' })
  });
  const dom = new JSDOM(htmlInline, {
    runScripts: 'dangerously', pretendToBeVisual: true,
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

const D = (w, s) => new w.Date(s + 'T00:00:00');
const vises = (w, dato, id) => w.eventsForDate(D(w, dato)).some(e => e.id === id);
const hent = (w, uttrykk) => w.eval(uttrykk);

// Fyller ut skjemaet for en ny undervisningstime og lagrer.
function nyTime(w, { weekday, startWeek = '', gjentas = true }) {
  w.openEventForm(null);
  w.setFormCategory('undervisning');
  const $ = id => w.document.getElementById(id);
  $('fagInput').value = 'Norsk';
  w.document.querySelector('input[name="trinnCheck"][value="9"]').checked = true;
  $('dagSelect').value = String(weekday);
  $('gjentasCheck').checked = gjentas;
  $('startWeekInput').value = String(startWeek);
  w.saveEvent();
  w.closeOverlay('afterSaveOverlay');
  const ev = hent(w, 'events');
  return ev[ev.length - 1];
}
const tester = [];
function test(navn, fn) { tester.push([navn, fn]); }
function sant(v, hva) { if (!v) throw new Error(hva); }
function like(a, b, hva) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(hva + ': ventet ' + JSON.stringify(b) + ', fikk ' + JSON.stringify(a));
}

// ══════════════════════════════════════════════════════════════
// STARTDATO FOR NYE HENDELSER
// ══════════════════════════════════════════════════════════════
// saveEvent() satte gyldigFra til dagens dato. En time opprettet tirsdag
// for mandag i samme uke lå da før sin egen startdato og kom først uka
// etter. Løkka går gjennom alle fem ukedagene — én ukedag alene kan stå
// grønn fire dager av fem med feilen i behold (tests/README.md).

test('en ny gjentakende time vises alle dager i uka den ble opprettet', () => {
  for (let wd = 0; wd < 5; wd++) {
    const dom = lagDom(); const w = dom.window;
    const mandag = w.getMonday(new w.Date());
    const ev = nyTime(w, { weekday: wd });
    const dag = new w.Date(mandag); dag.setDate(dag.getDate() + wd);
    sant(w.eventsForDate(dag).some(e => e.id === ev.id), 'ukedag ' + wd + ' mangler i uka den ble opprettet');
    dom.window.close();
  }
});

test('«gjeldende fra uke» tar med den uka', () => {
  const dom = lagDom(); const w = dom.window;
  const mandag = w.getMonday(new w.Date());
  const ev = nyTime(w, { weekday: 0, startWeek: w.weekNumber(mandag) });
  sant(vises(w, w.isoDate(mandag), ev.id), 'mangler mandag i startuka');
  const foer = new w.Date(mandag); foer.setDate(foer.getDate() - 7);
  sant(!vises(w, w.isoDate(foer), ev.id), 'vises i uka før');
  dom.window.close();
});

test('«gjeldende fra uke» fram i tid starter først den uka', () => {
  const dom = lagDom(); const w = dom.window;
  const mandag = w.getMonday(new w.Date());
  const om2 = new w.Date(mandag); om2.setDate(om2.getDate() + 14);
  const ev = nyTime(w, { weekday: 0, startWeek: w.weekNumber(om2) });
  sant(!vises(w, w.isoDate(mandag), ev.id), 'vises før startuka');
  sant(vises(w, w.isoDate(om2), ev.id), 'mangler i startuka');
  dom.window.close();
});

test('en time opprettet i dagsvisning starter i den dagens uke', () => {
  const dom = lagDom(); const w = dom.window;
  w.setView('day');
  w.changeNav(21);   // tre uker fram — currentWeekMonday blir stående
  const mandag = w.getMonday(w.eval('currentDay'));
  const ev = nyTime(w, { weekday: 0 });
  like(ev.gyldigFra, w.isoDate(mandag), 'startdato');
  dom.window.close();
});

test('et møte lagt inn for en dag som er passert, vises', () => {
  const dom = lagDom(); const w = dom.window;
  const d = new w.Date(); d.setDate(d.getDate() - 3);
  const dato = w.isoDate(d);
  w.openEventForm(null);
  w.setFormCategory('mote');
  const $ = id => w.document.getElementById(id);
  $('moteTittelInput').value = 'Teammøte';
  $('moteDatoInput').value = dato;
  $('moteStartInput').value = '14:00'; $('moteSluttInput').value = '15:00';
  $('gjentasCheck').checked = false;
  w.saveEvent();
  const ev = hent(w, 'events').slice(-1)[0];
  sant(vises(w, dato, ev.id), 'møtet vises ikke på sin egen dato');
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// UKENUMMER OVER NYTTÅR
// ══════════════════════════════════════════════════════════════
// eventsForDate() sammenlignet ukenummeret alene: `wn < startWeek`. En time
// «fra uke 34» forsvant 1. januar og kom tilbake i august.

test('uka tolkes i året nærmest referansen', () => {
  const dom = lagDom(); const w = dom.window;
  const m = (uke, ref) => w.isoDate(w.mandagForUkeNaer(uke, D(w, ref)));
  like(m(2, '2026-11-04'), '2027-01-11', 'uke 2 skrevet inn i november');
  like(m(34, '2027-01-20'), '2026-08-17', 'uke 34 skrevet inn i januar');
  like(m(39, '2026-09-22'), '2026-09-21', 'uke 39 i uke 39');
  like(m(53, '2027-03-01'), '2026-12-28', 'uke 53 finnes i 2026');
  dom.window.close();
});

test('en time «fra uke 34» vises etter nyttår', () => {
  const ev = time({ startWeek: 34, gyldigFra: '2026-08-17' });
  const dom = lagDom([ev]); const w = dom.window;
  sant(vises(w, '2026-08-17', 1), 'mangler i uke 34');
  sant(vises(w, '2027-01-11', 1), 'forsvant i januar');
  sant(!vises(w, '2026-08-10', 1), 'vises før uke 34');
  dom.window.close();
});

test('lagrede timer får startdatoen fra uka ved lasting — bare framover', () => {
  const dom = lagDom([
    time({ id: 1, startWeek: 34, gyldigFra: '2026-08-10' }),   // laget i uke 33
    time({ id: 2, startWeek: 2,  gyldigFra: '2026-11-02' }),   // vårens uke 2
    time({ id: 3, startWeek: 34, gyldigFra: '2026-09-01' }),   // startdato alt etter
    time({ id: 4, recurs: false, date: '2026-09-21', weekday: undefined, gyldigFra: '2026-09-22' })
  ]);
  const w = dom.window;
  const g = id => hent(w, 'events').find(e => e.id === id).gyldigFra;
  like(g(1), '2026-08-17', 'uke 34');
  like(g(2), '2027-01-11', 'uke 2 etter nyttår');
  like(g(3), '2026-09-01', 'skal ikke flyttes bakover');
  like(g(4), '2026-09-21', 'enkelthendelse får datoen sin');
  const lagret = JSON.parse(w.lager.getItem('lp_events'));
  like(lagret.find(e => e.id === 1).gyldigFra, '2026-08-17', 'migreringen ble ikke skrevet tilbake');
  dom.window.close();
});

test('endret «gjeldende fra uke» flytter startdatoen', () => {
  const dom = lagDom([time({ startWeek: 34, gyldigFra: '2026-08-17' })]); const w = dom.window;
  w.openEventForm(hent(w, 'events')[0]);
  w.document.getElementById('startWeekInput').value = '40';
  w.saveEvent();
  like(hent(w, 'events')[0].gyldigFra, '2026-09-28', 'startdato etter endring');
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// LAGRE-KNAPPEN
// ══════════════════════════════════════════════════════════════
// «Avslutt fra dato» skjuler Lagre og Avbryt. Bare Avbryt i datovelgeren
// viste dem igjen; lukket man på en annen måte, manglet de neste gang.

const LUKKEMAATER = {
  'krysset':       w => w.document.querySelector('#eventFormOverlay .modal-close').click(),
  'Escape':        w => w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  'en annen time': w => {}
};

for (const [navn, lukk] of Object.entries(LUKKEMAATER)) {
  test('Lagre og Avbryt er tilbake etter «Avslutt fra dato» lukket med ' + navn, () => {
    const dom = lagDom([time({})]); const w = dom.window;
    w.openEventForm(hent(w, 'events')[0]);
    w.avsluttEventVisModal();
    lukk(w);
    for (const ev of [null, hent(w, 'events')[0]]) {
      w.openEventForm(ev);
      ['saveEventBtn', 'avbrytEventBtn'].forEach(id =>
        like(w.document.getElementById(id).style.display, '', id + (ev ? ' (redigering)' : ' (ny)')));
      like(w.document.getElementById('avsluttPanel').style.display, 'none', 'datovelgeren');
    }
    dom.window.close();
  });
}

// ── Kjør ───────────────────────────────────────────────────────
console.log('\nStartdato for hendelser, og Lagre-knappen\n');
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK   ' + navn); }
  catch (e) { alle = false; console.log('  FEIL ' + navn + '\n       ' + e.message); }
}
console.log(alle ? '\nAlle tester passerte.\n' : '\nNoen tester feilet.\n');
process.exit(alle ? 0 : 1);
