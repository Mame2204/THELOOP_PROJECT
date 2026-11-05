/**
 * Rend les Reels du calendrier à partir des FRAME_*.png (exports-png-v4-light/).
 * Image : léger zoom par plan + fondus enchaînés. Son : nappe musicale + arpège + pulsation douce
 * + souffle à chaque transition, synthétisés ici (aucune musique sous droits).
 *
 *   node scripts/render-videos.mjs            # toutes les vidéos
 *   node scripts/render-videos.mjs 1811 2011  # sélection
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const pngDir = path.join(dir, '..', 'exports-png-v4-light');
const outDir = path.join(dir, '..', 'exports-mp4');

/** Durée par plan (s) : le temps de lire le texte à voix basse, sans traîner. */
export const videoJobs = [
  { id: '0611', date: '2026-11-06', prefix: 'FRAME_0611_', out: 'VIDEO_0611_dilemme-PUBLIER.mp4', durations: [3.2, 3.2, 7.5, 5, 6.5, 4], ping: 1, mood: 'night' },
  { id: '1311', date: '2026-11-13', prefix: 'FRAME_1311_', out: 'VIDEO_1311_envie-PUBLIER.mp4', durations: [2.6, 2.6, 2.4, 2.6, 3.6, 3.6, 4], mood: 'calm' },
  { id: '1811', date: '2026-11-18', prefix: 'FRAME_1811_', out: 'VIDEO_1811_frequence-PUBLIER.mp4', durations: [2.2, 2.2, 2.6, 3, 3.6, 2.6, 3.6, 3.8], mood: 'lift' },
  { id: '2011', date: '2026-11-20', prefix: 'FRAME_2011_', out: 'VIDEO_2011_pourquoi-PUBLIER.mp4', durations: [2.8, 3.4, 3.6, 3.8, 2.8, 4], mood: 'lift' },
  { id: '2711', date: '2026-11-27', prefix: 'FRAME_2711_', out: 'VIDEO_2711_outil-PUBLIER.mp4', durations: [2.8, 2.6, 3.8, 3.4, 4], mood: 'calm' },
  { id: '0312', date: '2026-12-03', prefix: 'FRAME_0312_', out: 'VIDEO_0312_anti-annuaire-PUBLIER.mp4', durations: [3.4, 3.4, 3.6, 4], mood: 'night' },
  { id: '2412', date: '2026-12-24', prefix: 'FRAME_2412_', out: 'VIDEO_2412_noel-PUBLIER.mp4', durations: [3.4, 2.6, 3.8, 2.8, 3.6, 4.2], mood: 'noel' },
];

const XFADE = 0.4;
const FPS = 30;
const RATE = 44100;

const moods = {
  calm: { bpm: 84, chords: [[130.81, 196.0, 246.94, 329.63], [110.0, 164.81, 196.0, 261.63]], kick: false },
  night: { bpm: 88, chords: [[110.0, 164.81, 196.0, 261.63], [87.31, 130.81, 174.61, 220.0]], kick: true },
  lift: { bpm: 96, chords: [[130.81, 196.0, 246.94, 329.63], [146.83, 220.0, 261.63, 349.23], [110.0, 164.81, 196.0, 261.63], [98.0, 146.83, 196.0, 246.94]], kick: true },
  noel: { bpm: 90, chords: [[146.83, 220.0, 293.66, 369.99], [123.47, 185.0, 246.94, 293.66], [98.0, 146.83, 196.0, 246.94], [110.0, 164.81, 220.0, 277.18]], kick: false, bells: true },
};

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) {
    process.stderr.write(r.stderr);
    process.exit(r.status ?? 1);
  }
}

function synthAudio({ totalDur, transitions, mood, ping }) {
  const m = moods[mood];
  const n = Math.ceil(totalDur * RATE);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const beat = 60 / m.bpm;
  const bar = beat * 4;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const chord = m.chords[Math.floor(t / (bar * 2)) % m.chords.length];
    const swell = 0.82 + 0.18 * Math.sin(2 * Math.PI * 0.18 * t);
    let pad = 0;
    for (const f of chord) {
      pad += Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * (f * 1.003) * t) + 0.12 * Math.sin(2 * Math.PI * f * 2 * t);
    }
    lp += 0.08 * (pad - lp);
    const padOut = lp * 0.05 * swell;

    const step = beat / 2;
    const k = Math.floor(t / step);
    const tt = t - k * step;
    const note = chord[(k % 4)] * 2;
    const pluck = Math.sin(2 * Math.PI * note * tt) * Math.exp(-tt * 7) * 0.07;

    let kick = 0;
    if (m.kick && t > bar) {
      const tb = t % (beat * 2);
      kick = Math.sin(2 * Math.PI * (48 + 70 * Math.exp(-tb * 28)) * tb) * Math.exp(-tb * 8) * 0.22;
    }

    let bell = 0;
    if (m.bells) {
      const tb = t % bar;
      const f = chord[3] * 4;
      bell = (Math.sin(2 * Math.PI * f * tb) + 0.4 * Math.sin(2 * Math.PI * f * 2.76 * tb)) * Math.exp(-tb * 3.2) * 0.035;
    }

    let whoosh = 0;
    for (const tr of transitions) {
      const d = t - (tr - 0.35);
      if (d >= 0 && d < 0.8) whoosh += rnd() * Math.sin((Math.PI * d) / 0.8) ** 2 * 0.045;
    }

    let notif = 0;
    if (ping !== undefined) {
      const d = t - ping;
      if (d >= 0 && d < 0.09) notif += Math.sin(2 * Math.PI * 880 * d) * 0.12;
      const d2 = d - 0.11;
      if (d2 >= 0 && d2 < 0.12) notif += Math.sin(2 * Math.PI * 1320 * d2) * Math.exp(-d2 * 20) * 0.12;
    }

    const fadeIn = Math.min(1, t / 0.8);
    const fadeOut = Math.min(1, (totalDur - t) / 1.2);
    const env = Math.max(0, Math.min(fadeIn, fadeOut));
    const mono = (padOut + kick + notif) * env;
    const pan = Math.sin(2 * Math.PI * 0.11 * t) * 0.3;
    L[i] = mono + (pluck * (1 - pan) + bell + whoosh) * env;
    R[i] = mono + (pluck * (1 + pan) + bell - whoosh * 0.6) * env;
  }

  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const gain = 0.7 / (peak || 1);
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * gain)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * gain)) * 32767), 46 + i * 4);
  }
  return buf;
}

function render(job) {
  const files = fs.readdirSync(pngDir).filter((f) => f.startsWith(job.prefix) && f.endsWith('.png')).sort();
  if (files.length !== job.durations.length) {
    throw new Error(`${job.id} : ${files.length} PNG pour ${job.durations.length} durées`);
  }
  const tmp = path.join(outDir, `.render-${job.id}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });

  const segs = files.map((f, i) => {
    const dur = job.durations[i];
    const frames = Math.round(dur * FPS);
    const seg = path.join(tmp, `v${i}.mp4`);
    const vf = [
      'scale=1080:1920:force_original_aspect_ratio=decrease',
      'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0A3A44',
      `zoompan=z='min(1+${(0.04 / frames).toFixed(6)}*on,1.04)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${FPS}`,
      'format=yuv420p',
    ].join(',');
    run('ffmpeg', ['-y', '-loop', '1', '-i', path.join(pngDir, f), '-t', String(dur), '-vf', vf, '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-an', seg]);
    return seg;
  });

  const transitions = [];
  let fc = '';
  let last = '[0:v]';
  let offset = job.durations[0] - XFADE;
  for (let i = 1; i < segs.length; i++) {
    transitions.push(offset + XFADE / 2);
    const out = i === segs.length - 1 ? '[vx]' : `[v${i}]`;
    fc += `${last}[${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${offset.toFixed(3)}${out};`;
    last = `[v${i}]`;
    offset += job.durations[i] - XFADE;
  }
  const totalDur = job.durations.reduce((a, b) => a + b, 0) - XFADE * (segs.length - 1);
  const fadeOut = (totalDur - 0.6).toFixed(2);
  fc += `[vx]fade=t=in:st=0:d=0.3,fade=t=out:st=${fadeOut}:d=0.6,format=yuv420p[v]`;

  const pingAt = job.ping === undefined ? undefined
    : job.durations.slice(0, job.ping).reduce((a, b) => a + b, 0) - XFADE * job.ping + 0.35;
  const wav = path.join(tmp, 'audio.wav');
  fs.writeFileSync(wav, synthAudio({ totalDur, transitions, mood: job.mood, ping: pingAt }));

  const outFile = path.join(outDir, job.out);
  run('ffmpeg', [
    '-y', ...segs.flatMap((s) => ['-i', s]), '-i', wav,
    '-filter_complex', fc, '-map', '[v]', '-map', `${segs.length}:a`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', outFile,
  ]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`OK ${job.date} → ${job.out} (${totalDur.toFixed(1)} s)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const filter = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const jobs = filter.length ? videoJobs.filter((j) => filter.includes(j.id)) : videoJobs;
  for (const job of jobs) render(job);
  const keep = new Set(videoJobs.map((j) => j.out));
  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith('.mp4') && !keep.has(f)) {
      fs.rmSync(path.join(outDir, f));
      console.log('Supprimé (hors calendrier) :', f);
    }
  }
}
