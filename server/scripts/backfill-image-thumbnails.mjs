/**
 * Génère les miniatures manquantes du bucket content-media.
 *
 * Les images envoyées avant la mise en place des miniatures n'en ont pas : les
 * vignettes de 64 points téléchargent alors l'original de 1280 px. Ce script
 * rattrape l'existant en déposant, à côté de chaque image, une variante suffixée
 * « _thumb » que l'application déduit de l'URL principale.
 *
 * Dépend de sharp, volontairement hors package.json (outil ponctuel) :
 *   npm install sharp --no-save
 *
 * Simulation par défaut. Pour écrire réellement :
 *   node server/scripts/backfill-image-thumbnails.mjs --apply
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const APPLY = process.argv.includes('--apply');
const BUCKET = 'content-media';
const THUMB_WIDTH = 256;
const THUMB_QUALITY = 60;

const env = Object.fromEntries(
  readFileSync('server/.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ko = (n) => (n / 1024).toFixed(0) + ' Ko';
const mo = (n) => (n / 1024 / 1024).toFixed(2) + ' Mo';

const files = [];
async function walk(prefix, depth = 0) {
  if (depth > 4) return;
  const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw new Error(error.message);
  for (const entry of data ?? []) {
    const full = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.id === null) await walk(full, depth + 1);
    else files.push({ path: full, size: entry.metadata?.size ?? 0 });
  }
}

await walk('');

const thumbs = new Set(files.filter((f) => /_thumb\.jpe?g$/i.test(f.path)).map((f) => f.path));
const originals = files.filter((f) => /\.jpe?g$/i.test(f.path) && !/_thumb\.jpe?g$/i.test(f.path));
const todo = originals.filter((f) => !thumbs.has(f.path.replace(/\.jpe?g$/i, '_thumb.jpg')));

console.log('Mode              : ' + (APPLY ? 'ECRITURE' : 'simulation'));
console.log('Originaux         : ' + originals.length + '  (' + mo(originals.reduce((s, f) => s + f.size, 0)) + ')');
console.log('Miniatures en place: ' + thumbs.size);
console.log('A generer         : ' + todo.length + '\n');

if (!todo.length) {
  console.log('Rien a faire.');
  process.exit(0);
}

let done = 0;
let failed = 0;
let sourceBytes = 0;
let thumbBytes = 0;

for (const f of todo) {
  const thumbPath = f.path.replace(/\.jpe?g$/i, '_thumb.jpg');
  try {
    const { data, error } = await admin.storage.from(BUCKET).download(f.path);
    if (error) throw new Error(error.message);

    const input = Buffer.from(await data.arrayBuffer());
    const output = await sharp(input)
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: THUMB_QUALITY })
      .toBuffer();

    sourceBytes += input.length;
    thumbBytes += output.length;

    if (APPLY) {
      const up = await admin.storage.from(BUCKET).upload(thumbPath, output, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (up.error) throw new Error(up.error.message);
    }

    done += 1;
    const pct = (100 - (output.length / input.length) * 100).toFixed(0);
    console.log(
      String(done).padStart(3) + '/' + todo.length + '  ' +
      ko(input.length).padStart(9) + ' -> ' + ko(output.length).padStart(8) +
      '  (-' + pct + '%)  ' + f.path.slice(0, 52),
    );
  } catch (e) {
    failed += 1;
    console.log('  ECHEC  ' + f.path.slice(0, 60) + ' : ' + e.message.slice(0, 50));
  }
}

console.log('\n=== Bilan ===');
console.log('Traitees          : ' + done + (failed ? '   echecs : ' + failed : ''));
console.log('Poids des sources : ' + mo(sourceBytes));
console.log('Poids des vignettes: ' + mo(thumbBytes));
if (sourceBytes) {
  console.log('Reduction         : ' + (100 - (thumbBytes / sourceBytes) * 100).toFixed(1) + ' %');
}
if (!APPLY) console.log('\nSimulation : rien n a ete ecrit. Relancer avec --apply.');
