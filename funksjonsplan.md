# Funksjonsplan – Interaktiv Lærerplanlegger

**Målgruppe:** Faglærer på ungdomsskole (8–10), personlig verktøy  
**Plattform:** Web-app (nettleser), med fremtidig mobilstøtte  
**Kjerneproblem som løses:** Samle timeplan, arbeidstid og påminnelser på ett sted – uten å spre informasjon over mange systemer.

**Avgrensninger i denne versjonen:**
- Ingen eksterne integrasjoner (ikke Outlook, Google Kalender, Visma o.l.)
- Ingen kobling til LK20 / kompetansemål
- Alle elever har IOP – standard vurderingsverktøy er ikke nødvendig

---

## 1. Ukesoversikt (hoved-dashbord)

Det viktigste skjermbildet. Viser hele arbeidsuken på ett blikk.

- Arbeidstid for dagen vises øverst (innstemplet / planlagt start og slutt)
- Alle undervisningstimer med fag, klasse og rom
- Møter og hendelser i samme flate som undervisningstimer
- Fargekoding per fag eller klasse
- Dagens dato fremhevet tydelig
- Rask navigasjon mellom uker

---

## 2. Timeplan-administrasjon

Legg inn og vedlikehold sin egen timeplan.

- Legg til faste undervisningstimer (fag, klasse/gruppe, rom, ukedag, tidspunkt)
- Støtte for roterende timeplaner (odde/partallsuker)
- Markér enkelttimer som avlyst, byttet eller erstattet av vikar
- Legg til engangs-timer

---

## 3. Arbeidstidssporing (SFS2213)

Hjelper læreren å følge med på arbeidstid i henhold til avtalen.

### Daglig registrering
- Registrer start- og sluttid for arbeidsdagen (manuell registrering)
- Vises i ukesoversikten ved siden av timeplanen

### Akkumulert oversikt
- Totale timer per uke, per måned og hittil i semesteret/skoleåret
- Sammenlignet mot normen i SFS2213:
  - Årsramme total arbeidstid: 1 687,5 timer
  - Årsramme undervisningstid ungdomsskole: 741 timer
- Tydelig visualisering av om man er foran eller bak normert tid

### Varsler
- Varsel når ukentlig arbeidstid nærmer seg eller overskrider grensen
- Varsel ved slutt av semester hvis akkumulert tid avviker betydelig fra normen
- Valgfri daglig påminnelse om å registrere arbeidstid

---

## 4. Hendelser og møter

Kalenderbasert oversikt over alt som ikke er ordinær undervisning.

- Legg til hendelser med tittel, dato, tid, sted og notater
- Kategorier: Foreldremøte, Konferansetime, Personalmøte, Fagmøte, Fagdag, Annet
- Støtte for gjentakende hendelser (f.eks. ukentlige teammøter)
- Måneds- og listevisning i tillegg til ukevisning

---

## 5. Oppgaver og frister

Enkel gjøremålsliste koblet til tid og klasse.

- Legg til oppgaver med frist og tilhørende klasse
- Prioritetsnivå (høy / middels / lav)
- Marker som fullført
- Oppgavene vises i ukesoversikten på relevant dag
- Eksempler: «Ret innleveringer – 8B», «Planlegg prøve – 9A», «Send referat»

---

## 6. Påminnelser og varsler

- Varsler i god tid før hendelser og frister (konfigurerbar – 1 dag, 1 uke, etc.)
- Daglig oppsummering (valgfritt): «I dag har du 4 timer og ett møte»
- Nettleservarsler (push)

---

## 7. Klasselogg

Enkel logg per klasse læreren underviser i.

- Liste over egne klasser/grupper med fag
- Notatfelt per klasse (løpende logger)
- Notat per enkelttime: hva ble gjennomgått, hva gjenstår
- Notatene er søkbare

---

## 8. Ikke-funksjonelle krav

- **Hastighet:** Appen skal være rask – lærere har lite tid mellom timene
- **Mobilvennlig design:** Web-appen må fungere godt på telefon
- **Lokal lagring / personvern:** Data lagres lokalt i nettleseren (ingen sky-konto påkrevd i første versjon)
- **Enkelt førsteinntrykk:** Ny bruker skal forstå verktøyet uten opplæring

---

## 9. Foreslått rekkefølge for utvikling

1. **Fase 1:** Ukesoversikt + timeplan-administrasjon + hendelser/møter
2. **Fase 2:** Arbeidstidssporing (SFS2213) + påminnelser
3. **Fase 3:** Oppgaver/frister + klasselogg

---

*Sist oppdatert: 4. juni 2026*
