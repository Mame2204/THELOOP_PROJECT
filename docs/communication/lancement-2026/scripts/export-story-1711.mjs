import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dir, '..', 'export-visuels-story-1711.html');
const outDir = path.join(dir, '..', 'exports-png-v4-light');

const aliases = [
  'STORY_17-11_01_ouvert.png',
  'STORY_17-11_02_100-places.png',
  'STORY_17-11_03_lien.png',
];

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 2100 } });
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const slides = await page.$$('.slide');

for (let i = 0; i < slides.length; i++) {
  const name = aliases[i] ?? `STORY_17-11_${String(i + 1).padStart(2, '0')}.png`;
  await slides[i].screenshot({ path: path.join(outDir, name) });
}

await browser.close();
console.log(`Exported ${slides.length} story 17/11 frames`);
