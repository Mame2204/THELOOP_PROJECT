import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dir, '..', 'export-visuels-template-fete-story.html');
const outDir = path.join(dir, '..', 'exports-png-telephone-fete');

const items = [
  { id: '#neutre', name: 'FETE_neutre_9x16_TELEPHONE.png' },
  { id: '#noel', name: 'FETE_noel_9x16_TELEPHONE.png' },
  { id: '#bonne-annee', name: 'FETE_bonne-annee_9x16_TELEPHONE.png' },
];

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

for (const { id, name } of items) {
  const el = await page.$(id);
  if (!el) throw new Error(`Missing ${id}`);
  await el.screenshot({ path: path.join(outDir, name) });
  console.log('OK', name);
}

await browser.close();

const artifactsDir = '/opt/cursor/artifacts/fetes-telephone';
try {
  fs.mkdirSync(artifactsDir, { recursive: true });
  for (const { name } of items) {
    fs.copyFileSync(path.join(outDir, name), path.join(artifactsDir, name));
  }
  console.log('Copied to', artifactsDir);
} catch (e) {
  console.warn('Artifacts copy skipped:', e.message);
}
