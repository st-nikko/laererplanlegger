// Statisk sjekk av mobiltilpasningen.
//
// Sandkassen har ingen nettleser, så vi kan ikke måle faktisk layout.
// Det testene her fanger, er den vanligste årsaken til at noe stikker
// utenfor skjermkanten: en fast bredde i grunn-CSS-en som aldri blir
// overstyrt for smal skjerm. Ekte visuell kontroll må gjøres på telefon.

const fs   = require('fs');
const path = require('node:path').join(__dirname, '..') + '/';
const cssRaa = fs.readFileSync(path + 'app.css', 'utf8');
const html   = fs.readFileSync(path + 'index.html', 'utf8');
const js     = fs.readFileSync(path + 'app.js', 'utf8');

// Kommentarer fjernes først — ellers henger de fast foran selektoren
// og gjør sammenligningen mot mobilblokka meningsløs.
const css = cssRaa.replace(/\/\*[\s\S]*?\*\//g, '');

// Bredden vi regner som trang skjerm (iPhone SE og oppover)
const SMAL_SKJERM = 360;

// Del fila i «utenfor media query» og «inne i mobil-media-query»
function delOppp(kilde) {
  const grunn = [];
  const mobil = [];
  let i = 0, dybde = 0, iMobil = false, buffer = '';

  while (i < kilde.length) {
    const rest = kilde.slice(i);
    const m = rest.match(/^@media[^{]*\(max-width:\s*(\d+)px\)[^{]*\{/);
    if (m && dybde === 0) {
      grunn.push(buffer); buffer = '';
      iMobil = Number(m[1]) <= 768;
      i += m[0].length; dybde = 1;
      let start = i;
      while (i < kilde.length && dybde > 0) {
        if (kilde[i] === '{') dybde++;
        else if (kilde[i] === '}') dybde--;
        i++;
      }
      (iMobil ? mobil : grunn).push(kilde.slice(start, i - 1));
      continue;
    }
    buffer += kilde[i]; i++;
  }
  grunn.push(buffer);
  return { grunn: grunn.join('\n'), mobil: mobil.join('\n') };
}

const { grunn, mobil } = delOppp(css);

// Finn selektorer i grunn-CSS med fast bredde over SMAL_SKJERM
function finnBrede(kilde) {
  const treff = [];
  const regel = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = regel.exec(kilde))) {
    const selektor = m[1].trim().replace(/\s+/g, ' ');
    const kropp    = m[2];
    if (selektor.startsWith('@') || selektor.startsWith(':root')) continue;
    const b = kropp.match(/(?:^|;|\s)(min-width|width)\s*:\s*(\d+)px/g) || [];
    b.forEach(d => {
      const px = Number(d.match(/(\d+)px/)[1]);
      if (px > SMAL_SKJERM) treff.push({ selektor, px, deklarasjon: d.trim() });
    });
  }
  return treff;
}

const tester = [];
function test(navn, fn) { tester.push([navn, fn]); }
function sant(v, hva) { if (!v) throw new Error(hva); }

test('ingen fast bredde over ' + SMAL_SKJERM + 'px uten mobil-overstyring', () => {
  const brede = finnBrede(grunn);
  const glemt = brede.filter(t => {
    // Hold hver enkeltselektor opp mot mobilblokka
    return t.selektor.split(',').every(s => !mobil.includes(s.trim()));
  });
  sant(glemt.length === 0,
    'mangler mobil-overstyring:\n' +
    glemt.map(t => `         ${t.selektor} → ${t.deklarasjon}`).join('\n'));
});

test('ukelabelen mister min-width på mobil', () => {
  sant(/\.week-label[^}]*min-width:\s*0/.test(mobil),
       '.week-label må settes til min-width: 0 — 210px er hovedårsaken til sidescroll');
});

test('headeren kan brytes over flere rader', () => {
  sant(/header[^}]*flex-wrap:\s*wrap/.test(mobil), 'header trenger flex-wrap: wrap');
});

test('body bruker dvh så adresselinja ikke spiser innhold', () => {
  sant(cssRaa.includes('100dvh'), '100dvh mangler');
});

test('desktop-kun-klassen finnes både i markup og CSS', () => {
  sant(html.includes('desktop-kun'), 'klassen brukes ikke i index.html');
  sant(/\.desktop-kun[^}]*display:\s*none/.test(mobil), 'klassen skjules ikke på mobil');
});

test('elevtabellen ligger i en horisontalt rullbar beholder', () => {
  sant(html.includes('rullbar-x'), 'beholderen mangler klassen rullbar-x');
  sant(/\.rullbar-x[^}]*overflow-x:\s*auto/.test(mobil), 'rullbar-x scroller ikke');
});

test('gjøremål-sidebaren dekker ikke halve skjermen', () => {
  sant(/#sidebarContent[^}]*position:\s*fixed/.test(mobil),
       'sidebaren må bli et overlegg på mobil');
  sant(/#sidebarContent\.collapsed[^}]*display:\s*none/.test(mobil),
       'sammenslått sidebar må skjules helt — width: 0 holder ikke når den er fixed');
});

test('klasser som styles på mobil finnes i grunn-CSS, markup eller app.js', () => {
  // app.js teller også: klasser som .visning-dag og .uke-kort settes av
  // koden og står aldri i index.html. Uten den tredje kilden slår testen
  // ut på fullt levende selektorer.
  const klasser = [...mobil.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]);
  const ukjente = [...new Set(klasser)].filter(k =>
    !grunn.includes('.' + k) && !html.includes(k) && !js.includes(k));
  sant(ukjente.length === 0, 'ukjente klasser i mobilblokka: ' + ukjente.join(', '));
});

// ── Ting som ble meldt fra telefon ─────────────────────────────

test('kalenderkolonner kan ikke presses bredere av innholdet', () => {
  // 1fr er minmax(auto, 1fr): lange titler og arbeidstid-chipen dyttet
  // fredag utenfor skjermkanten. minmax(0, 1fr) hindrer det.
  sant(/repeat\(\$\{?antallDager\}?, minmax\(0, 1fr\)\)/.test(js),
       'kalenderKolonner() må bruke minmax(0, 1fr)');
  sant(!/gridTemplateColumns\s*=\s*[`'"][^`'"]*repeat\(5, 1fr\)/.test(js),
       'ingen inline grid-template med bar 1fr — inline slår media queries');
  sant(!/grid-template-columns:\s*48px repeat\(5, 1fr\)/.test(css),
       'grunn-CSS må også bruke minmax(0, 1fr)');
});

test('dagkolonnen kan ikke vokse ut av gridet', () => {
  sant(/\.day-header\s*\{[^}]*min-width:\s*0/.test(css.replace(/\n/g, ' ')),
       '.day-header trenger min-width: 0');
});

test('datoen står bare én gang i dagoverskriften', () => {
  sant(!js.includes('day-date'), 'day-date-elementet skal være fjernet fra app.js');
  sant(!css.includes('day-date'), 'day-date skal være fjernet fra CSS');
  const treff = js.match(/class="day-header[^`]*`/);
  sant(treff, 'fant ikke malen for dagoverskriften');
  sant((treff[0].match(/d\.getDate\(\)/g) || []).length === 1,
       'datoen skal settes inn nøyaktig én gang');
});

test('dagens dato markeres fortsatt', () => {
  sant(/\.day-header\.today\s+\.day-name/.test(css),
       'markeringen må flyttes til .day-name når .day-date er borte');
});

test('gjøremål er skjult som standard', () => {
  sant(/let sidebarVisible\s*=\s*false/.test(js), 'sidebarVisible skal starte som false');
  sant(/id="sidebarContent"[^>]*class="[^"]*collapsed/.test(html),
       'sidebarContent skal ha collapsed i markup');
});

test('gridet tegnes på nytt når skjermbredden endrer seg', () => {
  sant(js.includes("addEventListener('resize'"), 'mangler resize-lytter');
  sant(js.includes('erSmalSkjerm'), 'mangler erSmalSkjerm()');
});

// ── Kjør ───────────────────────────────────────────────────────
console.log('\nMobiltilpasning (statisk sjekk)\n');
let alle = true;
for (const [navn, fn] of tester) {
  try { fn(); console.log('  OK   ' + navn); }
  catch (e) { alle = false; console.log('  FEIL ' + navn + '\n       ' + e.message); }
}
console.log('\n' + (alle ? 'Alle sjekker passerte.' : 'Noen sjekker feilet.'));
console.log('Visuell kontroll på telefon gjenstår.\n');
process.exit(alle ? 0 : 1);
