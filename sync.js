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
  'lp_ics_token', 'lp_ics_publiser'
];

// Lokale nøkler for synktilstand
const LS_PASSFRASE   = 'lp_sync_passfrase';
const LS_SIST_SYNK   = 'lp_sync_sist';
const LS_ENHETSNAVN  = 'lp_sync_enhet';
const LS_ICS_TOKEN   = 'lp_ics_token';
const LS_ICS_PUBLISER= 'lp_ics_publiser';
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

async function syncPush() {
  if (!klarTilSynk()) return;
  clearTimeout(pushTimer);
  settStatus('synker');
  try {
    const pakke = await krypter(samleSynkdata(), localStorage.getItem(LS_PASSFRASE));
    const na    = new Date().toISOString();

    const { error } = await supabase.from('sync_data').upsert({
      user_id:    synkBruker.id,
      ciphertext: pakke.ciphertext,
      salt:       pakke.salt,
      iv:         pakke.iv,
      updated_at: na,
      enhet:      enhetsnavn()
    });
    if (error) throw error;

    localStorage.setItem(LS_SIST_SYNK, na);
    settStatus('ok');

    // Er kalenderen publisert, holdes den oppdatert i samme slengen.
    // Feiler den, skal ikke selve synken regnes som mislykket.
    if (icsPubliseres()) await publiserICS({ stille: true });
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
    if (!data) { await syncPush(); return; }

    const sist = localStorage.getItem(LS_SIST_SYNK);
    if (sist && new Date(data.updated_at) <= new Date(sist)) {
      settStatus('ok');   // vi er allerede oppdatert
      return;
    }

    let json;
    try {
      json = await dekrypter(data, localStorage.getItem(LS_PASSFRASE));
    } catch {
      settStatus('feil', 'Feil passfrase — dataene kunne ikke låses opp');
      return;
    }

    skrivSynkdata(json);
    localStorage.setItem(LS_SIST_SYNK, data.updated_at);
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
// PUBLISERING AV KALENDER TIL OUTLOOK
// ════════════════════════════════════════════════════════════
// Fila legges i en offentlig Storage-bøtte slik at Outlook kan hente
// den uten innlogging. Den er derfor IKKE kryptert — i motsetning til
// synkdataene. Beskyttelsen er at adressen inneholder en tilfeldig
// nøkkel som ikke lar seg gjette. Kommer adressen på avveie, kan hvem
// som helst lese timeplanen, og da må publiseringen slås av og på
// igjen for å få ny adresse.
//
// Elevnavn er uansett ikke med: byggICS() bruker icsTittel(), som
// aldri slår opp eleven. Se ICS-EKSPORT i app.js.

function icsToken() {
  let t = localStorage.getItem(LS_ICS_TOKEN);
  if (!t) {
    t = crypto.randomUUID().replace(/-/g, '');
    localStorage.setItem(LS_ICS_TOKEN, t);
  }
  return t;
}

function icsFilsti() {
  if (!synkBruker) return null;
  return `${synkBruker.id}/${icsToken()}.ics`;
}

function icsAdresse() {
  const sti = icsFilsti();
  if (!sti) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${ICS_BUCKET}/${sti}`;
}

function icsPubliseres() {
  return localStorage.getItem(LS_ICS_PUBLISER) === '1';
}

async function publiserICS({ stille = false } = {}) {
  if (!supabase || !synkBruker) {
    if (!stille) alert('Logg inn under Synk mellom enheter først.');
    return false;
  }

  const { ics, antall } = byggICS();
  if (!antall && !stille) {
    if (!confirm('Fant ingen undervisningstimer i skoleåret. Publisere en tom kalender likevel?')) return false;
  }

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const { error } = await supabase.storage
    .from(ICS_BUCKET)
    .upload(icsFilsti(), blob, {
      contentType: 'text/calendar;charset=utf-8',
      cacheControl: '600',
      upsert: true
    });

  if (error) {
    console.warn('Publisering feilet:', error);
    if (!stille) alert('Kunne ikke publisere: ' + (error.message || 'ukjent feil'));
    return false;
  }

  localStorage.setItem(LS_ICS_PUBLISER, '1');
  tegnICSStatus();
  return true;
}

async function slaAvICSPublisering() {
  if (!confirm('Slå av publisering? Adressen slutter å virke, og Outlook mister timeplanen.\n\nSlår du på igjen senere, får du en ny adresse som må legges inn på nytt.')) return;

  if (supabase && synkBruker) {
    const { error } = await supabase.storage.from(ICS_BUCKET).remove([icsFilsti()]);
    if (error) console.warn('Kunne ikke slette publisert fil:', error);
  }
  // Ny nøkkel neste gang — den gamle adressen skal ikke kunne gjenbrukes
  localStorage.removeItem(LS_ICS_TOKEN);
  localStorage.setItem(LS_ICS_PUBLISER, '0');
  saveToStorage();
  tegnICSStatus();
}

async function kopierICSAdresse() {
  const url = icsAdresse();
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    const k = document.getElementById('icsKopierBtn');
    if (k) { const f = k.textContent; k.textContent = 'Kopiert'; setTimeout(() => { k.textContent = f; }, 1500); }
  } catch {
    prompt('Kopier adressen:', url);
  }
}

function tegnICSStatus() {
  const av      = document.getElementById('icsAv');
  const paa     = document.getElementById('icsPaa');
  const krevPaalogging = document.getElementById('icsKrevInnlogging');
  if (!av || !paa) return;

  const innlogget = Boolean(synkBruker);
  const aktiv     = innlogget && icsPubliseres() && localStorage.getItem(LS_ICS_TOKEN);

  if (krevPaalogging) krevPaalogging.style.display = innlogget ? 'none' : '';
  av.style.display  = (innlogget && !aktiv) ? '' : 'none';
  paa.style.display = aktiv ? '' : 'none';

  const felt = document.getElementById('icsAdresse');
  if (felt && aktiv) felt.value = icsAdresse();
}
