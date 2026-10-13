import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dir, '..', 'export-visuels-video-1711.html');
const outDir = path.join(dir, '..', 'exports-png-v4-light');

const aliases = [
  'FRAME_1711_01_chaos.png',
  'FRAME_1711_02_tout-crie.png',
  'FRAME_1711_03_peu-guident.png',
  'FRAME_1711_04_repere.png',
  'FRAME_1711_05_piliers-flou.png',
  'FRAME_1711_06_logo.png',
  'FRAME_1711_07_100-places.png',
  'FRAME_1711_08_reserve.png',
];

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 2100 } });
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const slides = await page.$$('.slide');

for (let i = 0; i < slides.length; i++) {
  const name = aliases[i] ?? `FRAME_1711_${String(i + 1).padStart(2, '0')}.png`;
  await slides[i].screenshot({ path: path.join(outDir, name) });
}

await browser.close();
console.log(`Exported ${slides.length} frames 17/11`);
