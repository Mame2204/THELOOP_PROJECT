import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
for (const name of ['export-prelaunch-1712.mjs', 'export-story-2112.mjs', 'export-carousel-2312.mjs']) {
  const r = spawnSync('node', [path.join(dir, name)], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
console.log('Lot C export complete');
