/**
 * 17/11 · « Vendredi soir · le scroll » : montage complet + voix off féminine (synthèse) + sous-titres SRT.
 *
 *   pip install edge-tts
 *   node scripts/render-video-1711-voix.mjs
 *
 * Entrées (video-1711-montage/) : SCROLL_reseaux-bulles.mp4, SEARCH_recherche-efface.mp4,
 * APP_fragment-seuil-com.png, AFFICHE_1711_02 → 05.
 * Sorties : VIDEO_17-11_vendredi-scroll_VOIX.mp4 + VIDEO_17-11_vendredi-scroll.srt
 */
import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const montage = path.join(dir, '..', 'video-1711-montage');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v1711-'));
const W = 1080;
const H = 1920;
const FPS = 30;
const FADE = 0.35;
const VOICE = 'fr-FR-VivienneMultilingualNeural';
const RATE = '-8%';

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const ffmpeg = (args) => run('ffmpeg', ['-v', 'error', '-y', ...args]);
const duration = (f) => Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]));
const m = (f) => path.join(montage, f);
const t = (f) => path.join(tmp, f);

// --- Voix off ---------------------------------------------------------------
const lines = {
  a: 'Ce soir, je cherche un plan pour le week-end.',
  b: 'Des posts, des stories, des reels…',
  c: 'Toujours les mêmes endroits. Ou ce spot dont je ne retrouve plus le nom.',
  d: 'Trop de bruit. Peu de repères.',
  e1: "The Loop, c'est un guide sélectif pour Conakry.",
  e2: 'Spots, agenda, parcours, outils : en clair.',
  f: "Aujourd'hui, la liste est ouverte. Les cent premiers inscrits entrent avant tout le monde.",
  g: 'Premiers inscrits, premiers invités.',
  h: 'Le lien est juste en dessous. Réserve ta place.',
};
const vo = {};
for (const [k, text] of Object.entries(lines)) {
  const mp3 = t(`vo_${k}.mp3`);
  run('python3', ['-m', 'edge_tts', '--voice', VOICE, `--rate=${RATE}`, '--text', text, '--write-media', mp3]);
  vo[k] = { file: mp3, dur: duration(mp3), text };
}

// --- Durées des plans (calées sur la voix) ----------------------------------
const cue = [];
const place = (k, at) => { cue.push({ k, at }); return at + vo[k].dur; };

const segs = [];
const addSeg = (name, dur) => {
  const start = segs.length ? segs.at(-1).start + segs.at(-1).dur - FADE : 0;
  segs.push({ name, dur, start });
  return start;
};

let s = addSeg('scroll', 9);
let end = place('a', s + 2.2);
end = place('b', Math.max(end + 0.4, s + 5.6));

s = addSeg('search', 0);
end = place('c', Math.max(s + 0.5, end + 0.45));
end = place('d', end + 0.45);
segs.at(-1).dur = end - s + 0.6;

s = addSeg('fragment', 8.5);

s = addSeg('repere', 0);
end = place('e1', s + 0.5);
end = place('e2', end + 0.35);
segs.at(-1).dur = end - s + 0.8;

s = addSeg('liste', 0);
end = place('f', s + 0.4);
segs.at(-1).dur = end - s + 0.8;

s = addSeg('invites', 0);
end = place('g', s + 0.35);
segs.at(-1).dur = end - s + 0.7;

s = addSeg('reserve', 0);
end = place('h', s + 0.4);
segs.at(-1).dur = end - s + 1.8;

const total = segs.at(-1).start + segs.at(-1).dur;

// --- Textes à l'écran (PNG transparents) -----------------------------------
const overlays = [
  { name: 'ov_vendredi', html: '<div class="tag">Vendredi · 19h · Conakry</div>', top: 560 },
  { name: 'ov_weekend', html: '<div class="pill">Un plan pour<br>le week-end&nbsp;?</div>', top: 520 },
  { name: 'ov_ou', html: '<div class="pill">Où c’était déjà…&nbsp;?</div>', top: 640 },
];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
for (const o of overlays) {
  await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@700;800&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;width:${W}px;height:${H}px;background:transparent;font-family:Manrope,sans-serif}
  .wrap{position:absolute;left:0;right:0;top:${o.top}px;display:flex;justify-content:center;text-align:center}
  .pill{background:#fff;color:#0a3a44;font-size:76px;font-weight:800;line-height:1.12;padding:40px 56px;border-radius:36px;box-shadow:0 18px 50px rgba(10,58,68,.28);border:3px solid rgba(230,185,58,.6)}
  .tag{background:linear-gradient(90deg,#0a3a44,#0f7a8e);color:#fff;font-size:46px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;padding:30px 48px;border-radius:999px;box-shadow:0 18px 50px rgba(10,58,68,.3)}
</style></head><body><div class="wrap">${o.html}</div></body></html>`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: t(`${o.name}.png`), omitBackground: true });
}
await browser.close();

// --- Plans vidéo -------------------------------------------------------------
const enc = ['-r', String(FPS), '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-an'];
const seg = (name) => segs.find((x) => x.name === name);
const fadeIn = (o, a, b) => `[${o}]format=rgba,fade=t=in:st=${a}:d=0.3:alpha=1,fade=t=out:st=${b - 0.3}:d=0.3:alpha=1[${o}f]`;

// Scroll : on retire les bandes intégrées au fichier, puis textes CapCut.
{
  const d = seg('scroll').dur;
  ffmpeg([
    '-i', m('SCROLL_reseaux-bulles.mp4'),
    '-loop', '1', '-t', String(d), '-i', t('ov_vendredi.png'),
    '-loop', '1', '-t', String(d), '-i', t('ov_weekend.png'),
    '-filter_complex',
    `[0:v]crop=886:1585:96:172,scale=${W}:${H},setsar=1,fps=${FPS},tpad=stop_mode=clone:stop_duration=1,trim=0:${d}[v];` +
    `${fadeIn('1:v', 0.2, 2.2)};${fadeIn('2:v', 2.3, d)};` +
    `[v][1:vf]overlay=0:0:enable='between(t,0,2.2)'[v1];[v1][2:vf]overlay=0:0:enable='between(t,2.3,${d})'[out]`,
    '-map', '[out]', '-t', String(d), ...enc, t('s_scroll.mp4'),
  ]);
}

// Recherche : 0,5 → 15,5 s accélérée ; liste de suggestions floutée (comptes suivis, historique, noms de lieux).
{
  const d = seg('search').dur;
  const src = m('SEARCH_recherche-efface.mp4');
  const a = 0.5;
  const b = Math.min(15.5, duration(src));
  const speed = (b - a) / d;
  const pw = 886;
  const list = { y: 222, h: 1043 };
  ffmpeg([
    '-ss', String(a), '-to', String(b), '-i', src,
    '-loop', '1', '-t', String(d), '-i', t('ov_ou.png'),
    '-filter_complex',
    `[0:v]setpts=(PTS-STARTPTS)/${speed},fps=${FPS},scale=${pw}:${H},setsar=1,split=3[p][q][bgsrc];` +
    `[bgsrc]scale=${W}:${Math.round((H * W) / pw)},crop=${W}:${H},boxblur=40:2,eq=brightness=-0.06[bg];` +
    `[q]crop=${pw}:${list.h}:0:${list.y},boxblur=14:3[blur];` +
    `[p][blur]overlay=0:${list.y}[phone];` +
    `[bg][phone]overlay=(W-w)/2:0[v];` +
    `${fadeIn('1:v', 0.4, d)};[v][1:vf]overlay=0:0[out]`,
    '-map', '[out]', '-t', String(d), ...enc, t('s_search.mp4'),
  ]);
}

// Fragment : bouton « Découvrir l’événement » (fictif) recouvert par un morceau du fond, zoom lent.
{
  const d = seg('fragment').dur;
  const frames = Math.round(d * FPS);
  ffmpeg([
    '-loop', '1', '-i', m('APP_fragment-seuil-com.png'),
    '-filter_complex',
    `[0:v]scale=${W}:${H},setsar=1,split[a][b];[b]crop=${W}:190:0:1680[patch];[a][patch]overlay=0:1430,` +
    `scale=${W * 2}:${H * 2},zoompan=z='1+0.06*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih*0.42-(ih/zoom*0.42)':d=${frames}:s=${W}x${H}:fps=${FPS}[out]`,
    '-map', '[out]', '-frames:v', String(frames), ...enc, t('s_fragment.mp4'),
  ]);
}

// Affiches : léger zoom pour éviter l’image figée.
for (const [name, file] of [
  ['repere', 'AFFICHE_1711_02_un-repere.png'],
  ['liste', 'AFFICHE_1711_03_liste-ouverte.png'],
  ['invites', 'AFFICHE_1711_04_premiers-invites.png'],
  ['reserve', 'AFFICHE_1711_05_reserve.png'],
]) {
  const frames = Math.round(seg(name).dur * FPS);
  ffmpeg([
    '-loop', '1', '-i', m(file),
    '-filter_complex',
    `[0:v]scale=${W * 2}:${H * 2},setsar=1,zoompan=z='1+0.03*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS}[out]`,
    '-map', '[out]', '-frames:v', String(frames), ...enc, t(`s_${name}.mp4`),
  ]);
}

// Enchaînement en fondus.
{
  const inputs = segs.flatMap((x) => ['-i', t(`s_${x.name}.mp4`)]);
  let chain = '';
  let prev = '0:v';
  for (let i = 1; i < segs.length; i++) {
    const out = i === segs.length - 1 ? 'vout' : `x${i}`;
    chain += `[${prev}][${i}:v]xfade=transition=fade:duration=${FADE}:offset=${segs[i].start.toFixed(3)}[${out}];`;
    prev = out;
  }
  ffmpeg([...inputs, '-filter_complex', chain.slice(0, -1), '-map', '[vout]', ...enc, t('video.mp4')]);
}

// --- Son -----------------------------------------------------------------------
// Notifications pendant le scroll, silence sur le Fragment, nappe calme à partir de « Un repère », baissée sous la voix.
{
  const sr = 48000;
  const notif = [0.7, 3.1, 5.3, 7.4];
  const ding = (at, i) =>
    `aevalsrc='0.22*(sin(2*PI*1568*t)+0.6*sin(2*PI*2349*t))*exp(-18*t)':s=${sr}:d=0.35,adelay=${Math.round(at * 1000)}|${Math.round(at * 1000)},apad=whole_dur=${total}[n${i}]`;
  const padStart = seg('repere').start;
  const padDur = total - padStart;
  const pad =
    `aevalsrc='0.05*(sin(2*PI*220*t)+0.8*sin(2*PI*277.18*t)+0.7*sin(2*PI*329.63*t)+0.4*sin(2*PI*415.30*t))*(0.75+0.25*sin(2*PI*0.18*t))':s=${sr}:d=${padDur},` +
    `lowpass=f=1400,afade=t=in:d=2.5,afade=t=out:st=${padDur - 2.5}:d=2.5,adelay=${Math.round(padStart * 1000)}|${Math.round(padStart * 1000)},apad=whole_dur=${total}[pad]`;
  const fragStart = seg('fragment').start;
  const room =
    `aevalsrc='0.012*sin(2*PI*110*t)*(0.7+0.3*sin(2*PI*0.25*t))':s=${sr}:d=${seg('fragment').dur},` +
    `afade=t=in:d=1.5,afade=t=out:st=${seg('fragment').dur - 1.5}:d=1.5,adelay=${Math.round(fragStart * 1000)}|${Math.round(fragStart * 1000)},apad=whole_dur=${total}[room]`;

  const voInputs = cue.flatMap((c) => ['-i', vo[c.k].file]);
  const voChains = cue
    .map((c, i) => `[${i}:a]aresample=${sr},aformat=channel_layouts=mono,adelay=${Math.round(c.at * 1000)},apad=whole_dur=${total}[v${i}]`)
    .join(';');
  const voMix = `${cue.map((_, i) => `[v${i}]`).join('')}amix=inputs=${cue.length}:normalize=0,volume=1.15,asplit[voice][key]`;
  const fx = `${notif.map(ding).join(';')};${pad};${room};${notif.map((_, i) => `[n${i}]`).join('')}[pad][room]amix=inputs=${notif.length + 2}:normalize=0[bed]`;
  const duck = `[bed][key]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=350[bedd]`;
  ffmpeg([
    ...voInputs,
    '-filter_complex',
    `${voChains};${voMix};${fx};${duck};[voice][bedd]amix=inputs=2:normalize=0,loudnorm=I=-15:TP=-1.5:LRA=9,aformat=channel_layouts=stereo[aout]`,
    '-map', '[aout]', '-t', String(total), '-ar', String(sr), '-c:a', 'pcm_s16le', t('audio.wav'),
  ]);
}

const out = m('VIDEO_17-11_vendredi-scroll_VOIX.mp4');
ffmpeg(['-i', t('video.mp4'), '-i', t('audio.wav'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', out]);

// --- Sous-titres -------------------------------------------------------------
const ts = (x) => {
  const ms = Math.round(x * 1000);
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
const srt = cue.map((c, i) => `${i + 1}\n${ts(c.at)} --> ${ts(c.at + vo[c.k].dur)}\n${vo[c.k].text.replace("'", '’')}\n`).join('\n');
fs.writeFileSync(m('VIDEO_17-11_vendredi-scroll.srt'), srt);

console.log(`OK ${path.relative(process.cwd(), out)} · ${total.toFixed(1)} s`);
for (const x of segs) console.log(`  ${x.name.padEnd(9)} ${x.start.toFixed(2)} → ${(x.start + x.dur).toFixed(2)}`);
fs.rmSync(tmp, { recursive: true, force: true });
