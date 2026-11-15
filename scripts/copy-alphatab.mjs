// Copies the tab renderer (alphaTab), its music font and its instrument sounds
// into public/alphatab so the app can load them only when a tab is opened.
// Runs before `dev` and `build`; the copies are not committed.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules/@coderline/alphatab/dist');
const to = join(root, 'public/alphatab');

const files = [
  'alphaTab.min.js',
  'font/Bravura.woff2',
  'font/Bravura.woff',
  'font/Bravura-OFL.txt',
  'soundfont/sonivox.sf3',
  'soundfont/LICENSE',
];
for (const f of files) {
  mkdirSync(dirname(join(to, f)), { recursive: true });
  cpSync(join(from, f), join(to, f));
}
console.log(`alphaTab assets copied to public/alphatab (${files.length} files)`);
