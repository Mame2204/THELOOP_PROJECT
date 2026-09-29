/**
 * Vérifie que les Edge Functions Deno se bundlent (détecte ex. double `const role`).
 * Usage : node scripts/verify-edge-functions-syntax.mjs
 */
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const functionsDir = join(root, 'supabase', 'functions');

const slugs = readdirSync(functionsDir).filter((name) => {
  const indexPath = join(functionsDir, name, 'index.ts');
  return existsSync(indexPath);
});

let failed = false;
for (const slug of slugs) {
  const entry = join(functionsDir, slug, 'index.ts');
  const bundleCheck = spawnSync(
    'npx',
    ['esbuild', entry, '--bundle', '--platform=neutral', '--log-level=error'],
    { encoding: 'utf8' },
  );
  if (bundleCheck.status !== 0) {
    failed = true;
    console.error('FAIL', slug);
    console.error(bundleCheck.stderr || bundleCheck.stdout);
  } else {
    console.log('OK', slug);
  }
}

if (failed) process.exit(1);
