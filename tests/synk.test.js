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

// ── Publisering av kalender ────────────────────────────────────
test('token lages én gang og gjenbrukes', async () => {
  const store = lagStore();
  const ctx = lagKontekst(store);
  const a = ctx.icsToken();
  const b = ctx.icsToken();
  like(a, b, 'samme token ved gjentatte kall');
  like(store.getItem('lp_ics_token'), a, 'token skal lagres');
  sant(a.length >= 32, 'token skal være lang nok til å ikke kunne gjettes');
  sant(!a.includes('-'), 'bindestreker fjernes for penere adresse');
});

test('adressen ligger under brukerens egen mappe', async () => {
  const ctx = lagKontekst(lagStore());
  // synkBruker er let på toppnivå og blir ikke en egenskap på konteksten
  ctx.hent('synkBruker = { id: "bruker-123" }');
  const url = ctx.icsAdresse();
  sant(url.includes('/storage/v1/object/public/kalender/'), 'feil bøtte: ' + url);
  sant(url.includes('bruker-123/'), 'skal ligge under bruker-id — RLS krever det');
  sant(url.endsWith('.ics'), 'skal ende på .ics');
});

test('ingen adresse uten innlogging', async () => {
  const ctx = lagKontekst(lagStore());
  ctx.hent('synkBruker = null');
  like(ctx.icsAdresse(), null, 'adresse krever innlogget bruker');
  like(ctx.icsFilsti(), null, 'filsti krever innlogget bruker');
});

test('publisering er av som standard', async () => {
  const ctx = lagKontekst(lagStore());
  like(ctx.icsPubliseres(), false, 'skal være avslått til brukeren velger det');
});

test('token og publiseringsflagg synkes mellom enheter', async () => {
  const ctx = lagKontekst(lagStore());
  const nokler = ctx.hent('SYNK_NOKLER');
  sant(nokler.includes('lp_ics_token'), 'uten dette får hver enhet sin egen adresse');
  sant(nokler.includes('lp_ics_publiser'), 'publiseringsvalget bør følge med');
  // Men fortsatt ingen navn og ingen passfrase
  sant(!nokler.includes('lp_studentNames'), 'navn skal aldri synkes');
  sant(!nokler.includes('lp_sync_passfrase'), 'passfrasen skal aldri synkes');
});

test('avslåing gir ny adresse neste gang', async () => {
  const kilde = fs.readFileSync(path + 'sync.js', 'utf8');
  const bolk = kilde.slice(kilde.indexOf('async function slaAvICSPublisering'),
                           kilde.indexOf('async function kopierICSAdresse'));
  sant(bolk.includes('remove('), 'den publiserte fila skal slettes');
  sant(bolk.includes(`removeItem(LS_ICS_TOKEN)`),
       'token må nullstilles, ellers kan den gamle adressen gjenbrukes');
});

test('publisering henger på synk, men velter den ikke', async () => {
  const kilde = fs.readFileSync(path + 'sync.js', 'utf8');
  const push = kilde.slice(kilde.indexOf('async function syncPush()'),
                           kilde.indexOf('async function syncPull'));
  sant(push.includes('icsPubliseres()'), 'syncPush skal oppdatere publisert kalender');
  sant(push.includes('stille: true'), 'publiseringen skal ikke gi dialoger under synk');
});

test('markup har publiseringsfeltene', async () => {
  const html = fs.readFileSync(path + 'index.html', 'utf8');
  ['icsAv', 'icsPaa', 'icsAdresse', 'icsKrevInnlogging'].forEach(id => {
    sant(html.includes('id="' + id + '"'), 'mangler #' + id);
  });
  sant(html.includes('publiserICS()'), 'mangler publiser-knapp');
  sant(html.includes('slaAvICSPublisering()'), 'mangler av-knapp');
  sant(/ikke kryptert/i.test(html), 'advarselen om manglende kryptering må stå der');
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
