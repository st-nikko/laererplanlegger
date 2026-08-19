# Lærerplanlegger — Kontekst

## Hva appen gjør

Personlig planleggingsverktøy for faglærer på ungdomsskole (8–10. trinn). Samler timeplan, arbeidstid, timeplaner/elevlogg og gjøremål i ett nettleserbasert grensesnitt. Ingen sky, ingen pålogging — all data lever i nettleserens minne (nullstilles ved refresh).

Målbruker: én lærer, personlig verktøy, rask tilgang mellom timer.

---

## Filstruktur

```
Lærerplanlegger/
├── index.html          # HTML-markup, ~800 linjer. Alle modaler, header, kalendergrid-placeholders, student-form.
│                       # (het ukesoversikt.html t.o.m. økt 17 — omdøpt for GitHub Pages)
├── app.css             # All CSS, ~760 linjer. CSS-variabler, layout, modal-stiler, event-stiler, elev-admin-stiler.
├── app.js              # All JavaScript, ~2670 linjer. Se seksjoner nedenfor.
├── sync.js             # Kryptert synk mot Supabase. Egen fil for å holde app.js nede.
├── favicon.svg         # Logomerket. Toppraden har to celler, ikke tre — se «Visuell identitet»
├── favicon.ico         # 16+32 px fallback for eldre nettlesere
├── apple-touch-icon.png # 180×180, fullflate (iOS avrunder selv)
├── CONTEXT.md          # Dette dokumentet
├── SESSION-NOTES.md    # Løpende øktnotater
├── funksjonsplan.md    # Originalt kravdokument fra juni 2026 (referanse, fase 1–3 er gjennomført)
├── veikart.md          # Vurderte, men ikke besluttede utvidelser — med de tekniske funnene
└── tests/              # jsdom-tester, kjøres med node
```

### app.js — seksjoner

| Seksjon | Innhold |
|---------|---------|
| CONFIG  | `PERIODS` (skoletimetabell), gridkonstanter, `DAYS_*`, `MONTHS_*`, `TODAY` (hardkodet), navigasjonstilstand, `lunsjLuke()` |
| COLORS  | `COLOR_POOL`, `SPECIAL_COLORS`, `getSubjectColor()`, `eventColor()` |
| STUDENTS + LESSON DATA | `allStudents[]` (`{id,navn,trinn,startDato}`), `lessonData{}`, `topicsBySubject{}`, seed-data |
| ELEVNAVN | `elevLapp()`, `fallbackNavn()`, `elevNavn()`, `elevlisteUtenNavn()`, `navnekart()`, `hydrerNavn()`, `antallUtenNavn()` — holder navn utenfor det som kan synkes. `elevLapp()` er eneste kilde til hvilke fire tegn som vises: `fallbackNavn()` bygger på den, og `elevLappHtml()` viser den ved siden av ekte navn i elevtabellen. Siden navnene ikke synkes, er denne lappen gjenopprettingsveien — man leser den av på en enhet som har navnene og skriver dem inn på en som mangler dem. Endres utsnittet ett sted, må det endres begge; `pseudonymisering.test.js` vokter det |
| EVENTS + WORK TIMES | `events[]`, `planfestetTid[]`, `overtid{}`, `getWorkTimeForDate()` |
| HELPERS | `getMonday()`, `isoDate()`, `toDec()`, `toPx()`, `weekNumber()`, `eventsForDate()`, `calcSFS()`, `parseStudentId()`, `calcAttendance()` |
| RENDER | `render()`, `renderWeekLabel()` (skriver lang og kort etikett i hver sin span), `renderDayHeaders()`, `renderGrid()` (tidsakse med klokkeslett, `.period-band` bak hver skoletime i dagkolonnene, `.lunsj-band` i hver kolonne), `renderLegend()` |
| LUNSJ | `lunsjLuke()` i CONFIG finner den **lengste luka mellom to skoletimer** i `PERIODS` — det er lunsjen, og den er ikke registrert noe annet sted. `renderGrid()` tegner et `.lunsj-band` som fyller luka i hver dagkolonne, og et `.lunsj-merke` («Lunsj») i tidsaksen; merket skjules på mobil, der aksen er 32 px. Båndet er en **varm tone med kant over og under** — bevisst en annen kulør enn den accent-tonede `.period-band` og den nøytralt grå `.offwork-block`, så de tre flatene ikke kan forveksles. Første forsøk var én strek midt i luka; den forsvant i et rutenett som har streker hvert kvarter fra før. Skriv aldri inn `11:05`/`11:35` noe sted: `PERIODS` skal forbli eneste kilde til klokkeslett, slik at skillet flytter seg hvis skolen endrer timeplanen. `tests/lunsj.test.js` regner ut fasiten uavhengig og slår ut på en hardkodet tid. Båndet har `z-index: 2` — over de andre flatene, under `.event`, slik at en time som krysser lunsjen dekker det framfor å bli delt i to |
| SKOLETIMER | `skoletimerForHendelse()`, `skoletimeEtikett()` — hvilke timer en hendelse dekker. Bare `undervisning` og `vikar` får etikett; et møte klokka 14 er ikke «6. time». Overlapp avgjør, ikke eksakt start, så en time som begynner 08:15 regnes som 1. time og en dobbelttime blir «1.–2. time». Etiketten vises foran faget i `.event-title` via `.event-time-nr`, som skjules på mobil der kolonnen er ~70 px |
| PLANFESTET TID MODAL | `calcPftSummary()`, `openPlanfestetTidModal()`, `savePlanfestetTid()` |
| OVERTID MODAL | `openOvertidModal()`, `saveOvertid()`, `slettOvertid()` |
| EVENT FORM MODAL | `openEventForm()`, `setFormCategory()`, `setSessionType()`, `saveEvent()`, `deleteEvent()` m.fl. |
| LESSON PLAN MODAL | `openLessonPlan()`, `renderAttendanceList()`, `saveLessonPlan()`, `kopierEvent()` |
| ELEVLOGG MODAL | `openElevlogg()`, `renderElevlogg()` (modal-fallback), `renderElevloggInnhold(studentId, container)` — delt innholdsbygger brukt av både modal og fullskjerm-visning |
| ELEVLOGG VIEW | `renderElevloggView()` (fyller elevvelger, beholder valgt elev ved re-render), `elevloggViewChanged()` — rendrer logg i `#elevloggView` via `renderElevloggInnhold()` |
| ELEVADMIN | `renderElevView()`, `openStudentForm()`, `saveStudent()`, `deleteStudent()` |
| VIEW SWITCHING | `setView()` (setter også `.visning-dag` på `#weekDayView`, som CSS bruker for å slippe å krympe hendelsene i dagsvisning, **og lukker gjøremålspanelet når `erSmalSkjerm()`** — på mobil er det et overlegg over hele kalenderen, så visningen skiftet bak det; på PC er det en kolonne og skal bli stående), `changeNav()`, `goToDayView()` |
| MONTH VIEW | `renderMonthView()` |
| SIDEBAR / TODO | `toggleSidebar()`, `openTodoForm()`, `saveTodo()`, `cycleTodoStatus()`, `renderTodoList()` |
| MISC + INIT | `goToToday()`, `closeOverlay()`, `exportData()`, `importData()`, modallukking — se «Hvordan modaler lukkes» nedenfor |
| ICS-EKSPORT | `byggICS()`, `eksporterICS()`, `icsTittel()`, `icsEscape()`, `icsBrytLinje()` — undervisningstimer til Outlook. Kun `category === 'undervisning'`; møter kommer som innkallinger i Outlook. Gjentakelser utvides via `eventsForDate()` framfor RRULE, så ferier og ukemønstre arves. `icsTittel()` bruker faget, aldri elevnavnet |
| ARBEIDSTIDSKALENDER | `arbeidstidForDato()`, `slaaSammenIntervaller()`, `fraDesimal()`, `byggArbeidstidICS()` — viser bare *når* man er opptatt, aldri hva. Grunnlag: planfestet tid eller registrert overtid, utvidet av hendelser. Blokker slås sammen kun når de overlapper eller møtes, så et kveldsmøte blir en egen blokk framfor å strekke arbeidsdagen. Helger tas med bare når det ligger en hendelse der. Alle blokker heter «På jobb» |
| MIN SIDE | `renderMinSide()` — innstillinger (skoleår, skolerute) som fullskjerm-visning i `#minSideView`; `lagreSkoleaar()`, `renderSkolerute()`, `leggTilFridag()`, `slettFridag()`. Import/eksport-knappene ligger også her (UI), logikken i MISC |
| PAPIRKURV | `leggIPapirkurv()`, `gjenopprettFraPapirkurv()`, `slettFraPapirkurv()`, `tomPapirkurv()`, `ryddPapirkurv()`, `renderPapirkurv()` — mellomlager for slettede timer, elever og gjøremål. Lagres i `lp_papirkurv`, **bevisst utenfor `SYNK_NOKLER`**: den inneholder elevnavn og data brukeren har valgt å slette, og skal ikke reise mellom enheter. Derfor lagres elevobjektet her *med* navnet, i motsetning til `lp_students`. Ryddes for oppføringer eldre enn `PAPIRKURV_DAGER` (30) ved oppstart, og holdes under `PAPIRKURV_MAKS` (20) |
| LAGRING | `saveToStorage()`, `loadFromStorage()` + `render()` init-kall |

---

## Tekniske valg

- **Ingen rammeverk.** Vanilla JS og CSS. Alt rendres via `innerHTML` og `createElement`. Gjør det enkelt å forstå og endre uten toolchain.
- **Global scope.** Alle funksjoner og variabler er globale. Enkelt, men kaller på refaktorering om appen vokser.
- **localStorage-persistens.** Alle datavariabler lagres automatisk ved hver mutasjon via `saveToStorage()`. Lastes ved oppstart via `loadFromStorage()`. Seed-data brukes som fallback hvis localStorage er tom.
- **Elevnavn er skilt ut.** `allStudents[]` bærer `navn` i minnet, men ved lagring splittes lista: struktur til `lp_students` (kan synkes), navn til `lp_studentNames` (blir på enheten). Elever uten kjent navn får `Elev xxxx` og `navnMangler = true`, slik at fallbacket aldri lagres som ekte navn. Formålet er at fravær, tema og notater kan forlate maskinen uten å være direkte identifiserbare. **Merk:** fritekstfeltene `notes` og `studentNotes` kan fortsatt inneholde navn brukeren selv har skrevet inn.
- **CSS-variabler for theming.** Alle farger via `--bg`, `--surface`, `--border`, `--accent` osv. i `:root`. Ingen hardkodede hex-verdier i `app.css` — se «Visuell identitet» nedenfor.
- **Kalender-grid:** CSS Grid (`48px + repeat(5, 1fr)`), absolutt posisjonerte events basert på `toPx(tid)`.
- **Rutenettet starter 07:30, ikke på en hel time.** `GRID_START_H = 7.5`. Alt som skal ligge på et klokkeslett må derfor plasseres med `(tid - GRID_START_H) * PX_PER_HOUR`, aldri ved å stable elementer eller telle `h++` fra `GRID_START_H`. Sistnevnte var årsaken til at tidsaksen sto blank fram til økt 19: løkka gikk 7.5, 8.5, 9.5 … og `Number.isInteger(h)` slo aldri til, så alle etikettene ble tom streng. Samme feil gjorde at de heltrukne strekene havnet på halvtimene.
- **Event-modell:** `events[]` inneholder både faste (`recurs:true, weekday`) og engangshendelser (`recurs:false, date`). Annenhver-uke støttes via `weekPattern: 'every'|'odd'|'even'`.
- **`weekday` er 0-basert med mandag som 0**, og er *eneste* felt `eventsForDate()` bruker for gjentakende hendelser — `date` ignoreres da. Merk at skjemaet samler ukedagen på to måter: undervisning og vikar velger den i `dagSelect`, mens møter velger en dato og ukedagen utledes med `getDayOfWeekFromDate()`. Fram til økt 19 var den utledningen en hardkodet `0`, så alle gjentakende møter havnet på mandag. `loadFromStorage()` reparerer gamle møter ut fra datoen deres, og `tests/gjentakende-moter.test.js` vokter begge deler.

### Hvordan modaler lukkes

Endret 19. august 2026. Klikk utenfor lukket tidligere **alle** overlegg.
På arbeidsmodalene — der man skriver — var det for lett å bomme, og et
bomklikk kostet det man hadde skrevet.

Nå gjelder to regler:

- **Klikk utenfor lukker bare små dialoger.** Regelen leses av markupen,
  ikke av en liste med id-er: har overlegget en `.simple-modal` eller
  `.after-save-modal` inni seg, er det en liten dialog der ingenting går
  tapt. Legger du til en modal senere, **arver den oppførselen fra hvilken
  klasse du gir den** — `.event-modal`, `.plan-modal`, `.elevlogg-modal`
  og `.modal` blir stående ved klikk utenfor.
- **Escape lukker det øverste åpne overlegget.** «Øverste» = sist i DOM-en
  av dem med klassen `open`. Uten den ville musa vært eneste vei ut av
  arbeidsmodalene.

`tests/modallukking.test.js` vokter begge, og i tillegg at hver modal
fortsatt har en knapp som lukker den — Escape alene er ikke nok.

---

## Visuell identitet

Redesignet i økt 19 (3. august 2026). Retningen er «rolig nordisk»: varm
nøytral grunnflate, dempet kontrast, én tydelig accent. Appen ses på i
timevis om dagen, så flaten skal være kjedelig og fargene skal jobbe.

### Palett

Alle verdier ligger i `:root` i `app.css`. Ingen hardkodede farger utenfor
den blokka — unntaket er `COLOR_POOL`/`SPECIAL_COLORS` i `app.js`, som må
være JS fordi de settes som inline stil på hver hendelse.

| Gruppe | Variabler |
|--------|-----------|
| Flate | `--bg` `#FCFBF9`, `--surface`, `--border`, `--border-faint`, `--border-strong`, `--border-input` |
| Tekst | `--text-primary` `#22201D`, `--text-secondary`, `--text-muted`, `--paa-accent` |
| Accent (fjord) | `--accent` `#2F6076`, `--accent-hover`, `--accent-deep`, `--accent-kant`, `--meny-aktiv-bg`, `--today-light` |
| Semantisk | `--suksess`, `--overtid`, `--fare`, `--naa`, `--lyng-*`, `--fridag-bg`, `--utenfor-skoleaar-bg` — hver med `-soft` og `-kant` der de brukes som merkelapp |
| Skygge | `--skygge-svak`, `--skygge-modal`, `--skygge-modal-lett` — varme (`rgba(34,32,29,…)`), ikke svarte |
| Font | `--font-ui` (Inter), `--font-display` (Figtree) |

Nøytralene har varm undertone, ikke den kjølige Tailwind-grå appen brukte
til og med økt 18. Accenten er dyp og lite mettet med vilje: den lyse blå
`#3b82f6` konkurrerte med de fargede timeblokkene i kalenderen.

Alle tekstfarger ligger over 4,5:1 mot sin bakgrunn, og interaktive kanter
over 3:1 (WCAG AA / 1.4.11). `--text-muted` er akkurat 3,49:1 og skal bare
brukes til små versal-etiketter, ikke brødtekst.

### Fag- og kategorifarger

`COLOR_POOL` (7 fag) og `SPECIAL_COLORS` (møte, foreldre, annet) + vikar i
`eventColor()`. Konstruert i LCH, ikke plukket for hånd. To regler:

1. **Fag ligger på lyshet 89, kategorier på 94,5.** Et blokkslag skal kunne
   leses som «fag» eller «ikke fag» på lysheten alene.
2. **Ingen to bakgrunner er nærmere hverandre enn ΔE 5.** Unntaket er møte
   og vikar, som er identiske i JS og skilles av stripemønsteret i
   `.event.vikar` / `.month-event-pill.vikar`.

Regel 2 er verdt å holde på: første utkast til denne paletten hadde åtte par
under ΔE 5 (mose/annet lå på 1,1 — praktisk talt samme farge). Den gamle
Tailwind-paletten hadde tre. Endrer du en av de elleve fargene, mål
avstanden til de andre før du committer.

### Logo og favicon

Motivet er et kalenderkort med én uthevet blokk — den okergule er «timen
som skjer nå». Ordmerket deler navnet i **Lærer** (vekt 600) og
planlegger (vekt 400, `--text-secondary`), som gjør et langt navn lettere å
lese og gir headeren et fast punkt.

**Merket finnes i to versjoner, og det er med vilje:**

- **Header** (`index.html`, inline SVG i `.logo`): tre celler i toppraden.
- **Favicon** (`favicon.svg`): to bredere celler. På 16 px gror tre celler
  sammen til én grå stripe — testet ved å rendre SVG-en til PNG og se på
  den. Endrer du header-merket, husk at faviconen ikke arver endringen.

`apple-touch-icon.png` er fullflate uten kortformen, siden iOS avrunder
selv. `<meta name="theme-color">` er satt til accenten.

### Typografi

Figtree til logo og titler, Inter til all UI-tekst. Begge fra Google Fonts i
én forespørsel med `display=swap`. Uten nett faller de tilbake til
systemfonten — appen fungerer, men mister litt av uttrykket.

- Skala: 10 / 11 / 12 / 13 / 14 / 15 px. Basis er fortsatt 14 px; kalenderens
  layout henger på det, så ikke flytt den uten å sjekke gridet.
- Vekter: 400 brødtekst, 500 knapper og etiketter, 600 titler og
  timeblokk-navn, 700 kun til `.event-badge`.
- `font-variant-numeric: tabular-nums` på alt som viser klokkeslett, uketall
  eller prosent — se lista øverst i `app.css`. Uten den hopper tidsaksen
  sidelengs mellom `11:00` og `08:00`.
- Titler får `--font-display` via en samleregel øverst i fila. Legger du til
  en ny tittelklasse, meld den inn der.

---

### sync.js — seksjoner

| Seksjon | Innhold |
|---------|---------|
| KONFIGURASJON | `SUPABASE_URL`, `SUPABASE_ANON`, `SYNK_NOKLER` (hvilke localStorage-nøkler som synkes — `lp_studentNames` er bevisst utelatt) |
| OPPSTART | `initSync()`, `settStatus()`, `harPassfrase()`, `enhetsnavn()` |
| KRYPTERING | `utledNokkel()` (PBKDF2, 250k runder), `krypter()`, `dekrypter()` (AES-GCM) |
| HVA SOM SYNKES | `samleSynkdata()`, `skrivSynkdata()` — sistnevnte filtrerer mot `SYNK_NOKLER` så innkommende data ikke kan overskrive lokale navn |
| PUSH / PULL | `syncPushDebounced()` (2 s), `syncPush()`, `syncPull()`, `syncNaa()` |
| INNLOGGING | `synkLoggInn()` / `synkOpprettKonto()` (e-post + passord), `synkLoggUt()`, `synkFeilTekst()` (norske feilmeldinger) |
| VERN MOT DATATAP | `harPulletDenneEnheten()`, `merkPullet()`, `harUlagredeEndringer()`, `taSynkKopi()`, `synkKopiInfo()`, `gjenopprettForSynk()` — se avsnittet «Synken kan spise data» nedenfor |
| PASSFRASE | `lagrePassfrase()`, `glemPassfrase()` |
| STATUSVISNING | `tegnSynkStatus()`, `sistSynkTekst()` |
| ICS-PUBLISERING | `ICS_FEEDS` (to kalendere: `undervisning` og `jobb`), `feedToken()`, `feedAdresse()`, `publiserFeed()`, `slaAvFeed()`, `oppdaterPubliserteKalendere()`, `tegnICSStatus()` — laster opp til Storage-bøtta `kalender` under `{user_id}/{feed}-{token}.ics`. Hver kalender har **sin egen nøkkel**, så jobbkalenderen kan deles med familien uten at timeplanen følger med. **Filene er ikke krypterte** — bøtta er offentlig så Outlook og Google kan hente uten innlogging, og beskyttelsen er at token ikke lar seg gjette. Oppdateres av `syncPush()` |

### Synken kan spise data — les dette før du rører sync.js

Synken er **«siste skriver vinner» på én stor kryptert blokk**. Det finnes
ingen sammenslåing: `skrivSynkdata()` skriver nøkkel for nøkkel oppå det som
lå der. Den 6. august 2026 spiste den en times arbeid — elever, møter og
undervisning lagt inn mellom 18:07 og 19:10 forsvant ved et hardt refresh.

Tre feil virket sammen, og alle tre er nå rettet:

1. **Pullen sammenlignet feil ting.** Den så på `lp_sync_sist`, altså når vi
   sist snakket med serveren — ikke når dataene sist ble endret her. Alt
   lokalt arbeid etter siste synk var usynlig for sjekken. Nå settes
   `lp_sist_endret` ved hver `saveToStorage()`, og `harUlagredeEndringer()`
   stopper pullen og spør brukeren framfor å overskrive.
2. **Pushen kunne laste opp uten å ha lest.** `syncPush()` sjekket bare
   innlogging og passfrase. En enhet der pullen feilet — typisk fordi
   passfrasen manglet — kjørte videre som normalt og lastet opp sin egen
   tomme tilstand oppå alt. Nå kreves `lp_sync_pullet`, som *ikke* settes
   når dekrypteringen feiler.
3. **`lp_sync_sist` ble satt til vår egen klokke etter push**, mens serveren
   kan sette sin egen `updated_at`. Da tror neste pull at skyen er nyere, og
   henter ned ved hvert oppstart. Det var den unødvendige pullen som gjorde
   overskrivingen mulig i det hele tatt. Nå leses raden tilbake med
   `.select('updated_at')`, og serverens verdi lagres.

**Og den fjerde, som trolig var utløseren:** `publiserFeed()` avsluttet med
`saveToStorage()`, men kalles selv til slutt i `syncPush()` via
`oppdaterPubliserteKalendere()`. Siden `saveToStorage()` armer
`syncPushDebounced()`, ble det en evig runde — push → publiser → lagre →
push, hvert annet sekund. Enheten lastet dermed opp sin egen tilstand
kontinuerlig og overskrev serveren uansett hva andre enheter pushet.
Statusfeltet syklet synlig mellom «synkronisert», «synkroniserer» og
«endringer venter». Nå hopper den stille publiseringen over lagringen;
flagget skrives direkte og følger med neste ekte endring. **Kall aldri
`saveToStorage()` fra noe som kjører inne i en push.**

I tillegg tas `taSynkKopi()` rett før hver pull som faktisk overskriver, og
«Angre siste synk» i Min side legger den tilbake *og* laster den opp — uten
det siste ville neste pull hentet ned den dårlige kopien igjen.

`tests/synk.test.js` gjenskaper hendelsen med en falsk Supabase. Fjerner du
vernet, feiler testen «pull overskriver ikke lokale endringer som ikke er
lastet opp» — verifisert.

Supabase-tabellen `sync_data` har én rad per bruker: `ciphertext`, `salt`,
`iv`, `updated_at`, `enhet`. Row Level Security gjør at hver bruker kun
ser sin egen rad. Serveren ser aldri klartekst.

`saveToStorage()` i app.js kaller `syncPushDebounced()` hvis funksjonen
finnes — appen fungerer uendret om `sync.js` ikke lastes.

---

## Kjente begrensninger / uløste ting

1. ~~**`TODAY` er hardkodet**~~ — endret til `new Date()`. Live dato.
2. ~~**Ingen `localStorage`**~~ — implementert. Data persisteres automatisk.
3. ~~**"Now line" er hardkodet**~~ — endret til `new Date().getHours() + new Date().getMinutes() / 60`.
4. ~~**Elever er hardkodet**~~ — ELEVADMIN implementert med legg til/rediger/slett og oppmøte%.
5. **Mobil, steg 1** — to seksjoner i app.css: «BUNN-NAVIGASJON (mobil)» gjør `#sideMeny` til en bunn-rad, og «MOBIL (under 768px)» nederst i fila tar resten — header over to rader, smalere tidskolonne i gridet, fullskjermmodaler, gjøremål-sidebar som overlegg, `100dvh`, horisontalt rullbar elevtabell. Alt er ren CSS pluss klassene `desktop-kun`, `mobil-kun` og `rullbar-x` i markup. Ukesvisningen er fortsatt trang på 390px; blir det et problem, er neste grep å la mobilen åpne i dagsvisning.

   **Én rulleflate om gangen.** `.student-list` har `max-height: 200px` i grunn-CSS. Inne i en fullskjermmodal på mobil ble det scroll i scroll — halve skjermen sto tom mens man dro i en liten boks. Mobilblokka nuller derfor både `max-height` og `overflow-y` på `.student-list`, slik at `.modal-body` er det eneste som ruller. Samme felle gjelder alt annet som får en fast `max-height` i grunn-CSS: sjekk om det havner inni en modal før du setter den.

   **Steg 2 (økt 19)** — headeren ryddet: Gjøremål flyttet ut av headeren og inn i bunnmenyen som et femte element (`.mobil-kun`, `#menyGjoeremaal`, aktiv-markering settes i `toggleSidebar()`), logosymbolet vist alene i sin egen flex-celle mellom visningsvelgeren og knappene, og ukelabelen kortet ned. Etiketten skrives i to varianter i hver sin span av `renderWeekLabel()` — `.uke-lang` og `.uke-kort` — der CSS velger hvilken som vises. Det gjør at den følger rotasjon uten at JS må lytte på skjermbredde. Merk at `.mobil-kun` slås på i 768px-blokka, ikke 767px-blokka, slik at den følger bunnmenyen og ikke mangler på nøyaktig 768 px.
6. **SFS2213-beregning (`calcSFS`)** returnerer demo-tall, ikke ekte aggregering fra registrert tid.
7. **Annenhver-uke vises ikke i Måned-visning** — `eventsForDate` håndterer weekPattern i uke/dag, men månedvisningen arver dette riktig.
8. **Mobilheaderen er fortsatt to rader, og det er strukturelt.** Etter opprydningen i økt 19 er rad 1 (visningsvelger · logo · I dag · Ny hendelse) ~347 px og rad 2 (ukenavigasjonen) ~215–237 px. Summen passer ikke på 390 px uansett hvor mye som fjernes fra rad 1, fordi ukenavigasjonen alene trenger over halve bredden. Én rad krever at enten visningsvelgeren eller ukenavigasjonen får en annen form — det er en større øvelse enn å flytte knapper. Rad 1 er dessuten full: på skjermer smalere enn ~350 px bryter den til en tredje rad framfor å flyte utenfor kanten.
9. **Fontene krever nett ved første last** — Inter og Figtree hentes fra Google Fonts. `display=swap` gjør at appen alltid tegnes, men uten nett brukes systemfonten. Skal appen bli helt frittstående, må fontfilene inn i repoet og `@font-face` erstatte `<link>`-en.
