import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const scripts = [
  'export-story-3011.mjs',
  'export-regle-0212.mjs',
  'export-j20-0412.mjs',
  'export-video-0512-frames.mjs',
  'export-regle-0912.mjs',
];

for (const name of scripts) {
  const r = spawnSync('node', [path.join(dir, name)], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
console.log('Lot A PNG export complete');
