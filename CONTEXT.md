# Lærerplanlegger — Kontekst

## Hva appen gjør

Personlig planleggingsverktøy for faglærer på ungdomsskole (8–10. trinn). Samler timeplan, arbeidstid, timeplaner/elevlogg og gjøremål i ett nettleserbasert grensesnitt. Ingen sky, ingen pålogging — all data lever i nettleserens minne (nullstilles ved refresh).

Målbruker: én lærer, personlig verktøy, rask tilgang mellom timer.

---

## Filstruktur

```
Lærerplanlegger/
├── index.html          # HTML-markup, ~474 linjer. Alle modaler, header, kalendergrid-placeholders, student-form.
│                       # (het ukesoversikt.html t.o.m. økt 17 — omdøpt for GitHub Pages)
├── app.css             # All CSS, ~323 linjer. CSS-variabler, layout, modal-stiler, event-stiler, elev-admin-stiler.
├── app.js              # All JavaScript, ~1407 linjer. Se seksjoner nedenfor.
├── CONTEXT.md          # Dette dokumentet
├── SESSION-NOTES.md    # Løpende øktnotater
└── funksjonsplan.md    # Originalt kravdokument (referanse)
```

### app.js — seksjoner

| Seksjon | Innhold |
|---------|---------|
| CONFIG  | `PERIODS` (skoletimetabell), gridkonstanter, `DAYS_*`, `MONTHS_*`, `TODAY` (hardkodet), navigasjonstilstand |
| COLORS  | `COLOR_POOL`, `SPECIAL_COLORS`, `getSubjectColor()`, `eventColor()` |
| STUDENTS + LESSON DATA | `allStudents[]` (`{id,navn,trinn,startDato}`), `lessonData{}`, `topicsBySubject{}`, seed-data |
| EVENTS + WORK TIMES | `events[]`, `planfestetTid[]`, `overtid{}`, `getWorkTimeForDate()` |
| HELPERS | `getMonday()`, `isoDate()`, `toDec()`, `toPx()`, `weekNumber()`, `eventsForDate()`, `calcSFS()`, `parseStudentId()`, `calcAttendance()` |
| RENDER | `render()`, `renderWeekLabel()`, `renderDayHeaders()`, `renderGrid()`, `renderLegend()` |
| PLANFESTET TID MODAL | `calcPftSummary()`, `openPlanfestetTidModal()`, `savePlanfestetTid()` |
| OVERTID MODAL | `openOvertidModal()`, `saveOvertid()`, `slettOvertid()` |
| EVENT FORM MODAL | `openEventForm()`, `setFormCategory()`, `setSessionType()`, `saveEvent()`, `deleteEvent()` m.fl. |
| LESSON PLAN MODAL | `openLessonPlan()`, `renderAttendanceList()`, `saveLessonPlan()`, `kopierEvent()` |
| ELEVLOGG MODAL | `openElevlogg()`, `renderElevlogg()` (modal-fallback), `renderElevloggInnhold(studentId, container)` — delt innholdsbygger brukt av både modal og fullskjerm-visning |
| ELEVLOGG VIEW | `renderElevloggView()` (fyller elevvelger, beholder valgt elev ved re-render), `elevloggViewChanged()` — rendrer logg i `#elevloggView` via `renderElevloggInnhold()` |
| ELEVADMIN | `renderElevView()`, `openStudentForm()`, `saveStudent()`, `deleteStudent()` |
| VIEW SWITCHING | `setView()`, `changeNav()`, `goToDayView()` |
| MONTH VIEW | `renderMonthView()` |
| SIDEBAR / TODO | `toggleSidebar()`, `openTodoForm()`, `saveTodo()`, `cycleTodoStatus()`, `renderTodoList()` |
| MISC + INIT | `goToToday()`, `closeOverlay()`, `exportData()`, `importData()`, click-outside-lukking |
| MIN SIDE | `renderMinSide()` — innstillinger (skoleår, skolerute) som fullskjerm-visning i `#minSideView`; `lagreSkoleaar()`, `renderSkolerute()`, `leggTilFridag()`, `slettFridag()`. Import/eksport-knappene ligger også her (UI), logikken i MISC |
| LAGRING | `saveToStorage()`, `loadFromStorage()` + `render()` init-kall |

---

## Tekniske valg

- **Ingen rammeverk.** Vanilla JS og CSS. Alt rendres via `innerHTML` og `createElement`. Gjør det enkelt å forstå og endre uten toolchain.
- **Global scope.** Alle funksjoner og variabler er globale. Enkelt, men kaller på refaktorering om appen vokser.
- **localStorage-persistens.** Alle 7 datavariabler lagres automatisk ved hver mutasjon via `saveToStorage()`. Lastes ved oppstart via `loadFromStorage()`. Seed-data brukes som fallback hvis localStorage er tom.
- **CSS-variabler for theming.** Alle farger via `--bg`, `--surface`, `--border`, `--accent` osv. i `:root`.
- **Kalender-grid:** CSS Grid (`48px + repeat(5, 1fr)`), absolutt posisjonerte events basert på `toPx(tid)`.
- **Event-modell:** `events[]` inneholder både faste (`recurs:true, weekday`) og engangshendelser (`recurs:false, date`). Annenhver-uke støttes via `weekPattern: 'every'|'odd'|'even'`.

---

## Kjente begrensninger / uløste ting

1. ~~**`TODAY` er hardkodet**~~ — endret til `new Date()`. Live dato.
2. ~~**Ingen `localStorage`**~~ — implementert. Data persisteres automatisk.
3. ~~**"Now line" er hardkodet**~~ — endret til `new Date().getHours() + new Date().getMinutes() / 60`.
4. ~~**Elever er hardkodet**~~ — ELEVADMIN implementert med legg til/rediger/slett og oppmøte%.
5. **Delvis mobiloptimalisering** — under 768px omstyles `#sideMeny` til en fast bunn-navigasjon (ren CSS, egen seksjon «BUNN-NAVIGASJON (mobil)» i app.css; samme markup og klikk-håndtering). Resten av layouten (kalendergrid, modaler, gjøremål-sidebar) forutsetter fortsatt desktop.
6. **SFS2213-beregning (`calcSFS`)** returnerer demo-tall, ikke ekte aggregering fra registrert tid.
7. **Annenhver-uke vises ikke i Måned-visning** — `eventsForDate` håndterer weekPattern i uke/dag, men månedvisningen arver dette riktig.
