import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { copyToArtifacts } from './lib-artifacts.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dir, '..', 'export-visuels-video-1311.html');
const outDir = path.join(dir, '..', 'exports-png-v4-light');
const artifactsDir = '/opt/cursor/artifacts/theloop-acte-a-v4';

const aliases = [
  'FRAME_1311_01_envie.png',
  'FRAME_1311_02_calme.png',
  'FRAME_1311_03_peu-de-bruit.png',
  'FRAME_1311_04_pas-ca.png',
  'FRAME_1311_05_selectif-clair-fr.png',
  'FRAME_1311_06_piliers.png',
  'FRAME_1311_07_17nov.png',
];

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 2100 } });
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const slides = await page.$$('.slide');

for (let i = 0; i < slides.length; i++) {
  const name = aliases[i] ?? `FRAME_1311_${String(i + 1).padStart(2, '0')}.png`;
  const dest = path.join(outDir, name);
  await slides[i].screenshot({ path: dest });
  copyToArtifacts(dest, artifactsDir, name);
}

await browser.close();
console.log(`Exported ${slides.length} frames 13/11`);
