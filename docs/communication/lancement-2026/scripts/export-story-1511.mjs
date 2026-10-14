import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { copyToArtifacts } from './lib-artifacts.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dir, '..', 'export-visuels-story-1511.html');
const outDir = path.join(dir, '..', 'exports-png-v4-light');
const artifactsDir = '/opt/cursor/artifacts/theloop-acte-a-v4';
const aliases = ['STORY_15-11_01_J-2.png', 'STORY_15-11_02_100-places.png', 'STORY_15-11_03_mardi-reserve.png'];

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 2100 } });
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const slides = await page.$$('.slide');
for (let i = 0; i < slides.length; i++) {
  const dest = path.join(outDir, aliases[i]);
  await slides[i].screenshot({ path: dest });
  copyToArtifacts(dest, artifactsDir, aliases[i]);
}
await browser.close();
console.log('Exported story 15/11');
