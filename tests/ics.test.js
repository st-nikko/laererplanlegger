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
    navn     = { s1: 'Esekiel' },
    overtid  = null
  } = opsjoner;

  const store = lagStore({
    lp_events:       JSON.stringify(events),
    lp_fridager:     JSON.stringify(fridager),
    lp_skoleaar:     JSON.stringify(skoleaar),
    lp_students:     JSON.stringify(elever),
    lp_studentNames: JSON.stringify(navn),
    ...(overtid ? { lp_overtid: JSON.stringify(overtid) } : {})
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

// ── Arbeidstidskalender ────────────────────────────────────────
// Hjelper: hent blokkene for én dato som lesbare tidsspenn
function blokker(w, isoDato) {
  return w.arbeidstidForDato(new w.Date(isoDato + 'T00:00:00'))
    .map(iv => w.fraDesimal(iv.fra) + '-' + w.fraDesimal(iv.til));
}

test('intervaller som overlapper slås sammen', () => {
  const dom = lagDom(); const w = dom.window;
  const slaa = iv => w.slaaSammenIntervaller(iv).map(x => [x.fra, x.til]);
  like(slaa([{ fra: 8, til: 15 }, { fra: 14, til: 16 }]), [[8, 16]], 'overlapp');
  like(slaa([{ fra: 8, til: 15 }, { fra: 15, til: 16 }]), [[8, 16]], 'kant i kant');
  like(slaa([{ fra: 8, til: 15 }, { fra: 19, til: 21 }]), [[8, 15], [19, 21]], 'atskilte');
  like(slaa([{ fra: 19, til: 21 }, { fra: 8, til: 15 }]), [[8, 15], [19, 21]], 'usortert inn');
  like(slaa([{ fra: 8, til: 16 }, { fra: 10, til: 12 }]), [[8, 16]], 'helt innenfor');
  dom.window.close();
});

test('vanlig arbeidsdag gir én blokk fra planfestet tid', () => {
  const dom = lagDom({ events: [] }); const w = dom.window;
  like(blokker(w, '2026-08-17'), ['08:00-15:30'], 'mandag uten hendelser');
  dom.window.close();
});

test('møte innenfor arbeidstiden endrer ingenting', () => {
  const dom = lagDom({
    events: [{ id: 5, title: 'Teammøte', category: 'mote', recurs: false,
               date: '2026-08-17', start: '14:00', end: '15:00', students: [],
               gyldigFra: '2020-01-01', gyldigTil: null }]
  });
  const w = dom.window;
  like(blokker(w, '2026-08-17'), ['08:00-15:30'], 'skal fortsatt være én blokk');
  dom.window.close();
});

test('møte som varer forbi arbeidsdagen forlenger blokka', () => {
  const dom = lagDom({
    events: [{ id: 5, title: 'Foreldremøte', category: 'mote', recurs: false,
               date: '2026-08-17', start: '15:00', end: '16:30', students: [],
               gyldigFra: '2020-01-01', gyldigTil: null }]
  });
  const w = dom.window;
  like(blokker(w, '2026-08-17'), ['08:00-16:30'], 'blokka skal strekkes');
  dom.window.close();
});

test('kveldsmøte blir en egen blokk', () => {
  const dom = lagDom({
    events: [{ id: 5, title: 'Foreldremøte', category: 'mote', recurs: false,
               date: '2026-08-17', start: '19:00', end: '21:00', students: [],
               gyldigFra: '2020-01-01', gyldigTil: null }]
  });
  const w = dom.window;
  like(blokker(w, '2026-08-17'), ['08:00-15:30', '19:00-21:00'],
       'ettermiddagen mellom skal ikke se opptatt ut');
  dom.window.close();
});

test('helg uten hendelser gir ingenting', () => {
  const dom = lagDom({ events: [] }); const w = dom.window;
  like(blokker(w, '2026-08-22'), [], 'lørdag');
  like(blokker(w, '2026-08-23'), [], 'søndag');
  dom.window.close();
});

test('kurs i helga gir en blokk', () => {
  const dom = lagDom({
    events: [{ id: 6, title: 'Kurs', category: 'mote', recurs: false,
               date: '2026-08-22', start: '10:00', end: '15:00', students: [],
               gyldigFra: '2020-01-01', gyldigTil: null }]
  });
  const w = dom.window;
  like(blokker(w, '2026-08-22'), ['10:00-15:00'], 'lørdag med kurs');
  dom.window.close();
});

test('ferie gir ingen arbeidstid', () => {
  const dom = lagDom({
    events: [],
    fridager: [{ id: 'x', fra: '2026-08-17', til: '2026-08-21', tittel: 'Ferie', type: 'ferie' }]
  });
  const w = dom.window;
  like(blokker(w, '2026-08-17'), [], 'mandag i ferien');
  dom.window.close();
});

test('planleggingsdag er en arbeidsdag', () => {
  const dom = lagDom({
    events: [],
    fridager: [{ id: 'x', fra: '2026-08-17', til: '2026-08-17', tittel: 'Planlegging', type: 'planlegging' }]
  });
  const w = dom.window;
  like(blokker(w, '2026-08-17'), ['08:00-15:30'], 'planleggingsdag skal telle som jobb');
  dom.window.close();
});

test('registrert overtid overstyrer planfestet tid', () => {
  const dom = lagDom({
    events: [],
    overtid: { '2026-08-17': { start: '07:00', end: '17:00' } }
  });
  const w = dom.window;
  like(blokker(w, '2026-08-17'), ['07:00-17:00'], 'overtid skal vinne');
  dom.window.close();
});

test('jobbkalenderen røper ikke hva du gjør', () => {
  const dom = lagDom({
    events: [NORSK, ENETIME, { id: 7, title: 'Samtale med rektor', category: 'mote',
             recurs: false, date: '2026-08-17', start: '16:00', end: '17:00',
             students: [], gyldigFra: '2020-01-01', gyldigTil: null }]
  });
  const { ics } = dom.window.byggArbeidstidICS();
  ['Norsk', 'Matematikk', 'Esekiel', 'Samtale med rektor', 'B12'].forEach(ord => {
    sant(!ics.includes(ord), 'fant «' + ord + '» i jobbkalenderen');
  });
  sant(ics.includes('SUMMARY:På jobb'), 'alle blokker skal hete det samme');
  dom.window.close();
});

test('blokkene markeres som opptatt', () => {
  const dom = lagDom({ events: [] });
  const { ics } = dom.window.byggArbeidstidICS();
  sant(ics.includes('TRANSP:OPAQUE'), 'skal vises som opptatt');
  sant(ics.includes('X-MICROSOFT-CDO-BUSYSTATUS:BUSY'), 'for Outlook');
  sant(ics.includes('X-WR-CALNAME:På jobb'), 'kalendernavn');
  dom.window.close();
});

test('jobbkalenderen dekker hele skoleåret', () => {
  const dom = lagDom({ events: [] });
  const { antall } = dom.window.byggArbeidstidICS();
  // 17. aug – 11. sep 2026 er fire hele arbeidsuker
  like(antall, 20, 'fire uker à fem virkedager');
  dom.window.close();
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
