# Veikart

Ting som er vurdert, men ikke bestemt. Hver post sier hva idéen går ut på,
hva som faktisk må endres i koden, hva som allerede er avklart, og hva som
fortsatt står åpent.

`funksjonsplan.md` er det opprinnelige kravdokumentet fra juni 2026 og
beskriver fase 1–3, som er gjennomført. Dette dokumentet er det som kommer
etter.

---

## 1. «Husk til neste time»

**Idéen:** Et felt i timeplanmodalen, fylt ut mens man fører nærvær, som
vises igjen i den kommende timen i samme fag.

**Status:** Ikke bestemt. Verdt å ta hvis bakoverblikk-varianten velges —
den er liten.

### Det som gjør det enkelt

`lessonData` er allerede én post per `(hendelse-id, dato)` via
`lessonKey()`, med `{tema, notes, attendance, studentNotes}`. Et felt til er
én linje i `saveLessonPlan()` og én i `openLessonPlan()`, og det synkes
automatisk siden hele `lessonData` går med.

**Men det er én linje du ikke kan glemme.** `saveLessonPlan()`
(app.js:1331) bygger et *helt nytt* objekt:

```js
setLesson(planEventId, planDateStr, { tema, notes, attendance, studentNotes });
```

Alt som ikke står i den literalen forsvinner ved neste lagring. Et nytt
felt må inn der, ellers slettes det stille første gang timen lagres på
nytt — også om det ble satt et helt annet sted i koden. Dette gjelder alle
nye felt i timeplanmodalen, ikke bare dette.

### Det som gjør det vanskelig

Appen har **ikke noe begrep om et fag med en klasse** — bare enkeltoppføringer
i kalenderen. `events[]` har `trinn`/`trinns`, men ingen `klasse`. To følger av
det:

- Norsk med 8A og Norsk med 8C ser identiske ut i datamodellen: samme tittel,
  samme trinn.
- Norsk med 8A mandag og torsdag er to separate hendelser med hver sin id.

Så «neste time i faget» betyr to ulike ting, med svært ulik pris:

1. **Neste gang denne timen går igjen** — søk framover etter neste dato der
   `eventsForDate()` gir samme hendelse-id. Enkelt.
2. **Neste gang jeg møter denne klassen i dette faget, uansett ukedag** —
   krever et kursbegrep som ikke finnes, eller et nytt klassefelt som må
   fylles inn på alle eksisterende timer. Datamodellendring.

### Anbefalt grep

**La den kommende timen slå opp bakover** framfor å levere notatet framover:
«finnes det et huskefelt i forrige time i denne serien?»

Da slipper man å finne et mål mens man skriver, å håndtere at målet flytter
seg når en time avlyses eller ferien kommer, og et «levert»-flagg. Notatet
blir tilstandsløst — det ligger der det ble skrevet, og vises der det er
relevant. Skrives det i siste time før sommeren, skjer det bare ingenting.

### Fortsatt åpent

- **Når slutter notatet å vises?** Henter man bare fra forrige time,
  forsvinner det av seg selv etter én gang — men da mistes det hvis timen ble
  avlyst.
- **Skal det synes i kalenderen før timen åpnes?** Det finnes allerede en
  prikk for «har plan» (`.event-plan-dot`); en tilsvarende markør ville vist
  at noe venter uten at man må klikke.
- **Personvern.** Enda et fritekstfelt som kan inneholde elevnavn, og det
  synkes. Samme forbehold som for `notes` og `studentNotes`:
  pseudonymiseringen beskytter strukturen, ikke det brukeren selv skriver.

---

## 2. Elev-ID synlig ved siden av navnet ✅

**Idéen:** Vis «Kari Nordmann 4f2a» i elevlista, ikke bare navnet.

**Status: gjennomført 3. august 2026 (økt 19).** `elevLapp()` er eneste
kilde til utsnittet, `fallbackNavn()` bygger på den, og `elevLappHtml()`
viser lappen ved siden av ekte navn i både den aktive og den arkiverte
elevtabellen. Banneret som vises når navn mangler forklarer nå
gjenopprettingsveien. `pseudonymisering.test.js` vokter at de to visningene
ikke kan drifte fra hverandre — verifisert ved å bryte invarianten med
vilje og se testen slå ut.

Beskrivelsen under er beholdt som begrunnelse.

### Hvorfor

`lp_studentNames` synkes ikke — det er et bevisst personvernvalg, se
«Tekniske valg» i CONTEXT.md. Konsekvensen er at navnene bare finnes i
nettleserlagringen på den enkelte enheten, og at de **ikke** følger med til
en ny enhet. Ryker PC-en, henter synken tilbake fravær, tema og notater
knyttet til «Elev 4f2a», uten at appen vet hvem det er.

Enheten som mangler navnene viser dem allerede med id-suffikset, siden
`fallbackNavn()` er `'Elev ' + String(id).slice(-4)`. Det som mangler er den
andre halvparten: at enheten som *har* navnene også viser suffikset. Da kan
Nikolai lese av den ene skjermen og skrive inn på den andre.

### Hva som må gjøres

Vis id-suffikset i elevlista i Elever-visningen (`renderElevView()`), og
eventuelt i elevvelgeren. **Bruk nøyaktig samme fire tegn som
`fallbackNavn()`** — `String(id).slice(-4)` — ellers stemmer ikke de to
skjermene overens, og hele poenget faller.

### Fortsatt åpent

- **Kollisjoner.** Fire tegn fra en UUID gir 65 536 muligheter. Med 30
  elever er sjansen for at to får samme lapp ~0,7 %, med 90 er den ~6 %.
  Skjer det, er svaret å vise flere tegn. Ikke noe å løse på forhånd, men
  verdt å kjenne igjen.
- **En sikrere variant i tillegg.** Manuell avlesing dekker det praktiske
  tilfellet. En bevisst «eksporter navnenøkkel»-knapp, som legger id → navn
  et sted Nikolai selv velger, er en tryggere backup. Merk at en slik fil
  *er* re-identifiseringsnøkkelen — den bør ikke ende i en bildesky eller et
  annet sted man ikke har tenkt over.

---

## 3. «Utgått», «ingen elever møtt» og timer uten elever

**Idéen:** Kunne markere at en time ikke ble gjennomført uten å slette den
— og se i kalenderen når en time står uten elever.

**Status:** Ønsket. Tellingen av undervisningstimer, som er den egentlige
motivasjonen bak statusene, er utsatt — men de er nyttige i seg selv.

*Dette var to poster fram til 19. august 2026. De ble slått sammen fordi
de handler om samme spørsmål sett fra hver sin kant: hva betyr det at en
time står tom, og hvordan vises det?*

### Tre tilstander, ikke én

De ser like ut i kalenderen og betyr helt forskjellige ting:

| Tilstand | Hva det betyr | Hvor det bor |
|----------|---------------|--------------|
| **Utgått** | Timen ble ikke gjennomført. Du underviste ikke. | `lessonData`, per `(hendelse-id, dato)` |
| **Ingen møtte** | Timen gikk, du var der, men ingen elever kom. | Kan **utledes** — er alle krysset av som fraværende i `attendance`, vet appen det allerede |
| **Ingen elever registrert** | Timen har ingen elever knyttet til seg i det hele tatt. Sier ingenting om hva som skjedde. | `ev.students` er tom — ingen ny data |

Skal timeregnskapet bli riktig, trengs de to første hver for seg: **en
utgått time underviste du ikke i, mens en time der ingen møtte var du
der.** Nikolai foretrekker «utgått» framfor «avlyst» som ordvalg.

Den tredje er noe annet: den handler om at *lista* er ufullstendig, ikke
om at timen var det.

### Hva som må gjøres

**Statusene** hører hjemme på timeinstansen, ikke på hendelsen — en fast
time i `events[]` gjentar seg, og det er den enkelte datoen som utgår.
`lessonData` er allerede én post per `(hendelse-id, dato)` og er derfor
riktig sted. Visning i kalenderen må være tydelig: gjennomstreket eller
nedtonet blokk.

**Merket for «ingen elever registrert»** er billigere og uavhengig:
`ev.category === 'undervisning' && !(ev.students||[]).length` i
`renderGrid()` (app.js:689–702), tegnet som en `.event-badge`-variant
eller et hjørneelement à la `.event-plan-dot`.

Ikonet bør være inline SVG i samme Feather-stil som menyikonene i
`index.html` — 24-rutenett, `stroke="currentColor"`, `stroke-width="2"`.
Appen har ingen emoji-ikoner, og et unntak ville synes.

I `renderMonthView()` (app.js:1942) er `.month-event-pill` ~11 px høy; der
får neppe et ikon til plass.

### Sammenheng

Statusene er forutsetningen for å gjøre noe med `calcSFS()`, som i dag er
død kode: funksjonen kalles ikke fra noe sted og returnerer hardkodede
tall (`year: 412`, `teach: 186`). Enten bygges den på ekte data — der
disse statusene inngår — eller så bør den slettes, slik at den ikke lurer
den som leser koden senere.

### Fortsatt åpent

**Hvor mange timer mangler faktisk elever?** Er elevlistene ufullstendige,
lyser hele uka opp og merket blir støy framfor informasjon. Tell før du
bygger — er det mange, er problemet elevlistene, ikke merket.

---

## 4. Papirkurv for slettede hendelser ✅

**Idéen:** Kunne angre en sletting.

**Status: gjennomført 3. august 2026 (økt 19).** Alternativ 2 under ble
valgt. Slettede timer, elever og gjøremål legges i `lp_papirkurv` og kan
hentes tilbake fra Min side i 30 dager. En slettet time tar med seg hele
elevloggen, og den følger med tilbake. Papirkurven står utenfor
`SYNK_NOKLER`, og `tests/papirkurv.test.js` vokter både gjenopprettingen og
den avgrensningen — verifisert ved å fjerne elevlogg-gjenopprettingen med
vilje og se testen slå ut.

Beskrivelsen under er beholdt som begrunnelse.

### Hvorfor

Sletting av en hendelse tar med seg all elevlogg og oppmøtehistorikk for
den hendelsen, permanent. Det er den mest kostbare operasjonen i appen, og
den er beskyttet av én `confirm()`.

Mønsteret finnes allerede to steder: elever kan arkiveres (`s.arkivert`), og
gjøremål kan skjules. Hendelser er det eneste som slettes hardt.

### Tre nivåer, fra billigst

1. **Angre-stripe.** «Slettet. Angre» i noen sekunder, med objektene i en
   variabel. Fanger feilklikk, hjelper ikke dagen etter.
2. **Papirkurv i localStorage.** Det som fjernes legges i en
   `lp_papirkurv`-nøkkel med tidsstempel og beskrivelse, og Min side får en
   liste med «Gjenopprett». **Anbefalt** — avgrenset til slettefunksjonene
   pluss ett panel, og dekker begge tilfellene. Sletting skjer sjelden, så
   listen kan være kort.
3. **Myk sletting.** `slettet: true` framfor å fjerne. Mest robust, men hver
   eneste lesesti må filtrere, og det er der feilene oppstår.

### Fortsatt åpent

**Skal papirkurven synkes?** Trolig ikke — da ville data man har valgt å
slette reise mellom enhetene. Samme resonnement som for `lp_studentNames`.

---

## 5. Sikkerhetsgjennomgang av Supabase-oppsettet ✅

**Status: gjennomført 6. august 2026.** Offentlig registrering er slått av,
og begge de to gjenstående punktene er verifisert:

- **RLS på `sync_data` virker.** En `select('user_id')` som innlogget bruker
  gir én rad. Ingen ser andres data.
- **Skrivepolicyene på `kalender`-bøtta er scopet til `auth.uid()`.** Rollen
  `authenticated` har lov til insert, update og delete, men bare innenfor
  brukerens egen mappe. Lesing er åpen, som den må være for at Outlook og
  Google skal kunne hente uten innlogging.

Beskrivelsen under er beholdt som begrunnelse og som sjekkliste hvis noe av
dette skal endres senere.

### Utgangspunktet

`SUPABASE_URL` og `SUPABASE_ANON` ligger i `sync.js` og er lesbare for alle
som åpner sidekilden. **Det er ikke en feil** — anon-nøkkelen er laget for å
være offentlig. Men det betyr at hele sikkerheten hviler på Row Level
Security og policyene på lagringsbøtta, ikke på at nøkkelen er hemmelig.

Elevdata er beskyttet i to uavhengige lag: RLS gir hver bruker bare sin egen
rad, og innholdet er kryptert med en passfrase som aldri forlater enhetene.
Selv en fullstendig svikt i RLS avslører ikke elevnavn eller notater.

### Angrepsflaten var registrering

Fram til 6. august kunne hvem som helst opprette en konto med anon-nøkkelen.
Ingen av følgene ville avslørt elevdata, men alle ville gjort at *appen*
sluttet å virke:

- Opplasting av store filer til `kalender`-bøtta til gratiskvoten på 1 GB er
  brukt opp
- Én rad i `sync_data` per konto, uten grense på hvor stor `ciphertext` kan
  være
- Uttømming av Supabase' delte e-postkvote, slik at *du* ikke får sendt deg
  selv en innloggingslenke
- Pausing av hele prosjektet ved brudd på gratisgrensene

**Løst:** «Allow new users to sign up» er slått av i Supabase. Du er eneste
bruker og har allerede kontoen din. Skal du noen gang trenge en konto til —
en ny enhet trenger det *ikke*, samme konto brukes overalt — må den slås på
midlertidig.

### Slik ble det verifisert — gjenta dette hvis noe endres

**Skriverettigheter på `kalender`-bøtta.** Bøtta er offentlig for lesing, og
det er med vilje: Outlook og Google må kunne hente uten innlogging.
Spørsmålet er hvem som får skrive. Policyen bør begrense insert, update og
delete til brukerens egen mappe — filene ligger allerede under
`{user_id}/{feed}-{token}.ics`, så formen er riktig. Sjekk under Storage →
`kalender` → Policies at det ikke står en åpen regel for rollen
`authenticated`.

**At RLS faktisk er på for `sync_data`.** Kjør dette i konsollen på appsiden
mens du er innlogget:

```js
const { data, error } = await supabase.from('sync_data').select('user_id');
console.log({ rader: data?.length, error });
```

Ett svar med `rader: 1` er riktig — du ser bare din egen rad. Mer enn én, og
RLS er ikke i orden.

### Vurdert og akseptert

Undervisningskalenderen er offentlig for alle som har adressen; tokenet er
hele beskyttelsen. **Nikolai har vurdert dette og er komfortabel med det** —
feeden inneholder fag, tid og rom, og `icsTittel()` bruker alltid faget,
aldri elevnavnet, også for enetimer der grensesnittet ellers viser eleven.
Det er altså ingenting personsensitivt i den.

Skulle adressen likevel måtte byttes, roterer «Slå av» og «Slå på» tokenet —
men da må alle som abonnerer legge inn den nye adressen.

---

## 6. Frist én uke etter møtet på gjøremål fra møtemodulen

**Idéen:** Et gjøremål opprettet fra møteskjemaet skal få frist én uke etter
møtedatoen, framfor møtedatoen selv.

**Status:** Ønsket. Trivielt for engangsmøter, ikke for gjentakende.

### Utgangspunktet

`leggTilGjøremålFraMøte()` (app.js:2025) setter i dag:

```js
const frist = (ev && ev.date) ? ev.date : isoDate(TODAY);
```

For et engangsmøte er endringen én linje: legg sju dager til `ev.date` før
den brukes.

### Det gjentakende tilfellet er den egentlige jobben

`saveEvent()` lagrer `date: recurs ? undefined : date` (app.js:1144 og
1148). **Et gjentakende møte har altså ingen `date` i det hele tatt** —
ukedagen i `weekday` er alt som finnes. Linja over faller da tilbake på
dagens dato, og «én uke etter møtet» blir «én uke etter i dag», som bare
tilfeldigvis stemmer hvis du står i møtet mens du skriver.

Å rette det krever at skjemaet vet *hvilken forekomst* som er åpen, og det
gjør det ikke: både `renderGrid()` (app.js:711) og `renderMonthView()`
(app.js:1952) kaller `openEventForm(ev)` uten dato. `openLessonPlan(ev, d)`
får datoen — møteskjemaet får den ikke.

| Sted | Endring |
|------|---------|
| `renderGrid()` app.js:711, `renderMonthView()` app.js:1952 | Send den klikkede datoen: `openEventForm(ev, null, key)` eller tilsvarende |
| `openEventForm()` app.js:914 | Ta imot og ta vare på datoen, slik `planDateStr` gjør for timeplanmodalen |
| `leggTilGjøremålFraMøte()` app.js:2025 | Bruk den datoen + 7 dager |

### Fortsatt åpent

- **«Gjennomført» finnes ikke som tilstand.** Ingenting registrerer at et
  møte faktisk ble holdt, så det som faktisk lages er «én uke etter
  møtedatoen». Det er trolig det som menes, men ordlyden bør si det.
- **Skal fristen kunne overstyres?** I dag er det ingen fristfelt i
  møteskjemaet — gjøremålet opprettes med ett trykk. Vises den beregnede
  datoen som en liten tekst ved siden av feltet, ser man hva man får uten
  at det blir et skjema til å fylle ut.

Anslag: 15 minutter for engangsmøter alene. En time hvis gjentakende møter
skal treffe riktig forekomst — og den datoparameteren er nyttig langt
utover dette punktet.

---

## 7. Nedtelling til neste ferie, og teller for skoledager

**Idéen:** Vise hvor mange dager det er til neste ferie, og hvor mange av
skoleårets 190 dager som er gjennomført.

**Status:** Ønsket. Dataene finnes allerede; spørsmålet er hvor tallet skal
stå og hva det skal telle.

### Alt som trengs finnes

`fridager[]` har `{fra, til, tittel, type}` med `type` i `ferie` /
`fridag` / `planlegging`, og `skoleaar` har `{start, slutt}`. Begge
redigeres fra Min side og synkes (`lp_fridager`, `lp_skoleaar` står i
`SYNK_NOKLER`). `erFridag(dato)` og `erUtenforSkoleaar(dato)` gjør
oppslaget.

**Nedtelling:** første post med `type === 'ferie'` og `fra > i dag`,
sortert på `fra`. Ren aritmetikk.

**Skoledager:** løkke fra `skoleaar.start` til i dag; tell mandag–fredag
som ikke treffer en fridag.

### Det ene som må avgjøres først

**Planleggingsdager er ikke skoledager, men de er arbeidsdager.**
`eventsForDate()` behandler dem allerede sånn: på `type === 'planlegging'`
skjules undervisning og vikar, mens møter blir stående. Telleren må ta
samme standpunkt, ellers blir ikke 190 til 190. Regelen bør være at
`ferie`, `fridag` **og** `planlegging` alle trekkes fra skoledagene.

### Ikke hardkod 190

190 er normen, ikke fasit for akkurat din skolerute. Regn ut totalen fra
`skoleaar` og `fridager` og vis den som «dag 87 av 189» — da fanger du
også at skoleruta er ufullstendig. Er totalen langt fra 190, mangler det
fridager, og telleren sier fra i stedet for å lyve pent. Merk at
seed-dataene i `FRIDAGER_SEED` dekker 2025/26; legges ikke 2026/27 inn,
teller appen ferien som skoledager.

### Fortsatt åpent

**Hvor skal det stå?** Tre kandidater:

- `.legend` nederst i kalenderen, ved siden av `.legend-total` som
  allerede viser «N undervisningstimer denne uka». Naturlig nabo, men
  legenden er allerede full på mobil.
- Øverst i Min side. Alltid plass, men man går ikke dit ofte.
- Månedsvisningen, der «hvor er vi i året» uansett er spørsmålet.

Anslag: en kveld, og det meste av den går til plasseringen.

---

## 8. Gjentakende gjøremål

**Idéen:** Et gjøremål som kommer igjen — ukentlig, månedlig — uten at man
må opprette det på nytt hver gang.

**Status:** Ønsket. Modellvalget avgjør prisen.

### To former, og bare den ene er billig

`todos` er i dag `{id, tittel, tekst, linkedFag, linkedStudentId, frist,
status, slettet}`. Ingen gjentakelse.

1. **Forhåndsgenererte forekomster.** Én rad per gjennomføring, laget på
   forhånd. Speiler hvordan `events[]` *ikke* gjør det, og fyller
   `lp_todos` — som synkes i sin helhet, kryptert, ved hver endring.
2. **Rullende frist.** Ett objekt med et `gjentas`-felt. Når status settes
   til `ferdig`, flyttes fristen fram til neste gang framfor at gjøremålet
   arkiveres. **Anbefalt** — `renderTodoList()` og `renderSkjulteGjøremål()`
   kan stå urørt, og lagringen vokser ikke.

| Sted | Endring |
|------|---------|
| `openTodoForm()` app.js:1995, `saveTodo()` app.js:2050 | Nytt felt `gjentas` med intervall, lest og skrevet som de andre |
| `cycleTodoStatus()` app.js:2070 | Gren: er `gjentas` satt og ny status `ferdig`, sett `frist` fram og status tilbake til `ikke_startet` |
| `index.html`, `todoFormOverlay` (linje 719) | Nedtrekksliste for intervall |

### Fortsatt åpent

- **Hvilke intervaller?** Ukentlig og månedlig dekker antakelig alt. Blir
  det flere, er det samme valg som venter i post 10 for møter, og de to
  bør velge samme form.
- **Historikken forsvinner.** Med rullende frist finnes bare neste
  forekomst; man kan ikke se at gjøremålet ble gjort de fem foregående
  ukene. Er det viktig, er alternativ 1 likevel svaret — men da er det
  verdt å si hvorfor.
- **Skal ferier pause dem?** Et ukentlig gjøremål knyttet til undervisning
  gir ikke mening i juli. `eventsForDate()` kjenner skoleruta; `todos` gjør
  det ikke, og å koble dem sammen er mer arbeid enn selve gjentakelsen.

---

## 9. Trinn i den eksporterte undervisningskalenderen

**Idéen:** Se hvilket trinn timen gjelder i Outlook, ikke bare fagnavnet.

**Status:** Ønsket, og nesten gratis — men avhenger av hva «gruppe»
betyr.

### Utgangspunktet

`byggICS()` skriver `SUMMARY` fra `icsTittel(ev)` (app.js:2810), som er
`ev.title`, eventuelt med «(enetime)» bak. Trinnet ligger allerede i
`DESCRIPTION` via `icsBeskrivelse(ev)` (app.js:2817), formatert som «8. +
9. trinn». Outlook viser bare `SUMMARY` i måneds- og ukeoversikten, så i
praksis er trinnet usynlig til man åpner hendelsen.

Endringen er i `icsTittel()` alene: sett trinnet fra `getEventTrinns(ev)`
foran eller bak faget. `icsBeskrivelse()` har allerede formateringen og
kan gjenbrukes.

### Avklart

- **Personvern er ikke et hinder.** Feeden er offentlig for den som har
  adressen, og inneholder allerede fag, tid og rom — se post 5. Et trinn
  er ikke personidentifiserende.
- **Enetimer er unntaket.** «Enetime · 8. trinn» snevrer inn hvem det
  gjelder på en måte «Enetime» ikke gjør, særlig på et lite trinn.
  `icsTittel()` skiller allerede ut enetimer, så regelen kan være: trinn
  på gruppe- og parallelltimer, ikke på enetimer.

### Fortsatt åpent

**Er det trinnet eller klassen som menes?** Ordet «gruppe» peker mot 8A,
ikke mot 8. trinn. **Appen har ikke noe klassebegrep** — `events[]` har
`trinn`/`trinns`, og Norsk med 8A og Norsk med 8C er identiske i
datamodellen. Det er nøyaktig den mangelen post 1 står og venter på. Er
det 8A som skal stå i Outlook, er dette ikke en endring i `icsTittel()`,
men samme datamodellendring — og da bør de to tas sammen.

Anslag: 20 minutter for trinn. Klasse er en annen sak.

---

## 10. Månedlige møter

**Idéen:** Et møte som går den første tirsdagen i måneden, uten at det må
legges inn tolv ganger.

**Status:** Ønsket. Krever en ny gren i gjentakelsesmodellen.

### Hvorfor det ikke passer inn som det er

`eventsForDate()` (app.js:301) avgjør gjentakelse med tre linjer:

```js
if (ev.weekday !== wd) return false;
if (ev.weekPattern === 'odd'  && wn % 2 === 0) return false;
if (ev.weekPattern === 'even' && wn % 2 !== 0) return false;
```

`weekPattern` er altså en paritetssjekk på uketallet. «Første tirsdag i
måneden» er ikke en paritet, og lar seg ikke uttrykke i den formen.

| Sted | Endring |
|------|---------|
| `eventsForDate()` app.js:321–327 | Ny gren for månedlig. Trenger et felt til — f.eks. `manedsUke: 1–5` eller `'siste'` |
| `index.html`, `weekPatternRow` | Flere valg. Radioknappene bærer ikke et tall i tillegg; antakelig en nedtrekksliste i stedet |
| `openEventForm()` app.js:962, `saveEvent()` app.js:1105 | Lese og skrive det nye feltet |
| `loadFromStorage()` app.js:2630 | Gamle hendelser har `weekPattern: 'every'` og trenger ingen migrering — men det bør stå at det er sjekket |
| `tests/gjentakende-moter.test.js` | Utvides. Den vokter allerede at ukedagen utledes riktig fra møtedatoen |

`byggICS()`, `arbeidstidForDato()`, månedsvisningen og ukesvisningen går
alle gjennom `eventsForDate()`, så de arver den nye grenen uten endring.
Det er hele grunnen til at prisen er lav.

### Anbefalt form

**«N-te ukedag i måneden», ikke «dato i måneden».** Skolemøter ligger
nesten alltid på en fast ukedag. En fast dato lander i helga omtrent hver
tredje måned, og verken uke- eller dagsvisningen har lørdag og søndag —
`saveEvent()` avviser allerede gjentakende hendelser med `weekday > 4`
(app.js:1089) av nettopp den grunn.

### Fortsatt åpent

- **Hva med «siste tirsdag»?** Måneder har fire eller fem tirsdager.
  Velger man «5.», forsvinner møtet i de fleste måneder. Enten støtt
  `'siste'` eksplisitt, eller sperr valget.
- **Samme mekanikk som post 8.** Gjentakende gjøremål trenger det samme
  intervallbegrepet. Tas de sammen, deler de én form; tas de hver for seg,
  blir det to.

---

## 11. Flere fagfarger, og egen farge per trinn

**Idéen:** Flere farger å velge mellom, og at samme fag kan ha ulik farge
på ulike trinn.

**Status:** Ønsket, men den ene halvdelen kolliderer med palettreglene.
Verdt å lese «Visuell identitet» i CONTEXT.md før noe røres.

### Utgangspunktet

`COLOR_POOL` har sju farger. `getSubjectColor(name)` deler dem ut
fortløpende etter fagnavn og går rundt med `% COLOR_POOL.length`
(app.js:101).

**`subjectColorMap` lagres ikke.** Den bygges på nytt ved hver last, i den
rekkefølgen fagene dukker opp under rendringen. Så lenge `events[]` ligger
i samme rekkefølge er tildelingen stabil i praksis — men sletter du en
time og legger inn en ny, kan fagene bytte farge. Det er verdt å vite før
man begynner å knytte betydning til fargene, og det er billig å rette:
lagre kartet.

### Hvorfor «farge per fag og trinn» er dyrere enn det ser ut

Nøkkelen måtte bli `tittel + '|' + trinn`. Fem fag på tre trinn er
femten kombinasjoner, mot sju farger.

Og da slår regelen i CONTEXT.md inn: **fag ligger på lyshet 89,
kategorier på 94,5, og ingen to bakgrunner er nærmere enn ΔE 5.** Sju
farger på én lyshet er allerede tett. Femten er ikke mulig innenfor samme
regel — man må enten slippe opp på ΔE (og da gror fargene sammen, som de
gjorde i første utkast der mose og annet lå på ΔE 1,1) eller ta i bruk et
lyshetsnivå til for fag, og da forsvinner «fag eller ikke fag på lysheten
alene».

### Anbefalt grep

**Behold én kulør per fag, og skill trinnene på noe annet enn farge.**
Alle norsktimer skal se like ut — det er nettopp det man leser en uke på.
Trinnet finnes allerede som `trinnKortEtikett()` og vises i
`.event-trinn-kort`, men bare på mobil; på desktop står det i
undertittelen. Vil man ha det tydeligere, er kantfargen
(`border-left-color`, som i dag er `c.border`) eller et lite merke
billigere og mer lesbart enn femten kulører.

Skal det likevel være egne farger, er jobben: utvid `COLOR_POOL`, mål ΔE
for hele settet på nytt, sjekk at ingen kolliderer med `SPECIAL_COLORS`
eller vikarstripen i `app.css:466`, og bestem hva `renderLegend()` skal
gjøre — den lister i dag ett merke per unikt fagnavn, og med fag+trinn
blir raden lang.

### Fortsatt åpent

- **Hvor mange fag er det egentlig?** Er det åtte eller ni, er svaret å
  utvide `COLOR_POOL` med et par farger og ferdig med det. Er det femten
  kombinasjoner, er det avsnittet over som gjelder. Tell først.
- **Skal man kunne velge farge selv?** Da blir ΔE-regelen umulig å
  håndheve, men det er brukerens eget verktøy. Verdt en tanke.

---

## 12. Merke for ny eller endret time

**Idéen:** Se i kalenderen at en time er ny eller endret siden forrige
uke.

**Status:** Ønsket, men det dyreste punktet i lista — og grunnen er at
appen ikke har noen historikk å sammenligne mot.

### Hvorfor det ikke er rett fram

`events[]` er nåtilstanden. `saveEvent()` skriver oppå objektet
(app.js:1144) uten å ta vare på det som sto der. Det finnes altså ingen
forrige versjon.

### Tre nivåer, fra billigst

1. **Endringsstempel.** `saveEvent()` setter `sistEndret: <ISO>` på
   hendelsen; `renderGrid()` viser et merke på hendelser endret de siste N
   dagene. Ett felt, én linje i rendringen. Svarer på «hva har jeg rørt
   nylig», ikke på «hva er annerledes denne uka enn forrige».
   **Anbefalt**, med den ordlyden.
2. **Sammenlign uke mot uke.** Kjør `eventsForDate()` for samme ukedag
   forrige uke og se om hendelsen var der. Fanger `gyldigFra`/`gyldigTil`
   og fridager riktig — men flagger *hver eneste* annenhver-uke-time som
   ny. Teknisk sant, praktisk ubrukelig.
3. **Versjonshistorikk per hendelse.** Det egentlige svaret, og en
   datamodellendring med eget lagringsområde.

### Fortsatt åpent

- **Hva teller som en endring?** Nytt rom fortjener et merke; en rettet
  skrivefeil i tittelen gjør det ikke. Uten et skille lyser alt opp etter
  en opprydningsøkt.
- **Hvor lenge står merket?** Sju dager er det opplagte, men da må det
  også forsvinne av seg selv — altså sammenlignes mot dagens dato ved hver
  rendring, ikke settes som en flaggverdi.
- **Plassen er opptatt.** `.event-plan-dot` (app.css:176) ligger nederst
  til høyre i blokka. Et merke til må ha en annen plass, eller de to må
  slås sammen til én merkerad.

---

## 13. Klikk utenfor modalen skal ikke lukke den ✅

**Idéen:** Det er for lett å bomme og miste det man har skrevet.

**Status: gjennomført 19. august 2026.** Mellomtingen under ble valgt:
klikk utenfor lukker fortsatt de små dialogene, men ikke arbeidsmodalene.
Escape kom med, ellers hadde musa vært eneste vei ut på PC. Regelen leses
av markupen — har overlegget en `.simple-modal` eller `.after-save-modal`
inni seg, er det en liten dialog — så en modal lagt til senere arver
oppførselen fra klassen den får. `tests/modallukking.test.js` vokter begge
halvdeler og at ingen modal er blitt umulig å lukke; verifisert ved å
skru av hver av dem med vilje og se testen slå ut.

Beskrivelsen under er beholdt som begrunnelse.

### Hva som må gjøres

app.js:2302:

```js
document.querySelectorAll('.overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) closeOverlay(el.id); });
});
```

### Avklart

**Alle ni overlegg har en annen vei ut.** `planfestetOverlay`,
`overtidOverlay`, `eventFormOverlay`, `afterSaveOverlay`, `planOverlay`,
`elevloggOverlay`, `todoFormOverlay`, `skjulteGjøremålOverlay` og
`studentFormOverlay` har alle enten en `×` i toppen eller en
Avbryt-knapp — de fleste begge. Fjernes linja, blir ingen modal umulig å
lukke. Det er sjekket.

### Anbefalt mellomting

Behold klikk-utenfor der ingenting kan gå tapt, fjern den der det kan:

- **Fjern** på `.event-modal`, `.plan-modal` og `.elevlogg-modal` — det er
  der man skriver.
- **Behold** på `.simple-modal` og `.after-save-modal` (planfestet tid,
  overtid, «Vil du legge inn plan?») — små dialoger der et bomklikk ikke
  koster noe.

Det treffer nøyaktig klagen, og beholder den raske veien ut av dialogene
man bare skal bekrefte.

### Fortsatt åpent

**Escape.** Fjerner man klikk-utenfor uten å legge til Escape, blir musa
eneste vei ut på desktop. En `keydown`-lytter som lukker øverste åpne
overlegg er noen få linjer, og hører sammen med denne endringen.

Anslag: 20 minutter, inkludert Escape.

---

## 14. Vurderinger som egen visning

**Idéen:** Et eget menypunkt med en oversikt over gjennomførte
vurderinger, og hva som kom ut av dem.

**Status:** Avklart 19. august 2026. Klar til å bygges — omfanget er
bestemt, og det er vesentlig mindre enn det så ut som først.

### Hva som ble bestemt

Posten sto tidligere åpen fordi «vurdering» kan bety fire ting: karakter,
underveisvurdering i tekst, registrering av at en vurderingssituasjon
fant sted, eller halvårsvurdering. Nikolai har valgt:

- **En oversikt, ikke et vurderingsverktøy.** Kun gjennomførte
  vurderinger, listet.
- **Vurderinger registreres i visningen selv**, ikke ved å merke en time.
  De er altså egne oppføringer med dato, fag, trinn og tittel — ikke et
  felt på `lessonData`. Det gjør at en innlevering uten en bestemt time
  også kan føres.
- **Resultat er én samlet notis per vurdering.** Fritekst: «snittet lavt
  på oppgave 3», «må tas opp igjen». **Ikke per elev, og ingen
  karakterer.**
- **Kun desktop.** Se avsnittet om bunnmenyen under.

### Hva det betyr for personvernet

Dette var den tunge innvendingen mot posten slik den sto, og valgene over
fjerner den. Uten elevkobling er en vurderingsoppføring ikke
personopplysninger i det hele tatt — den sier at 8. trinn hadde
norskprøve 12. september, ikke hvem som gjorde det bra.

Merk likevel at notisen er fritekst, og at fritekst kan inneholde navn
brukeren selv skriver inn. Samme forbehold som for `notes` og
`studentNotes`: pseudonymiseringen beskytter strukturen, ikke innholdet.

### Hva som må gjøres

| Sted | Endring |
|------|---------|
| `index.html`, `<nav id="sideMeny">` (linje 58–81) | Nytt menyelement med `desktop-kun`, inline SVG i Feather-stil som de andre |
| `index.html` | Ny fullskjermvisning `#vurderingerView`, samme mønster som `#minSideView` |
| `setView()` app.js:1845 | Ny gren + `menyVurderinger` i `menyStatus`-objektet |
| `render()` app.js:470 | Vis/skjul den nye visningen |
| Ny `renderVurderingerView()` | Liste sortert på dato, med skjema for å legge til |
| `saveToStorage()` / `loadFromStorage()` app.js:2601 og 2630 | Ny nøkkel `lp_vurderinger` |
| `SYNK_NOKLER` i sync.js:24 | **Må inn her**, ellers synkes ikke vurderingene til de andre enhetene |
| `exportData()` app.js:2235 / `importData()` app.js:2257 | Ta med i backup, ellers mistes de ved gjenoppretting |

Datamodell, forslag: `{ id, dato, fag, trinn, tittel, notis }`.

### Bunnmenyen er grunnen til desktop-kun

`#sideMeny` er sidemeny på PC og **bunnmeny på mobil**. Den har allerede
fem elementer, hvorav Gjøremål (`#menyGjoeremaal`) bare ligger der fordi
headeren ble for trang — se punkt 5 og 8 under «Kjente begrensninger» i
CONTEXT.md. Et sjette element gir rundt 65 px per punkt på en 390 px
skjerm.

`desktop-kun` finnes allerede som klasse og skjules i mobilblokka, så
løsningen er på plass. Men merk at det da er **to** menypunkter som ikke
finnes på mobil-motsatt-vei — vurderinger mangler der, gjøremål finnes
bare der. Blir det et tredje unntak, er bunnmenyen moden for å tenkes om
framfor å lappes.

### Fortsatt åpent

- **Skal vurderinger kunne knyttes til en time likevel?** Ikke nå. Men
  hvis oversikten viser seg å bli ført sjelden, er grunnen antakelig at
  den må fylles ut et sted man ikke er. Da er en snarvei fra
  timeplanmodalen svaret — ikke en ny datamodell.
- **Skal de vises i kalenderen?** En markør på dagen en vurdering ble
  gjennomført ville gjort oversikten toveis. Billig hvis dataene først
  finnes.

Anslag: en kveld for visningen med lagring og synk.

---

## 15. Mulighet for å legge inn lenker

**Idéen:** Kunne lagre lenker — til fagplan, læreverk, møtelenke.

**Status:** Ønsket. Tre steder er mulige, og de koster ulikt.

### Tre kandidater

| Hvor | Hva det dekker | Pris |
|------|----------------|------|
| **På hendelsen** | Fagplan, digitalt læreverk, Teams-lenken til møtet | Felt i `openEventForm()`/`saveEvent()` + visning i timeplanmodalen |
| **På gjøremålet** | Det man skal gjøre noe med | Felt i `openTodoForm()`/`saveTodo()`, ved siden av `tekst` |
| **I timenotatet** | Alt, uten nytt felt | Gjør URL-er i `planNotes` klikkbare ved rendring |

Det siste er nesten gratis og dekker antakelig behovet. Men:

### Én ting å passe på

`renderTodoList()` setter brukerens tekst med `textContent`
(app.js:2112 og 2116), ikke `innerHTML`. Det er et vern: det gjør at tekst
brukeren selv har skrevet aldri tolkes som markup. Skal lenker bli
klikkbare, må `<a>`-elementene **bygges som noder i JS** —
`document.createElement('a')` — ikke ved å bytte til `innerHTML`.

Til orientering gjør `renderSkjulteGjøremål()` (app.js:2165) og
`renderStudentList()` (app.js:1054) allerede det motsatte: de setter
`t.tittel` og `s.navn` rett inn i en `innerHTML`-mal. I et personlig
verktøy der du er eneste som skriver, er det ikke et angrepspunkt — men
det er en inkonsekvens, og det er verdt å rydde i den *før* man legger
lenkehåndtering oppå.

### Fortsatt åpent

**Hvilke lenker er det snakk om?** Svaret avgjør hvilken av de tre radene
i tabellen som skal bygges. Peker de på det samme hver time (fagplanen),
hører de til hendelsen. Er de forskjellige hver gang, hører de til
notatet.

---

## 16. Hake for «fravær ført i det andre systemet»

**Idéen:** En avkrysningsboks som bekrefter at fraværet er ført der det
skal føres — i skolens eget system, utenfor denne appen.

**Status:** Avklart 19. august 2026. Plasseringen er bestemt, og den er en
annen enn posten opprinnelig foreslo.

### Hva som ble bestemt

- **Haken ligger nederst på den aktuelle dagen i ukesvisningen**, rett
  over fargekodeforklaringen — ikke i timeplanmodalen.
- **Den skal ikke blandes med appens egen fraværsføring.** `attendance` i
  `lessonData` er hvem som var til stede i en time. Denne haken er noe
  helt annet: at du har gjort unna papirarbeidet et annet sted.

**Det endrer arkitekturen.** Posten sa tidligere at feltet hørte hjemme i
`lessonData`, per `(hendelse-id, dato)`. Men **haken gjelder en hel dag**,
ikke en enkelt time. Den trenger derfor sin egen lagring.

### Hva som må gjøres

| Sted | Endring |
|------|---------|
| Ny variabel `fravaerFort` | `{ 'YYYY-MM-DD': true }` — én nøkkel per dag, ikke per time |
| `saveToStorage()` app.js:2601, `loadFromStorage()` app.js:2630 | Ny nøkkel `lp_fravaerFort` |
| `SYNK_NOKLER` i sync.js:24 | **Må inn her.** Uten det ville PC-en ikke visst hva du huket av på telefonen |
| `exportData()` app.js:2235 / `importData()` app.js:2257 | Ta med i backup |
| `index.html`, `#weekDayView` (linje 100–105) | Ny rad etter `.calendar-scroll`, før legenden |
| Ny `renderFravaerRad()`, kalt fra `render()` | Én avkrysningsboks per dagkolonne |

### `renderDayHeaders()` er malen

Raden må stå i flukt med kalenderkolonnene, og det er allerede løst ett
sted: `renderDayHeaders()` (app.js:519) bygger en gridrad med
`kalenderKolonner()` og en tom celle over tidsaksen. Kopier den formen,
så følger raden både kolonnebreddene og dagsvisningen.

Konkret:

- `el.style.gridTemplateColumns = kalenderKolonner(currentView==='day' ? 1 : 5)`
- Første celle er tom — den ligger over tidsaksen.
- Deretter én celle per dag, med `isoDate(d)` som nøkkel.

**Dagsvisningen må virke.** Der er det én kolonne, ikke fem. Bruker du
`kalenderKolonner()` som over, kommer det gratis.

**Månedsvisningen gjelder ikke.** Raden ligger inne i `#weekDayView`, som
er skjult i månedsvisning, så den forsvinner av seg selv.

**Ferier og fridager.** `erFridag(d)` og `erUtenforSkoleaar(d)` bør
antakelig skjule haken — det er ikke noe fravær å føre på en dag uten
timer. Samme sjekk som `renderGrid()` gjør i dag.

### På mobil

Kolonnene er ~70 px. Avkrysningsboksen får plass; en tekstetikett ved
siden av gjør det ikke. Sett `title` på boksen og la den stå alene, slik
`.event-time-nr` er løst i samme situasjon.

### Fortsatt åpent

**Skal ubekreftede dager kunne ses samlet?** Det er antakelig det som
gjør funksjonen nyttig over tid — «disse fem dagene mangler» framfor å
måtte bla tilbake gjennom ukene. Men det er en egen liten øvelse, og
haken er nyttig uten den.

Anslag: en kveld, det meste på raden som skal stå i flukt med gridet.

---

## 17. Lunsj som visuelt skille ✅

**Idéen:** Markere lunsjen med egen farge, så det blir lettere å lese
formiddag mot ettermiddag.

**Status: gjennomført 19. august 2026.** `lunsjLuke()` finner den lengste
luka mellom to skoletimer i `PERIODS`, og `renderGrid()` tegner et
`.lunsj-band` som fyller den i hver dagkolonne, pluss en «Lunsj»-etikett i
tidsaksen. Klokkeslettene står fortsatt bare ett sted.
`tests/lunsj.test.js` regner ut fasiten uavhengig av implementasjonen, så
en hardkodet tid slår ut — verifisert.

**Anbefalingen under om linje framfor flate holdt ikke.** Den ble prøvd
først, og sett i en ekte nettleser forsvant den: rutenettet har streker
hvert kvarter fra før, så enda en ble bare enda en. Løsningen ble et bånd
i en varm tone — altså «annen farge», som opprinnelig ønsket — med kant
over og under, så skillet mellom formiddag og ettermiddag også er der.
Kantene er linja; flaten er det som gjør den synlig.

Beskrivelsen under er beholdt som begrunnelse.

### Lunsjen ligger allerede i dataene

`PERIODS` har 30 minutter mellom 3. time (slutt 11:05) og 4. time (start
11:35). Alle andre pauser er 10–15 minutter. Lunsjen er altså allerede
der, som det lengste hullet.

`renderGrid()` tegner en `.period-band` bak hver skoletime
(app.js:650–655, `rgba(47,96,118,0.055)` i app.css:157). Pausene står
igjen som lyse mellomrom. Et lunsjbånd er én `div` til i samme løkke.

### To varianter

- **Flate.** En `.lunsj-band` mellom `PERIODS[2].end` og
  `PERIODS[3].start`, litt varmere enn timesonene.
- **Linje.** En kraftigere `.grid-line`-variant midt i luka.
  **Sannsynligvis bedre** hvis det er *lesbarhet* som er poenget — øyet
  leser en heltrukket strek som «her deler dagen seg», mens en flate til
  bare er enda en flate i et rutenett som har flere fra før.

Prøv linja først. Den er billigere å angre.

### Ikke skriv inn klokkeslettene

Regn luka ut framfor å hardkode `11:05–11:35`: den lengste avstanden
mellom `PERIODS[i].end` og `PERIODS[i+1].start`. Endrer skolen timeplanen,
flytter lunsjen seg med — og `PERIODS` er ett sted, mens et hardkodet
klokkeslett ville vært to.

### Fortsatt åpent

**Hvilke visninger?** Ukesvisningen er den som trenger det. Dagsvisningen
arver det gratis (samme `renderGrid()`). Månedsvisningen har ingen
tidsakse, så der gir det ingen mening.

Anslag: en halvtime.

---

## 18. Mobil: gjøremål skal lukkes når du bytter visning ✅

**Idéen:** Trykker du Timeplan mens gjøremål står åpent, skal panelet
lukke seg. I dag må det skjules manuelt.

**Status: gjennomført 19. august 2026.** `setView()` lukker panelet når
`erSmalSkjerm()`, og bare da — på PC blir kolonnen stående, som den skal.
`tests/navigasjon.test.js` dekker begge tilfellene med en stubbet
`matchMedia`; verifisert ved å fjerne linja og se mobiltesten slå ut mens
PC-testen holdt.

Beskrivelsen under er beholdt som begrunnelse.

### Hva som skjer i dag

På mobil er `#sidebarContent` `position: fixed` med `z-index: 150` og
`bottom: 58px`, altså et overlegg over hele kalenderen (app.css:829–838).
`setView()` (app.js:1845) rører den ikke. Trykker du et annet punkt i
bunnmenyen, byttes visningen **bak** overlegget — men overlegget blir
stående, så det ser ut som ingenting skjedde.

### Fiksen

Først i `setView()`:

```js
if (sidebarVisible && erSmalSkjerm()) toggleSidebar();
```

`erSmalSkjerm()` finnes allerede (app.js:209). `toggleSidebar()` fjerner
selv `active` fra `#menyGjoeremaal` (app.js:1992), så markeringen følger
med.

### Hvorfor `erSmalSkjerm()` og ikke bare `sidebarVisible`

På desktop er `#sidebarContent` en kolonne ved siden av kalenderen, ikke
et overlegg. Der er det ingenting i veien, og å lukke panelet hver gang
man bytter visning ville vært et tap. Betingelsen må derfor kjenne
skjermbredden.

### Test

`tests/mobil.test.js` vokter allerede at sidebaren er `position: fixed` og
at `.collapsed` er `display: none`. En test til på at `setView()` lukker
den på smal skjerm hører hjemme samme sted.

Anslag: 15 minutter, test inkludert.

---

## 19. Mobil: tekstfeltene på Min side er for store

**Idéen:** Feltene tar for mye plass på telefon.

**Status:** Ønsket, men det bør avklares hva «for store» betyr før det
fikses.

### Hva som skjer

`.synk-input` har `flex: 1 1 220px` (app.css:651–657) inne i `.synk-rad`, som
er `display: flex; flex-wrap: wrap` (app.css:647). På 390 px får inputen
hele raden og knappen faller ned på neste linje. **Hvert felt tar dermed
to rader**, og seksjonen «Synk mellom enheter» — som har fem inputfelt —
blir lang.

Mobilblokka i app.css rører i dag bare `#minSideView`-paddingen og
`.data-toolbar` (app.css:845–848). `.synk-input` er ikke justert der i det
hele tatt.

### Ikke gjør skriften mindre

`.synk-input` er 13 px. iOS Safari zoomer inn på et inputfelt ved fokus
når skriften er under 16 px, så feltene er **allerede** under grensen.
Krymper man dem videre, blir zoomingen mer merkbar, ikke mindre. Skal noe
gjøres med størrelsen, er det bredden og radhøyden — ikke skriftgraden.

### Fortsatt åpent

**Er det bredden, høyden eller antallet som er problemet?** En regel i
767px-blokka som setter `flex: 1 1 140px` lar input og knapp dele raden og
halverer høyden på seksjonen. Men fem inputfelt er fem inputfelt, og de
tre av dem som gjelder passord og passfrase trengs sjelden. Å legge dem
bak «Vis flere valg» ville hjulpet mer enn å krympe hvert enkelt felt.

Si hvilket av de to du mener, så er det enten fem minutter eller en time.

---

## 20. Fritekstfeltet i gjøremål skal fylle skjermen ✅

**Idéen:** Beskrivelsesfeltet i gjøremålsskjemaet er for lite, både på
mobil og desktop.

**Status: gjennomført 19. august 2026.** Diagnosen stemte: modalen var
allerede full høyde, det var textareaen som ikke fikk beskjed om å vokse.
Flex-kjeden er koblet gjennom `.form-section` og feltet, og de to inline
breddene er flyttet til `.event-modal--smal` og `.event-modal--medium`.
`tests/gjoeremaal.test.js` vokter kjeden og at inline bredde ikke kommer
tilbake. Mobiltesten fanget underveis at de nye breddeklassene manglet
overstyring i mobilblokka — de står nå eksplisitt i fullskjermregelen.

Beskrivelsen under er beholdt som begrunnelse.

### Modalen er allerede stor — feltet vokser bare ikke

- `.event-modal` er `height: 90vh` på desktop (app.css:265) og `100dvh` på
  mobil (app.css:797–805). Gjøremålsmodalen har `style="width:420px"`
  inline (index.html:720), som overstyrer bredden, men `max-width: 100%`
  fra mobilblokka klamrer den likevel til skjermbredden. **Høyden er altså
  allerede full.**
- `#todoTextInput` har `rows="3"` (index.html:733) og `.form-field
  textarea` har `min-height: 90px` (app.css:338). Feltet blir stående på
  90 px mens resten av modalen er tom.

Det er altså ikke modalen som er for liten. Det er textareaen som ikke får
beskjed om å vokse.

### Hva som må gjøres

`.modal-body` er allerede `display: flex; flex-direction: column`
(app.css:252), og `.form-section` likeså (app.css:324). Kjeden er der; det
mangler bare `flex: 1` og `min-height: 0` nedover den, fram til
textareaen.

Én komplikasjon: beskrivelsesfeltet er **ikke siste felt** i skjemaet —
fag, elev og frist står under (index.html:735–751). Skal textareaen ta all
ledig plass, må enten den flyttes nederst, eller feltet få `flex: 1` mens
de andre beholder `flex: 0 0 auto`.

### Bonus mens du er der

`skjulteGjøremålOverlay` har `style="width:520px"` inline
(index.html:767), av samme grunn. Flytt begge inline-breddene til klasser
(`.event-modal--smal`, `.event-modal--medium`) — da slutter mobilblokka å
kjempe mot inline stil, og det blir tydeligere hva som faktisk gjelder.

Anslag: en halvtime.

---

## Vurdert og lagt bort inntil videre

Kartlagt i økt 19, men utsatt til appen har vært brukt et skoleår i praksis.
Skoleåret 2026/27 starter uken etter 3. august 2026, og fram til da er all
prioritering gjetning.

- **Søk i notater.** Funksjonsplanen § 7 lovte søkbare notater. Alt ligger
  flatt i minnet, så ytelse er ikke problemet. Men det er verdt å avklare om
  behovet egentlig er fritekstsøk («hvor nevnte jeg brøk?») eller en
  **temaoversikt per fag** — alle temaer i rekkefølge med dato, som en
  pensumlogg. `topicsBySubject` finnes allerede, og den er både billigere og
  trolig oftere brukt. Vent og se hvilken som savnes.
- **Rull kalenderen til nå ved oppstart.** Rutenettet er 510 px; på telefon
  ser man omtrent halvparten. Åpner man appen klokka 13, vises formiddagen.
  Én linje som ruller `.calendar-scroll` til nå-linja. Ikke opplevd som et
  problem så langt.
- **Tastaturnavigasjon og skjermleser.** Null `tabindex`, null `role`, én
  `aria-`. Timer og dagkolonner er `div`-er med `onclick`. Ikke prioritert
  for et personlig verktøy.
- **Varsler og påminnelser.** Funksjonsplanen § 6, ikke implementert. Ikke
  etterspurt.

---

*Opprettet 3. august 2026 (økt 19). Utvidet 19. august 2026 med en
forslagsrunde, og ryddet samme dag: forelesninger strøket, «utgått» og
«timer uten elever» slått sammen, vurdering og fraværshaken omskrevet
etter avklaring, og fire poster gjennomført. Numrene ble satt på nytt da
— peker du hit fra et annet dokument, sjekk at nummeret stemmer.*
