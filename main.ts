// Sunset Bay — an original open-world crime game, handed in as plain
// static files. This program (Node 22, standard library only) copies the
// game/ folder and the screenshots/ folder beside this file into the
// output directory and writes the dossier.json summary the judge reads,
// using the vendored make.fun library. The game itself runs offline in a
// desktop browser: open game/index.html, or serve this directory and open
// http://localhost:8080 (serve.ts does that).
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(here, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The scorer's caps: text_max_bytes shapes the dossier text; the other
// limits refuse anything the scorer would refuse (screenshot count/size,
// game file count and bytes, over-long paths under game/).
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
