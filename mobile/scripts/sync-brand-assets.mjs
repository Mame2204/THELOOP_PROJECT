/**
 * Synchronise les logos officiels (PNG reference) vers mobile/assets et icones Expo.
 * Sources : public/brand/logo-blanc-reference.png, logo-kit-icons.png
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const brandPublic = join(root, 'public', 'brand');
const brandMobile = join(__dirname, '..', 'assets', 'brand');
const assetsDir = join(__dirname, '..', 'assets');

const refBlanc = join(brandPublic, 'logo-blanc-reference.png');
const refKit = join(brandPublic, 'logo-kit-icons.png');

async function loadSharp() {
  try {
    return (await import('sharp')).default;
  } catch {
    console.error('Installez sharp : npm install sharp --no-save');
    process.exit(1);
  }
}

async function extractKitIcons(sharp) {
  const meta = await sharp(refKit).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    throw new Error('Kit marque introuvable ou vide');
  }

  // Kit horizontal : 5 variantes (BLANC | NOIR | OR | APP LG | TAMPON)
  const names = ['mark-blanc-kit', 'mark-app', 'mark-or', 'mark-app-lg', 'mark-stamp'];
  const cellW = Math.floor(width / names.length);
  for (let i = 0; i < names.length; i += 1) {
    const left = i * cellW;
    const w = i === names.length - 1 ? width - left : cellW;
    const out = join(brandMobile, `${names[i]}.png`);
    await sharp(refKit)
      .extract({ left, top: 0, width: w, height })
      .png()
      .toFile(out);
    console.log('OK', names[i], `${w}x${height}`);
  }
}

/**
 * Icône native : logo bien centré et grand (même rendu iOS / Android / splash).
 * Fond clair #F4FCFD.
 */
async function buildCenteredMarkCanvas(sharp, markSrc, {
  canvas = 1024,
  markRatio = 0.62,
  background = { r: 244, g: 252, b: 253, alpha: 1 },
} = {}) {
  const markPx = Math.round(canvas * markRatio);
  const pad = Math.round((canvas - markPx) / 2);
  const mark = await sharp(markSrc)
    .resize(markPx, markPx, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background,
    },
  })
    .composite([{ input: mark, top: pad, left: pad }])
    .png()
    .toBuffer();
}

async function buildNativeIcons(sharp) {
  // Source de vérité = SVG kit (generate-icons.mjs), pas le PNG strip.
  const { spawnSync } = await import('node:child_process');
  const nodeBin = process.execPath;
  const gen = join(__dirname, 'generate-icons.mjs');
  const r = spawnSync(nodeBin, [gen], { cwd: join(__dirname, '..'), stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error('generate-icons.mjs a échoué');
  }
  void sharp;
}

async function copyBlancReference(sharp) {
  copyFileSync(refBlanc, join(brandMobile, 'mark-blanc-ref.png'));
  copyFileSync(refKit, join(brandMobile, 'logo-kit-icons.png'));

  const fromKit = join(brandMobile, 'mark-blanc-kit.png');
  if (existsSync(fromKit)) {
    await sharp(fromKit)
      .resize(128, 128, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toFile(join(brandMobile, 'mark-blanc.png'));
  } else {
    await sharp(refBlanc)
      .resize(128, 128, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toFile(join(brandMobile, 'mark-blanc.png'));
  }
  console.log('OK mark-blanc.png');
}

async function syncToPublic(sharp) {
  for (const name of ['mark-blanc.png', 'mark-app.png', 'mark-or.png', 'mark-app-lg.png', 'mark-stamp.png']) {
    const src = join(brandMobile, name);
    if (existsSync(src)) {
      copyFileSync(src, join(brandPublic, name));
    }
  }
  const appSrc = existsSync(join(brandMobile, 'mark-blanc-kit.png'))
    ? join(brandMobile, 'mark-blanc-kit.png')
    : join(assetsDir, 'icon.png');
  await sharp(appSrc)
    .resize(512, 512, { fit: 'cover' })
    .png()
    .toFile(join(root, 'public', 'app-icon.png'));
  copyFileSync(join(assetsDir, 'icon.png'), join(root, 'public', 'pwa-icon.png'));
  console.log('OK public/app-icon.png + brand/*.png');
}

const sharp = await loadSharp();
mkdirSync(brandMobile, { recursive: true });
copyFileSync(refKit, join(brandMobile, 'logo-kit-icons.png'));
try {
  await extractKitIcons(sharp);
} catch (err) {
  console.warn('Kit icons :', err instanceof Error ? err.message : err);
}
await copyBlancReference(sharp);
await buildNativeIcons(sharp);
await syncToPublic(sharp);

writeFileSync(
  join(brandMobile, 'README.txt'),
  'Assets generes depuis public/brand/logo-blanc-reference.png et logo-kit-icons.png\n' +
    'Regenerer : node scripts/sync-brand-assets.mjs\n',
);
console.log('Marque synchronisee dans', brandMobile);
