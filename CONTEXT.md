# Lærerplanlegger — Kontekst

Kort oppslag for den som skal endre koden. **Les dette først, og
`DETALJER.md` bare for den delen du rører.** Der står begrunnelsene,
feilene som ble funnet og hva testene vokter, ordrett fra før
oppryddingen 5. november 2026.

Hold denne fila kort. Ny kunnskap legges slik:
- en regel som ikke skal brytes → én linje under «Regler» her
- hvorfor regelen finnes, og hvordan feilen ble funnet → `DETALJER.md`
- hva som er endret når → commit-meldingen

---

## Hva appen er

Personlig planleggingsverktøy for én faglærer på ungdomsskole (8.–10.
trinn): timeplan, nærvær og elevlogg, vurderinger, varsler, gjøremål og
arbeidstid i ett grensesnitt. Brukes på PC og mobil, ofte mellom timer.

- **Data:** localStorage i nettleseren (`lp_*`-nøkler). Lagres ved hver
  endring via `saveToStorage()`, lastes med `loadFromStorage()`.
- **Synk (valgfri):** `sync.js` krypterer hele datasettet i nettleseren
  (AES-GCM, PBKDF2) og lagrer én blokk per bruker i Supabase. Serveren ser
  aldri klartekst. Appen virker uendret uten `sync.js`.
- **Kalenderfeeder:** tre ICS-filer (undervisning, jobb, gjøremål) i en
  offentlig Supabase-bøtte, beskyttet av token i adressen. Ikke krypterte.
- **Publisering:** GitHub Pages fra `main` (st-nikko/laererplanlegger).
  `app.css` og `app.js` caches i opptil ti minutter — Ctrl+Shift+R etter push.

## Filer

| Fil | Innhold |
|-----|---------|
| `index.html` | All markup: header, visninger, alle modaler. Laster `app.js`, så Supabase som ESM-modul, så `sync.js` |
| `app.js` | All appkode, global scope. Seksjoner under |
| `sync.js` | Kryptert synk og ICS-publisering. Seksjoner under |
| `app.css` | All CSS. Farger kun som variabler i `:root` |
| `tests/` | jsdom-tester, én fil per område. Se `tests/README.md` |
| `veikart.md` | Vurderte utvidelser med prioritert rekkefølge øverst |
| `DETALJER.md` | Begrunnelser og bakgrunn per område |
| `SESSION-NOTES.md` | Gamle øktnotater (t.o.m. august 2026). Historikk |
| `funksjonsplan.md` | Originalt kravdokument fra juni 2026. Historikk |

### app.js

Seksjonene har overskrifter på formen `// NAVN` mellom streker. Søk etter
dem framfor å stole på linjenumre.

| Seksjon | Hva den eier |
|---------|--------------|
| CONFIG | `PERIODS` (skoletimene — **eneste kilde til klokkeslett**), gridkonstanter, `TODAY`, `lunsjLuke()` |
| COLORS | `COLOR_POOL`, `SPECIAL_COLORS`, `getSubjectColor()`, `eventColor()` |
| STUDENTS | `allStudents[]`, elevnavn holdt utenfor synken (`elevLapp()`, `navnekart()`, `hydrerNavn()`), elevnotat, varsler, termin |
| LESSON DATA | `lessonData{}` (nøkkel `hendelsesId_dato`), `topicsBySubject{}` |
| EVENTS / WORK TIMES | `events[]`, `planfestetTid[]`, `overtid{}`, `gyldigFraForNy()` |
| HELPERS | dato- og gridhjelpere, `eventsForDate()`, skoletimer, hover-tekst, deltakelse, forsentkomming |
| RENDER | `render()`, `renderGrid()`, dagshoder, legende |
| FRAVÆRSRAD | haken for «fravær ført i skolens system» — ikke `attendance` |
| PLANFESTET TID / OVERTID | modaler for arbeidstid |
| EVENT FORM | `openEventForm()`, `saveEvent()`, `moteDatoForSkjema()` |
| LESSON PLAN MODAL | nærværsføring, tema, notater, `saveLessonPlan()` |
| ELEVLOGG | `renderElevloggInnhold()` (deles av modal og fullskjerm), lenker i fritekst |
| VURDERINGER | `vurderinger[]`, visning og modal (kun PC) |
| ELEVLOGG VIEW / ELEVADMIN | elevvelger, elevtabell, elevskjema |
| VIEW SWITCHING / MONTH VIEW | `setView()`, `changeNav()`, `renderMonthView()` |
| SIDEBAR / GJØREMÅL | `todos[]`, merker, filter, dra-og-slipp |
| MISC | «I dag», modallukking, import/eksport, Min side, ICS for undervisning |
| PAPIRKURV | slettede timer, elever, gjøremål og vurderinger; lagring/lasting |
| GJØREMÅLSKALENDER / ARBEIDSTIDSKALENDER | de to andre ICS-feedene |

### sync.js

KONFIGURASJON (`SYNK_NOKLER`) · OPPSTART · KRYPTERING · HVA SOM SYNKES ·
PUSH / PULL · INNLOGGING · VERN MOT DATATAP · PASSFRASE · STATUSVISNING ·
ICS-PUBLISERING.

## Datamodell

| Nøkkel | Synkes | I «Eksporter uten navn» | Merk |
|--------|:-:|:-:|------|
| `lp_events` | ja | ja | `recurs` + `weekday` (0 = mandag) eller `date`; `weekPattern`; `gyldigFra`/`gyldigTil` |
| `lp_lessonData` | ja | ja | `attendance[elev][i]` er `true`, `false` eller `'sen'`; `lagret`-stempel |
| `lp_students` | ja | ja | elever **uten** navn |
| `lp_studentNames` | **nei** | nei | navnene. Forlater aldri enheten |
| `lp_elevNotater` | ja | **ja** | egen nøkkel med vilje, ikke på elevobjektet. Med i anonym eksport — `exportDataUtenNavn()` advarer om det |
| `lp_varsler` | ja | nei | ingen fritekst |
| `lp_vurderinger` | ja | nei | aldri i feed |
| `lp_todos` | ja | ja | `merke`, `rekkefolge` |
| `lp_fravaerFort` | ja | ja | bare førte dager lagres |
| `lp_papirkurv` | **nei** | nei | inneholder navn |
| `lp_fagfarger`, `lp_fridager`, `lp_skoleaar`, `lp_planfestetTid`, `lp_overtid`, `lp_topicsBySubject` | ja | ja | |

Fasit for hva som synkes er `SYNK_NOKLER` i `sync.js`, og for eksporten
`exportData()` i `app.js`. Endres tabellen, endres koden der først.

## Regler

Hver linje er en feil som har skjedd eller et valg som er tatt. Testen i
parentes slår ut hvis regelen brytes. Bakgrunn i `DETALJER.md` under samme
overskrift.

**Personvern**
- Ingenting legges direkte på elevobjektet. `elevlisteUtenNavn()` er en
  spread, så alt på objektet havner i synken og den anonyme eksporten.
  Bruk en egen `lp_`-nøkkel (`elevnotat`, `varsler`).
- Elevnavn og `tekst`/notater kommer aldri i en ICS-feed. Tittel er faget
  (`icsTittel()`) (`ics`, `gjoeremaal` — «ELEVNAVN KOMMER ALDRI MED»).
- `elevLapp()` er eneste kilde til de fire tegnene som vises uten navn
  (`pseudonymisering`).
- Brukertekst settes som `textContent` eller attributt, aldri i
  `innerHTML` (`hover`). **Kjent hull:** flere eldre `innerHTML`-maler
  setter inn navn og titler uten escaping.

**Synk** — les «Synken kan spise data» i `DETALJER.md` før du rører `sync.js`
- Siste skriver vinner, på hele blokka. Ingen sammenslåing.
- Kall aldri `saveToStorage()` fra noe som kjører inne i en push. Det gir
  en evig push-løkke (`synk`).
- Push krever at enheten har pullet (`lp_sync_pullet`). Pull stopper hvis
  `lp_sist_endret` viser ulagrede lokale endringer (`synk`).

**Tid og dato**
- Les aldri dagens dato inn i en variabel ved oppstart. Bruk `TODAY`, som
  `sjekkDatoskifte()` oppdaterer (`idag-og-ikon`).
- Gridet starter 07:30. Plasser alt med `(tid - GRID_START_H) * PX_PER_HOUR`,
  aldri ved å telle `h++`. Ingen test vokter tidsaksen ennå.
- Skriv aldri inn klokkeslett. `PERIODS` er eneste kilde, også for
  lunsjen (`lunsj`).
- Et gjentakende møte har ingen `date`. Datofeltet fylles av
  `moteDatoForSkjema()`, ellers flytter møtet seg ved lagring (`motedato`).
- `startWeek` styrer ikke synlighet lenger — `gyldigFra` gjør det
  (`startdato`).
- Tester bruker datoer regnet ut fra i dag, og løkker over alle fem
  hverdager der ukedagen er det som testes.

**Elever og nærvær**
- Elevlista ligger på hendelsen, ikke datoen. For en holdt time er lagret
  `attendance` fasit (`eleverPaaTime()`) (`elev-paa-time`).
- Alt som leser nærvær sjekker `!== false`, ikke `=== true` — `'sen'`
  betyr til stede (`forsentkomming`).
- Timer før elevens `startDato` telles ikke og vises ikke i loggen
  (`elevlogg-datoer`).
- Deltakelse telles i skoletimer; en dobbelttime er to (`deltakelse`).
- Fraværsraden og `attendance` rører aldri hverandre (`fravaer`).

**Grensesnitt**
- Klikk utenfor lukker bare `.simple-modal` og `.after-save-modal`.
  Escape lukker øverste overlegg. Hver modal har en lukkeknapp
  (`modallukking`).
- `openEventForm()` nullstiller alle knappene i skjemaet.
- Én rulleflate om gangen. Sjekk om en ny `max-height` havner inni en
  modal (`mobil`).
- Lagring av elevnotat og varsler rendrer ikke loggen på nytt — markøren
  skal bli stående (`elevnotat`, `varsler`).
- `category: 'foreldre'` vises som «Samarbeidsmøte». Bytt bare etiketten.

## Visuell identitet

«Rolig nordisk»: varm nøytral flate, dempet kontrast, én accent (fjord,
`--accent`). Kort fortalt:

- Alle farger som variabler i `:root` i `app.css`. Unntak: `COLOR_POOL`
  og `SPECIAL_COLORS` i `app.js`, som settes som inline stil.
- Tekst minst 4,5:1, interaktive kanter minst 3:1. `--text-muted` kun til
  små versal-etiketter.
- Fagfarger på LCH-lyshet 89, kategorier på 94,5. Ingen to bakgrunner
  nærmere enn ΔE 5 — mål før du endrer en farge.
- Figtree til titler, Inter til UI, fra Google Fonts. Basis 14 px; gridet
  henger på den. `tabular-nums` på tall som står i kolonner.
- Logoen finnes i to versjoner med vilje: tre celler i headeren, to i
  `favicon.svg`.

Palett, typografiskala og logobegrunnelse står i `DETALJER.md`.

## Arbeidsflyt

- **Kjør ikke git i den monterte mappa** fra sandkassen — heller ikke
  `git status`. Det etterlater `.git/index.lock`. Nikolai committer og
  pusher selv fra PowerShell.
- Tester: `npm install jsdom`, så `node tests/<fil>.test.js`. Hver fil
  avslutter med `process.exit`.
- Verifiser ved å bryte: gjør endringen om igjen med vilje og se testen
  bli rød.
- Layout sjekkes i Playwright, ikke jsdom. `ERR_TUNNEL_CONNECTION_FAILED`
  for Google Fonts og jsdelivr er ventet i sandkassen.

## Kjente begrensninger

- Ingen service worker eller manifest: appen kan ikke installeres og
  virker ikke uten nett.
- Supabase-klienten hentes ulåst (`@supabase/supabase-js@2`) fra
  jsdelivr, og passfrasen ligger i klartekst i localStorage.
- `saveToStorage()` svelger feil (full lagring) og varsler bare i konsollen.
- Fontene krever nett ved første last; uten nett brukes systemfonten.
- Mobilheaderen er to rader, og det er strukturelt (se `DETALJER.md`).
- Ukesvisningen er trang på 390 px. Neste grep er å åpne i dagsvisning
  på mobil.
