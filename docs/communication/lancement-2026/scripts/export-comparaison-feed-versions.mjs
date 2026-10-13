import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dir, '..', 'comparaison-feed-v2-vs-publier.html');
const outDir = path.join(dir, '..', 'exports-png-v4-light');
const artifactsDir = '/opt/cursor/artifacts/theloop-acte-a-v4';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

const name = 'GUIDE_DIFF_feed-v2-vs-PUBLIER-3nov.png';
const dest = path.join(outDir, name);
await page.locator('#compare').screenshot({ path: dest });
fs.copyFileSync(dest, path.join(artifactsDir, name));

await browser.close();
console.log('Exported', name);
