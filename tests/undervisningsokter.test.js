// Statistikk over undervisningstimer på Min side (veikart post 29).
//
// Det telles skoletime for skoletime: en dobbelttime er to, og hver får
// sin egen kategori — med elever, ingen møtte eller uten elever. Møter og
// vikartimer telles ikke, og heller ikke skoletimer som ikke er over ennå.
//
// (Filnavnet er fra første utgave, som talte økter.)

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

const ELEVER = [
  { id: 's1', trinn: 9, startDato: '2000-01-01', arkivert: false, arkivertDato: null },
  { id: 's2', trinn: 9, startDato: '2000-01-01', arkivert: false, arkivertDato: null }
];

// Enkelthendelser på faste datoer bakover i tid — da spiller ukedagen
// ingen rolle.
const en = (id, dato, extra) => ({ id, title: 'Matematikk', category: 'undervisning', recurs: false,
  date: dato, start: '08:30', end: '09:15', room: '204', trinn: 9, trinns: [9], sessionType: 'gruppe',
  students: ['s1', 's2'], weekPattern: 'every', gyldigFra: '2000-01-01', gyldigTil: null, ...extra });

const D1 = dagerFra(-10), D2 = dagerFra(-9), D3 = dagerFra(-8), FERIE = dagerFra(-6);

const EVENTS = [
  en(1, D1),                                                  // med elever, oppmøte aldri åpnet
  en(2, D1, { start: '09:25', end: '10:10' }),                // ingen møtte
  en(3, D1, { start: '10:20', end: '11:05' }),                // én borte, én til stede → med elever
  en(4, D2, { students: [], title: 'Kroppsøving', trinns: [8, 9, 10] }), // uten elever
  en(5, D2, { start: '08:30', end: '10:10' }),                // dobbelttime, borte bare første halvdel → med
  en(6, D2, { start: '10:20', end: '12:20' }),                // dobbelttime, borte begge → ingen møtte
  en(7, D3, { category: 'mote', title: 'Trinnmøte', students: [] }),     // møte — ikke med
  en(8, D3, { category: 'vikar', title: 'Vikar', tellSomUndervisning: true }), // vikar — ikke med
  en(9, dagerFra(3)),                                         // framtidig — ikke med
  en(10, FERIE),                                              // i ferien — ikke med
  // Har ingen elever i dag, men s1 sto på lista da oppmøtet ble ført
  en(11, D3, { students: [] }),
];

const LESSONS = {
  [`2_${D1}`]:  { attendance: { s1: [false], s2: [false] } },
  [`3_${D1}`]:  { attendance: { s1: [false], s2: [true] } },
  [`5_${D2}`]:  { attendance: { s1: [false, true], s2: [false, true] } },
  [`6_${D2}`]:  { attendance: { s1: [false, false], s2: [false, false] } },
  [`11_${D3}`]: { attendance: { s1: [true] } },
};

function lagDom(skoleaar) {
  const store = lagStore({
    lp_students:     JSON.stringify(ELEVER),
    lp_studentNames: JSON.stringify({ s1: 'Kari Nordmann', s2: 'Ola Nordmann' }),
    lp_events:       JSON.stringify(EVENTS),
    lp_lessonData:   JSON.stringify(LESSONS),
    lp_fridager:     JSON.stringify([{ id: 'f1', fra: FERIE, til: FERIE, tittel: 'Høstferie', type: 'ferie' }]),
    lp_skoleaar:     JSON.stringify(skoleaar || { start: '2000-01-01', slutt: '2099-12-31' })
  });
  return new JSDOM(htmlInline, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { value: store, writable: false });
      if (!w.crypto) w.crypto = {};
      w.crypto.randomUUID = () => 'uuid-test';
      w.alert = () => {}; w.confirm = () => true;
    }
  });
}

const tester = [];
function test(navn, fn) { tester.push([navn, fn]); }
function sant(v, hva) { if (!v) throw new Error(hva); }
function like(a, b, hva) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(hva + ': ventet ' + JSON.stringify(b) + ', fikk ' + JSON.stringify(a));
}

const tell = w => w.tellUndervisningstimer(dagerFra(-30), dagerFra(-1));
const tall = t => ({ total: t.total, medElever: t.medElever, ingenMotte: t.ingenMotte, utenElever: t.utenElever });

// ══════════════════════════════════════════════════════════════
// TELLINGEN
// ══════════════════════════════════════════════════════════════

test('skoletimene fordeles riktig på de tre kategoriene', () => {
  const w = lagDom().window;
  like(tall(tell(w)), { total: 9, medElever: 4, ingenMotte: 4, utenElever: 1 }, 'fordeling');
});

test('summen av kategoriene er alltid totalen', () => {
  const t = tell(lagDom().window);
  like(t.medElever + t.ingenMotte + t.utenElever, t.total, 'sum');
  like(t.perLinje.reduce((s, l) => s + l.total, 0), t.total, 'sum per fag');
  like(t.perUke.reduce((s, u) => s + u.total, 0), t.total, 'sum per uke');
});

test('en dobbelttime teller som to skoletimer', () => {
  const w = lagDom().window;
  const ev = w.eval('events').find(e => e.id === 5);
  like(w.finnSkoletimer(ev).length, 2, 'timen dekker to skoletimer');
  like(w.tellUndervisningstimer(D2, D2).total, 5, 'enkelttime + to dobbelttimer');
});

test('hver skoletime får sin egen kategori', () => {
  const w = lagDom().window;
  const ev = id => w.eval('events').find(e => e.id === id);
  const k = (id, d) => w.skoletimeKategorier(ev(id), d).map(x => x.kategori);
  like(k(2, D1), ['ingenMotte'], 'begge borte');
  like(k(3, D1), ['medElever'], 'én til stede');
  like(k(5, D2), ['ingenMotte', 'medElever'], 'borte første halvdel, til stede andre');
  like(k(6, D2), ['ingenMotte', 'ingenMotte'], 'borte begge halvdeler');
  like(k(4, D2), ['utenElever'], 'uten elevliste');
});

test('en time der oppmøtet aldri ble åpnet, teller som med elever', () => {
  const w = lagDom().window;
  like(w.skoletimeKategorier(w.eval('events').find(e => e.id === 1), D1).map(x => x.kategori),
    ['medElever'], 'manglende kryss = til stede');
});

test('elevlista slik den var den dagen avgjør, ikke dagens', () => {
  const w = lagDom().window;
  like(w.skoletimeKategorier(w.eval('events').find(e => e.id === 11), D3).map(x => x.kategori),
    ['medElever'], 'ført oppmøte er fasit');
});

test('en undervisningstime utenfor timeplanen teller som én', () => {
  const w = lagDom().window;
  const ev = w.Object.assign({}, en(60, D3, { start: '16:00', end: '17:00' }));
  like(w.finnSkoletimer(ev).length, 0, 'ingen skoletimer');
  like(w.skoletimeKategorier(ev, D3).length, 1, 'én likevel');
});

test('møter, vikartimer, ferier og framtidige timer er ikke med', () => {
  const w = lagDom().window;
  like(w.tellUndervisningstimer(dagerFra(-30), dagerFra(10)).total, 9, 'samme antall som uten framtiden');
  like(w.tellUndervisningstimer(FERIE, FERIE).total, 0, 'ferien');
  like(w.tellUndervisningstimer(D3, D3).total, 1, 'bare time 11 den dagen — ikke møtet og vikartimen');
});

test('dagens skoletimer telles først når de er over', () => {
  const w = lagDom().window;
  const iDag = w.eval('isoDate(TODAY)');
  w.eval('events').push(w.Object.assign({}, en(50, iDag, { start: '08:30', end: '09:15' })));
  w.eval('events').push(w.Object.assign({}, en(51, iDag, { start: '13:25', end: '14:10' })));
  w.eval('events').push(w.Object.assign({}, en(52, iDag, { start: '10:20', end: '12:20' })));  // dobbel
  const kl = (h, m) => { const d = new w.Date(); d.setHours(h, m, 0, 0); return d; };
  like(w.tellUndervisningstimer(iDag, iDag, kl(7, 0)).total, 0, 'før første time');
  like(w.tellUndervisningstimer(iDag, iDag, kl(11, 0)).total, 1, 'første halvdel av dobbelttimen pågår');
  like(w.tellUndervisningstimer(iDag, iDag, kl(12, 0)).total, 2, 'første halvdel av dobbelttimen er over');
  like(w.tellUndervisningstimer(iDag, iDag, kl(15, 0)).total, 4, 'etter skolen');
});

test('per fag og trinn: uten elever-timen står på sin egen linje', () => {
  const t = tell(lagDom().window);
  const navn = t.perLinje.map(l => l.navn);
  sant(navn.includes('Kroppsøving · 8.–10. trinn'), 'linjen for kroppsøving: ' + navn.join(' | '));
  const kroo = t.perLinje.find(l => l.fag === 'Kroppsøving');
  like(kroo.utenElever, 1, 'uten elever');
});

test('lista over timer der ingen møtte, nyeste først, med skoletimene', () => {
  const t = tell(lagDom().window);
  like(t.ingenMotteListe.map(x => x.dato), [D2, D2, D1], 'datoene');
  like(t.ingenMotteListe.map(x => x.timer.map(p => p.n)), [[3, 4], [1], [2]], 'skoletimene');
});

// ══════════════════════════════════════════════════════════════
// MIN SIDE
// ══════════════════════════════════════════════════════════════

test('seksjonen ligger etter Varsler på Min side', () => {
  const doc = lagDom().window.document;
  const titler = [...doc.querySelectorAll('#minSideView .innst-seksjon-tittel')].map(e => e.textContent.trim());
  like(titler[titler.indexOf('Varsler') + 1], 'Undervisningstimer', 'rekkefølge');
});

test('tallene tegnes først når Min side åpnes', () => {
  const w = lagDom().window;
  const el = w.document.getElementById('undervisningStatistikk');
  like(el.innerHTML.trim(), '', 'tom før Min side er åpnet');
  w.setView('minside');
  w.velgStatistikkPeriode('aar');
  like(el.querySelector('[data-stat="ingenMotte"]').textContent, '4', 'ingen møtte');
  like(el.querySelector('[data-stat="utenElever"]').textContent, '1', 'uten elever');
  sant(el.querySelectorAll('.stat-tabell tbody tr').length >= 2, 'tabell per fag');
  like(el.querySelectorAll('[data-stat-dato]').length, 3, 'lenker til timene der ingen møtte');
  sant(el.querySelector('[data-stat-dato]').textContent.includes('3.–4. time'), 'skoletimene står på lenken');
});

test('uten terminskille er det ingen termin-knapp, og skoleåret velges', () => {
  const w = lagDom().window;
  w.setView('minside');
  const el = w.document.getElementById('undervisningStatistikk');
  const knapper = [...el.querySelectorAll('[data-stat-periode]')].map(b => b.dataset.statPeriode);
  like(knapper, ['uke', 'aar'], 'knappene');
  like(el.querySelector('.view-btn.active').dataset.statPeriode, 'aar', 'aktiv');
});

test('med terminskille starter visningen på terminen', () => {
  const w = lagDom({ start: dagerFra(-60), slutt: dagerFra(200), terminskille: dagerFra(100) }).window;
  w.eval("statistikkPeriode = 'termin'");
  w.setView('minside');
  const el = w.document.getElementById('undervisningStatistikk');
  like(el.querySelector('.view-btn.active').dataset.statPeriode, 'termin', 'aktiv');
  like(el.querySelector('.view-btn.active').textContent, '1. termin', 'etikett');
});

test('calcSFS er borte', () => {
  like(typeof lagDom().window.calcSFS, 'undefined', 'calcSFS');
});

// ══════════════════════════════════════════════════════════════
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK  ', navn); }
  catch (e) { alle = false; console.log('  FEIL', navn, '\n       ', e.message); }
}
console.log(alle ? '\nAlle tester passerte.' : '\nNoen tester feilet.');
process.exit(alle ? 0 : 1);
