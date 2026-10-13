import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dir, '..', 'export-visuels-prelaunch-1712.html');
const outDir = path.join(dir, '..', 'exports-png-v4-light');
const name = 'POST_17-12_prelaunch-PUBLIER.png';

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1500 } });
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.$('.slide').then((el) => el.screenshot({ path: path.join(outDir, name) }));
await browser.close();
console.log('Exported', name);
