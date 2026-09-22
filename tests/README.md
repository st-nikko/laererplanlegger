# Tester

Kjøres med Node og jsdom. jsdom er ikke committet — installer én gang:

```bash
npm install jsdom
```

Så:

```bash
node tests/pseudonymisering.test.js
```

Testene laster `index.html` og `app.js` i jsdom med et falskt
`localStorage`, og verifiserer at elevnavn holdes utenfor `lp_students`.

## Skriv aldri inn en dato som skal passeres

`TODAY` er `new Date()`, og nye hendelser får en `gyldigFra` regnet ut fra
uka som vises (se «Når en hendelse begynner å gjelde» i CONTEXT.md).
`eventsForDate()` viser ingenting før den datoen. En test
med en fast dato i nær framtid blir derfor **rød av seg selv** den dagen
kalenderen passerer den — `gjentakende-moter.test.js` sto rød 10. september
2026 fordi den var skrevet rundt 2026-09-09.

Regn datoene ut fra i dag i stedet (`dagerFra(-10)`, `nesteUke()`), eller
bruk årstall så langt unna at de aldri nås (`2000-01-01`, `2099-12-31`) der
datoen bare skal være «utenfor veien».

Gjelder også den andre veien: en test som prøver **én** ukedag kan stå
grønn fire dager av fem med feilen i behold. Løkk gjennom alle fem der
ukedagen er det som testes.

## Avslutt alltid med `process.exit`

app.js starter en `setInterval` (datoskifte-sjekken for «I dag»). Den
holder Node i live etter at testene er ferdige, så en testfil uten
`process.exit(alle ? 0 : 1)` til slutt blir hengende for alltid.
