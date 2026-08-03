// ICS-eksport av undervisningstimer til Outlook.
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

// Fast time hver mandag, 1. time
const NORSK = {
  id: 1, title: 'Norsk', category: 'undervisning', recurs: true, weekday: 0,
  start: '08:30', end: '09:15', room: 'B12', trinns: [9], sessionType: 'gruppe',
  students: [], weekPattern: 'every', gyldigFra: '2020-01-01', gyldigTil: null
};
// Enetime hver tirsdag — tittelen skal aldri bli elevnavnet
const ENETIME = {
  id: 2, title: 'Matematikk', category: 'undervisning', recurs: true, weekday: 1,
  start: '09:25', end: '10:10', room: '', trinns: [10], sessionType: 'enetime',
  students: ['s1'], weekPattern: 'every', gyldigFra: '2020-01-01', gyldigTil: null
};
// Møte hver onsdag — skal ikke være med i det hele tatt
const MOTE = {
  id: 3, title: 'Teammøte', category: 'mote', recurs: true, weekday: 2,
  start: '14:15', end: '15:00', room: 'Personalrom', students: [],
  weekPattern: 'every', gyldigFra: '2020-01-01', gyldigTil: null
};

function lagDom(opsjoner = {}) {
  const {
    events   = [NORSK, ENETIME, MOTE],
    fridager = [],
    skoleaar = { start: '2026-08-17', slutt: '2026-09-11' },   // fire uker
    elever   = [{ id: 's1', trinn: 10, startDato: '2026-08-17', arkivert: false, arkivertDato: null }],
    navn     = { s1: 'Esekiel' }
  } = opsjoner;

  const store = lagStore({
    lp_events:       JSON.stringify(events),
    lp_fridager:     JSON.stringify(fridager),
    lp_skoleaar:     JSON.stringify(skoleaar),
    lp_students:     JSON.stringify(elever),
    lp_studentNames: JSON.stringify(navn)
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

function tellVEVENT(ics) { return (ics.match(/BEGIN:VEVENT/g) || []).length; }
function summaries(ics) {
  return (ics.match(/^SUMMARY:.*$/gm) || []).map(s => s.replace('SUMMARY:', ''));
}

// ── Struktur ───────────────────────────────────────────────────
test('fila har gyldig ytre struktur', () => {
  const dom = lagDom(); const w = dom.window;
  const { ics } = w.byggICS();
  sant(ics.startsWith('BEGIN:VCALENDAR'), 'skal starte med VCALENDAR');
  sant(ics.trimEnd().endsWith('END:VCALENDAR'), 'skal slutte med VCALENDAR');
  sant(ics.includes('VERSION:2.0'), 'mangler VERSION');
  sant(ics.includes('TZID:Europe/Oslo'), 'mangler tidssone');
  like(tellVEVENT(ics), (ics.match(/END:VEVENT/g) || []).length, 'BEGIN og END skal balansere');
  sant(ics.includes('\r\n'), 'ICS krever CRLF');
  dom.window.close();
});

test('tidspunkt bruker Europe/Oslo, ikke UTC', () => {
  const dom = lagDom(); const w = dom.window;
  const { ics } = w.byggICS();
  sant(/DTSTART;TZID=Europe\/Oslo:\d{8}T083000/.test(ics), 'starttid med tidssone');
  sant(!/DTSTART[^\r\n]*\dZ/.test(ics), 'skal ikke bruke UTC-suffiks');
  dom.window.close();
});

// ── Utvalg ─────────────────────────────────────────────────────
test('bare undervisning er med — møter utelates', () => {
  const dom = lagDom(); const w = dom.window;
  const { ics } = w.byggICS();
  sant(!ics.includes('Teammøte'), 'møter skal ikke eksporteres');
  sant(ics.includes('Norsk'), 'undervisning skal eksporteres');
  dom.window.close();
});

test('fire uker gir fire forekomster av en fast ukentlig time', () => {
  const dom = lagDom({ events: [NORSK] }); const w = dom.window;
  const { ics, antall } = w.byggICS();
  like(antall, 4, 'antall timer');
  like(tellVEVENT(ics), 4, 'antall VEVENT');
  dom.window.close();
});

test('ferier og fridager utelates', () => {
  const dom = lagDom({
    events: [NORSK],
    // Dekker mandag 24. og 31. august
    fridager: [{ id: 'x', fra: '2026-08-24', til: '2026-09-01', tittel: 'Ferie', type: 'ferie' }]
  });
  const { antall } = dom.window.byggICS();
  like(antall, 2, 'to av fire mandager skal falle bort');
  dom.window.close();
});

test('annenhver uke respekteres', () => {
  const dom = lagDom({
    events: [{ ...NORSK, weekPattern: 'odd' }]
  });
  const { antall } = dom.window.byggICS();
  like(antall, 2, 'bare oddetallsuker');
  dom.window.close();
});

test('avsluttede timer er ikke med etter sluttdato', () => {
  const dom = lagDom({
    events: [{ ...NORSK, gyldigTil: '2026-08-24' }]
  });
  const { antall } = dom.window.byggICS();
  like(antall, 2, '17. og 24. august, deretter slutt');
  dom.window.close();
});

// ── Personvern ─────────────────────────────────────────────────
test('elevnavn havner aldri i fila', () => {
  const dom = lagDom(); const w = dom.window;
  const { ics } = w.byggICS();
  sant(!ics.includes('Esekiel'), 'elevnavnet skal ikke forekomme');
  sant(!ics.includes('s1'), 'elev-id skal heller ikke forekomme');
  dom.window.close();
});

test('enetimer får faget som tittel', () => {
  const dom = lagDom({ events: [ENETIME] }); const w = dom.window;
  const { ics } = w.byggICS();
  const s = summaries(ics);
  sant(s.length > 0, 'fant ingen SUMMARY');
  sant(s.every(t => t === 'Matematikk (enetime)'), 'feil tittel: ' + s[0]);

  // Kontroll: appen selv viser navnet — det er nettopp derfor
  // eksporten må bruke en egen tittelfunksjon
  like(w.eventDisplayLabel(w.hent('events')[0]), 'Esekiel',
       'kalenderen viser fortsatt navnet i appen');
  dom.window.close();
});

// ── Detaljer ───────────────────────────────────────────────────
test('UID er stabil mellom to eksporter', () => {
  const dom = lagDom({ events: [NORSK] }); const w = dom.window;
  const uid = ics => (ics.match(/^UID:.*$/gm) || []).map(s => s.trim());
  const a = uid(w.byggICS().ics);
  const b = uid(w.byggICS().ics);
  like(a, b, 'samme time samme dato skal gi samme UID');
  sant(a[0].includes('lp-1-2026'), 'UID skal inneholde hendelses-id og dato');
  dom.window.close();
});

test('spesialtegn i fag- og romnavn escapes', () => {
  const dom = lagDom({
    events: [{ ...NORSK, title: 'Norsk; fordypning, muntlig', room: 'B12, fløy A' }]
  });
  const { ics } = dom.window.byggICS();
  sant(ics.includes('Norsk\\; fordypning\\, muntlig'), 'semikolon og komma i tittel');
  sant(ics.includes('B12\\, fløy A'), 'komma i rom');
  dom.window.close();
});

test('lange linjer brytes etter standarden', () => {
  const dom = lagDom({
    events: [{ ...NORSK, title: 'Norsk '.repeat(30).trim() }]
  });
  const { ics } = dom.window.byggICS();
  const lange = ics.split('\r\n').filter(l => l.length > 75);
  like(lange, [], 'ingen linje skal være over 75 tegn');
  sant(/\r\n /.test(ics), 'fortsettelseslinjer skal starte med mellomrom');
  dom.window.close();
});

test('tomt skoleår gir ingen hendelser, ikke krasj', () => {
  const dom = lagDom({ events: [] });
  const { antall, ics } = dom.window.byggICS();
  like(antall, 0, 'ingen timer');
  sant(ics.includes('END:VCALENDAR'), 'fila skal fortsatt være gyldig');
  dom.window.close();
});

test('knappen finnes i Min side', () => {
  sant(html.includes('eksporterICS()'), 'mangler knapp i markup');
});

// ── Kjør ───────────────────────────────────────────────────────
console.log('\nICS-eksport til Outlook\n');
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK   ' + navn); }
  catch (e) { alle = false; console.log('  FEIL ' + navn + '\n       ' + e.message); }
}
console.log('\n' + (alle ? 'Alle tester passerte.' : 'Noen tester feilet.') + '\n');
process.exit(alle ? 0 : 1);
