/**
 * Génère galerie-calendrier.html : tous les visuels et Reels du calendrier, classés par date,
 * à partir de visuels-manifest.mjs et render-videos.mjs (aucune liste à tenir à la main).
 *
 *   node scripts/build-galerie.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { manifest, entryItems } from './visuels-manifest.mjs';
import { videoJobs } from './render-videos.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..');
const out = path.join(root, 'galerie-calendrier.html');

/** Heure et contenu de chaque jour (miroir de CALENDRIER-PUBLICATION-GUIDE-2026.md). */
const days = {
  '2026-11-03': ['19h00', 'Photo feed + story · publié', '01'],
  '2026-11-05': ['19h00', 'Photo feed + stories · programmé', '02'],
  '2026-11-06': ['19h00', 'Reel « Vendredi soir » + story · boost', '03'],
  '2026-11-08': ['19h00', 'Stories ×3 (compte à rebours 17/11)', '04'],
  '2026-11-11': ['19h00', 'Carrousel ×4 + story', '05'],
  '2026-11-12': ['19h00', 'Photo J-5 + story', '06'],
  '2026-11-13': ['19h00', 'Reel « Une envie » + story', '07'],
  '2026-11-15': ['19h00', 'Stories ×3', '08'],
  '2026-11-16': ['19h00', 'Photo J-1 + story', '09'],
  '2026-11-17': ['19h00 · 19h05 · 19h10', 'Ta vidéo face caméra · carrousel ×5 · stories ×3 · boost', '10'],
  '2026-11-18': ['19h00 · 19h10', 'Reel « La fréquence » · story compteur (vrai chiffre)', '10b'],
  '2026-11-19': ['19h00', 'Photo merci + story', '11'],
  '2026-11-20': ['19h00 · 19h10', 'Reel « Pourquoi The Loop » · sondage + compteur', '12'],
  '2026-11-25': ['19h00', 'Photo « Une règle » 1/3 + story', '14'],
  '2026-11-26': ['19h00', 'Carrousel ×5 + story · boost', '15'],
  '2026-11-27': ['19h00', 'Reel « Il y a un endroit pour ça » + story', '16'],
  '2026-11-30': ['19h00', 'Stories ×2', '17'],
  '2026-12-02': ['19h00', 'Photo « Une règle » 2/3 + story', '17'],
  '2026-12-03': ['19h00', 'Reel « Pas un annuaire » + story', '17'],
  '2026-12-04': ['19h00', 'Photo « Question du vendredi » + story', '17'],
  '2026-12-07': ['19h00', 'Stories terrain ×3', '18'],
  '2026-12-08': ['19h00', 'Stories terrain ×3', '18'],
  '2026-12-09': ['19h00 · 19h10', 'Photo « Une règle » 3/3 · stories terrain ×4', '17 · 18'],
  '2026-12-10': ['19h00', 'Stories terrain ×3', '18'],
  '2026-12-11': ['19h00', 'Stories terrain ×3', '18'],
  '2026-12-12': ['19h00', 'Stories terrain ×3', '18'],
  '2026-12-13': ['19h00', 'Stories terrain ×3', '18'],
  '2026-12-14': ['19h00', 'Stories terrain ×3 (seulement si un lieu a signé)', '18'],
  '2026-12-15': ['19h00', 'Stories terrain ×3', '18'],
  '2026-12-16': ['19h00', 'Stories terrain ×3', '18'],
  '2026-12-17': ['12h00 · 19h00', 'E-mail aux 100 premiers · ta vidéo (révèle le 24/12) · photo accès anticipé', '19'],
  '2026-12-19': ['19h00', 'Repartage des stories des invités', '19'],
  '2026-12-21': ['19h00', 'Stories J-3 ×2', '19'],
  '2026-12-23': ['19h00', 'Carrousel « Demain » ×4 + story', '19'],
  '2026-12-24': ['10h00 · 10h10 · 19h00', 'Ta vidéo « C’est ouvert » · stories ×5 · Reel « Cadeau de Noël » · boost', '20'],
  '2026-12-25': ['10h00', 'Photo Joyeux Noël + story', '21'],
  '2026-12-26': ['19h00', 'Photo merci + story (sticker question)', '21'],
  '2026-12-31': ['19h00', 'Photo fin d’année + story', '21'],
  '2027-01-01': ['10h00', 'Photo bonne année + story', '21'],
};

const locked = {
  '2026-11-03': ['POST_3-11_feed-PUBLIER-3nov.png', 'POST_3-11_reels-PUBLIER-3nov.png'],
  '2026-11-05': ['POST_5-11_citation-PUBLIER-5nov.png', 'POST_5-11_reels-PUBLIER-5nov.png', 'STORY_5-11_01_citation-l1.png', 'STORY_5-11_02_citation-l2.png', 'STORY_5-11_03_rappel-17nov.png'],
};

const byDate = new Map();
const templates = [];
const push = (date, item) => {
  if (!byDate.has(date)) byDate.set(date, []);
  byDate.get(date).push(item);
};

for (const [date, names] of Object.entries(locked)) {
  for (const name of names) push(date, { kind: 'img', src: `exports-png-v4-light/${name}`, name, locked: true });
}
for (const entry of manifest) {
  const folder = entry.outDir ?? 'exports-png-v4-light';
  for (const { name, date } of entryItems(entry)) {
    const item = { kind: 'img', src: `${folder}/${name}`, name, format: entry.format };
    if (date === null) templates.push(item);
    else push(date, item);
  }
}
for (const job of videoJobs) {
  const poster = manifest.flatMap(entryItems).find((i) => i.name.startsWith(job.prefix))?.name;
  push(job.date, { kind: 'video', src: `exports-mp4/${job.out}`, name: job.out, poster: poster && `exports-png-v4-light/${poster}` });
}
for (const date of Object.keys(days)) if (!byDate.has(date)) byDate.set(date, []);

for (const items of byDate.values()) {
  for (const item of items) {
    if (!fs.existsSync(path.join(root, item.src))) throw new Error(`Fichier manquant : ${item.src}`);
  }
}

const fmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const card = (item) => {
  const media = item.kind === 'video'
    ? `<video src="${esc(item.src)}" ${item.poster ? `poster="${esc(item.poster)}"` : ''} controls preload="none" playsinline></video>`
    : `<a href="${esc(item.src)}" target="_blank" rel="noopener"><img src="${esc(item.src)}" alt="${esc(item.name)}" loading="lazy" /></a>`;
  const badge = item.kind === 'video' ? '<span class="badge reel">Reel</span>'
    : item.locked ? '<span class="badge lock">Verrouillé</span>' : '';
  return `<figure class="${item.kind === 'video' || item.format === 'story' || /9x16|reels|STORY|FRAME|COVER/.test(item.name) ? 'tall' : 'feed'}">${media}<figcaption>${badge}<a href="${esc(item.src)}" download>${esc(item.name)}</a></figcaption></figure>`;
};

const sections = [...byDate.keys()].sort().map((date) => {
  const [heure, quoi, fiche] = days[date] ?? ['', '', ''];
  const items = byDate.get(date);
  const label = fmt.format(new Date(`${date}T12:00:00Z`));
  const body = items.length
    ? `<div class="grid">${items.map(card).join('')}</div>`
    : '<p class="empty">Pas de visuel à produire : contenu des invités.</p>';
  const reveal = date === '2026-12-17' ? '<span class="badge gold">Révélation du 24/12</span>' : '';
  return `<section id="d${date}">
  <header><h2>${esc(label.charAt(0).toUpperCase() + label.slice(1))}</h2>${reveal}
  <p><strong>${esc(heure)}</strong> · ${esc(quoi)}${fiche ? ` · fiche ${esc(fiche)}` : ''}</p></header>
  ${body}
</section>`;
});

const months = [...byDate.keys()].sort().reduce((acc, d) => {
  const m = d.slice(0, 7);
  if (!acc.includes(m)) acc.push(m);
  return acc;
}, []);
const monthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const nav = months.map((m) => {
  const first = [...byDate.keys()].sort().find((d) => d.startsWith(m));
  return `<a href="#d${first}">${esc(monthFmt.format(new Date(`${m}-15T12:00:00Z`)))}</a>`;
}).join('');

const total = [...byDate.values()].flat().length + templates.length;

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>The Loop — Galerie du calendrier de publication</title>
<!-- Fichier généré par scripts/build-galerie.mjs : ne pas modifier à la main. -->
<style>
  :root { --ink:#0A3A44; --teal:#0F7A8E; --gold:#C9A84C; --bg:#F4F8F9; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: Manrope, system-ui, -apple-system, Segoe UI, sans-serif; background:var(--bg); color:var(--ink); }
  .top { position:sticky; top:0; z-index:5; background:#fff; border-bottom:1px solid #dde8eb; padding:14px 20px; display:flex; flex-wrap:wrap; gap:12px 24px; align-items:baseline; }
  .top h1 { margin:0; font-size:18px; letter-spacing:.02em; }
  .top p { margin:0; font-size:13px; color:#5b7c84; }
  .top nav { display:flex; gap:14px; margin-left:auto; }
  .top nav a { font-size:12px; text-transform:uppercase; letter-spacing:.2em; color:var(--teal); text-decoration:none; font-weight:700; }
  main { max-width:1400px; margin:0 auto; padding:8px 20px 80px; }
  .rules { background:#fff; border:1px solid #dde8eb; border-radius:14px; padding:16px 20px; margin:20px 0; font-size:14px; line-height:1.6; }
  .rules b { color:var(--teal); }
  section { margin-top:34px; scroll-margin-top:80px; }
  section header { display:flex; flex-wrap:wrap; align-items:baseline; gap:6px 14px; border-bottom:2px solid var(--ink); padding-bottom:8px; margin-bottom:14px; }
  section h2 { margin:0; font-size:20px; }
  section header p { margin:0; font-size:14px; color:#38606a; width:100%; }
  .grid { display:flex; flex-wrap:wrap; gap:14px; align-items:flex-start; }
  figure { margin:0; background:#fff; border-radius:12px; padding:8px; box-shadow:0 2px 10px rgba(10,58,68,.08); }
  figure.tall img, figure.tall video { width:180px; aspect-ratio:9/16; object-fit:cover; }
  figure.feed img { width:224px; aspect-ratio:4/5; object-fit:cover; }
  figure img, figure video { display:block; border-radius:8px; background:#0A3A44; }
  figcaption { font-size:11px; margin-top:6px; max-width:224px; word-break:break-all; display:flex; flex-direction:column; gap:4px; }
  figcaption a { color:#38606a; text-decoration:none; }
  figcaption a:hover { text-decoration:underline; }
  .badge { align-self:flex-start; font-size:10px; text-transform:uppercase; letter-spacing:.2em; font-weight:800; padding:3px 8px; border-radius:999px; background:#e6f1f4; color:var(--teal); }
  .badge.reel { background:var(--ink); color:#fff; }
  .badge.lock { background:#eee; color:#777; }
  .badge.gold { background:var(--gold); color:#fff; }
  .empty { color:#7a959b; font-style:italic; margin:0; }
</style>
</head>
<body>
<div class="top">
  <h1>The Loop · calendrier de publication</h1>
  <p>${total} fichiers · heures de Conakry · cliquer sur un nom pour le télécharger</p>
  <nav>${nav}<a href="#modeles">Modèles</a></nav>
</div>
<main>
  <div class="rules">
    <b>19h00</b> par défaut (17/12 à 12h00, 24/12 · 25/12 · 1/1 à 10h00) · chaque post feed ou Reel est aussi partagé <b>en story</b> · publication croisée <b>Instagram</b>, lieu <b>Conakry</b> ·
    aucun lien avant le <b>17/11</b> · accès anticipé « <b>bientôt</b> » jusqu’au 17/12 · la date du <b>24 décembre</b> n’apparaît qu’<b>à partir du 17/12</b>.
    Légendes : <code>fiches/</code> · calendrier : <code>CALENDRIER-PUBLICATION-GUIDE-2026.md</code>.
  </div>
${sections.join('\n')}
<section id="modeles">
  <header><h2>Modèles réutilisables</h2><p>Sans année · pour les autres fêtes (voir <code>FEED-FETES-TEMPLATES-GUINEE.md</code>)</p></header>
  <div class="grid">${templates.map(card).join('')}</div>
</section>
</main>
</body>
</html>
`;

fs.writeFileSync(out, html);
console.log(`galerie-calendrier.html · ${byDate.size} jours · ${total} fichiers`);
