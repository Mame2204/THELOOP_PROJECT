import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dir, '..', 'export-visuels-video-0512.html');
const outDir = path.join(dir, '..', 'exports-png-v4-light');
const aliases = [
  'FRAME_0512_01_pas-tout-conakry.png',
  'FRAME_0512_02_repere.png',
  'FRAME_0512_03_piliers-flou.png',
  'FRAME_0512_04_reserve.png',
];

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 2100 } });
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const slides = await page.$$('.slide');
for (let i = 0; i < slides.length; i++) {
  await slides[i].screenshot({ path: path.join(outDir, aliases[i]) });
}
await browser.close();
console.log('Exported 5/12 video frames');
