import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export function stitchSmooth({ pngPaths, durations, outFile }) {
  if (pngPaths.length !== durations.length) {
    throw new Error('pngPaths et durations doivent avoir la même longueur');
  }
  for (const p of pngPaths) {
    if (!fs.existsSync(p)) throw new Error(`PNG manquant: ${p}`);
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const tmpDir = path.join(path.dirname(outFile), `.tmp-stitch-${path.basename(outFile, '.mp4')}`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  function run(cmd, args) {
    const r = spawnSync(cmd, args, { stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }

  const segPaths = [];
  for (let i = 0; i < pngPaths.length; i++) {
    const duration = durations[i];
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
      '-y', '-loop', '1', '-i', pngPaths[i],
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
}

/** Durée par défaut (~30–40 s) si non précisé par plan. */
export function defaultDurations(count, totalSec = 32) {
  const d = totalSec / count;
  return Array.from({ length: count }, () => Math.round(d * 10) / 10);
}
