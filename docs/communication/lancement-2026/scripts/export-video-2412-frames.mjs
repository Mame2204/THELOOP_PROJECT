import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dir, '..', 'export-visuels-video-2412.html');
const outDir = path.join(dir, '..', 'exports-png-v4-light');
const aliases = [
  'FRAME_2412_01_24dec.png',
  'FRAME_2412_02_repere.png',
  'FRAME_2412_03_app.png',
  'FRAME_2412_04_logo.png',
  'FRAME_2412_05_disponible.png',
  'FRAME_2412_06_signature.png',
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
console.log('Exported 24/12 video frames');
