// Hvilke timer elevloggen har lov til å vise.
//
// Bakgrunnen: elevlista ligger på HENDELSEN, ikke på hver enkelt dato.
// Nøkkelen i lessonData er `hendelsesId_dato`, og én hendelse dekker alle
// datoene den gjentas på. Legger man en elev inn i en time i november,
// står han med ett slag på alle datoene den timen har hatt siden august.
//
// calcAttendance() og calcAttendancePerFag() har alltid tatt hensyn til
// dette med `if (dateStr < startDato) return`. renderElevloggInnhold()
// gjorde det ikke, og derfor viste loggen timer eleven aldri var i mens
// tellingen i «Elever» så riktig ut. To visninger av samme elev sa ulike
// ting. Feilen ble meldt 2. september 2026.
//
// Grensen fram i tid er BEVISST ulik: oppmøtetellingen stopper på i dag
// (en time som ikke er holdt kan ikke telles som nærvær), mens loggen tar
// med planlagte timer fordi tema ofte skrives på forhånd og lista da også
// er en oversikt over hva som kommer. De merkes «Planlagt» i stedet for å
// skjules — testene under vokter både at de vises OG at de er merket.

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

// ── Datoer relativt til i dag ──
// TODAY settes til `new Date()` når app.js lastes, så testene kan ikke
// fryse tiden. De regner i stedet ut datoer i forhold til dagen i dag.
function dagerFra(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
const I_FJOR_HOST = dagerFra(-120);  // lenge før eleven begynte
const FOR_START   = dagerFra(-60);   // fortsatt før startdato
const ETTER_START = dagerFra(-10);   // gjennomført, etter startdato
const I_MORGEN    = dagerFra(1);     // planlagt
const START_DATO  = dagerFra(-30);

function lagStore(seed = {}) {
  const data = { ...seed };
  return {
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; }
  };
}

// Eleven begynte for 30 dager siden. Timen har gått siden i fjor høst.
const ELEV = { id: 's1', trinn: 9, startDato: START_DATO, arkivert: false, arkivertDato: null };
const TIME = {
  id: 1, title: 'Norsk', category: 'undervisning', recurs: true, weekday: 0,
  start: '08:30', end: '09:15', room: '204', trinn: 9, trinns: [9],
  sessionType: 'gruppe', students: ['s1'], weekPattern: 'every',
  gyldigFra: '2000-01-01', gyldigTil: null
};

function lagDom(lessonData) {
  const store = lagStore({
    lp_students:     JSON.stringify([ELEV]),
    lp_studentNames: JSON.stringify({ s1: 'Kari Nordmann' }),
    lp_events:       JSON.stringify([TIME]),
    lp_lessonData:   JSON.stringify(lessonData),
    lp_fridager:     JSON.stringify([]),
    lp_skoleaar:     JSON.stringify({ start: '2000-01-01', slutt: '2099-12-31' })
  });
  return new JSDOM(htmlInline, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { value: store, writable: false });
      if (!w.crypto) w.crypto = {};
      w.crypto.randomUUID = () => 'uuid-test';
      w.alert = () => {}; w.confirm = () => true;
    }
  });
}

// Alle fire datoene har tema ført
const ALLE_TIMER = {
  ['1_' + I_FJOR_HOST]: { tema: 'Eventyr',      notes: '', attendance: {} },
  ['1_' + FOR_START]:   { tema: 'Novelle',      notes: '', attendance: {} },
  ['1_' + ETTER_START]: { tema: 'Argumenterende', notes: '', attendance: {} },
  ['1_' + I_MORGEN]:    { tema: 'Lyrikk',       notes: '', attendance: {} }
};

const tester = [];
function test(navn, fn) { tester.push([navn, fn]); }
function sant(v, hva) { if (!v) throw new Error(hva); }
function like(a, b, hva) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(hva + ': ventet ' + JSON.stringify(b) + ', fikk ' + JSON.stringify(a));
}

// Tegn loggen for s1 og gi tilbake temaene som faktisk står der
function temaer(w) {
  const c = w.document.getElementById('elevloggViewContent');
  w.renderElevloggInnhold('s1', c);
  return [...c.querySelectorAll('.logg-tema')].map(e => e.textContent).sort();
}
function poster(w) {
  const c = w.document.getElementById('elevloggViewContent');
  w.renderElevloggInnhold('s1', c);
  return [...c.querySelectorAll('.logg-entry')];
}

// ══════════════════════════════════════════════════════════════
// STARTDATO
// ══════════════════════════════════════════════════════════════

test('timer holdt før eleven begynte vises ikke', () => {
  const dom = lagDom(ALLE_TIMER); const w = dom.window;
  const t = temaer(w);
  sant(!t.includes('Eventyr'), 'time fra i fjor høst kom med: ' + t.join(', '));
  sant(!t.includes('Novelle'), 'time før startdato kom med: ' + t.join(', '));
  dom.window.close();
});

test('timer fra og med startdatoen vises', () => {
  const dom = lagDom(ALLE_TIMER); const w = dom.window;
  sant(temaer(w).includes('Argumenterende'), 'gjennomført time etter startdato manglet');
  dom.window.close();
});

test('selve startdatoen er med, ikke utelatt', () => {
  // `<` og ikke `<=` — begynner eleven på mandag, skal mandagens time med.
  const dom = lagDom({ ['1_' + START_DATO]: { tema: 'Første dag', notes: '', attendance: {} } });
  sant(temaer(dom.window).includes('Første dag'), 'timen på startdatoen falt ut');
  dom.window.close();
});

test('elev uten startdato får se alt', () => {
  // Elever lagt inn før feltet fantes har ingen startDato. De skal ikke
  // miste historikken sin — reservedatoen er den samme som i calcAttendance.
  const dom = lagDom(ALLE_TIMER); const w = dom.window;
  w.eval('allStudents[0].startDato = undefined');
  const t = temaer(w);
  sant(t.includes('Eventyr') && t.includes('Novelle'),
       'elev uten startdato mistet gamle timer: ' + t.join(', '));
  dom.window.close();
});

test('loggen og oppmøtetellingen bruker samme grense bakover', () => {
  // Selve feilen som ble meldt: de to visningene sa ulike ting om samme
  // elev. Tellingen så riktig ut, loggen viste for mye.
  const dom = lagDom(ALLE_TIMER); const w = dom.window;
  const iLoggen = temaer(w).length;
  const talte   = w.calcAttendance('s1').total;   // i skoletimer, ikke poster
  const gammel  = w.calcAttendance('s1');
  sant(gammel.total > 0, 'tellingen fant ingenting — testen måler ikke det den tror');
  // Tellingen tar med gjennomførte timer, loggen de samme pluss planlagte.
  sant(iLoggen === talte + 1,
       `loggen har ${iLoggen} poster, tellingen ${talte} + 1 planlagt — de er ikke i takt`);
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// PLANLAGTE TIMER
// ══════════════════════════════════════════════════════════════

test('planlagte timer blir stående i loggen', () => {
  // Bevisst valg: tema skrives ofte på forhånd, og lista er da også en
  // oversikt over hva som kommer.
  const dom = lagDom(ALLE_TIMER);
  sant(temaer(dom.window).includes('Lyrikk'), 'timen i morgen forsvant fra loggen');
  dom.window.close();
});

test('planlagte timer er merket som ikke gjennomført', () => {
  const dom = lagDom(ALLE_TIMER); const w = dom.window;
  const merkede = poster(w).filter(p => p.querySelector('.logg-planlagt-merke'));
  like(merkede.length, 1, 'antall merkede poster');
  sant(merkede[0].textContent.includes('Lyrikk'), 'feil post ble merket');
  sant(merkede[0].classList.contains('logg-entry--planlagt'), 'posten mangler klassen for stiplet kant');
  dom.window.close();
});

test('gjennomførte timer er ikke merket', () => {
  const dom = lagDom(ALLE_TIMER); const w = dom.window;
  const gjennomfort = poster(w).find(p => p.textContent.includes('Argumenterende'));
  sant(gjennomfort, 'fant ikke den gjennomførte timen');
  sant(!gjennomfort.querySelector('.logg-planlagt-merke'), 'gjennomført time ble merket «Planlagt»');
  sant(!gjennomfort.classList.contains('logg-entry--planlagt'), 'gjennomført time fikk stiplet kant');
  dom.window.close();
});

test('dagens time regnes som gjennomført, ikke planlagt', () => {
  // Grensa går ved `> i dag`. Timen du nettopp har hatt skal ikke stå og
  // se ut som noe som ikke har skjedd.
  const dom = lagDom({ ['1_' + dagerFra(0)]: { tema: 'I dag', notes: '', attendance: {} } });
  const p = poster(dom.window);
  like(p.length, 1, 'antall poster');
  sant(!p[0].querySelector('.logg-planlagt-merke'), 'dagens time ble merket «Planlagt»');
  dom.window.close();
});

test('planlagt time viser aldri fraværsbrikke', () => {
  // Fravær ført ved et uhell på en time som ikke er holdt, ville lest som
  // et faktum om noe som ikke har skjedd.
  const dom = lagDom({
    ['1_' + I_MORGEN]: { tema: 'Lyrikk', notes: '', attendance: { s1: [false] } }
  });
  const p = poster(dom.window);
  like(p.length, 1, 'antall poster');
  sant(!p[0].querySelector('.logg-attendance-badge'),
       'planlagt time viste fraværsbrikke: ' + p[0].textContent);
  sant(p[0].querySelector('.logg-planlagt-merke'), 'planlagt-merket manglet');
  dom.window.close();
});

test('gjennomført time viser fortsatt fravær', () => {
  // Motprøven — merkingen over skal ikke ha slått ut fraværsvisningen.
  const dom = lagDom({
    ['1_' + ETTER_START]: { tema: 'Argumenterende', notes: '', attendance: { s1: [false] } }
  });
  const p = poster(dom.window);
  sant(p[0].querySelector('.logg-attendance-badge'), 'fraværsbrikka forsvant fra gjennomført time');
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// UTSEENDE
// ══════════════════════════════════════════════════════════════

test('planlagt-merket bruker ingen ny farge', () => {
  // De fylte brikkene (--fare, --overtid) betyr fravær. En tredje fylt
  // farge ville konkurrert med dem om den samme plassen i raden.
  const regel = (css.match(/\.logg-planlagt-merke\s*\{([^}]*)\}/) || [])[1] || '';
  sant(regel, 'fant ikke regelen .logg-planlagt-merke');
  sant(/dashed/.test(regel), 'merket skal være stiplet, ikke fylt');
  sant(!/background:\s*var\(--(fare|overtid|accent)/.test(regel),
       'merket har fått en fylt varselfarge: ' + regel.trim());
});

test('raden hopper ikke når den er planlagt', () => {
  // .logg-entry--planlagt legger på en 1 px kant. Uten en gjennomsiktig
  // kant på .logg-entry fra før ville raden vokst 2 px og stått og
  // hoppet i forhold til radene rundt.
  const base = (css.match(/\.logg-entry\s*\{([^}]*)\}/) || [])[1] || '';
  sant(/border:\s*1px solid transparent/.test(base),
       '.logg-entry mangler gjennomsiktig kant — planlagte rader blir 2 px høyere');
});

// ══════════════════════════════════════════════════════════════

let feil = 0;
console.log('\nElevlogg — hvilke datoer som vises\n');
tester.forEach(([navn, fn]) => {
  try { fn(); console.log('  OK   ' + navn); }
  catch (e) { feil++; console.log('  FEIL ' + navn + '\n       ' + e.message); }
});
console.log(feil ? '\nNoen tester feilet.' : '\nAlle tester passerte.');
process.exit(feil ? 1 : 0);
