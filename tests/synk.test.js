// Tester for kryptering og utvalg av synkdata i sync.js.
// Kjøres uten Supabase — vi laster bare fila og kaller funksjonene direkte.
const fs   = require('fs');
const vm   = require('node:vm');
const path = require('node:path').join(__dirname, '..') + '/';

const kode = fs.readFileSync(path + 'sync.js', 'utf8');

function lagStore(seed = {}) {
  const data = { ...seed };
  return {
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; },
    _dump: () => data
  };
}

// Minimalt miljø: sync.js trenger crypto, localStorage, btoa/atob,
// TextEncoder/Decoder og en document-stubb for statusvisningen.
function lagKontekst(store) {
  const ctx = {
    localStorage: store,
    crypto: require('node:crypto').webcrypto,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    TextEncoder, TextDecoder,
    console, setTimeout, clearTimeout,
    document: { getElementById: () => null },
    window: {},
    alert: () => {}, confirm: () => true,
    loadFromStorage: () => {}, render: () => {}
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(kode, ctx);
  // const/let på toppnivå blir ikke egenskaper på kontekstobjektet
  ctx.hent = uttrykk => vm.runInContext(uttrykk, ctx);
  return ctx;
}

const tester = [];
function test(navn, fn) { tester.push([navn, fn]); }

function like(a, b, hva) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(hva + ': ventet ' + sb + ', fikk ' + sa);
}
function sant(v, hva) { if (!v) throw new Error(hva); }

// ── Kryptering ─────────────────────────────────────────────────
test('krypter og dekrypter gir samme tekst tilbake', async () => {
  const ctx = lagKontekst(lagStore());
  const klartekst = JSON.stringify({ lp_events: '[{"id":1}]' });
  const pakke = await ctx.krypter(klartekst, 'riktig-passfrase');
  const ut    = await ctx.dekrypter(pakke, 'riktig-passfrase');
  like(ut, klartekst, 'rundtur');
});

test('chifferteksten inneholder ikke klartekst', async () => {
  const ctx = lagKontekst(lagStore());
  const pakke = await ctx.krypter(JSON.stringify({ hemmelig: 'Esekiel' }), 'passfrase123');
  sant(!pakke.ciphertext.includes('Esekiel'), 'navn skal ikke være lesbart');
  sant(!Buffer.from(pakke.ciphertext, 'base64').toString('utf8').includes('Esekiel'),
       'navn skal ikke være lesbart etter base64-dekoding');
});

test('feil passfrase gir feil, ikke tull', async () => {
  const ctx = lagKontekst(lagStore());
  const pakke = await ctx.krypter('hemmelig innhold', 'riktig');
  let kastet = false;
  try { await ctx.dekrypter(pakke, 'feil'); } catch { kastet = true; }
  sant(kastet, 'dekryptering med feil passfrase skal kaste');
});

test('samme tekst gir ulik chiffertekst hver gang', async () => {
  const ctx = lagKontekst(lagStore());
  const a = await ctx.krypter('samme tekst', 'passfrase');
  const b = await ctx.krypter('samme tekst', 'passfrase');
  sant(a.ciphertext !== b.ciphertext, 'tilfeldig IV og salt skal gi ulikt resultat');
});

// ── Utvalg av data ─────────────────────────────────────────────
test('elevnavn er ikke med i det som synkes', async () => {
  const ctx = lagKontekst(lagStore({
    lp_students:     '[{"id":"a1","trinn":10}]',
    lp_studentNames: '{"a1":"Esekiel"}',
    lp_events:       '[]'
  }));
  const json = ctx.samleSynkdata();
  sant(!json.includes('studentNames'), 'lp_studentNames skal ikke samles opp');
  sant(!json.includes('Esekiel'),      'navnet skal ikke være med');
  sant(json.includes('lp_students'),   'strukturen skal være med');
});

test('innkommende data kan ikke overskrive elevnavn', async () => {
  const store = lagStore({ lp_studentNames: '{"a1":"Esekiel"}' });
  const ctx = lagKontekst(store);
  // En ondsinnet eller feilaktig nyttelast prøver å sette navn
  ctx.skrivSynkdata(JSON.stringify({
    lp_events:       '[{"id":9}]',
    lp_studentNames: '{"a1":"Overskrevet"}'
  }));
  like(JSON.parse(store.getItem('lp_studentNames')), { a1: 'Esekiel' },
       'lokale navn skal være urørt');
  like(store.getItem('lp_events'), '[{"id":9}]', 'events skal være oppdatert');
});

test('alle synknøkler er lp-nøkler og navn er utelatt', async () => {
  const ctx = lagKontekst(lagStore());
  const nokler = ctx.hent('SYNK_NOKLER');
  sant(nokler.every(k => k.startsWith('lp_')), 'alle nøkler skal ha lp-prefiks');
  sant(!nokler.includes('lp_studentNames'), 'navnekartet skal ikke synkes');
  sant(!nokler.includes('lp_sync_passfrase'), 'passfrasen skal ikke synkes');
});

// ── Innlogging ─────────────────────────────────────────────────
test('passfrasen sendes aldri som passord', async () => {
  const kilde = fs.readFileSync(path + 'sync.js', 'utf8');
  // Innloggingen skal lese passordfeltet, aldri passfrasenøkkelen
  const innlogging = kilde.slice(kilde.indexOf('function lesInnloggingsfelt'),
                                 kilde.indexOf('async function synkLoggUt'));
  sant(!innlogging.includes('LS_PASSFRASE'),
       'innloggingen skal ikke røre passfrasen');
  sant(innlogging.includes('synkPassord'), 'innloggingen skal lese passordfeltet');
});

test('feilmeldinger oversettes til norsk', async () => {
  const ctx = lagKontekst(lagStore());
  like(ctx.synkFeilTekst('Invalid login credentials'), 'Feil e-post eller passord.',
       'vanligste feil');
  like(ctx.synkFeilTekst('User already registered'),
       'Det finnes allerede en konto på denne adressen — logg inn i stedet.',
       'konto finnes');
  sant(ctx.synkFeilTekst('noe ukjent') === 'noe ukjent', 'ukjent feil slippes gjennom');
  sant(ctx.synkFeilTekst('') === 'Noe gikk galt.', 'tom feil får standardtekst');
});

test('magisk lenke er faktisk fjernet', async () => {
  const kilde = fs.readFileSync(path + 'sync.js', 'utf8');
  sant(!kilde.includes('signInWithOtp'), 'signInWithOtp skal være borte');
  sant(kilde.includes('signInWithPassword'), 'signInWithPassword mangler');
  sant(kilde.includes('auth.signUp'), 'signUp mangler');
});

test('markup har feltene innloggingen leser', async () => {
  const html = fs.readFileSync(path + 'index.html', 'utf8');
  ['synkEpost', 'synkPassord', 'synkPassfrase', 'synkNyttPassord'].forEach(id => {
    sant(html.includes('id="' + id + '"'), 'mangler #' + id);
  });
  sant(html.includes('synkOpprettKonto()'), 'mangler knapp for å opprette konto');
  sant(html.includes('synkSettPassord()'), 'mangler knapp for å sette passord');
  sant(html.includes('synkGlemtPassord()'), 'mangler reservevei ved glemt passord');
});

test('kontoer laget med magisk lenke kan få passord i ettertid', async () => {
  const kilde = fs.readFileSync(path + 'sync.js', 'utf8');
  sant(kilde.includes('auth.updateUser'), 'updateUser mangler — uten den er slike kontoer låst ute');
  sant(kilde.includes('resetPasswordForEmail'), 'mangler reservevei når sesjonen er borte');

  // Nytt passord skal aldri hentes fra passfrasefeltet
  const bolk = kilde.slice(kilde.indexOf('async function synkSettPassord'),
                           kilde.indexOf('async function synkGlemtPassord'));
  sant(!bolk.includes('LS_PASSFRASE') && !bolk.includes('synkPassfrase'),
       'passordsetting skal ikke røre passfrasen');
});

// ── Publiserte kalendere ───────────────────────────────────────
test('token lages én gang og gjenbrukes', async () => {
  const store = lagStore();
  const ctx = lagKontekst(store);
  const a = ctx.feedToken('undervisning');
  const b = ctx.feedToken('undervisning');
  like(a, b, 'samme token ved gjentatte kall');
  like(store.getItem('lp_ics_token'), a, 'token skal lagres');
  sant(a.length >= 32, 'token må være for langt til å gjettes');
});

test('de to kalenderne har ulike adresser', async () => {
  const ctx = lagKontekst(lagStore());
  ctx.hent('synkBruker = { id: "bruker-123" }');
  const u = ctx.feedAdresse('undervisning');
  const j = ctx.feedAdresse('jobb');
  sant(u !== j, 'adressene må være forskjellige');
  sant(u.includes('undervisning-'), 'undervisningskalenderen: ' + u);
  sant(j.includes('jobb-'), 'jobbkalenderen: ' + j);
  sant(u.includes('bruker-123/') && j.includes('bruker-123/'),
       'begge skal ligge under bruker-id — RLS krever det');
});

test('deling av jobbkalenderen avslører ikke timeplanen', async () => {
  const ctx = lagKontekst(lagStore());
  ctx.hent('synkBruker = { id: "bruker-123" }');
  const jobbToken = ctx.feedToken('jobb');
  const undToken  = ctx.feedToken('undervisning');
  sant(jobbToken !== undToken, 'kalenderne må ha hver sin nøkkel');
  sant(!ctx.feedAdresse('jobb').includes(undToken),
       'jobbadressen skal ikke inneholde undervisningsnøkkelen');
});

test('ingen adresse uten innlogging', async () => {
  const ctx = lagKontekst(lagStore());
  ctx.hent('synkBruker = null');
  like(ctx.feedAdresse('jobb'), null, 'adresse krever innlogget bruker');
  like(ctx.feedFilsti('jobb'), null, 'filsti krever innlogget bruker');
});

test('begge kalendere er av som standard', async () => {
  const ctx = lagKontekst(lagStore());
  like(ctx.feedPubliseres('undervisning'), false, 'undervisning');
  like(ctx.feedPubliseres('jobb'), false, 'jobb');
});

test('nøkler og valg synkes mellom enheter', async () => {
  const ctx = lagKontekst(lagStore());
  const nokler = ctx.hent('SYNK_NOKLER');
  ['lp_ics_token', 'lp_ics_publiser', 'lp_jobb_token', 'lp_jobb_publiser']
    .forEach(k => sant(nokler.includes(k), 'mangler ' + k + ' — hver enhet ville fått egen adresse'));
  sant(!nokler.includes('lp_studentNames'), 'navn skal aldri synkes');
  sant(!nokler.includes('lp_sync_passfrase'), 'passfrasen skal aldri synkes');
});

test('avslåing gir ny adresse neste gang', async () => {
  const kilde = fs.readFileSync(path + 'sync.js', 'utf8');
  const bolk = kilde.slice(kilde.indexOf('async function slaAvFeed'),
                           kilde.indexOf('async function oppdaterPubliserteKalendere'));
  sant(bolk.includes('remove('), 'den publiserte fila skal slettes');
  sant(bolk.includes('removeItem(f.tokenKey)'),
       'nøkkelen må kastes, ellers kan en lekket adresse gjenbrukes');
});

test('publisering henger på synk, men velter den ikke', async () => {
  const kilde = fs.readFileSync(path + 'sync.js', 'utf8');
  const push = kilde.slice(kilde.indexOf('async function syncPush()'),
                           kilde.indexOf('async function syncPull'));
  sant(push.includes('oppdaterPubliserteKalendere()'), 'syncPush skal oppdatere kalenderne');

  const oppd = kilde.slice(kilde.indexOf('async function oppdaterPubliserteKalendere'),
                           kilde.indexOf('async function kopierFeedAdresse'));
  sant(oppd.includes('try'), 'en feilende opplasting skal ikke velte synken');
  sant(oppd.includes('stille: true'), 'ingen dialoger under automatisk oppdatering');
});

test('markup har feltene for begge kalendere', async () => {
  const html = fs.readFileSync(path + 'index.html', 'utf8');
  ['av-undervisning', 'paa-undervisning', 'adresse-undervisning',
   'av-jobb', 'paa-jobb', 'adresse-jobb', 'icsKrevInnlogging']
    .forEach(id => sant(html.includes('id="' + id + '"'), 'mangler #' + id));
  sant(html.includes("publiserFeed('jobb')"), 'mangler publiser-knapp for jobb');
  sant(html.includes("slaAvFeed('undervisning')"), 'mangler av-knapp for undervisning');
  sant(/ikke krypterte/i.test(html), 'advarselen om manglende kryptering må stå der');
});

// ── Vern mot datatap ───────────────────────────────────────────
// 6. august 2026 spiste synken en times arbeid: enheten hadde endringer
// fra 19:10 som aldri ble lastet opp, siste synk var 18:07, og en pull ved
// oppstart la skyens 18:07-kopi rett oppå. Testene under gjenskaper akkurat
// det, og et par nabotilfeller.

// Bygger et miljø med en falsk Supabase som svarer med én rad.
async function lagSynkKontekst(store, serverInnhold, serverTid, { svarPaaSporsmal = true } = {}) {
  const ctx = lagKontekst(store);
  const pakke = await ctx.krypter(JSON.stringify(serverInnhold), 'passfrase123');
  ctx.confirm = () => svarPaaSporsmal;
  ctx.hent(`
    supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
          ciphertext: ${JSON.stringify(pakke.ciphertext)},
          salt: ${JSON.stringify(pakke.salt)},
          iv: ${JSON.stringify(pakke.iv)},
          updated_at: ${JSON.stringify(serverTid)},
          enhet: 'annen enhet'
        }, error: null }) }) }),
        upsert: () => ({ select: () => ({ maybeSingle: async () => {
          globalThis.__pushet = true;
          return { data: { updated_at: new Date().toISOString() }, error: null };
        } }) })
      })
    };
    synkBruker = { id: 'u1' };
  `);
  return ctx;
}

const LOKALT  = { lp_events: '[{"id":1},{"id":2},{"id":3}]', lp_lessonData: '{"a":1,"b":2}' };
const SKYKOPI = { lp_events: '[{"id":9}]',                    lp_lessonData: '{}' };

test('pull overskriver ikke lokale endringer som ikke er lastet opp', async () => {
  const store = lagStore({
    ...LOKALT,
    lp_sync_passfrase: 'passfrase123',
    lp_sync_sist:   '2026-08-06T18:07:00.000Z',   // siste synk
    lp_sist_endret: '2026-08-06T19:10:00.000Z',   // siste lokale endring
    lp_sync_pullet: 'ja'
  });
  // Brukeren svarer OK = behold det lokale
  const ctx = await lagSynkKontekst(store, SKYKOPI, '2026-08-06T18:30:00.000Z', { svarPaaSporsmal: true });
  await ctx.hent('syncPull()');

  like(store.getItem('lp_events'), LOKALT.lp_events, 'de lokale timene skal stå urørt');
  like(store.getItem('lp_lessonData'), LOKALT.lp_lessonData, 'elevloggen skal stå urørt');
  sant(ctx.hent('globalThis.__pushet'), 'det lokale skal lastes opp i stedet');
});

test('velger brukeren skykopien, tas det sikkerhetskopi først', async () => {
  const store = lagStore({
    ...LOKALT,
    lp_sync_passfrase: 'passfrase123',
    lp_sync_sist:   '2026-08-06T18:07:00.000Z',
    lp_sist_endret: '2026-08-06T19:10:00.000Z',
    lp_sync_pullet: 'ja'
  });
  // Avbryt = hent ned skykopien likevel
  const ctx = await lagSynkKontekst(store, SKYKOPI, '2026-08-06T18:30:00.000Z', { svarPaaSporsmal: false });
  await ctx.hent('syncPull()');

  like(store.getItem('lp_events'), SKYKOPI.lp_events, 'skykopien skal være lastet inn');
  const info = ctx.hent('synkKopiInfo()');
  sant(info, 'det skal finnes en sikkerhetskopi');
  like(info.antallTimer, 3, 'kopien har de tre lokale timene');
  like(info.antallLogg, 2, 'og de to loggførte timene');
});

test('uten lokale endringer hentes skykopien uten spørsmål', async () => {
  const store = lagStore({
    ...LOKALT,
    lp_sync_passfrase: 'passfrase123',
    lp_sync_sist:   '2026-08-06T18:07:00.000Z',
    lp_sist_endret: '2026-08-06T18:07:00.000Z',   // i takt med skyen
    lp_sync_pullet: 'ja'
  });
  let spurt = false;
  const ctx = await lagSynkKontekst(store, SKYKOPI, '2026-08-06T18:30:00.000Z');
  ctx.confirm = () => { spurt = true; return false; };
  await ctx.hent('syncPull()');

  sant(!spurt, 'ingen grunn til å spørre når ingenting kan gå tapt');
  like(store.getItem('lp_events'), SKYKOPI.lp_events, 'skykopien lastet inn');
  like(store.getItem('lp_sist_endret'), store.getItem('lp_sync_sist'),
       'etter pull er lokalt og sky i takt');
});

test('enhet som ikke har lest skyen får ikke laste opp', async () => {
  const store = lagStore({
    lp_events: '[]',                       // tom enhet, som en fersk telefon
    lp_sync_passfrase: 'feil-passfrase',   // pullen vil feile på dekrypteringen
    lp_lessonData: '{}'
  });
  const ctx = await lagSynkKontekst(store, SKYKOPI, '2026-08-06T18:30:00.000Z');
  await ctx.hent('syncPush()');

  sant(!ctx.hent('globalThis.__pushet'), 'den tomme tilstanden skal ikke nå skyen');
  sant(!ctx.hent('harPulletDenneEnheten()'), 'enheten skal ikke regnes som oppdatert');
});

test('sist_endret sammenlignes riktig', async () => {
  const ctx = lagKontekst(lagStore({
    lp_sync_sist:   '2026-08-06T18:00:00.000Z',
    lp_sist_endret: '2026-08-06T19:00:00.000Z'
  }));
  sant(ctx.hent('harUlagredeEndringer()'), 'nyere endring enn synk = ulagret arbeid');

  const ctx2 = lagKontekst(lagStore({
    lp_sync_sist:   '2026-08-06T19:00:00.000Z',
    lp_sist_endret: '2026-08-06T18:00:00.000Z'
  }));
  sant(!ctx2.hent('harUlagredeEndringer()'), 'eldre endring enn synk = alt er lastet opp');

  const ctx3 = lagKontekst(lagStore({ lp_sist_endret: '2026-08-06T19:00:00.000Z' }));
  sant(ctx3.hent('harUlagredeEndringer()'), 'endringer men aldri synket = ulagret arbeid');

  const ctx4 = lagKontekst(lagStore({}));
  sant(!ctx4.hent('harUlagredeEndringer()'), 'tom enhet har ingenting å miste');
});

// ── Kjør ───────────────────────────────────────────────────────
(async () => {
  console.log('\nSynk og kryptering\n');
  let alle = true;
  for (const [navn, fn] of tester) {
    try { await fn(); console.log('  OK   ' + navn); }
    catch (e) { alle = false; console.log('  FEIL ' + navn + '\n       ' + e.message); }
  }
  console.log('\n' + (alle ? 'Alle tester passerte.' : 'Noen tester feilet.') + '\n');
  process.exit(alle ? 0 : 1);
})();
