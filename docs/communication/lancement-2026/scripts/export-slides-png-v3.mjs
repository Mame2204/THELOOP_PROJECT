import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dir, '..', 'export-visuels-pack-acte-a-v3.html');
const outDir = path.join(dir, '..', 'exports-png-v3');
const artifactsDir = '/opt/cursor/artifacts/theloop-acte-a';

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(artifactsDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 2200 } });
await page.goto(`file://${htmlPath}`);

const labels = await page.$$eval('.label', (els) => els.map((e) => e.textContent?.trim() ?? ''));
const slides = await page.$$('.c');

for (let i = 0; i < slides.length; i++) {
  const safe = (labels[i] ?? `slide-${i}`).replace(/[^\w\-]+/g, '_').slice(0, 50);
  const name = `${String(i + 1).padStart(2, '0')}_${safe}.png`;
  await slides[i].screenshot({ path: path.join(outDir, name) });
  fs.copyFileSync(path.join(outDir, name), path.join(artifactsDir, name));
}

await browser.close();
console.log(`Exported ${slides.length} to v3`);
