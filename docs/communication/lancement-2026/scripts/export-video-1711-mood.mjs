import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dir, '..', 'export-visuels-video-1711-mood.html');
const montageDir = path.join(dir, '..', 'video-1711-montage');

const names = [
  'MOOD_01_weekend-ou.png',
  'MOOD_02_encore-endroit.png',
  'MOOD_03_bruit-reperes.png',
];

fs.mkdirSync(montageDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 2100 } });
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

const slides = await page.$$('.slide');
for (let i = 0; i < slides.length && i < names.length; i++) {
  const dest = path.join(montageDir, names[i]);
  await slides[i].screenshot({ path: dest });
  console.log('→', names[i]);
}

await browser.close();
