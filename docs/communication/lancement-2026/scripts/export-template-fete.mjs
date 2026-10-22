import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dir, '..', 'export-visuels-template-fete.html');
const outDir = path.join(dir, '..', 'exports-png-v4-light');

const names = [
  'TEMPLATE_fete_neutre-PUBLIER.png',
  'TEMPLATE_fete_noel-PUBLIER.png',
  'TEMPLATE_fete_bonne-annee-PUBLIER.png',
];

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1500 } });
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const slides = await page.$$('.slide');
for (let i = 0; i < slides.length; i++) {
  await slides[i].screenshot({ path: path.join(outDir, names[i] ?? `TEMPLATE_fete_${i}.png`) });
}
await browser.close();
console.log('Exported', slides.length, 'fête templates');
