import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { copyToArtifacts } from './lib-artifacts.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dir, '..', 'export-visuels-j5-1211.html');
const outDir = path.join(dir, '..', 'exports-png-v4-light');
const artifactsDir = '/opt/cursor/artifacts/theloop-acte-a-v4';
const name = 'POST_12-11_J-5-PUBLIER.png';

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1500 } });
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

const slide = await page.$('.slide');
const dest = path.join(outDir, name);
await slide.screenshot({ path: dest });
copyToArtifacts(dest, artifactsDir, name);

await browser.close();
console.log('Exported', name);
