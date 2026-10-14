import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(dir, '..', 'exports-png-v4-light');

/** @type {{ prefix: string; dayLabel: string; utm: string; lines: string[]; slugs: string[] }[]} */
const days = [
  {
    prefix: '07-12',
    dayLabel: '7 décembre',
    utm: 'jour_07',
    lines: ['Conakry.', 'On prépare le guide.', 'Sélection en cours.'],
    slugs: ['conakry', 'guide', 'selection'],
  },
  {
    prefix: '08-12',
    dayLabel: '8 décembre',
    utm: 'jour_08',
    lines: ['Rencontres.', 'Écouter.', 'Comprendre ce qui vaut le coup.'],
    slugs: ['rencontres', 'ecouter', 'valeur'],
  },
  {
    prefix: '09-12',
    dayLabel: '9 décembre',
    utm: 'jour_09',
    lines: ['Critères.', 'Calme possible.', 'Service.', 'Expérience soignée.'],
    slugs: ['criteres', 'calme', 'service', 'experience'],
  },
  {
    prefix: '10-12',
    dayLabel: '10 décembre',
    utm: 'jour_10',
    lines: ['Agenda.', 'Ce qui compte', 'sans le bruit.'],
    slugs: ['agenda', 'compte', 'bruit'],
  },
  {
    prefix: '11-12',
    dayLabel: '11 décembre',
    utm: 'jour_11',
    lines: ['Outils.', 'Le quotidien', 'centralisé.'],
    slugs: ['outils', 'quotidien', 'centralise'],
  },
  {
    prefix: '12-12',
    dayLabel: '12 décembre',
    utm: 'jour_12',
    lines: ['Parcours.', 'Organiser', 'son temps.'],
    slugs: ['parcours', 'organiser', 'temps'],
  },
  {
    prefix: '13-12',
    dayLabel: '13 décembre',
    utm: 'jour_13',
    lines: ['J-4', 'Accès anticipé', '17 décembre'],
    slugs: ['j-4', 'acces', '17dec'],
  },
  {
    prefix: '14-12',
    dayLabel: '14 décembre',
    utm: 'jour_14',
    lines: ['Partenaires.', 'Des adresses', 'rejoignent The Loop'],
    slugs: ['partenaires', 'adresses', 'rejoignent'],
  },
  {
    prefix: '15-12',
    dayLabel: '15 décembre',
    utm: 'jour_15',
    lines: ['Demain.', 'Tests finaux', 'avant invitations'],
    slugs: ['demain', 'tests', 'invitations'],
  },
  {
    prefix: '16-12',
    dayLabel: '16 décembre',
    utm: 'jour_16',
    lines: ['J-1', 'Accès anticipé', '100 premiers inscrits'],
    slugs: ['j-1', 'acces', '100-inscrits'],
  },
];

function frameHtml({ dayLabel, index, total, line, isLast, utm }) {
  const footer = isLast
    ? `<p class="foot">Réserve ta place · <span class="gold">theloop-app.com</span></p>`
    : '';
  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="utf-8"/>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&display=swap" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Manrope, sans-serif; background: #111; }
  .slide {
    width: 1080px; height: 1920px; position: relative; overflow: hidden;
    background: linear-gradient(165deg, #1a2830 0%, #0a3a44 45%, #062830 100%); color: #fff;
  }
  .grain { position: absolute; inset: 0; opacity: 0.08; background: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
  .ribbon {
    position: absolute; top: 0; left: 0; right: 0; padding: 22px;
    background: linear-gradient(90deg, #0f7a8e, #0a3a44);
    text-align: center; font-size: 20px; font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase;
  }
  .badge { position: absolute; top: 88px; right: 56px; font-size: 18px; font-weight: 800; padding: 10px 18px; border-radius: 999px; background: rgba(255,255,255,0.12); border: 2px solid rgba(230,185,58,0.45); }
  .inner { height: 100%; padding: 140px 56px 200px; display: flex; align-items: center; justify-content: center; text-align: center; }
  .panel { max-width: 920px; width: 100%; padding: 56px 40px; border-radius: 32px; background: rgba(255,255,255,0.08); border: 2px solid rgba(255,255,255,0.12); }
  .line { font-size: ${line.length > 28 ? 56 : 72}px; font-weight: 800; line-height: 1.12; margin: 0; }
  .gold { color: #e6b93a; }
  .foot { margin-top: 40px; font-size: 28px; font-weight: 700; line-height: 1.35; color: rgba(255,255,255,0.85); }
</style></head>
<body><div class="slide"><div class="grain"></div>
<div class="ribbon">Terrain · ${dayLabel}</div>
<div class="badge">${index} / ${total}</div>
<div class="inner"><div class="panel">
<p class="line">${line.replace(/(\d+\s*décembre|100 premiers)/gi, '<span class="gold">$1</span>').replace(/J-\d+/g, (m) => `<span class="gold">${m}</span>`)}</p>
${footer}
</div></div></div></body></html>`;
}

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });

let count = 0;
for (const day of days) {
  const total = day.lines.length;
  for (let i = 0; i < total; i++) {
    const name = `STORY_${day.prefix}_${String(i + 1).padStart(2, '0')}_${day.slugs[i]}.png`;
    const html = frameHtml({
      dayLabel: day.dayLabel,
      index: i + 1,
      total,
      line: day.lines[i],
      isLast: i === total - 1,
      utm: day.utm,
    });
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.waitForTimeout(120);
    await page.locator('.slide').screenshot({ path: path.join(outDir, name) });
    count++;
  }
}

await browser.close();
console.log(`Exported ${count} terrain story frames (7–16/12)`);
