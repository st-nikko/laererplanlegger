# vendor/

Tredjepartskode som ligger i repoet framfor å hentes fra en CDN ved hver
last. Grunnen er sikkerhet: appen har passfrasen til synken og elevnavnene
i localStorage, og alt skript som kjører på siden kan lese dem. En ulåst
CDN-adresse (`@2`) betyr at hvem som helst som publiserer en ny 2.x-versjon
— eller kompromitterer CDN-en — får kjøre kode her.

## supabase-js-2.118.0.mjs

- Pakke: `@supabase/supabase-js` **2.118.0** (sluppet 15. oktober 2026), MIT-lisens
- Bygget med esbuild 0.25.0 til én ES-modul som bare eksporterer `createClient`
- SHA-256: `0fd8decd0f79b3af6caecbe8360abed78c22b13970db9e12951c92bc92f15795`

Lastes i `index.html`:

```html
<script type="module">
  import { createClient } from './vendor/supabase-js-2.118.0.mjs';
```

### Oppdatere

Velg en versjon som har ligget ute i minst to uker, og bygg på nytt:

```bash
mkdir bygg && cd bygg && npm init -y
npm install --save-exact @supabase/supabase-js@<versjon> esbuild@0.25.0
echo "export { createClient } from '@supabase/supabase-js';" > inngang.mjs
npx esbuild inngang.mjs --bundle --format=esm --minify --legal-comments=inline \
  --target=es2020 --outfile=supabase-js-<versjon>.mjs
sha256sum supabase-js-<versjon>.mjs
```

Legg fila her, slett den gamle, oppdater filnavnet i `index.html` og
sjekksummen over, og test innlogging og synk på ekte før du pusher.
