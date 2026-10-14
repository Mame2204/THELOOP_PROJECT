/**
 * Vidéo brouillon 6/11 — enchaîne les 6 PNG (sans musique / VO).
 * Pour Meta : import possible tel quel, ou ouvrir dans CapCut pour son + B-roll plan 4.
 *
 * Usage (depuis docs/communication/lancement-2026/) :
 *   node scripts/stitch-video-0611.mjs
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const pngDir = path.join(dir, '..', 'exports-png-v4-light');
const outDir = path.join(dir, '..', 'exports-mp4');
const outFile = path.join(outDir, 'VIDEO_0611_dilemme-BROUILLON.mp4');

const slides = [
  { file: 'FRAME_0611_01_vendredi-19h.png', duration: 3 },
  { file: 'FRAME_0611_02_question-weekend.png', duration: 3 },
  { file: 'FRAME_0611_03_quatre-reponses.png', duration: 8 },
  { file: 'FRAME_0611_04_moins-de-temps.png', duration: 6 },
  { file: 'FRAME_0611_05_the-loop-bientot.png', duration: 8 },
  { file: 'FRAME_0611_06_signature-fin.png', duration: 4 },
];

for (const { file } of slides) {
  const p = path.join(pngDir, file);
  if (!fs.existsSync(p)) {
    console.error('PNG manquant:', p);
    process.exit(1);
  }
}

fs.mkdirSync(outDir, { recursive: true });
const listPath = path.join(outDir, '.concat-0611.txt');
const lines = ['ffconcat version 1.0'];
for (const { file, duration } of slides) {
  lines.push(`file '${path.join(pngDir, file).replace(/'/g, "'\\''")}'`);
  lines.push(`duration ${duration}`);
}
lines.push(`file '${path.join(pngDir, slides.at(-1).file).replace(/'/g, "'\\''")}'`);
fs.writeFileSync(listPath, lines.join('\n'));

const vf =
  'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0xECF4F7,fps=30,format=yuv420p';

const args = [
  '-y',
  '-f',
  'concat',
  '-safe',
  '0',
  '-i',
  listPath,
  '-f',
  'lavfi',
  '-i',
  'anullsrc=channel_layout=stereo:sample_rate=44100',
  '-vf',
  vf,
  '-c:v',
  'libx264',
  '-preset',
  'medium',
  '-crf',
  '20',
  '-c:a',
  'aac',
  '-b:a',
  '128k',
  '-shortest',
  '-movflags',
  '+faststart',
  outFile,
];

const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
fs.unlinkSync(listPath);
if (r.status !== 0) process.exit(r.status ?? 1);
console.log('OK →', outFile);
