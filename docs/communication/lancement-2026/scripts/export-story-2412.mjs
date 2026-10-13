import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dir, '..', 'export-visuels-story-2412.html');
const outDir = path.join(dir, '..', 'exports-png-v4-light');
const aliases = [
  'STORY_24-12_01_ouvert.png',
  'STORY_24-12_02_lien.png',
  'STORY_24-12_03_piliers.png',
  'STORY_24-12_04_signature.png',
  'STORY_24-12_05_merci.png',
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
console.log('Exported 24/12 stories');
