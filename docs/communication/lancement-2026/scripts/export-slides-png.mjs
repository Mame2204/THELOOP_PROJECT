import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dir, '..', 'export-visuels-pack1.html');
const outDir = path.join(dir, '..', 'exports-png');
const artifactsDir = '/opt/cursor/artifacts/theloop-visuels';

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(artifactsDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
await page.goto(`file://${htmlPath}`);

const labels = await page.$$eval('.slide-label', (els) => els.map((e) => e.textContent?.trim() ?? 'slide'));
const slides = await page.$$('.slide');

for (let i = 0; i < slides.length; i++) {
  const safe = (labels[i] ?? `slide-${i + 1}`)
    .replace(/[^\w\-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 60);
  const name = `${String(i + 1).padStart(2, '0')}_${safe}.png`;
  await slides[i].screenshot({ path: path.join(outDir, name) });
  fs.copyFileSync(path.join(outDir, name), path.join(artifactsDir, name));
}

await browser.close();
console.log(`Exported ${slides.length} PNGs to ${outDir} and ${artifactsDir}`);
