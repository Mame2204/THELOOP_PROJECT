import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dir, '..', 'export-visuels-pack-acte-a-v4-light.html');
const outDir = path.join(dir, '..', 'exports-png-v4-light');
const artifactsDir = '/opt/cursor/artifacts/theloop-acte-a-v4';

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(artifactsDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 2200 } });
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });

const labels = await page.$$eval('.label', (els) => els.map((e) => e.textContent?.trim() ?? ''));
const slides = await page.$$('.c');

const aliases = ['POST_3-11_feed-final.png', 'POST_3-11_reels-v2.png', 'POST_5-11_citation-v2.png'];

for (let i = 0; i < slides.length; i++) {
  const safe = (labels[i] ?? `slide-${i}`).replace(/[^\w\-]+/g, '_').slice(0, 55);
  const name = `${String(i + 1).padStart(2, '0')}_${safe}.png`;
  const dest = path.join(outDir, name);
  await slides[i].screenshot({ path: dest });
  fs.copyFileSync(dest, path.join(artifactsDir, name));
  if (aliases[i]) {
    fs.copyFileSync(dest, path.join(outDir, aliases[i]));
    fs.copyFileSync(dest, path.join(artifactsDir, aliases[i]));
  }
}

await browser.close();
console.log(`Exported ${slides.length} v4 light`);
