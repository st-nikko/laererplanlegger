// Datofeltet i møteskjemaet.
//
// Meldt 10. september 2026: «Når jeg åpner et møte, endres datoen på møtet
// til dagens dato.»
//
// **Et gjentakende møte har ingen `date`.** saveEvent() lagrer det som
// `date: recurs ? undefined : date` — møtet bor på `weekday` og gjentar
// seg. Skjemaet har likevel bare ett datofelt, og det falt tilbake til
// `isoDate(TODAY)` når `ev.date` manglet.
//
// Det var ikke bare feil å se på. saveEvent() leser ukedagen UT AV det
// samme feltet (`getDayOfWeekFromDate(moteDato)`), så et tirsdagsmøte man
// åpnet på en torsdag og lagret uten å røre, ble et torsdagsmøte. Et
// gjentakende møte kunne vandre gjennom uka bare av å bli sett på.
//
// Vernet er `moteDatoForSkjema()`: datoen som vises skal ALLTID ha møtets
// egen ukedag. Testene under vokter både visningen og — viktigere — at
// ukedagen overlever en åpne-og-lagre.

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

const UKEDAG = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'];

function lagStore(seed = {}) {
  const data = { ...seed };
  return {
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; }
  };
}

// Et møte. `weekday` for gjentakende, `date` for engangs — aldri begge,
// slik saveEvent() lagrer dem.
function motePaa({ weekday = null, date = null, id = 7 }) {
  return {
    id, title: 'Teammøte', category: 'mote', recurs: weekday !== null,
    weekday: weekday === null ? undefined : weekday,
    date: date || undefined,
    start: '14:00', end: '15:00', room: 'Personalrom',
    trinn: null, trinns: [], sessionType: 'gruppe', students: [],
    weekPattern: 'every', gyldigFra: '2000-01-01', gyldigTil: null
  };
}

function lagDom(events) {
  const store = lagStore({
    lp_students:     '[]',
    lp_studentNames: '{}',
    lp_events:       JSON.stringify(events),
    lp_lessonData:   '{}',
    lp_fridager:     '[]',
    lp_skoleaar:     JSON.stringify({ start: '2000-01-01', slutt: '2099-12-31' })
  });
  const dom = new JSDOM(htmlInline, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { value: store, writable: false });
      if (!w.crypto) w.crypto = {};
      w.crypto.randomUUID = () => 'uuid-test';
      w.varsler = [];
      w.alert = m => w.varsler.push(m);
      w.confirm = () => true;
    }
  });
  return dom;
}

const tester = [];
function test(navn, fn) { tester.push([navn, fn]); }
function sant(v, hva) { if (!v) throw new Error(hva); }
function like(a, b, hva) {
  if (String(a) !== String(b)) throw new Error(hva + ': ventet ' + b + ', fikk ' + a);
}

const hendelse = (w, id = 7) => w.eval('events').find(e => e.id === id);
const datofelt = w => w.document.getElementById('moteDatoInput').value;
const ukedagAv  = iso => { const d = new Date(iso + 'T00:00:00'); return d.getDay() === 0 ? 6 : d.getDay() - 1; };

// ══════════════════════════════════════════════════════════════
// SELVE FEILEN
// ══════════════════════════════════════════════════════════════

test('et gjentakende møte flytter seg ikke av å bli åpnet og lagret', () => {
  // Kjøres for HVER ukedag, ikke bare én. Testen skal slå ut uansett hvilken
  // dag i uka den kjøres på — ellers ville den vært grønn fire dager av fem
  // med feilen i behold.
  [0, 1, 2, 3, 4].forEach(wd => {
    const dom = lagDom([motePaa({ weekday: wd })]); const w = dom.window;
    w.openEventForm(hendelse(w));
    w.saveEvent();
    like(hendelse(w).weekday, wd,
         `møte på ${UKEDAG[wd]} flyttet seg (varsler: ${w.varsler.join(' | ') || 'ingen'})`);
    dom.window.close();
  });
});

test('datofeltet viser møtets ukedag, ikke dagens', () => {
  [0, 1, 2, 3, 4].forEach(wd => {
    const dom = lagDom([motePaa({ weekday: wd })]); const w = dom.window;
    w.openEventForm(hendelse(w));
    like(ukedagAv(datofelt(w)), wd,
         `datofeltet viste ${UKEDAG[ukedagAv(datofelt(w))]} for et møte på ${UKEDAG[wd]}`);
    dom.window.close();
  });
});

// ══════════════════════════════════════════════════════════════
// HVILKEN FOREKOMST SOM VISES
// ══════════════════════════════════════════════════════════════

test('datofeltet viser forekomsten i uka man ser på', () => {
  const dom = lagDom([motePaa({ weekday: 1 })]); const w = dom.window;   // tirsdag
  w.eval('currentWeekMonday = new Date("2026-11-02T00:00:00")');          // uke 45
  w.openEventForm(hendelse(w));
  like(datofelt(w), '2026-11-03', 'skulle vist tirsdagen i uka man står i');
  dom.window.close();
});

test('den klikkede datoen vinner over uka man står i', () => {
  // Månedsvisningen kan stå langt fra currentWeekMonday. Da er den
  // klikkede datoen eneste kilde til hvilken forekomst det gjelder.
  const dom = lagDom([motePaa({ weekday: 1 })]); const w = dom.window;
  w.eval('currentWeekMonday = new Date("2026-11-02T00:00:00")');
  w.openEventForm(hendelse(w), null, '2027-02-16');   // en tirsdag
  like(datofelt(w), '2027-02-16', 'den klikkede datoen ble ikke brukt');
  dom.window.close();
});

test('en klikket dato med feil ukedag overstyrer ikke møtet', () => {
  // Skulle en kaller sende inn noe som ikke er en forekomst av møtet, er
  // det bedre å regne ut riktig dag enn å la møtet flytte seg.
  const dom = lagDom([motePaa({ weekday: 1 })]); const w = dom.window;
  w.eval('currentWeekMonday = new Date("2026-11-02T00:00:00")');
  w.openEventForm(hendelse(w), null, '2026-11-05');   // torsdag, ikke tirsdag
  like(ukedagAv(datofelt(w)), 1, 'feil ukedag slapp gjennom');
  w.saveEvent();
  like(hendelse(w).weekday, 1, 'møtet flyttet seg likevel');
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// AT DET FORTSATT VIRKER SOM FØR
// ══════════════════════════════════════════════════════════════

test('et engangsmøte beholder sin egen dato', () => {
  const dom = lagDom([motePaa({ date: '2026-10-14' })]); const w = dom.window;
  w.openEventForm(hendelse(w));
  like(datofelt(w), '2026-10-14', 'datoen på et engangsmøte ble endret');
  w.saveEvent();
  like(hendelse(w).date, '2026-10-14', 'datoen ble endret ved lagring');
  dom.window.close();
});

test('et nytt møte foreslås på i dag', () => {
  const dom = lagDom([]); const w = dom.window;
  w.openEventForm(null);
  w.setFormCategory('mote');
  w.openEventForm(null);
  like(datofelt(w), w.isoDate(w.eval('TODAY')), 'nytt møte skulle foreslått dagens dato');
  dom.window.close();
});

test('endrer man datoen med vilje, flytter møtet seg', () => {
  // Motprøven. Vernet skal låse fast ukedagen mot utilsiktet drift, ikke
  // hindre at man faktisk flytter et møte.
  const dom = lagDom([motePaa({ weekday: 1 })]); const w = dom.window;   // tirsdag
  w.openEventForm(hendelse(w));
  w.document.getElementById('moteDatoInput').value = '2026-11-04';        // onsdag
  w.saveEvent();
  like(hendelse(w).weekday, 2, 'møtet lot seg ikke flytte til onsdag');
  dom.window.close();
});

test('gjentakende undervisning rører ikke datofeltet', () => {
  // Undervisning velger ukedag i dagSelect og har aldri hatt feilen.
  // Testen er her for å fange at fiksen ikke lekker inn i den veien.
  const time = {
    id: 3, title: 'Norsk', category: 'undervisning', recurs: true, weekday: 1,
    start: '08:30', end: '09:15', room: '204', trinn: 9, trinns: [9],
    sessionType: 'gruppe', students: [], weekPattern: 'every',
    gyldigFra: '2000-01-01', gyldigTil: null
  };
  const dom = lagDom([time]); const w = dom.window;
  w.openEventForm(hendelse(w, 3));
  like(w.document.getElementById('dagSelect').value, '1', 'dagSelect fikk feil ukedag');
  w.saveEvent();
  like(hendelse(w, 3).weekday, 1, 'undervisningstimen flyttet seg');
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// AT KALENDEREN FAKTISK SENDER DATOEN MED
// ══════════════════════════════════════════════════════════════

test('klikk i månedsvisningen åpner riktig forekomst', () => {
  // Denne går på selve ledningen, ikke på hjelperen. Kaller man
  // openEventForm() direkte i en test, er det lett å tro at alt er i
  // orden mens kalenderen i praksis har sluttet å sende datoen — og da
  // faller den tilbake på uka man står i, som i månedsvisningen kan ligge
  // måneder unna det man ser på.
  const dom = lagDom([motePaa({ weekday: 1 })]); const w = dom.window;   // tirsdag
  w.eval('currentMonthStart = new Date(2027, 1, 1)');                     // februar 2027
  w.setView('month');
  w.renderMonthView();

  const piller = w.document.querySelectorAll('.month-event-pill');
  sant(piller.length > 0, 'fant ingen møtepiller i månedsvisningen');
  piller[0].onclick({ stopPropagation() {} });

  // 1. februar 2027 er en mandag, så rutenettet starter der og den
  // første tirsdagen er den 2.
  like(datofelt(w), '2027-02-02', 'skjemaet åpnet på feil forekomst');
  dom.window.close();
});

test('klikk i ukesvisningen åpner riktig forekomst', () => {
  const dom = lagDom([motePaa({ weekday: 1 })]); const w = dom.window;
  w.eval('currentWeekMonday = new Date("2026-11-02T00:00:00")');
  w.setView('week');
  w.render();

  const blokker = [...w.document.querySelectorAll('.event')];
  sant(blokker.length > 0, 'fant ingen hendelser i ukesvisningen');
  blokker[0].dispatchEvent(new w.Event('click', { bubbles: true }));

  like(datofelt(w), '2026-11-03', 'skjemaet åpnet på feil forekomst');
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════
// HJELPEFUNKSJONEN DIREKTE
// ══════════════════════════════════════════════════════════════

test('moteDatoForSkjema gir aldri en dato uten møtets ukedag', () => {
  const dom = lagDom([]); const w = dom.window;
  w.eval('currentWeekMonday = new Date("2026-11-02T00:00:00")');
  [0, 1, 2, 3, 4].forEach(wd => {
    const ev = motePaa({ weekday: wd });
    ['', null, undefined, '2026-11-02', '2026-11-06', '2027-03-09'].forEach(klikket => {
      const iso = w.moteDatoForSkjema(ev, klikket);
      like(ukedagAv(iso), wd, `weekday ${wd}, klikket «${klikket}» ga ${iso}`);
    });
  });
  dom.window.close();
});

// ══════════════════════════════════════════════════════════════

let feil = 0;
console.log('\nMøteskjemaet — datofeltet\n');
tester.forEach(([navn, fn]) => {
  try { fn(); console.log('  OK   ' + navn); }
  catch (e) { feil++; console.log('  FEIL ' + navn + '\n       ' + e.message); }
});
console.log(feil ? '\nNoen tester feilet.' : '\nAlle tester passerte.');
process.exit(feil ? 1 : 0);
