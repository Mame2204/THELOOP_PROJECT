/**
 * Génère icon.png, adaptive-icon.png, splash-icon.png
 * depuis le monogramme officiel du kit (public/brand/the-loop-logo-kit.html).
 *
 * iOS  : mark ~74 % (rendu « parfait » demandé).
 * Android adaptive : mark ~42 % (un peu plus grand, toujours safe-zone).
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOOP_MARK } from './loop-mark-paths.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, '..', 'assets');
const CANVAS = 1024;
const SPLASH_BG = '#F4FCFD';
const MARK_COLOR = '#000000';

function loopMarkGroup(color, scale, tx, ty) {
  const m = LOOP_MARK.lg;
  return `
  <g transform="translate(${tx}, ${ty}) scale(${scale})">
    <circle cx="${m.circle.cx}" cy="${m.circle.cy}" r="${m.circle.r}" stroke="${color}" stroke-width="${m.circle.strokeWidth}" fill="none"/>
    <path d="${m.path}" stroke="${color}" stroke-width="${m.circle.strokeWidth}" stroke-linecap="round" fill="none"/>
    <circle cx="${m.dot.cx}" cy="${m.dot.cy}" r="${m.dot.r}" fill="${color}"/>
  </g>`;
}

/** Symbole seul, centré — markRatio = portion du canvas. */
function centeredMarkSvg(canvasSize, markColor, backgroundColor, markRatio) {
  const markScale = (canvasSize * markRatio) / 52;
  const markPx = 52 * markScale;
  const offset = (canvasSize - markPx) / 2;
  const bg =
    backgroundColor === 'none'
      ? ''
      : `<rect width="${canvasSize}" height="${canvasSize}" fill="${backgroundColor}"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasSize} ${canvasSize}" width="${canvasSize}" height="${canvasSize}">
  ${bg}
  ${loopMarkGroup(markColor, markScale, offset, offset)}
</svg>`;
}

async function loadSharp() {
  try {
    return (await import('sharp')).default;
  } catch {
    console.error('Installez sharp : npm install sharp --no-save');
    process.exit(1);
  }
}

async function renderPng(sharp, svgContent, outPath) {
  await sharp(Buffer.from(svgContent)).png().toFile(outPath);
  console.log('OK', outPath.split(/[/\\]/).pop());
}

const sharp = await loadSharp();

// iOS / launcher générique : fond clair, monogramme ~74 %
await renderPng(
  sharp,
  centeredMarkSvg(CANVAS, MARK_COLOR, SPLASH_BG, 0.74),
  join(assetsDir, 'icon.png'),
);

// Android adaptive : légèrement plus grand (~42 %).
await renderPng(
  sharp,
  centeredMarkSvg(CANVAS, MARK_COLOR, SPLASH_BG, 0.42),
  join(assetsDir, 'adaptive-icon.png'),
);

// Splash natif : même rendu iOS/Android (fond page + mark ~48 %).
await renderPng(
  sharp,
  centeredMarkSvg(CANVAS, MARK_COLOR, SPLASH_BG, 0.48),
  join(assetsDir, 'splash-icon.png'),
);

writeFileSync(join(assetsDir, 'icon.svg'), centeredMarkSvg(512, MARK_COLOR, 'none', 0.74));
console.log('Icones kit THE LOOP regeneres (iOS grand / Android safe-zone)');
