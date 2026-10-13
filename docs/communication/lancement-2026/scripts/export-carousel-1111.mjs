import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dir, '..', 'export-visuels-carousel-1111.html');
const outDir = path.join(dir, '..', 'exports-png-v4-light');
const artifactsDir = '/opt/cursor/artifacts/theloop-acte-a-v4';

const aliases = [
  'CARROUSEL_11-11_01_ne-liste-pas-tout.png',
  'CARROUSEL_11-11_02_respire.png',
  'CARROUSEL_11-11_03_plus-value.png',
  'CARROUSEL_11-11_04_en-clair-17nov.png',
];

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(artifactsDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1500 } });
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const slides = await page.$$('.slide');

for (let i = 0; i < slides.length; i++) {
  const name = aliases[i] ?? `CARROUSEL_11-11_${String(i + 1).padStart(2, '0')}.png`;
  const dest = path.join(outDir, name);
  await slides[i].screenshot({ path: dest });
  fs.copyFileSync(dest, path.join(artifactsDir, name));
}

await browser.close();
console.log(`Exported ${slides.length} carousel 11/11 slides`);
