import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { copyToArtifacts } from './lib-artifacts.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dir, '..', 'export-visuels-story-0811.html');
const outDir = path.join(dir, '..', 'exports-png-v4-light');
const artifactsDir = '/opt/cursor/artifacts/theloop-acte-a-v4';

const aliases = [
  'STORY_8-11_01_marque.png',
  'STORY_8-11_02_piliers.png',
  'STORY_8-11_03_17nov.png',
];

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 2100 } });
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const slides = await page.$$('.slide');

for (let i = 0; i < slides.length; i++) {
  const name = aliases[i] ?? `STORY_8-11_${String(i + 1).padStart(2, '0')}.png`;
  const dest = path.join(outDir, name);
  await slides[i].screenshot({ path: dest });
  copyToArtifacts(dest, artifactsDir, name);
}

await browser.close();
console.log(`Exported ${slides.length} story 8/11 frames`);
