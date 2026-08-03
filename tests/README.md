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
