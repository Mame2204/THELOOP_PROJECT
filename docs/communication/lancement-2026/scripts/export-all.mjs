/**
 * Exporte tous les visuels du calendrier à partir de visuels-manifest.mjs.
 *
 *   node scripts/export-all.mjs                 # tout
 *   node scripts/export-all.mjs 2026-11-18      # un jour (date de l'entrée)
 *   node scripts/export-all.mjs --clean         # + supprime les PNG qui ne sont plus au calendrier
 *
 * Chaque slide sans logo reçoit la signature The Loop (marque + nom) :
 * en bas pour le feed 4:5, sous la zone d'en-tête Meta pour les formats 9:16,
 * déplacée automatiquement si elle chevauche le contenu.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loopMarkSvg } from './loop-mark-svg.mjs';
import { entryItems, lockedPngs, lockedPrefixes, manifest } from './visuels-manifest.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..');
const defaultOut = 'exports-png-v4-light';

const args = process.argv.slice(2);
const clean = args.includes('--clean');
const dates = args.filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const selected = dates.length ? manifest.filter((e) => dates.includes(e.date)) : manifest;

const stampCss = `
  .loop-stamp {
    position: absolute; left: 50%; transform: translateX(-50%); z-index: 40;
    display: flex; align-items: center; gap: 12px; pointer-events: none;
    font-family: Manrope, sans-serif; font-size: 20px; font-weight: 800;
    letter-spacing: 0.22em; text-transform: uppercase; white-space: nowrap;
  }
`;

function stampMarkup(color, santaHat) {
  const svg = loopMarkSvg({ color, width: santaHat ? 46 : 40, santaHat });
  return `${svg}<span style="color:${color}">The Loop</span>`;
}

const browser = await chromium.launch();
const expected = new Map();
let count = 0;

for (const entry of manifest) {
  for (const { name } of entryItems(entry)) {
    expected.set(path.join(root, entry.outDir ?? defaultOut, name), true);
  }
}

for (const entry of selected) {
  const htmlPath = path.join(root, entry.html);
  const outDir = path.join(root, entry.outDir ?? defaultOut);
  fs.mkdirSync(outDir, { recursive: true });

  const page = await browser.newPage({ viewport: { width: 1200, height: entry.format === 'story' ? 2100 : 1500 } });
  page.on('console', (msg) => {
    if (msg.type() === 'warning') console.warn(`  ⚠ ${entry.html} · ${msg.text()}`);
  });
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  const light = stampMarkup('#ffffff', Boolean(entry.santaHat));
  const dark = stampMarkup('#0A3A44', Boolean(entry.santaHat));
  await page.evaluate(
    ({ css, light, dark, format }) => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
      for (const slide of document.querySelectorAll('.slide')) {
        const hasMark = [...slide.querySelectorAll('svg path')].some((p) => (p.getAttribute('d') ?? '').includes('13.5 10.21'));
        if (hasMark) continue;
        const [r, g, b] = getComputedStyle(slide).color.match(/\d+/g).map(Number);
        const textIsLight = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.4;
        const stamp = document.createElement('div');
        stamp.className = 'loop-stamp';
        stamp.innerHTML = textIsLight ? light : dark;
        slide.appendChild(stamp);

        const s = slide.getBoundingClientRect();
        const obstacles = [...slide.querySelectorAll('*')].filter((el) => {
          if (stamp.contains(el)) return false;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          if (r.width >= s.width * 0.98 && r.height >= s.height * 0.5) return false;
          return getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).opacity !== '0';
        });
        const collides = () => {
          const m = stamp.getBoundingClientRect();
          const pad = 24;
          return obstacles.some((el) => {
            const r = el.getBoundingClientRect();
            return !(r.right < m.left - pad || r.left > m.right + pad || r.bottom < m.top - pad || r.top > m.bottom + pad);
          });
        };
        const spots = format === 'story'
          ? [{ top: '212px' }, { bottom: '300px' }, { top: '140px' }, { bottom: '200px' }]
          : [{ bottom: '44px' }, { top: '44px' }, { bottom: '20px' }];
        let placed = false;
        for (const spot of spots) {
          stamp.style.top = spot.top ?? 'auto';
          stamp.style.bottom = spot.bottom ?? 'auto';
          if (!collides()) { placed = true; break; }
        }
        if (!placed) {
          stamp.remove();
          console.warn(`Signature non placée (pas d'espace libre) : slide ${[...document.querySelectorAll('.slide')].indexOf(slide) + 1}`);
        }
      }
    },
    { css: stampCss, light, dark, format: entry.format },
  );
  await page.waitForTimeout(250);

  const slides = await page.$$('.slide');
  const items = entryItems(entry);
  if (slides.length !== items.length) {
    throw new Error(`${entry.html} : ${slides.length} slides pour ${items.length} noms`);
  }
  for (let i = 0; i < slides.length; i++) {
    await slides[i].screenshot({ path: path.join(outDir, items[i].name) });
    count++;
  }
  await page.close();
  console.log(`OK ${entry.date} · ${entry.html} → ${items.length} PNG`);
}

await browser.close();

if (clean) {
  for (const sub of [defaultOut, 'exports-png-telephone-fete']) {
    const d = path.join(root, sub);
    for (const f of fs.readdirSync(d)) {
      if (!f.endsWith('.png')) continue;
      if (lockedPngs.includes(f) || lockedPrefixes.some((p) => f.startsWith(p))) continue;
      const full = path.join(d, f);
      if (!expected.has(full)) {
        fs.rmSync(full);
        console.log('Supprimé (hors calendrier) :', path.join(sub, f));
      }
    }
  }
}

console.log(`\n${count} PNG exportés.`);
