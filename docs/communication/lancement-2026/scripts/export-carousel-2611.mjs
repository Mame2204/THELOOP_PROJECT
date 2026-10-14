import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dir, '..', 'export-visuels-carousel-2611.html');
const outDir = path.join(dir, '..', 'exports-png-v4-light');

const aliases = [
  'CARROUSEL_26-11_01_spots.png',
  'CARROUSEL_26-11_02_agenda.png',
  'CARROUSEL_26-11_03_parcours.png',
  'CARROUSEL_26-11_04_outils.png',
  'CARROUSEL_26-11_05_reserve.png',
];

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1500 } });
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const slides = await page.$$('.slide');

for (let i = 0; i < slides.length; i++) {
  const name = aliases[i] ?? `CARROUSEL_26-11_${String(i + 1).padStart(2, '0')}.png`;
  await slides[i].screenshot({ path: path.join(outDir, name) });
}

await browser.close();
console.log(`Exported ${slides.length} carousel 26/11 slides`);
