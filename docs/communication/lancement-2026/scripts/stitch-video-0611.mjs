/**
 * Vidéo 6/11 sans CapCut — texte déjà sur les PNG (pas de VO / pas de texte à retaper).
 *
 *   node scripts/stitch-video-0611.mjs          → BROUILLON (cuts secs)
 *   node scripts/stitch-video-0611.mjs --smooth → PUBLIER (zoom léger + fondus)
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const smooth = process.argv.includes('--smooth');
const dir = path.dirname(fileURLToPath(import.meta.url));
const pngDir = path.join(dir, '..', 'exports-png-v4-light');
const outDir = path.join(dir, '..', 'exports-mp4');
const outFile = path.join(
  outDir,
  smooth ? 'VIDEO_0611_dilemme-PUBLIER.mp4' : 'VIDEO_0611_dilemme-BROUILLON.mp4',
);

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

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!smooth) {
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
  run('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-vf', vf, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', outFile,
  ]);
  fs.unlinkSync(listPath);
  console.log('OK →', outFile);
  process.exit(0);
}

const tmpDir = path.join(outDir, '.tmp-0611');
fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });

const segPaths = [];
for (let i = 0; i < slides.length; i++) {
  const { file, duration } = slides[i];
  const seg = path.join(tmpDir, `seg-${String(i).padStart(2, '0')}.mp4`);
  segPaths.push(seg);
  const fps = 30;
  const frames = Math.round(duration * fps);
  const fade = Math.min(0.4, duration / 4);
  const fadeOutStart = Math.max(0, duration - fade);
  const zStep = 0.035 / frames;
  const vf = [
    'scale=1080:1920:force_original_aspect_ratio=decrease',
    'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0xECF4F7',
    `zoompan=z='min(1+${zStep.toFixed(6)}*on,1.035)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${fps}`,
    `fade=t=in:st=0:d=${fade}`,
    `fade=t=out:st=${fadeOutStart}:d=${fade}`,
    'format=yuv420p',
  ].join(',');
  run('ffmpeg', [
    '-y', '-loop', '1', '-i', path.join(pngDir, file),
    '-t', String(duration), '-vf', vf,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-an', seg,
  ]);
}

const listPath = path.join(tmpDir, 'concat.txt');
fs.writeFileSync(
  listPath,
  segPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'),
);

run('ffmpeg', [
  '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
  '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest',
  '-movflags', '+faststart', outFile,
]);

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log('OK (smooth) →', outFile);
