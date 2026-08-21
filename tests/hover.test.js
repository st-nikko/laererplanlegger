// Hva timen inneholder, som tooltip på kalenderblokka.
//
// Den billige varianten: nettleserens eget `title`-attributt, valgt for å
// finne ut om hover i det hele tatt blir brukt før et ekte kort bygges.
//
// To ting voktes særlig her:
//
//   1. **Kapping.** `title` er ren tekst uten rulling. Et langt notat
//      eller en klasse på tretti gir en tooltip som dekker halve skjermen
//      og blir ubrukelig. Kappingen ER funksjonen.
//   2. **At det er et attributt, ikke markup.** Elevnotater er brukerens
//      fritekst. Havner de i innerHTML, tolkes de som HTML.

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

const elev = (id, navn) => ({ id, trinn: 9, startDato: '2020-01-01', arkivert: false, arkivertDato: null, navn });

function lagDom({ events = [], elever = [], lessonData = {} } = {}) {
  const navn = {};
  elever.forEach(e => { navn[e.id] = e.navn; });
  const store = lagStore({
    lp_events:       JSON.stringify(events),
    lp_students:     JSON.stringify(elever.map(({ navn, ...rest }) => rest)),
    lp_studentNames: JSON.stringify(navn),
    lp_lessonData:   JSON.stringify(lessonData),
    lp_fridager:     JSON.stringify([]),
    lp_skoleaar:     JSON.stringify({ start: '2020-01-01', slutt: '2030-12-31' })
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

const time = (o = {}) => ({
  id: 1, title: 'Norsk', category: 'undervisning', recurs: true, weekday: 0,
  start: '08:30', end: '09:15', room: '204', trinn: 9, trinns: [9],
  sessionType: 'gruppe', students: [], weekPattern: 'every',
  gyldigFra: '2020-01-01', gyldigTil: null, ...o
});

const tester = [];
function test(navn, fn) { tester.push([navn, fn]); }
function sant(v, hva) { if (!v) throw new Error(hva); }

// Mandagen i uka som vises — den ukedagen testtimene ligger på
function mandag(w) { return new Date(w.eval('currentWeekMonday')); }
function hover(w, ev) { return w.eventHoverTekst(ev, mandag(w)); }

test('tittelen har fag, trinn, rom, skoletime og klokkeslett', () => {
  const dom = lagDom(); const w = dom.window;
  const t = hover(w, time());
  sant(/Norsk/.test(t), 'faget mangler');
  sant(/9\. trinn/.test(t), 'trinnet mangler');
  sant(/204/.test(t), 'rommet mangler');
  sant(/1\. time/.test(t), 'skoletimen mangler');
  sant(/08:30–09:15/.test(t), 'klokkeslettet mangler');
  dom.window.close();
});

test('sier fra når timen ikke har plan', () => {
  const dom = lagDom(); const w = dom.window;
  sant(/Ingen plan lagt inn/.test(hover(w, time())), 'mangler beskjed om manglende plan');
  dom.window.close();
});

test('tema, notat og elever kommer med når planen finnes', () => {
  const dom = lagDom({ elever: [elev('s1', 'Kari Nordmann'), elev('s2', 'Ola Hansen')] });
  const w = dom.window;
  const d = w.isoDate(mandag(w));
  w.eval(`setLesson(1, '${d}', { tema:'Brøk', notes:'Starte med repetisjon', attendance:{}, studentNotes:{ s2:'sitter foran' } })`);

  const t = hover(w, time({ students: ['s1', 's2'] }));
  sant(/Tema: Brøk/.test(t), 'temaet mangler');
  sant(/Starte med repetisjon/.test(t), 'notatet mangler');
  sant(/Elever \(2\)/.test(t), 'antall elever mangler');
  sant(/Kari Nordmann/.test(t) && /Ola Hansen/.test(t), 'elevnavn mangler');
  sant(/Ola Hansen — sitter foran/.test(t), 'elevnotatet mangler');
  dom.window.close();
});

test('fraværende markeres, og telles', () => {
  const dom = lagDom({ elever: [elev('s1', 'Kari'), elev('s2', 'Ola')] });
  const w = dom.window;
  const d = w.isoDate(mandag(w));
  w.eval(`setLesson(1, '${d}', { tema:'', notes:'', attendance:{ s1:[true], s2:[false] }, studentNotes:{} })`);

  const t = hover(w, time({ students: ['s1', 's2'] }));
  sant(/1 fraværende/.test(t), 'antall fraværende mangler: ' + t);
  sant(/Ola \(borte\)/.test(t), 'den fraværende er ikke markert');
  sant(!/Kari \(borte\)/.test(t), 'den som var der skal ikke markeres');
  dom.window.close();
});

test('en dobbelttime der eleven var borte i én av dem teller som fravær', () => {
  const dom = lagDom({ elever: [elev('s1', 'Kari')] }); const w = dom.window;
  const d = w.isoDate(mandag(w));
  w.eval(`setLesson(1, '${d}', { tema:'', notes:'', attendance:{ s1:[true,false] }, studentNotes:{} })`);
  sant(/Kari \(borte\)/.test(hover(w, time({ students: ['s1'] }))), 'delvis fravær skal telle');
  dom.window.close();
});

// ── Kapping ────────────────────────────────────────────────────
// Dette er grunnen til at funksjonen finnes framfor å slenge sammen
// feltene: en tooltip uten tak dekker halve skjermen.

test('lange linjer brytes — title gjør det ikke selv', () => {
  // Uten dette blir et notat på 240 tegn én linje som strekker tooltipen
  // tvers over skjermen. Den skal være en boks, ikke en stripe.
  const dom = lagDom(); const w = dom.window;
  const d = w.isoDate(mandag(w));
  const setning = 'Starte med repetisjon av virkemidler og så gruppearbeid i par ved vinduet. ';
  w.eval(`setLesson(1, '${d}', { tema:'', notes:'${setning.repeat(4)}', attendance:{}, studentNotes:{} })`);

  const bredde = w.eval('HOVER_BREDDE');
  const linjer = hover(w, time()).split('\n');
  linjer.forEach(l => sant(l.length <= bredde + 4, 'linje på ' + l.length + ' tegn: ' + l));
  sant(linjer.filter(l => /repetisjon|gruppearbeid/.test(l)).length > 1, 'notatet skulle blitt brutt over flere linjer');
  dom.window.close();
});

test('brytingen deler på mellomrom, ikke midt i et ord', () => {
  const dom = lagDom(); const w = dom.window;
  const linjer = w.bryt('ett to tre fire fem seks sju åtte ni ti elleve tolv tretten', 20);
  linjer.forEach(l => sant(l.length <= 20, 'for lang: ' + l));
  sant(linjer.join(' ') === 'ett to tre fire fem seks sju åtte ni ti elleve tolv tretten',
       'ord gikk tapt eller ble delt: ' + linjer.join(' | '));
  dom.window.close();
});

test('et langt notat kappes', () => {
  const dom = lagDom(); const w = dom.window;
  const d = w.isoDate(mandag(w));
  const langt = 'a'.repeat(2000);
  w.eval(`setLesson(1, '${d}', { tema:'', notes:'${langt}', attendance:{}, studentNotes:{} })`);

  const t = hover(w, time());
  const maks = w.eval('HOVER_NOTAT_MAKS');
  sant(!t.includes(langt), 'hele notatet kom med');
  sant(t.includes('…'), 'mangler tegnet som viser at det er kappet');
  t.split('\n').forEach(l => sant(l.length <= maks + 20, 'for lang linje: ' + l.length + ' tegn'));
  dom.window.close();
});

test('en stor klasse kappes, og sier hvor mange som er igjen', () => {
  const elever = Array.from({ length: 30 }, (_, i) => elev('e' + i, 'Elev nummer ' + i));
  const dom = lagDom({ elever }); const w = dom.window;
  const maks = w.eval('HOVER_ELEVER_MAKS');

  const t = hover(w, time({ students: elever.map(e => e.id) }));
  const navnelinjer = t.split('\n').filter(l => /^ {2}Elev nummer/.test(l));
  sant(navnelinjer.length === maks, 'ventet ' + maks + ' navn, fikk ' + navnelinjer.length);
  sant(/Elever \(30\)/.test(t), 'totalen skal fortsatt stå der');
  sant(new RegExp('og ' + (30 - maks) + ' til').test(t), 'mangler «og N til»');
  dom.window.close();
});

test('et langt elevnotat kappes også', () => {
  const dom = lagDom({ elever: [elev('s1', 'Kari')] }); const w = dom.window;
  const d = w.isoDate(mandag(w));
  w.eval(`setLesson(1, '${d}', { tema:'', notes:'', attendance:{}, studentNotes:{ s1:'${'b'.repeat(500)}' } })`);
  const linje = hover(w, time({ students: ['s1'] })).split('\n').find(l => l.includes('Kari'));
  sant(linje.length < 100, 'elevlinja er ' + linje.length + ' tegn');
  dom.window.close();
});

// ── Andre hendelsestyper ───────────────────────────────────────

test('møter og vikartimer får sin egen tekst', () => {
  const dom = lagDom({ elever: [elev('s1', 'Kari')] }); const w = dom.window;

  const mote = hover(w, time({ id: 2, category: 'mote', title: 'Teammøte', room: 'Personalrom', elevId: 's1' }));
  sant(/Teammøte/.test(mote) && /Personalrom/.test(mote), 'møtet mangler tittel eller sted');
  sant(/Gjelder Kari/.test(mote), 'eleven møtet gjelder mangler');
  sant(!/Ingen plan lagt inn/.test(mote), 'møter har ikke timeplan');

  const vikar = hover(w, time({ id: 3, category: 'vikar', vikarNotes: 'Matte 8B, oppgave 4–9' }));
  sant(/Vikartime/.test(vikar), 'vikartimen mangler overskrift');
  sant(/oppgave 4–9/.test(vikar), 'vikarnotatet mangler');
  dom.window.close();
});

// ── Kobling til kalenderen ─────────────────────────────────────

test('teksten havner som attributt på blokka, ikke i markupen', () => {
  // Elevnotater er brukerens fritekst. I innerHTML ville de blitt tolket
  // som HTML; som attributt er de alltid ren tekst.
  const dom = lagDom({
    events: [time({ students: ['s1'] })],
    elever: [elev('s1', 'Kari')]
  });
  const w = dom.window;
  const d = w.isoDate(mandag(w));
  w.eval(`setLesson(1, '${d}', { tema:'Brøk', notes:'', attendance:{}, studentNotes:{ s1:'<img src=x onerror=alert(1)>' } })`);
  w.render();

  const blokk = w.document.querySelector('#calGrid .day-col .event');
  sant(blokk, 'fant ingen timeblokk');
  sant(/Tema: Brøk/.test(blokk.title), 'tooltip mangler på blokka');
  sant(blokk.title.includes('<img'), 'fritekst skal være med som ren tekst');
  sant(!blokk.querySelector('img'), 'fritekst ble tolket som markup');
  dom.window.close();
});

test('månedsvisningen får samme tooltip', () => {
  const dom = lagDom({ events: [time()] }); const w = dom.window;
  w.setView('month');
  const pille = [...w.document.querySelectorAll('.month-event-pill')].find(p => p.textContent === 'Norsk');
  sant(pille, 'fant ingen pille i månedsvisningen');
  sant(/1\. time/.test(pille.title), 'pilla mangler tooltip');
  dom.window.close();
});

// ── Kjør ───────────────────────────────────────────────────────
console.log('\nHover — hva timen inneholder\n');
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK   ' + navn); }
  catch (e) { alle = false; console.log('  FEIL ' + navn + '\n       ' + e.message); }
}
console.log('\n' + (alle ? 'Alle tester passerte.' : 'Noen tester feilet.') + '\n');
process.exit(alle ? 0 : 1);
