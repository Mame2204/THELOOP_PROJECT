/**
 * 6/11 · Reels « social » sans VO — effets visuels + SFX + fond musical léger (procédural).
 * Usage : node scripts/render-video-0611-social.mjs
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const pngDir = path.join(dir, '..', 'exports-png-v4-light');
const outDir = path.join(dir, '..', 'exports-mp4');
const outFile = path.join(outDir, 'VIDEO_0611_dilemme-SOCIAL.mp4');
const tmp = path.join(outDir, '.render-0611-social');

const plans = [
  { file: 'FRAME_0611_01_vendredi-19h.png', dur: 2.6, sfx: 'rumble' },
  { file: 'FRAME_0611_02_question-weekend.png', dur: 2.6, sfx: 'notif' },
  { file: 'FRAME_0611_03_quatre-reponses.png', dur: 5.2, sfx: 'tick' },
  { file: 'FRAME_0611_04_moins-de-temps.png', dur: 3.8, sfx: 'none' },
  { file: 'FRAME_0611_05_the-loop-bientot.png', dur: 4.8, sfx: 'none' },
  { file: 'FRAME_0611_06_signature-fin.png', dur: 3.0, sfx: 'none' },
];

const XFADE = 0.22;
const fps = 30;

function run(cmd, args, quiet = false) {
  const r = spawnSync(cmd, args, { stdio: quiet ? 'pipe' : 'inherit' });
  if (r.status !== 0) {
    if (quiet && r.stderr) process.stderr.write(r.stderr);
    process.exit(r.status ?? 1);
  }
}

function segmentVf(dur, frames, extra = '') {
  const fade = Math.min(0.18, dur / 5);
  const out = Math.max(0, dur - fade);
  const zStep = 0.045 / frames;
  return [
    'scale=1080:1920:force_original_aspect_ratio=decrease',
    'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0xECF4F7',
    `zoompan=z='min(1+${zStep.toFixed(6)}*on,1.045)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${fps}`,
    `fade=t=in:st=0:d=${fade}`,
    `fade=t=out:st=${out}:d=${fade}`,
    extra,
    'format=yuv420p',
  ]
    .filter(Boolean)
    .join(',');
}

fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

for (const p of plans) {
  const full = path.join(pngDir, p.file);
  if (!fs.existsSync(full)) {
    console.error('Manquant:', full);
    process.exit(1);
  }
}

const segPaths = [];
for (let i = 0; i < plans.length; i++) {
  const { file, dur } = plans[i];
  const frames = Math.round(dur * fps);
  const seg = path.join(tmp, `v${i}.mp4`);
  segPaths.push(seg);
  let extra = '';
  if (i === 1) {
    extra = "eq=brightness='if(lt(t,0.12),0.08,0)':contrast=1.02";
  }
  run('ffmpeg', [
    '-y',
    '-loop',
    '1',
    '-i',
    path.join(pngDir, file),
    '-t',
    String(dur),
    '-vf',
    segmentVf(dur, frames, extra),
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '17',
    '-an',
    seg,
  ]);
}

const totalDur = plans.reduce((a, p) => a + p.dur, 0) - XFADE * (plans.length - 1);
const audioPath = path.join(tmp, 'mix.m4a');

const t1 = plans[0].dur - XFADE;
const t2 = t1 + plans[1].dur - XFADE;
const t3 = t2 + plans[2].dur - XFADE;

/** Audio : SFX + pad musical (plusieurs passes ffmpeg) */
run('ffmpeg', [
  '-y',
  '-f',
  'lavfi',
  '-i',
  `sine=frequency=55:sample_rate=44100:duration=0.42`,
  '-af',
  'lowpass=f=120,volume=0.4,adelay=0|0',
  path.join(tmp, 'sfx-rumble.aac'),
], true);

run('ffmpeg', [
  '-y',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=880:duration=0.07',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=880:duration=0.07',
  '-filter_complex',
  `[0:a]volume=0.3,adelay=${Math.round(t1 * 1000)}|${Math.round(t1 * 1000)}[a];[1:a]volume=0.25,adelay=${Math.round(t1 * 1000 + 100)}|${Math.round(t1 * 1000 + 100)}[b];[a][b]amix=inputs=2`,
  path.join(tmp, 'sfx-notif.aac'),
], true);

const tickInputsList = [];
for (let k = 0; k < 9; k++) {
  const start = t2 + 0.3 + k * 0.52;
  run('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=1200:duration=0.035',
    '-af',
    `volume=0.15,adelay=${Math.round(start * 1000)}|${Math.round(start * 1000)}`,
    path.join(tmp, `tick${k}.aac`),
  ], true);
  tickInputsList.push('-i', path.join(tmp, `tick${k}.aac`));
}

run('ffmpeg', [
  '-y',
  '-f',
  'lavfi',
  '-i',
  `sine=frequency=196:duration=${totalDur.toFixed(2)}`,
  '-f',
  'lavfi',
  '-i',
  `sine=frequency=294:duration=${totalDur.toFixed(2)}`,
  '-filter_complex',
  `[0:a]volume=0.035[a0];[1:a]volume=0.022[a1];[a0][a1]amix=inputs=2,afade=t=in:st=${t3.toFixed(2)}:d=1.4,afade=t=out:st=${(totalDur - 0.8).toFixed(2)}:d=0.8,alimiter=limit=0.92`,
  path.join(tmp, 'music.aac'),
], true);

const mixInputs = [
  '-i',
  path.join(tmp, 'sfx-rumble.aac'),
  '-i',
  path.join(tmp, 'sfx-notif.aac'),
  '-i',
  path.join(tmp, 'music.aac'),
  ...tickInputsList,
];
const nIn = 3 + tickInputsList.length / 2;
const amix = `${Array.from({ length: nIn }, (_, i) => `[${i}:a]`).join('')}amix=inputs=${nIn}:duration=longest:dropout_transition=0,apad=whole_dur=${totalDur.toFixed(2)},alimiter=limit=0.95`;
run('ffmpeg', ['-y', ...mixInputs, '-filter_complex', amix, '-c:a', 'aac', '-b:a', '128k', audioPath], true);

/** xfade vidéo */
let vInputs = segPaths.flatMap((s) => ['-i', s]);
let fc = '';
let last = '[0:v]';
let offset = plans[0].dur - XFADE;
for (let i = 1; i < plans.length; i++) {
  const out = i === plans.length - 1 ? '[vout]' : `[v${i}]`;
  fc += `${last}[${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${offset.toFixed(3)}${out};`;
  if (i < plans.length - 1) {
    offset += plans[i].dur - XFADE;
    last = `[v${i}]`;
  }
}
fc = fc.replace(/;$/, '');

const videoOnly = path.join(tmp, 'video-xfade.mp4');
run('ffmpeg', [
  '-y',
  ...vInputs,
  '-filter_complex',
  `${fc};[vout]format=yuv420p[v420]`,
  '-map',
  '[v420]',
  '-c:v',
  'libx264',
  '-preset',
  'medium',
  '-crf',
  '17',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  videoOnly,
]);

run('ffmpeg', [
  '-y',
  '-i',
  videoOnly,
  '-i',
  audioPath,
  '-c:v',
  'copy',
  '-c:a',
  'aac',
  '-b:a',
  '128k',
  '-shortest',
  '-movflags',
  '+faststart',
  outFile,
]);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('OK →', outFile, `(~${totalDur.toFixed(1)} s · SFX + fond · sans VO)`);
