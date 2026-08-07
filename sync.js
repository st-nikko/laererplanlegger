// ════════════════════════════════════════════════════════════
// SYNK — kryptert synkronisering mellom enheter via Supabase
// ════════════════════════════════════════════════════════════
//
// Prinsipp: hele datasettet krypteres i nettleseren med en passfrase
// bare du kjenner, og lastes opp som én ugjennomtrengelig streng.
// Supabase lagrer og henter, men kan ikke lese innholdet.
//
// Elevnavn synkes aldri. De ligger i lp_studentNames og forlater
// ikke enheten — se ELEVNAVN-seksjonen i app.js.
//
// Konfliktmodell: siste skriving vinner. Redigerer du på to enheter
// samtidig, går den eldste endringen tapt. Akseptabelt for én bruker
// med én enhet om gangen; UI viser derfor alltid sist synkronisert.

// ────────────────────────────────────────────
// KONFIGURASJON
// ────────────────────────────────────────────
const SUPABASE_URL  = 'https://sfghgzktphhraiqiwcym.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmZ2hnemt0cGhocmFpcWl3Y3ltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NDU1NjUsImV4cCI6MjEwMTMyMTU2NX0.4v9zb_1gyJmZCQW2TiyxFwayFUAf8E86SfjNXJXZPwQ';

// Nøkler som synkes. lp_studentNames er bevisst utelatt.
// ics-nøklene er med så alle enheter publiserer til samme adresse.
const SYNK_NOKLER = [
  'lp_events', 'lp_todos', 'lp_planfestetTid', 'lp_overtid',
  'lp_lessonData', 'lp_topicsBySubject', 'lp_students',
  'lp_fridager', 'lp_skoleaar',
  'lp_ics_token', 'lp_ics_publiser',
  'lp_jobb_token', 'lp_jobb_publiser'
];

// Lokale nøkler for synktilstand
const LS_PASSFRASE   = 'lp_sync_passfrase';
const LS_SIST_SYNK   = 'lp_sync_sist';
const LS_ENHETSNAVN  = 'lp_sync_enhet';

// ── Vern mot at synken spiser data ──
// Synken er «siste skriver vinner» på én stor blokk. Uten disse tre
// nøklene kan en enhet som aldri har lest serverkopien overskrive den, og
// en pull kan viske ut lokale endringer som aldri rakk å bli lastet opp.
// Begge deler skjedde 6. august 2026.
const LS_SIST_ENDRET = 'lp_sist_endret';   // når data sist ble endret her
const LS_PULLET      = 'lp_sync_pullet';   // har denne enheten lest skyen?
const LS_SYNK_KOPI   = 'lp_synk_kopi';     // lokal kopi tatt før siste pull
const ICS_BUCKET     = 'kalender';

let supabase       = null;
let synkBruker     = null;   // innlogget bruker, eller null
let synkStatus     = 'av';   // av | venter | synker | ok | feil
let synkMelding    = '';
let pushTimer      = null;

// ────────────────────────────────────────────
// OPPSTART
// ────────────────────────────────────────────
async function initSync() {
  if (!window.supabaseJs) return;               // biblioteket lastet ikke
  supabase = window.supabaseJs.createClient(SUPABASE_URL, SUPABASE_ANON);

  const { data } = await supabase.auth.getSession();
  synkBruker = data?.session?.user || null;

  supabase.auth.onAuthStateChange((_e, sesjon) => {
    synkBruker = sesjon?.user || null;
    tegnSynkStatus();
    if (synkBruker && harPassfrase()) syncPull();
  });

  if (synkBruker && harPassfrase()) {
    await syncPull();
  } else {
    settStatus('av', synkBruker ? 'Passfrase mangler' : 'Ikke innlogget');
  }
}

function settStatus(status, melding = '') {
  synkStatus  = status;
  synkMelding = melding;
  tegnSynkStatus();
}

function harPassfrase() {
  return Boolean(localStorage.getItem(LS_PASSFRASE));
}

function enhetsnavn() {
  let n = localStorage.getItem(LS_ENHETSNAVN);
  if (!n) {
    n = 'Enhet ' + Math.random().toString(36).slice(2, 6);
    localStorage.setItem(LS_ENHETSNAVN, n);
  }
  return n;
}

// ────────────────────────────────────────────
// KRYPTERING (AES-GCM, nøkkel utledet med PBKDF2)
// ────────────────────────────────────────────
// Passfrasen forlater aldri enheten. Salt og IV er ikke hemmelige og
// lagres i klartekst sammen med chifferteksten — de er der for at
// samme passfrase skal gi ulik chiffertekst hver gang.

const PBKDF2_RUNDER = 250000;

function tilBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fraBase64(s) {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

async function utledNokkel(passfrase, salt) {
  const enc = new TextEncoder();
  const raa = await crypto.subtle.importKey(
    'raw', enc.encode(passfrase), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_RUNDER, hash: 'SHA-256' },
    raa,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function krypter(klartekst, passfrase) {
  const salt   = crypto.getRandomValues(new Uint8Array(16));
  const iv     = crypto.getRandomValues(new Uint8Array(12));
  const nokkel = await utledNokkel(passfrase, salt);
  const buf    = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, nokkel, new TextEncoder().encode(klartekst)
  );
  return { ciphertext: tilBase64(buf), salt: tilBase64(salt), iv: tilBase64(iv) };
}

async function dekrypter(pakke, passfrase) {
  const salt   = fraBase64(pakke.salt);
  const iv     = fraBase64(pakke.iv);
  const nokkel = await utledNokkel(passfrase, salt);
  const buf    = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, nokkel, fraBase64(pakke.ciphertext)
  );
  return new TextDecoder().decode(buf);
}

// ────────────────────────────────────────────
// HVA SOM SYNKES
// ────────────────────────────────────────────
function samleSynkdata() {
  const ut = {};
  SYNK_NOKLER.forEach(k => {
    const v = localStorage.getItem(k);
    if (v !== null) ut[k] = v;
  });
  return JSON.stringify(ut);
}

function skrivSynkdata(json) {
  const inn = JSON.parse(json);
  Object.keys(inn).forEach(k => {
    // Vokter mot at en fremtidig endring smugler navn inn i synken
    if (!SYNK_NOKLER.includes(k)) return;
    localStorage.setItem(k, inn[k]);
  });
}

// ────────────────────────────────────────────
// PUSH / PULL
// ────────────────────────────────────────────

// Kalles fra saveToStorage(). Samler opp endringer i to sekunder slik
// at en serie raske lagringer blir én opplasting.
function syncPushDebounced() {
  if (!klarTilSynk()) return;
  settStatus('venter');
  clearTimeout(pushTimer);
  pushTimer = setTimeout(syncPush, 2000);
}

function klarTilSynk() {
  return Boolean(supabase && synkBruker && harPassfrase());
}

// ────────────────────────────────────────────
// VERN MOT DATATAP
// ────────────────────────────────────────────

// Har denne enheten faktisk fått ned serverkopien? En pull som feiler på
// dekrypteringen lar appen kjøre videre som normalt — og uten dette
// flagget ville første lagring lastet opp enhetens egen, tomme tilstand
// oppå alt som lå i skyen.
function harPulletDenneEnheten() {
  return localStorage.getItem(LS_PULLET) === 'ja';
}
function merkPullet() {
  localStorage.setItem(LS_PULLET, 'ja');
}

// Finnes det lokale endringer som aldri ble lastet opp? LS_SIST_SYNK sier
// når vi sist snakket med serveren, LS_SIST_ENDRET når dataene sist ble
// rørt her. Er det siste nyere enn det første, ligger det arbeid her som
// skyen ikke kjenner til.
function harUlagredeEndringer() {
  const endret = localStorage.getItem(LS_SIST_ENDRET);
  if (!endret) return false;
  const sist = localStorage.getItem(LS_SIST_SYNK);
  if (!sist) return true;
  return new Date(endret) > new Date(sist);
}

// Tas rett før en pull skriver over. Uten den er en feilaktig synk
// endelig; med den er den til å angre.
function taSynkKopi() {
  try {
    const data = {};
    SYNK_NOKLER.forEach(k => {
      const v = localStorage.getItem(k);
      if (v !== null) data[k] = v;
    });
    localStorage.setItem(LS_SYNK_KOPI, JSON.stringify({
      tidspunkt: new Date().toISOString(),
      data
    }));
  } catch (e) {
    console.warn('Kunne ikke ta sikkerhetskopi før synk:', e);
  }
}

function synkKopiInfo() {
  try {
    const raa = localStorage.getItem(LS_SYNK_KOPI);
    if (!raa) return null;
    const kopi = JSON.parse(raa);
    const antallTimer = JSON.parse(kopi.data.lp_events || '[]').length;
    const antallLogg  = Object.keys(JSON.parse(kopi.data.lp_lessonData || '{}')).length;
    return { tidspunkt: kopi.tidspunkt, antallTimer, antallLogg };
  } catch { return null; }
}

// Legger tilbake det som lå her før forrige pull, og laster det opp så
// skyen slutter å sende ned den dårlige kopien.
async function gjenopprettForSynk() {
  const raa = localStorage.getItem(LS_SYNK_KOPI);
  if (!raa) { alert('Det finnes ingen sikkerhetskopi å gjenopprette fra.'); return; }
  const info = synkKopiInfo();
  const naar = info ? new Date(info.tidspunkt).toLocaleString('nb-NO') : 'ukjent tidspunkt';
  if (!confirm(
    `Legge tilbake dataene slik de var før forrige synk (${naar})?\n\n` +
    `Kopien har ${info ? info.antallTimer : '?'} timer og ${info ? info.antallLogg : '?'} loggførte timer.\n\n` +
    `Det som ligger her nå blir erstattet.`
  )) return;

  const kopi = JSON.parse(raa);
  Object.entries(kopi.data).forEach(([k, v]) => {
    if (SYNK_NOKLER.includes(k)) localStorage.setItem(k, v);
  });
  localStorage.setItem(LS_SIST_ENDRET, new Date().toISOString());
  if (typeof loadFromStorage === 'function') loadFromStorage();
  if (typeof render === 'function') render();
  // Last opp med én gang, ellers henter neste pull ned den dårlige kopien igjen
  await syncPush();
  alert('Dataene er lagt tilbake og lastet opp.');
}

async function syncPush() {
  if (!klarTilSynk()) return;

  // En enhet som ikke har lest skyen, får ikke skrive til den. Dette er
  // vernet mot at en telefon uten passfrase, eller en enhet der pullen
  // feilet, laster opp sin egen tomme tilstand oppå alt.
  if (!harPulletDenneEnheten()) {
    await syncPull({ stille: true });
    if (!harPulletDenneEnheten()) {
      settStatus('feil', 'Venter på å få ned skykopien før noe lastes opp');
      return;
    }
  }

  clearTimeout(pushTimer);
  settStatus('synker');
  try {
    const pakke = await krypter(samleSynkdata(), localStorage.getItem(LS_PASSFRASE));
    const na    = new Date().toISOString();

    // Les tilbake raden vi nettopp skrev. Serveren kan sette sin egen
    // updated_at, og lagrer vi vår egen klokke i stedet, vil neste pull
    // tro at skyen er nyere enn oss — og hente ned igjen ved hvert eneste
    // oppstart. Det er den unødvendige pullen som gjorde overskrivingen
    // 6. august 2026 mulig i det hele tatt.
    const { data: rad, error } = await supabase.from('sync_data').upsert({
      user_id:    synkBruker.id,
      ciphertext: pakke.ciphertext,
      salt:       pakke.salt,
      iv:         pakke.iv,
      updated_at: na,
      enhet:      enhetsnavn()
    }).select('updated_at').maybeSingle();
    if (error) throw error;

    const kvittert = (rad && rad.updated_at) ? rad.updated_at : na;
    localStorage.setItem(LS_SIST_SYNK, kvittert);
    // Vi er nå i takt med skyen: det som ligger her, ligger også der
    localStorage.setItem(LS_SIST_ENDRET, kvittert);
    merkPullet();
    settStatus('ok');

    // Er kalenderen publisert, holdes den oppdatert i samme slengen.
    // Feiler den, skal ikke selve synken regnes som mislykket.
    await oppdaterPubliserteKalendere();
  } catch (e) {
    console.warn('Synk opp feilet:', e);
    settStatus('feil', e.message || 'Kunne ikke laste opp');
  }
}

async function syncPull({ stille = false } = {}) {
  if (!klarTilSynk()) return;
  if (!stille) settStatus('synker');
  try {
    const { data, error } = await supabase
      .from('sync_data')
      .select('ciphertext, salt, iv, updated_at, enhet')
      .eq('user_id', synkBruker.id)
      .maybeSingle();
    if (error) throw error;

    // Ingen rad ennå — denne enheten er første som laster opp
    if (!data) { merkPullet(); await syncPush(); return; }

    const sist = localStorage.getItem(LS_SIST_SYNK);
    if (sist && new Date(data.updated_at) <= new Date(sist)) {
      merkPullet();       // vi har sett skyen, selv om vi ikke trengte den
      settStatus('ok');   // vi er allerede oppdatert
      return;
    }

    let json;
    try {
      json = await dekrypter(data, localStorage.getItem(LS_PASSFRASE));
    } catch {
      // Merk: LS_PULLET settes *ikke* her. Uten den kan denne enheten
      // heller ikke laste opp, og kan dermed ikke overskrive skyen med
      // en tilstand den aldri har sett.
      settStatus('feil', 'Feil passfrase — dataene kunne ikke låses opp');
      return;
    }

    // Ligger det lokalt arbeid her som aldri ble lastet opp, skal det ikke
    // forsvinne uten at brukeren får si sin mening. Det var nettopp dette
    // som spiste en dags arbeid 6. august 2026.
    if (harUlagredeEndringer()) {
      const endret = new Date(localStorage.getItem(LS_SIST_ENDRET)).toLocaleString('nb-NO');
      const beholdLokalt = confirm(
        `Denne enheten har endringer fra ${endret} som ikke er lastet opp, ` +
        `og det ligger en nyere kopi i skyen.\n\n` +
        `OK = behold det som ligger her, og last det opp\n` +
        `Avbryt = hent ned skykopien og forkast de lokale endringene`
      );
      merkPullet();
      if (beholdLokalt) {
        settStatus('ok');
        await syncPush();
        return;
      }
    }

    taSynkKopi();          // slik at en dårlig synk er til å angre
    skrivSynkdata(json);
    localStorage.setItem(LS_SIST_SYNK, data.updated_at);
    // Vi er nå identiske med skyen — ingen upushede endringer igjen
    localStorage.setItem(LS_SIST_ENDRET, data.updated_at);
    merkPullet();
    settStatus('ok');

    // Last inn på nytt slik at minnet stemmer med det nye innholdet
    loadFromStorage();
    render();
    tegnSynkStatus();
  } catch (e) {
    console.warn('Synk ned feilet:', e);
    settStatus('feil', e.message || 'Kunne ikke hente data');
  }
}

async function syncNaa() {
  if (!klarTilSynk()) { alert('Logg inn og sett passfrase først.'); return; }
  await syncPull();
  await syncPush();
}

// ────────────────────────────────────────────
// INNLOGGING (e-post og passord)
// ────────────────────────────────────────────
// Passordet slipper deg inn hos Supabase. Passfrasen lenger nede er noe
// helt annet: den låser opp dataene og sendes aldri til serveren.
// De må være forskjellige.

// Supabase svarer på engelsk. Oversett det vi faktisk kan treffe på.
function synkFeilTekst(melding) {
  const m = (melding || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'Feil e-post eller passord.';
  if (m.includes('user already registered')) return 'Det finnes allerede en konto på denne adressen — logg inn i stedet.';
  if (m.includes('password should be'))      return 'Passordet er for kort. Bruk minst 6 tegn.';
  if (m.includes('email not confirmed'))     return 'E-posten er ikke bekreftet. Slå av «Confirm email» i Supabase, eller bekreft via lenka du fikk tilsendt.';
  if (m.includes('rate limit') || m.includes('too many')) return 'For mange forsøk. Vent litt før du prøver igjen.';
  return melding || 'Noe gikk galt.';
}

function lesInnloggingsfelt() {
  const epost   = (document.getElementById('synkEpost')?.value || '').trim();
  const passord =  document.getElementById('synkPassord')?.value || '';
  if (!supabase) { alert('Synk er ikke tilgjengelig — kunne ikke laste Supabase.'); return null; }
  if (!epost)    { alert('Skriv inn e-postadressen din.'); return null; }
  if (!passord)  { alert('Skriv inn passordet ditt.'); return null; }
  return { epost, passord };
}

function tomInnloggingsfelt() {
  const p = document.getElementById('synkPassord');
  if (p) p.value = '';
}

async function synkLoggInn() {
  const felt = lesInnloggingsfelt();
  if (!felt) return;

  settStatus('synker', 'Logger inn …');
  const { error } = await supabase.auth.signInWithPassword({
    email: felt.epost, password: felt.passord
  });
  tomInnloggingsfelt();

  if (error) settStatus('feil', synkFeilTekst(error.message));
  else       settStatus('av', harPassfrase() ? '' : 'Innlogget. Sett en passfrase for å starte synk.');
}

async function synkOpprettKonto() {
  const felt = lesInnloggingsfelt();
  if (!felt) return;
  if (felt.passord.length < 6) { alert('Passordet må være minst 6 tegn.'); return; }

  settStatus('synker', 'Oppretter konto …');
  const { data, error } = await supabase.auth.signUp({
    email: felt.epost, password: felt.passord
  });
  tomInnloggingsfelt();

  if (error) { settStatus('feil', synkFeilTekst(error.message)); return; }

  // Er e-postbekreftelse påslått, finnes brukeren men uten sesjon
  if (!data.session) {
    settStatus('av', 'Konto opprettet. Bekreft e-posten din, så kan du logge inn.');
  } else {
    settStatus('av', 'Konto opprettet. Sett en passfrase for å starte synk.');
  }
}

// Kontoer laget med magisk lenke har ingen passord. Er du innlogget,
// kan du sette ett her — da virker vanlig innlogging heretter.
async function synkSettPassord() {
  const felt = document.getElementById('synkNyttPassord');
  const nytt = felt?.value || '';
  if (!synkBruker) { alert('Du må være innlogget for å sette passord.'); return; }
  if (nytt.length < 6) { alert('Passordet må være minst 6 tegn.'); return; }

  settStatus('synker', 'Lagrer passord …');
  const { error } = await supabase.auth.updateUser({ password: nytt });
  if (felt) felt.value = '';

  if (error) settStatus('feil', synkFeilTekst(error.message));
  else       settStatus(synkStatus === 'feil' ? 'av' : 'ok',
                        'Passord lagret. Neste gang logger du inn med e-post og passord.');
}

// Reserve når sesjonen er borte og du ikke har passord ennå.
// Lenka logger deg inn midlertidig, så kan du sette passord.
async function synkGlemtPassord() {
  const epost = (document.getElementById('synkEpost')?.value || '').trim();
  if (!supabase) { alert('Synk er ikke tilgjengelig.'); return; }
  if (!epost) { alert('Skriv inn e-postadressen din først.'); return; }

  settStatus('synker', 'Sender lenke …');
  const { error } = await supabase.auth.resetPasswordForEmail(epost, {
    redirectTo: window.location.href.split('#')[0]
  });

  if (error) settStatus('feil', synkFeilTekst(error.message));
  else       settStatus('av', 'Sjekk e-posten. Lenka logger deg inn, og da kan du sette et passord.');
}

async function synkLoggUt() {
  if (!confirm('Logge ut av synk? Dataene blir liggende på denne enheten.')) return;
  await supabase.auth.signOut();
  synkBruker = null;
  // Neste innlogging må lese skyen på nytt før den får skrive til den —
  // kontoen kan være en annen, eller dataene endret i mellomtiden
  localStorage.removeItem(LS_PULLET);
  settStatus('av', 'Ikke innlogget');
}

// ────────────────────────────────────────────
// PASSFRASE
// ────────────────────────────────────────────
// Passfrasen er den eneste nøkkelen til dataene. Mister du den, er det
// ingen vei tilbake — verken vi eller Supabase kan gjenopprette noe.
function lagrePassfrase() {
  const felt = document.getElementById('synkPassfrase');
  const p = (felt?.value || '').trim();
  if (p.length < 8) { alert('Passfrasen bør være minst 8 tegn.'); return; }

  const gammel = localStorage.getItem(LS_PASSFRASE);
  if (gammel && gammel !== p) {
    if (!confirm('Du endrer passfrasen. Data som allerede ligger i skyen ble kryptert med den gamle, og kan ikke låses opp med den nye.\n\nFortsette?')) return;
    localStorage.removeItem(LS_SIST_SYNK);
  }

  localStorage.setItem(LS_PASSFRASE, p);
  felt.value = '';
  settStatus('av', 'Passfrase lagret');
  if (klarTilSynk()) syncPull();
}

function glemPassfrase() {
  if (!confirm('Fjerner passfrasen fra denne enheten. Du må skrive den inn igjen for å synke.\n\nFortsette?')) return;
  localStorage.removeItem(LS_PASSFRASE);
  localStorage.removeItem(LS_SIST_SYNK);
  settStatus('av', 'Passfrase fjernet');
}

// ────────────────────────────────────────────
// STATUSVISNING
// ────────────────────────────────────────────
const STATUS_TEKST = {
  av:     'Av',
  venter: 'Endringer venter …',
  synker: 'Synkroniserer …',
  ok:     'Synkronisert',
  feil:   'Feil'
};

function sistSynkTekst() {
  const s = localStorage.getItem(LS_SIST_SYNK);
  if (!s) return 'aldri';
  const d = new Date(s);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1)   return 'nå nettopp';
  if (min < 60)  return min + ' min siden';
  if (min < 1440) return Math.round(min / 60) + ' t siden';
  return d.toLocaleDateString('nb-NO');
}

function tegnSynkStatus() {
  const boks = document.getElementById('synkStatus');
  if (!boks) return;

  const innlogget = Boolean(synkBruker);
  const pass      = harPassfrase();

  boks.className = 'synk-status synk-' + synkStatus;
  boks.innerHTML = `
    <div class="synk-status-rad">
      <span class="synk-prikk"></span>
      <strong>${STATUS_TEKST[synkStatus] || synkStatus}</strong>
      ${innlogget && pass ? `<span class="synk-sist">Sist: ${sistSynkTekst()}</span>` : ''}
    </div>
    ${synkMelding ? `<div class="synk-melding">${synkMelding}</div>` : ''}`;

  const seksjonInn  = document.getElementById('synkInnlogging');
  const seksjonPass = document.getElementById('synkPassfraseSeksjon');
  const seksjonAkt  = document.getElementById('synkAktiv');
  if (seksjonInn)  seksjonInn.style.display  = innlogget ? 'none' : '';
  if (seksjonPass) seksjonPass.style.display = innlogget ? '' : 'none';
  if (seksjonAkt)  seksjonAkt.style.display  = innlogget ? '' : 'none';

  const epostVis = document.getElementById('synkBrukerEpost');
  if (epostVis) epostVis.textContent = synkBruker?.email || '';

  const passVis = document.getElementById('synkPassfraseStatus');
  if (passVis) {
    passVis.textContent = pass
      ? 'Passfrase er satt på denne enheten.'
      : 'Ingen passfrase på denne enheten — synk er av.';
  }

  tegnICSStatus();
}


// ════════════════════════════════════════════════════════════
// PUBLISERTE KALENDERE
// ════════════════════════════════════════════════════════════
// To atskilte kalendere med hver sin adresse:
//
//   undervisning — timeplanen din, til din egen Outlook
//   jobb         — bare når du er opptatt, til deling med familien
//
// Adressene er ulike med vilje. Deler du arbeidstiden med familien,
// skal ikke timeplanen følge med på kjøpet.
//
// Begge filene ligger i en offentlig Storage-bøtte slik at Outlook og
// Google kan hente dem uten innlogging. De er derfor IKKE krypterte,
// til forskjell fra synkdataene. Beskyttelsen er at adressen inneholder
// en tilfeldig nøkkel som ikke lar seg gjette. Kommer en adresse på
// avveie, slår man publiseringen av og på igjen — da kastes nøkkelen
// og man får en ny adresse.

const ICS_FEEDS = {
  undervisning: {
    navn:      'Undervisning',
    tokenKey:  'lp_ics_token',
    flaggKey:  'lp_ics_publiser',
    bygg:      () => byggICS()
  },
  jobb: {
    navn:      'På jobb',
    tokenKey:  'lp_jobb_token',
    flaggKey:  'lp_jobb_publiser',
    bygg:      () => byggArbeidstidICS()
  }
};

function feedToken(feed) {
  const f = ICS_FEEDS[feed];
  let t = localStorage.getItem(f.tokenKey);
  if (!t) {
    t = crypto.randomUUID().replace(/-/g, '');
    localStorage.setItem(f.tokenKey, t);
  }
  return t;
}

function feedFilsti(feed) {
  if (!synkBruker) return null;
  return `${synkBruker.id}/${feed}-${feedToken(feed)}.ics`;
}

function feedAdresse(feed) {
  const sti = feedFilsti(feed);
  if (!sti) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${ICS_BUCKET}/${sti}`;
}

function feedPubliseres(feed) {
  return localStorage.getItem(ICS_FEEDS[feed].flaggKey) === '1';
}

async function publiserFeed(feed, { stille = false } = {}) {
  if (!supabase || !synkBruker) {
    if (!stille) alert('Logg inn under «Synk mellom enheter» først.');
    return false;
  }

  const { ics, antall } = ICS_FEEDS[feed].bygg();
  if (!antall && !stille) {
    if (!confirm('Fant ingenting å publisere i skoleåret. Publisere en tom kalender likevel?')) return false;
  }

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const { error } = await supabase.storage
    .from(ICS_BUCKET)
    .upload(feedFilsti(feed), blob, {
      contentType: 'text/calendar;charset=utf-8',
      cacheControl: '600',
      upsert: true
    });

  if (error) {
    console.warn('Publisering feilet:', error);
    if (!stille) alert('Kunne ikke publisere: ' + (error.message || 'ukjent feil'));
    return false;
  }

  localStorage.setItem(ICS_FEEDS[feed].flaggKey, '1');

  // Ikke kall saveToStorage() når vi står inne i en push. Denne funksjonen
  // kalles til slutt i syncPush() via oppdaterPubliserteKalendere(), og
  // saveToStorage() armer syncPushDebounced(). Resultatet var en evig
  // runde: push → publiser → lagre → push, hvert annet sekund, som
  // overskrev serveren kontinuerlig med denne enhetens tilstand.
  // Flagget er allerede skrevet på linja over, og følger med neste ekte
  // endring; det er bare selve lagringsrunden som må hoppes over.
  if (!stille) saveToStorage();

  tegnICSStatus();
  return true;
}

async function slaAvFeed(feed) {
  const f = ICS_FEEDS[feed];
  if (!confirm(`Slå av «${f.navn}»? Adressen slutter å virke.\n\nSlår du på igjen senere, får du en ny adresse som må legges inn på nytt der du abonnerer.`)) return;

  if (supabase && synkBruker) {
    const { error } = await supabase.storage.from(ICS_BUCKET).remove([feedFilsti(feed)]);
    if (error) console.warn('Kunne ikke slette publisert fil:', error);
  }
  // Ny nøkkel neste gang — en lekket adresse skal ikke kunne gjenbrukes
  localStorage.removeItem(f.tokenKey);
  localStorage.setItem(f.flaggKey, '0');
  saveToStorage();
  tegnICSStatus();
}

// Kalles etter vellykket synk. Feiler en opplasting, skal ikke selve
// synken regnes som mislykket — kalenderne er en bekvemmelighet.
async function oppdaterPubliserteKalendere() {
  for (const feed of Object.keys(ICS_FEEDS)) {
    if (feedPubliseres(feed)) {
      try { await publiserFeed(feed, { stille: true }); }
      catch (e) { console.warn('Kunne ikke oppdatere ' + feed + ':', e); }
    }
  }
}

async function kopierFeedAdresse(feed) {
  const url = feedAdresse(feed);
  if (!url) return;
  const knapp = document.getElementById('kopier-' + feed);
  try {
    await navigator.clipboard.writeText(url);
    if (knapp) {
      const f = knapp.textContent;
      knapp.textContent = 'Kopiert';
      setTimeout(() => { knapp.textContent = f; }, 1500);
    }
  } catch {
    prompt('Kopier adressen:', url);
  }
}

function tegnICSStatus() {
  const innlogget = Boolean(synkBruker);
  const krev = document.getElementById('icsKrevInnlogging');
  if (krev) krev.style.display = innlogget ? 'none' : '';

  Object.keys(ICS_FEEDS).forEach(feed => {
    const av  = document.getElementById('av-' + feed);
    const paa = document.getElementById('paa-' + feed);
    if (!av || !paa) return;

    const aktiv = innlogget && feedPubliseres(feed)
                  && localStorage.getItem(ICS_FEEDS[feed].tokenKey);

    av.style.display  = (innlogget && !aktiv) ? '' : 'none';
    paa.style.display = aktiv ? '' : 'none';

    const felt = document.getElementById('adresse-' + feed);
    if (felt && aktiv) felt.value = feedAdresse(feed);
  });
}
