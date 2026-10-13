import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dir, '..', 'export-visuels-carousel-2312.html');
const outDir = path.join(dir, '..', 'exports-png-v4-light');
const aliases = [
  'CARROUSEL_23-12_01_24dec.png',
  'CARROUSEL_23-12_02_piliers.png',
  'CARROUSEL_23-12_03_signature.png',
  'CARROUSEL_23-12_04_lien.png',
];

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1500 } });
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const slides = await page.$$('.slide');
for (let i = 0; i < slides.length; i++) {
  await slides[i].screenshot({ path: path.join(outDir, aliases[i]) });
}
await browser.close();
console.log('Exported carousel 23/12');
