/**
 * Génère tous les MP4 « publication » (fondus + zoom) à partir des FRAME_*.png.
 * Pas de VO · pas de musique · texte déjà sur les visuels.
 *
 *   node scripts/stitch-all-videos.mjs
 *   node scripts/stitch-all-videos.mjs 0611 1311   # sous-ensemble
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defaultDurations, stitchSmooth } from './lib-stitch-video.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const pngDir = path.join(dir, '..', 'exports-png-v4-light');
const outDir = path.join(dir, '..', 'exports-mp4');

const jobs = [
  {
    id: '0611',
    glob: 'FRAME_0611_*.png',
    out: 'VIDEO_0611_dilemme-PUBLIER.mp4',
    durations: [3, 3, 8, 6, 8, 4],
  },
  { id: '1311', glob: 'FRAME_1311_*.png', out: 'VIDEO_1311_envie-PUBLIER.mp4', totalSec: 35 },
  { id: '1711', glob: 'FRAME_1711_*.png', out: 'VIDEO_1711_frequence-PUBLIER.mp4', totalSec: 40 },
  { id: '2111', glob: 'FRAME_2111_*.png', out: 'VIDEO_2111_pourquoi-PUBLIER.mp4', totalSec: 32 },
  { id: '2811', glob: 'FRAME_2811_*.png', out: 'VIDEO_2811_outil-PUBLIER.mp4', totalSec: 28 },
  { id: '0512', glob: 'FRAME_0512_*.png', out: 'VIDEO_0512_anti-annuaire-PUBLIER.mp4', totalSec: 24 },
  { id: '2412', glob: 'FRAME_2412_*.png', out: 'VIDEO_2412_noel-PUBLIER.mp4', totalSec: 32 },
];

const filter = process.argv.slice(2);
const selected = filter.length ? jobs.filter((j) => filter.includes(j.id)) : jobs;

for (const job of selected) {
  const prefix = job.glob.replace(/\*\.png$/, '');
  const files = fs
    .readdirSync(pngDir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.png'))
    .sort((a, b) => a.localeCompare(b, 'en'));
  if (files.length === 0) {
    console.error(`Aucun PNG pour ${job.id} (${job.glob})`);
    process.exit(1);
  }
  const durations =
    job.durations ?? defaultDurations(files.length, job.totalSec ?? 32);
  const pngPaths = files.map((f) => path.join(pngDir, f));
  const outFile = path.join(outDir, job.out);
  console.log(`\n>>> ${job.id} · ${files.length} plans → ${job.out}`);
  stitchSmooth({ pngPaths, durations, outFile });
  console.log('OK', outFile);
}

console.log('\nTous les MP4 auto sont dans exports-mp4/');
