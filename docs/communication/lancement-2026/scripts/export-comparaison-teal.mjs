import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dir, '..', 'comparaison-teal-3-niveaux.html');
const outDir = path.join(dir, '..', 'exports-png-v4-light');
const artifactsDir = '/opt/cursor/artifacts/theloop-acte-a-v4';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 4500 } });
await page.goto(`file://${htmlPath}`);

const panels = await page.$$('.panel');
const names = ['COMPARAISON_NIVEAU_1_leger.png', 'COMPARAISON_NIVEAU_2_moyen.png', 'COMPARAISON_NIVEAU_3_fonce.png'];

for (let i = 0; i < panels.length; i++) {
  const p = path.join(outDir, names[i]);
  await panels[i].screenshot({ path: p });
  fs.copyFileSync(p, path.join(artifactsDir, names[i]));
}

await browser.close();
console.log('Exported 3 comparison levels');
