import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const scripts = [
  'export-slides-png-v4.mjs',
  'export-j5-1211.mjs',
  'export-j1-1611.mjs',
  'export-carousel-1111.mjs',
  'export-story-0811.mjs',
  'export-story-1511.mjs',
  'export-video-0611-frames.mjs',
  'export-video-1311-frames.mjs',
  'export-carousel-1711.mjs',
  'export-story-1711.mjs',
  'export-merci-1911.mjs',
  'export-video-2111-frames.mjs',
  'export-story-2211.mjs',
  'export-regle-2511.mjs',
  'export-carousel-2611.mjs',
  'export-video-2811-frames.mjs',
  'export-story-3011.mjs',
  'export-lot-c-dec.mjs',
  'export-terrain-7-16.mjs',
  'export-lot-d-2412.mjs',
];

for (const name of scripts) {
  console.log(`\n>>> ${name}`);
  const r = spawnSync('node', [path.join(dir, name)], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
console.log('\nPolish v5 PNG export complete');
