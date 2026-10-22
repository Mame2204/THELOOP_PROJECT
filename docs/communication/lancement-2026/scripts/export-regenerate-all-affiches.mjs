import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const scripts = [
  'export-polish-v5.mjs',
  'export-lot-a-nov-dec.mjs',
  'export-template-fete.mjs',
  'export-template-fete-telephone.mjs',
];

for (const name of scripts) {
  console.log(`\n>>> ${name}`);
  const r = spawnSync('node', [path.join(dir, name)], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
console.log('\nAll affiches PNG regenerated (logo + fêtes).');
