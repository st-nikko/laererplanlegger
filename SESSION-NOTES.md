# Session Notes — Lærerplanlegger

---

## Siste økt: 3. august 2026 (økt 21) — Mobiltilpasning, steg 1 (venter på visuell kontroll)

Nikolai meldte at UI-et var ubrukelig på telefon — headeren måtte
scrolles horisontalt. Årsak: hele CSS-en var skrevet for desktop, med
bare to media queries i fila (bunn-navigasjonen fra økt 17 og
synk-raden fra økt 20).

Avklart omfang: mobilen brukes først og fremst til å **sjekke
timeplanen**. Registrering og planlegging gjøres på PC. Målet var
derfor «brukbart», ikke egen mobillayout.

### Hva ble gjort

Én ny `@media (max-width: 767px)`-blokk nederst i app.css.

**Header** brytes nå over to rader. `.week-label` mistet
`min-width: 210px` — den var hovedårsaken til sidescrollen. Logo og
«Planfestet tid» skjules; sistnevnte fikk klassen `desktop-kun` i
markup fordi den er en oppgave man gjør ved skrivebordet.

**Kalendergrid** fikk tidskolonnen redusert fra 48px til 32px, mindre
skrift, og `.event-sub` skjult. På 390px gir det ~71px per dag —
trangt, men lesbart. Dagsvisning er ett trykk unna for detaljer.

**Modaler:** event, plan og elevlogg fyller skjermen. Små dialoger
(`.simple-modal`, `.after-save-modal`) beholder dialogformen, men
innenfor kanten.

**Gjøremål-sidebaren** var 272px fast, altså to tredjedeler av
skjermbredden. Den er nå et fast overlegg over innholdet, stoppende
over bunn-navigasjonen. Merk at `.collapsed` måtte få `display: none`
— `width: 0` gjør ingenting når elementet er `position: fixed`.

**`100vh` → `100dvh`** med vh som fallback, så adresselinja ikke
spiser innhold.

**Elevtabellen** ligger nå i en `rullbar-x`-beholder og scroller
horisontalt i stedet for å sprenge siden.

### Tester
`tests/mobil.test.js` — statisk sjekk, ikke visuell. Sandkassen har
ingen nettleser, så det som testes er den vanligste årsaken til
overflow: en fast bredde i grunn-CSS-en uten overstyring for smal
skjerm. Testen deler fila i «utenfor media query» og «inne i mobil»,
og krever at hver selektor med bredde over 360px er overstyrt.
Fant tre modaler ved første kjøring — men det var falske treff fordi
CSS-kommentarer hang fast foran selektoren. Kommentarene strippes nå
før parsing.

### Runde 2 — etter tilbakemelding fra telefon

Nikolai meldte at bunn-navigasjonen gjorde appen brukbar på samme måte
som på PC, men tre ting gjensto.

**Fredag var ikke synlig, og gridet lot seg ikke scrolle.** Årsaken var
ikke manglende scroll, men at `1fr` er `minmax(auto, 1fr)`: kolonnene
fikk minstebredde fra innholdet, og arbeidstid-chipen i dagoverskriften
presset gridet bredere enn skjermen. Løst med `minmax(0, 1fr)` pluss
`min-width: 0; overflow: hidden` på `.day-header`. Da fikk alle fem
dagene plass, og scrolling ble unødvendig.

Viktig detalj: kolonnene settes med **inline style fra JS**, og inline
slår enhver media query. Bredden måtte derfor bestemmes i JS, ikke CSS
— derav `erSmalSkjerm()` og `kalenderKolonner()`. En resize-lytter
tegner på nytt når terskelen krysses, så rotasjon fungerer.

**Gjøremål lå åpen som standard** og dekket kalenderen på mobil.
`sidebarVisible` starter nå som `false`, og `#sidebarContent` har
`collapsed` i markup. Nikolai godtok at dette også gjelder desktop.

**Datoen sto to ganger** i dagoverskriften — «Man 10.» og et stort «10»
under. `.day-date` er fjernet fra både markup, CSS og JS. Dagens
markering flyttet til `.day-header.today .day-name`.

`.reg-btn` («+ Overtid») skjules på mobil — registrering gjøres på PC,
og knappen bidro til bredden.

Seks nye statiske tester dekker disse, blant annet at ingen inline
grid-template bruker bar `1fr`.

### Runde 3 — innlogging med passord

Nikolai spurte om han kunne logge inn med e-post i stedet for å vente
på magisk lenke. Byttet til `signInWithPassword` og `signUp`.
`signInWithOtp` er fjernet helt.

Gevinsten er at synken ikke lenger avhenger av Supabases innebygde
e-postutsending, som var den skjøreste delen av oppsettet.

To hemmeligheter nå, og de må ikke blandes:
- **passordet** slipper deg inn hos Supabase
- **passfrasen** låser opp dataene og sendes aldri til serveren

UI-teksten sier dette eksplisitt, og en test sjekker at
innloggingskoden ikke rører `LS_PASSFRASE`.

`synkFeilTekst()` oversetter Supabases engelske feilmeldinger.
Ukjente meldinger slippes gjennom som de er framfor å skjules.

Krever at «Confirm email» er av i Supabase, ellers får man konto uten
sesjon ved registrering — koden håndterer begge tilfeller.

**Oversett først:** kontoen fra den magiske lenka finnes allerede, men
uten passord. «Opprett konto» feilet med «already registered», og
innlogging feilet fordi det ikke fantes noe passord. To veier lagt til:

- `synkSettPassord()` — `auth.updateUser({ password })` for den som er
  innlogget. Ligger i den aktive synk-seksjonen, og fungerer også som
  vanlig passordbytte senere.
- `synkGlemtPassord()` — `resetPasswordForEmail()` som reserve når
  sesjonen er borte. Lenka logger deg inn, så kan passord settes.

Lærdom: når en innloggingsmetode byttes ut, må eksisterende kontoer ha
en vei over. Å fjerne den gamle metoden uten overgang låser brukeren ute
av sin egen konto.

### Verifisert
Nikolai bekreftet 3. august at runde 2 på telefon og passordinnlogging
fungerer.

### Neste steg
- Hvis ukesvisningen fortsatt er for trang: la mobilen åpne i dagsvisning.

---

## Økt 20: 3. august 2026 — Kryptert synk via Supabase (verifisert i drift)

### Hva ble gjort

**Ny fil `sync.js`.** Holdt utenfor app.js, som allerede er på 2260 linjer.
Vanlig `<script>`-tag og globale funksjoner — konvensjonen holdes.

**Kryptering.** Passfrase → PBKDF2 (250 000 runder, SHA-256) → AES-GCM-256.
Tilfeldig salt og IV per opplasting, lagret i klartekst ved siden av
chifferteksten. Supabase ser bare en base64-streng.

**Datavalg.** `SYNK_NOKLER` lister de ni nøklene som synkes.
`lp_studentNames` er utelatt, og `skrivSynkdata()` filtrerer innkommende
data mot samme liste — en fremtidig endring kan altså ikke smugle navn
inn i synken, og en manipulert nyttelast kan ikke overskrive lokale navn.

**Innlogging.** Magisk lenke på e-post, ingen passord. Supabase-klienten
lastes som ESM fra jsDelivr og legges på `window.supabaseJs`.

**Push/pull.** `saveToStorage()` kaller `syncPushDebounced()` med to
sekunders forsinkelse. Ved oppstart hentes skydata hvis `updated_at` er
nyere enn lokal `lp_sync_sist`. Siste skriving vinner.

**UI.** Egen seksjon i Min side over Data-seksjonen: statusboks med
fargekodet prikk, e-postinnlogging, passfrasefelt, synk nå, logg ut.

**Tester.** `tests/synk.test.js` — sju tester som kjører sync.js i en
`node:vm`-kontekst uten Supabase. Dekker rundtur, at chifferteksten ikke
lekker klartekst, feil passfrase, at samme tekst gir ulik chiffertekst,
og at navn verken samles opp eller kan overskrives.

### Verifisert i drift
Nikolai bekreftet 3. august at innlogging, kryptert synk og
pseudonymisering fungerer: kalender og elever synkroniseres mellom
enheter, og elevnavn holdes lokalt som tiltenkt.

Forutsetninger som må være på plass: redirect-URL registrert i Supabase
under Authentication → URL Configuration, og SQL-en for `sync_data`
med RLS-policyer kjørt.

### Merk
- Passfrasen ligger i klartekst i `lp_sync_passfrase`. Den beskytter mot
  at Supabase kan lese dataene, ikke mot noen med tilgang til maskinen.
- Mister Nikolai passfrasen, er skydataene tapt. Ingen gjenoppretting.
- `const` på toppnivå blir ikke egenskaper på et `vm`-kontekstobjekt
  heller — testene henter dem via `vm.runInContext()`.

### Neste steg
- Vurder påminnelse i notatfeltene om at fritekst kan inneholde navn —
  det er nå den største gjenværende lekkasjeveien.
- Ekte SFS2213-beregning (nedprioritert av Nikolai 3. august).
- Uke-etiketten i header viser månedsnavn i Elever/Elevlogg-visning.

---

## Økt 19: 3. august 2026 — Pseudonymisering av elevnavn (fullført)

Forarbeid til datasynk: elevnavn skal aldri forlate enheten.

### Hva ble gjort

**Splitting ved lagring.** `allStudents[]` beholder `navn` i minnet, så
alle 18 rendringspunkter er urørt. `saveToStorage()` deler i to nøkler:
`lp_students` (struktur, kan synkes) og `lp_studentNames` (navn, lokalt).
`loadFromStorage()` setter dem sammen igjen via `hydrerNavn()`.

**Fallback-navn.** Mangler navnet på enheten, vises `Elev c123` (siste fire
tegn av ID-en) og `navnMangler = true` settes. Flagget hindrer at
fallbacket lagres som om det var et ekte navn. Redigeringsskjemaet viser
tomt felt, ikke fallbacket.

**Migrering.** Finnes ikke `lp_studentNames`, bygges kartet fra navnene
som lå i `lp_students` — gamle oppsett fungerer uten inngrep.

**Eksport/import.** Ny knapp «Eksporter uten navn» gir pseudonymisert fil.
Full eksport har navnene i eget felt `studentNames`. Import leser begge
formater, og beholder lokale navn for elever fila ikke dekker.
Eksport tar nå også med `fridager` og `skoleaar`, som manglet før.

**Banner i Elever-fanen** når elever mangler navn lokalt.

**Migreringen skrives tilbake ved oppstart.** Første utkast lot
`loadFromStorage()` migrere i minnet uten å skrive tilbake, så navnene
ble liggende i `lp_students` helt til neste mutasjon utløste en lagring.
Nikolai fant dette ved å inspisere localStorage. Flagget
`maaSkrivesTilbake` settes nå når gammelt format oppdages, og `init`
kaller `saveToStorage()` med én gang.

**Tester.** `tests/pseudonymisering.test.js` — sju jsdom-tester som dekker
migrering, fallback, persistering, ny elev via skjema, begge
eksportvariantene, tilbakeskriving ved oppstart, og at tilbakeskriving
*ikke* trigges når formatet allerede er nytt. Alle passerer.

### Merk
- `const` på toppnivå havner ikke på `window`. Testene henter globale
  variabler via `window.eval()`.
- Fritekstnotater kan fortsatt inneholde navn brukeren har skrevet inn.
  Dette er en vane, ikke en bug — vurder påminnelse i notatfeltet.

### Neste steg
- Økt B: Supabase-synk med AES-GCM-kryptering (se plan under økt 18).

---

## Økt 18: 3. august 2026 — Versjonskontroll og publisering (fullført)

### Hva ble gjort

**Git:** `git init` med `main` som branch. Lokal identitet satt på repoet
(Nikolai / nstallemo@gmail.com), ikke globalt. To commits:
`e8b7cc3` baseline etter økt 17, `0f7985d` omdøping av HTML-fila.

**.gitignore:** OS-artefakter, editor-mapper, backup-filer, og —
viktigst — `laererplanlegger-*.json`. Eksportfilene inneholder
elevnavn og fraværsdata og skal aldri havne i et offentlig repo.

**`ukesoversikt.html` → `index.html`:** GitHub Pages serverer `index.html`
fra rota, så appen åpnes på ren URL. Filreferansen i CONTEXT.md oppdatert;
historiske omtaler i dette dokumentet står urørt.

**GitHub Pages:** repo `st-nikko/laererplanlegger` (public),
publisert fra `main` / root. Live på
https://st-nikko.github.io/laererplanlegger/ — verifisert ved henting
av sida. Fungerer på mobil og hjemme-PC.

### Merk
- Repoet er **offentlig** (kreves for gratis Pages). Selve appen er åpen,
  men ingen elevdata ligger i repoet — de bor i `localStorage` per enhet.
- Push må kjøres fra Nikolais egen PowerShell; GitHub-innloggingen ligger
  der, ikke i verktøyets sandkasse.
- Første Pages-deploy tok noen minutter og ga 404 i mellomtiden.

### Neste steg
- **Datasynk mellom enheter.** Appen er nå tilgjengelig overalt, men hver
  enhet har sin egen `localStorage`. Skissert løsning: hele datasettet som
  én JSON-blob i skyen med tidsstempel, hektet på `saveToStorage()` og
  `loadFromStorage()` — de to funksjonene er allerede samlingspunkt, så
  inngrepet blir lite. Kandidater: Supabase (gratis, Postgres + innlogging),
  Firebase, Cloudflare Workers KV. Forbehold: siste skriving vinner, så
  samtidig redigering på to enheter gir tap. Vis «sist synkronisert» i UI.
  Innlogging må designes samtidig.
- Ekte SFS2213-beregning (`calcSFS()` returnerer fortsatt demo-tall).

---

## Økt 17: 10. juli 2026 — Frontend-redesign: sidemeny + mobil bunn-navigasjon (fullført)

### Hva ble gjort

**Steg 1:** Byttet horisontal fane-rad til sidestilt meny (desktop, fast
bredde). Elevlogg ble fullskjerm-visning med delt `renderElevloggInnhold()`.

**Steg 1b:** "Ukesoversikt" → "Timeplan" i all brukervendt UI-tekst
(kun visning, ikke interne navn/filnavn).

**Steg 2:** Min side ble fullskjerm-visning (`isMinSide`-gren i `render()`),
erstatter innstillingsmodalen som er fjernet helt. Import/eksport
flyttet inn i Min side som egen "Data"-seksjon.

**Steg 3:** Mobil bunn-navigasjon under 768px — gjenbruker `#sideMeny` med
ren CSS (`@media`), ingen duplisert markup, ingen JS-endring nødvendig.
Verifisert med jsdom-klikktest.

**Opprydding:** Null-bytes fjernet fra `ukesoversikt.html` (var artefakt
fra tidligere synk-hendelse).

### Kjent quirk (pre-eksisterende)
- Uke-etiketten i header viser månedsnavn i Elever/Elevlogg-visning.

### Ikke gjort
- Git/versjonskontroll — bevisst utsatt til neste økt.

### Neste steg
- Ekte SFS2213-beregning (punkt 8 i utviklingsplanen).

---

## Økt 16: 11. juni 2026

### Hva ble gjort

**Skjulte gjøremål og myk sletting:**
- Myk sletting: deleteTodo() setter slettet: true i stedet for
  å fjerne fra todos[]
- Migrering i loadFromStorage() for eksisterende todos
- Hovedlisten viser kun aktive og påbegynte gjøremål
- "Vis skjulte gjøremål"-knapp øverst i sidebaren
- Modal med to seksjoner: Fullførte og Slettede
- Gjenopprett-knapp per rad
- Slett permanent med confirm()-dialog

**Møte-modal forbedret:**
- Elev-dropdown — knytt møte til én elev
- Gjøremål-seksjon — legg til gjøremål direkte fra møtet,
  arver elev-kobling og møtedato som frist
- Datovelger i stedet for ukevalg for møter
- Gjentakende-checkbox ikke avkrysset som standard for alle
  nye hendelser

**Event-modal fast høyde:**
- height: 90vh på .event-modal
- Innhold scroller, footer alltid synlig

---

## Økt 15: 11. juni 2026

### Hva ble gjort

**Møte-modal forbedret:**
- Elev-dropdown i møte-modalen — knytt møte til én elev
- Gjøremål-seksjon i møte-modalen — legg til gjøremål direkte
  fra møtet, arver elev-kobling og møtedato som frist
- Datovelger i stedet for ukevalg for møter
- Mulighet for gjentakende møter beholdt
- Gjentakende-checkbox ikke avkrysset som standard for alle nye hendelser

---

## Økt 14: 10. juni 2026

### Hva ble gjort

**Ferie og fridager:**
- Ny variabel fridager[] med seed-data for skoleruta 2025-2026
- Ny variabel skoleaar { start, slutt } med persistens
- erFridag(dato) og erUtenforSkoleaar(dato) i HELPERS
- Innstillingsmodal via tannhjul-knapp i headeren
- Skolerute-administrasjon: legg til/slett ferier, fridager, planleggingsdager
- Skoleår-seksjon: justerbar start og sluttdato
- eventsForDate() skjuler undervisning/vikar på ferie og fridager
- Møter vises fortsatt på planleggingsdager
- calcAttendance() teller ikke timer på ferie/fridager eller utenfor skoleåret
- Visuell markering: gul bakgrunn for fridager, grå for utenfor skoleår

**Fridagstittel i kalenderen:**
- Fridagens tittel (f.eks. "Påskeferie") vises i alle visninger
- Ukesvisning: øverst i dagskolonnen
- Månedvisning: under dagnummeret i cellen
- Dagvisning: i dag-headeren under datoen
- Styling: diskret .fridag-label med liten, dempet tekst

---

## Økt 13: 10. juni 2026

### Hva ble gjort

**Gjøremål forbedret:**
- Ny tittel-felt (obligatorisk) — beskrivelse valgfri
- Redigering ved klikk på gjøremål i listen
- Beskrivelse vises avkortet til 2 linjer med "..." i listen
- Migrering: gamle todos får tittel = text, tekst = ''
- Sidebar flyttet til høyre side av skjermen
- Månedsvisning bruker tittel med fallback til text

---

## Økt 12: 10. juni 2026

### Hva ble gjort

**Elevlogg-modal forbedret:**
- Alle timer vises — også timer med fravær
- Nærvær-badge per time: rød "Fraværende", gul "2/3 t" ved delvis,
  ingen badge ved fullt nærvær
- Per-elev-notater vises i kursiv under klassenotat
- Rekkefølge snudd til nyeste først
- Fiks av boolean[]-bug — attendance-sjekk håndterer nytt arrayformat

---

## Økt 11: 9. juni 2026

### Hva ble gjort

**Arkivering av elever + fiks av Slett-knappen:**
- Datastruktur utvidet: arkivert og arkivertDato på alle elever
- Migrering i loadFromStorage() for eksisterende elever
- Slett-knappen fikset — bruker nå data-action i stedet for JSON.stringify i onclick
- Unified event listener håndterer alle knapper i Elever-fanen
- Arkiver-knapp per elev — skjuler eleven fra hovedlisten
- "Vis arkiverte elever"-lenke under tabellen med antall
- Gjenaktiver-knapp for å hente frem arkiverte elever
- arkiverElev(), gjenaktiverElev(), toggleVisArkiverte() lagt til

---

## Økt 10: 9. juni 2026

### Hva ble gjort

**Delvis fravær og korrekt timeantall:**
- finnSkoletimer(event) — ny hjelpefunksjon som beregner hvilke skoletimer en hendelse dekker via PERIODS-arrayet
- calcAttendance() teller nå skoletimer, ikke hendelser
- Nærvær lagres som boolean[] — én verdi per skoletime hendelsen dekker
- renderAttendanceList() viser én avkrysningsboks per skoletime merket "1. t", "2. t" osv. for flertimershendelser
- Migrering i loadFromStorage() konverterer gamle boolean-verdier til boolean[]

---

## Økt 9: 9. juni 2026

### Hva ble gjort

**Overlappende hendelser (side om side):**
- Ny hjelpefunksjon beregnKolonneposisjon() før renderGrid()
- Overlappende hendelser vises side om side i stedet for oppå hverandre
- Støtter opptil tre overlappende hendelser
- Enkelhendelser beholder full bredde
- Klikk og modal-funksjonalitet uendret

---

## Økt 8: 9. juni 2026

### Hva ble gjort

**Diverse fikser og forbedringer:**
- calcAttendance() teller nå kun gjennomførte timer (dato <= TODAY)
- Knappetekst "Ny time" endret til "Ny hendelse"
- Frammøte-fanen fjernet — openElevlogg()-modalen er eneste elevlogg-visning
- Rediger-knappen og elevlogg-knappen i Elever-fanen fikset (data-student-id-mønster i stedet for JSON.stringify i onclick)
- Bulkregistrering av elever: lim inn navn linje for linje, velg felles trinn og startdato

**Dagsvisning-bug fikset:**
- Navigasjon forbi fredag viste "undefined" — lørdag og søndag lagt til i navigasjonslogikken
- Lørdag og søndag tilgjengelige for møter og gjøremål
- Ukesvisningen uendret (viser fortsatt man–fre)

---

## Økt 7: 5. juni 2026

### Hva ble gjort

**Eksport / import (steg 7):**
- exportData() laster ned alle variabler som JSON med dato i filnavnet
- importData() validerer, bekrefter og laster inn JSON-fil
- Knapper plassert diskret nederst til høyre på linje med fargekodelegenden
- CSS via CSS-variabler

---

## Økt 6: 5. juni 2026

### Hva ble gjort

**Datobegrenset gyldighet for timer (steg 6):**
- Nye felt på alle event-objekter: gyldigFra (ISO-dato) og gyldigTil (ISO-dato | null)
- Seed-events fikk gyldigFra: '2025-08-18' og gyldigTil: null
- eventsForDate() filtrerer events utenfor gyldighetsperioden (to linjer øverst i filter-callbacken)
- deleteEvent(): myk sletting — setter gyldigTil = isoDate(TODAY) i stedet for å fjerne fra arrayet
- saveEvent(): nye events får gyldigFra: isoDate(TODAY), gyldigTil: null; redigering bevarer feltene via spread
- lessonData, calcAttendance() og elevlogg-logikk er uendret

---

## Økt 5: 5. juni 2026

### Hva ble gjort

**Dynamisk TODAY og "now line" (steg 5):**
- TODAY: const TODAY = new Date(2026, 5, 4) → const TODAY = new Date()
- nowDec: hardkodet 13.25 → new Date().getHours() + new Date().getMinutes() / 60

---

## Økt 4: 5. juni 2026

### Hva ble gjort

**Elevlogg som egen visning (steg 4):**
- Ny "Elevlogg"-fane i navigasjonen
- To nivåer i samme visning — ingen nye modaler
- Nivå 1: elevoversikt med navn, trinn og oppmøteprosent
- Nivå 2: elevdetalj med tilbake-knapp, oppmøtebadge, filterrad per fag,
  og loggoppføringer kronologisk nyeste først
- Filtrering per fag med farget etikett via eventColor()
- openElevlogg()-modalen beholdt uendret som fallback

---

## Økt 3: 5. juni 2026

### Hva ble gjort

**Elev-administrasjon + oppmøteprosent (steg 2 og 3):**
- Ny "Elever"-fane i navigasjonen
- Elevstruktur utvidet til: { id, navn, trinn, startDato }
- Seed-elever beholder numeriske IDer for bakoverkompatibilitet
- parseStudentId() håndterer både numeriske og UUID-IDer
- calcAttendance() teller kun timer fra elevens startDato
- Oppmøte vises med fargekoding: grønt ≥90%, gult 80–89%, rødt <80%
- Sletting fjerner eleven fra allStudents og events[].students
- lp_students lagt til i localStorage

---

## Økt 2: 5. juni 2026

### Hva ble gjort

**localStorage-persistens (steg 1):**
- `saveToStorage()` og `loadFromStorage()` lagt til som egen seksjon i app.js
- Persisterer: `events`, `todos`, `planfestetTid`, `overtid`, `lessonData`, `topicsBySubject`
- localStorage-nøkler med prefiks `lp_`
- `saveToStorage()` kalles i alle save/delete-funksjoner
- Seed-data brukes som fallback når localStorage er tom

---

## Økt 1: 5. juni 2026

### Hva ble gjort

**Oppsplitting og dokumentasjon:**
- `ukesoversikt.html` splittet i tre filer: `ukesoversikt.html` (434 linjer), `app.css` (308 linjer), `app.js` (1166 linjer)
- Skrevet `CONTEXT.md` med fullstendig filstruktur og tekniske valg
- Skrevet `SESSION-NOTES.md` (dette dokumentet)

**Tidligere bygget (økt 1–14):**
- Ukesoversikt med dag/uke/måned-visning og navigasjon
- Timeplan-administrasjon: legg til/rediger/slett time (undervisning, møte, vikar)
- Faste og engangstimer, annenhver-uke-mønster (odd/even/every)
- Oppstartsuke per hendelse (`startWeek`)
- Planfestet tid-modal med live oppsummering
- Overtid-registrering per dag
- Elevliste per time, med enetime/gruppe/parallell-distinksjon
- Timeplaner per time: tema, notater, nærvær, per-elev notater
- Kopier time-funksjon
- Elevlogg: historikk per elev, gruppert per fag
- Gjøremålsliste (sidebar) med status, fag/elev-kobling, frist og overdue-indikator
- Gjøremål vises i Måned-visningen på fristen
- Uketall i uke- og månedvisning
- Fargekoding per fag, forklaring i legend

---

## Hva som fungerer

Alle features i listen ovenfor er implementert og fungerer. Appen åpnes som en enkelt HTML-side i nettleseren. Seed-data (demo-timer og elevlogg-oppføringer) lastes ved oppstart.

---

## Neste naturlige steg (prioritert rekkefølge)

### ✅ 1. `localStorage`-persistens — ferdig

### ✅ 2. Elev-administrasjon — ferdig

### ✅ 3. Oppmøteprosent per elev — ferdig

### ✅ 4. Elevlogg som egen visning — ferdig

### ✅ 5. Dynamisk `TODAY` og "now line" — ferdig

### 4. Mobilvisning
Responsivt layout for telefon. Kalender-grid og modaler må tilpasses smal skjerm.

### 5. Eksport / import
JSON-eksport av all data (backup). Import for gjenoppretting eller overføring mellom enheter/nettlesere.

### 6. Ekte SFS2213-beregning
`calcSFS()` returnerer demo-tall. Implementer ekte beregning basert på `overtid`-registreringer akkumulert over skoleåret.

---

## Konvensjoner å holde

- Alle globale variabler og funksjoner — ingen ES-moduler (ikke endre dette uten å refaktorere hele scopingen)
- Norsk språk i UI og kode-kommentarer
- Seksjonskiller i app.js: `// ────────────────────────────────────────────`
- CSS-variabler for alle farger — ingen hardkodede hex-verdier i JS der det kan unngås

---

## Fremtidige features
### Store features (krever design før koding)
- Gjentakende gjøremål: ukentlig, annenhver uke, månedlig gjentakelse.
  Bare neste forekomst vises i listen. Ved fullføring opprettes neste
  forekomst automatisk. Uavklart: fast ukedag vs. antall dager frem, sluttdato.
- Elevvurdering etter timen: vises i elevlogg, knyttet til fag og dato. 
  Krever ny datastruktur — må designes før koding.
- Opptelling av lærerens undervisningstimer: ila uke og gjennom året. 
  Muligens egen "Lærer"-fane. Krever avklaring av datagrunnlag.
- Overlappende hendelser i kalenderen: gjør begge lesbare i UI. 
  Ren CSS/layout-endring, ingen datastruktur-konsekvenser.
- Mer funksjonell dagsvisning: utnytter gjenværende plass bedre. 
  Krever avklaring av hva som skal vises.
### Mindre endringer (klare til prompt)
- Fiks bug i calcAttendance(): tell kun gjennomførte timer (dato <= TODAY), 
  ikke fremtidige. Påvirker alle oppmøtetall — bør fikses tidlig.
- Bytt navn på "Elevlogg"-fanen til "Frammøte". Gjør elevnavnet 
  klikkbart i Frammøte-fanen for å åpne elevloggen.
- Fiks bug i dagsvisning: neste dag etter fredag viser "undefined". 
  Legg til lørdag og søndag som tilgjengelige dager for møter/gjøremål.
- Endre knappetekst "Ny time" til "Ny hendelse".

---

*Oppdater denne filen ved slutten av hver økt med hva som ble gjort og hva som er neste steg.*
