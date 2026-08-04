# Veikart

Ting som er vurdert, men ikke bestemt. Hver post sier hva idéen går ut på,
hva som faktisk må endres i koden, hva som allerede er avklart, og hva som
fortsatt står åpent.

`funksjonsplan.md` er det opprinnelige kravdokumentet fra juni 2026 og
beskriver fase 1–3, som er gjennomført. Dette dokumentet er det som kommer
etter.

---

## 1. Forelesninger som egen hendelsestype

**Idéen:** Nikolai begynner å studere ved siden av jobben og vil se
forelesningene i samme kalender som undervisningen.

**Status:** Utsatt til timeplanen for studiet er kjent. Uklart om
forelesningene blir prioritert, og om de finnes i opptak — er de i opptak,
er det kanskje ikke en kalenderhendelse som trengs.

### Hva som må gjøres

| Sted | Endring |
|------|---------|
| `SPECIAL_COLORS` + `eventColor()` i app.js | Ny farge. Paletten er bygget i LCH med kategorier på lyshet 94,5 — se «Visuell identitet» i CONTEXT.md før du velger en, og mål ΔE mot de elleve som finnes |
| `index.html`, fanene i hendelsesskjemaet | Fjerde `.type-tab` ved siden av Undervisning / Møte / Vikar |
| `setFormCategory()` i app.js | Gren for den nye kategorien |
| `eventSubLabel()` i app.js | Egen undertittel — trinn og rom gir ikke mening for en forelesning |
| `skoletimerForHendelse()` i app.js | Må utelate kategorien, ellers blir en forelesning 13:30 hetende «6. time» |
| `byggICS()` i app.js, linje med `.filter(ev => ev.category === 'undervisning')` | Må slippe gjennom den nye kategorien hvis forelesningene skal nå Outlook |

Anslag: en kveld.

### Avklart

- **Skoleruta er ikke et problem.** Studiet følger samme skolerute, så at
  `eventsForDate()` skjuler alt utenfor skoleåret og på ferie-/fridager
  gjør ingenting. Dette var den største bekymringen, og den falt bort.
- **Rutenettet holder.** Ingen forelesninger på kveldstid eller i helg, så
  `GRID_END_H = 16.0` og fem kolonner mandag–fredag er nok. Dette var det
  klart dyreste punktet, og det falt også bort.
- **«På jobb» er greit.** `arbeidstidForDato()` folder inn alle hendelser
  uten kategorifilter, så forelesninger dukker automatisk opp som
  «På jobb»-blokker i familiekalenderen. Ønsket oppførsel — ikke rør det.
- **Skoletimenummer er uansett ikke universelt.** Møter med eksterne følger
  heller ikke skolens timeplan, så at forelesninger mangler timenummer er
  konsistent med resten.

### Fortsatt åpent

**Hva skal stå i tittelen i undervisningskalenderen?** De to ICS-feedene har
ulikt publikum: `undervisning` deles med kollegaer og ledelse og bruker
`icsTittel()`, som er selve `ev.title`. `jobb` deles med familien og sier
bare «På jobb», aldri hva.

Slipper man forelesninger inn i undervisningsfeeden med emnenavnet, blir det
synlig for alle som abonnerer at Nikolai studerer ved siden av jobben, og
hvilket emne. Det kan være helt greit — men det er en avgjørelse, ikke en
bieffekt. Alternativet er en generisk tittel for kategorien, «Opptatt» eller
«Studier», altså samme prinsipp som jobbkalenderen allerede bruker, men per
kategori.

---

## 2. «Husk til neste time»

**Idéen:** Et felt i timeplanmodalen, fylt ut mens man fører nærvær, som
vises igjen i den kommende timen i samme fag.

**Status:** Ikke bestemt. Verdt å ta hvis bakoverblikk-varianten velges —
den er liten.

### Det som gjør det enkelt

`lessonData` er allerede én post per `(hendelse-id, dato)` via
`lessonKey()`, med `{tema, notes, attendance, studentNotes}`. Et felt til er
én linje i `saveLessonPlan()` og én i `openLessonPlan()`, og det synkes
automatisk siden hele `lessonData` går med.

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

## 3. Elev-ID synlig ved siden av navnet ✅

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

## 4. «Avlyst» og «ingen elever møtt»

**Idéen:** Kunne markere at en time ikke ble gjennomført, uten å slette den.

**Status:** Ønsket. Tellingen av undervisningstimer, som er den egentlige
motivasjonen, er utsatt — men statusene er nyttige i seg selv.

### Hvorfor to statuser, ikke én

De betyr forskjellige ting når timer skal telles: **en avlyst time
underviste du ikke i, mens en time der ingen møtte var du der.** Skal
timeregnskapet bli riktig, trengs begge. Nikolai foretrekker «utgått»
framfor «avlyst» som ordvalg.

«Ingen elever møtt» bør antakelig kunne utledes framfor å registreres: er
alle krysset av som fraværende i `attendance`, vet appen det allerede.

### Hva som må gjøres

Statusen hører hjemme på timeinstansen, ikke på hendelsen — en fast time i
`events[]` gjentar seg, og det er den enkelte datoen som utgår. `lessonData`
er allerede én post per `(hendelse-id, dato)` og er derfor riktig sted.
Visning i kalenderen må vise det tydelig, for eksempel gjennomstreket eller
nedtonet blokk.

### Sammenheng

Dette er forutsetningen for å gjøre noe med `calcSFS()`, som i dag er død
kode: funksjonen kalles ikke fra noe sted og returnerer hardkodede tall
(`year: 412`, `teach: 186`). Enten bygges den på ekte data — der disse
statusene inngår — eller så bør den slettes, slik at den ikke lurer den som
leser koden senere.

---

## 5. Papirkurv for slettede hendelser ✅

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

*Opprettet 3. august 2026 (økt 19).*
