import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
for (const name of ['export-video-2412-frames.mjs', 'export-story-2412.mjs']) {
  const r = spawnSync('node', [path.join(dir, name)], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
console.log('Lot D export complete');
