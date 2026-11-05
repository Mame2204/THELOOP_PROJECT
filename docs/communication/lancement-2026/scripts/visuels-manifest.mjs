/**
 * Source unique des visuels publiés (hors 3/11 et 5/11, déjà programmés : export-slides-png-v4.mjs).
 * Chaque entrée = un fichier HTML ; `names[i]` = PNG de la i-ème `.slide`.
 * `date` sert à la galerie ; un nom peut être [nom, date] quand un HTML couvre plusieurs jours.
 */

const terrain = [
  ['07-12', ['conakry', 'guide', 'selection']],
  ['08-12', ['rencontres', 'ecouter', 'valeur']],
  ['09-12', ['criteres', 'calme', 'service', 'experience']],
  ['10-12', ['agenda', 'compte', 'bruit']],
  ['11-12', ['outils', 'quotidien', 'centralise']],
  ['12-12', ['parcours', 'organiser', 'temps']],
  ['13-12', ['acces', 'premiers-inscrits', 'premiers-invites']],
  ['14-12', ['partenaires', 'adresses', 'rejoignent']],
  ['15-12', ['reglages', 'tests', 'invitations']],
  ['16-12', ['precise', 'inscrit-tot', 'boite-mail']],
];

const compteur = [90, 80, 70, 60, 50, 40, 30, 20, 10].map((n) => `STORY_COMPTEUR_reste-${n}.png`);

export const manifest = [
  {
    date: '2026-11-06', html: 'export-visuels-video-0611.html', format: 'story',
    names: ['FRAME_0611_01_vendredi-19h.png', 'FRAME_0611_02_question-weekend.png', 'FRAME_0611_03_quatre-reponses.png', 'FRAME_0611_04_moins-de-temps.png', 'FRAME_0611_05_the-loop-bientot.png', 'FRAME_0611_06_signature-fin.png'],
  },
  {
    date: '2026-11-08', html: 'export-visuels-story-0811.html', format: 'story',
    names: ['STORY_8-11_01_marque.png', 'STORY_8-11_02_piliers.png', 'STORY_8-11_03_17nov.png'],
  },
  {
    date: '2026-11-11', html: 'export-visuels-carousel-1111.html', format: 'feed',
    names: ['CARROUSEL_11-11_01_ne-liste-pas-tout.png', 'CARROUSEL_11-11_02_respire.png', 'CARROUSEL_11-11_03_plus-value.png', 'CARROUSEL_11-11_04_en-clair-17nov.png'],
  },
  { date: '2026-11-12', html: 'export-visuels-j5-1211.html', format: 'feed', names: ['POST_12-11_J-5-PUBLIER.png'] },
  {
    date: '2026-11-13', html: 'export-visuels-video-1311.html', format: 'story',
    names: ['FRAME_1311_01_envie.png', 'FRAME_1311_02_calme.png', 'FRAME_1311_03_peu-de-bruit.png', 'FRAME_1311_04_pas-ca.png', 'FRAME_1311_05_selectif-clair-fr.png', 'FRAME_1311_06_piliers.png', 'FRAME_1311_07_17nov.png'],
  },
  {
    date: '2026-11-15', html: 'export-visuels-story-1511.html', format: 'story',
    names: ['STORY_15-11_01_J-2.png', 'STORY_15-11_02_100-places.png', 'STORY_15-11_03_mardi-reserve.png'],
  },
  { date: '2026-11-16', html: 'export-visuels-j1-1611.html', format: 'feed', names: ['POST_16-11_J-1-PUBLIER.png'] },
  {
    date: '2026-11-17', html: 'export-visuels-covers-fondatrice.html', format: 'story',
    names: [['COVER_17-11_liste-ouverte.png', '2026-11-17'], ['COVER_17-12_invitations.png', '2026-12-17'], ['COVER_24-12_cest-ouvert.png', '2026-12-24']],
  },
  {
    date: '2026-11-17', html: 'export-visuels-carousel-1711.html', format: 'feed',
    names: ['CARROUSEL_17-11_01_liste-ouverte.png', 'CARROUSEL_17-11_02_pourquoi.png', 'CARROUSEL_17-11_03_piliers.png', 'CARROUSEL_17-11_04_selectif.png', 'CARROUSEL_17-11_05_reserve.png'],
  },
  {
    date: '2026-11-17', html: 'export-visuels-story-1711.html', format: 'story',
    names: ['STORY_17-11_01_ouvert.png', 'STORY_17-11_02_100-places.png', 'STORY_17-11_03_lien.png'],
  },
  {
    date: '2026-11-18', html: 'export-visuels-video-1811.html', format: 'story',
    names: ['FRAME_1811_01_chaos.png', 'FRAME_1811_02_tout-crie.png', 'FRAME_1811_03_peu-guident.png', 'FRAME_1811_04_repere.png', 'FRAME_1811_05_piliers-flou.png', 'FRAME_1811_06_logo.png', 'FRAME_1811_07_100-places.png', 'FRAME_1811_08_reserve.png'],
  },
  {
    date: '2026-11-18', html: 'export-visuels-story-compteur.html', format: 'story',
    names: [...compteur, 'STORY_COMPTEUR_complet.png'],
  },
  { date: '2026-11-19', html: 'export-visuels-merci-1911.html', format: 'feed', names: ['POST_19-11_merci-PUBLIER.png'] },
  {
    date: '2026-11-20', html: 'export-visuels-video-2011.html', format: 'story',
    names: ['FRAME_2011_01_conakry-avance.png', 'FRAME_2011_02_disperses.png', 'FRAME_2011_03_bruit.png', 'FRAME_2011_04_piliers.png', 'FRAME_2011_05_selectif.png', 'FRAME_2011_06_reserve.png'],
  },
  { date: '2026-11-20', html: 'export-visuels-story-2011.html', format: 'story', names: ['STORY_20-11_01_sondage.png'] },
  { date: '2026-11-25', html: 'export-visuels-regle-2511.html', format: 'feed', names: ['POST_25-11_regle-1-PUBLIER.png'] },
  {
    date: '2026-11-26', html: 'export-visuels-carousel-2611.html', format: 'feed',
    names: ['CARROUSEL_26-11_01_spots.png', 'CARROUSEL_26-11_02_agenda.png', 'CARROUSEL_26-11_03_parcours.png', 'CARROUSEL_26-11_04_outils.png', 'CARROUSEL_26-11_05_reserve.png'],
  },
  {
    date: '2026-11-27', html: 'export-visuels-video-2711.html', format: 'story',
    names: ['FRAME_2711_01_monnaie.png', 'FRAME_2711_02_creneau.png', 'FRAME_2711_03_ce-soir.png', 'FRAME_2711_04_endroit.png', 'FRAME_2711_05_reserve.png'],
  },
  { date: '2026-11-30', html: 'export-visuels-story-3011.html', format: 'story', names: ['STORY_30-11_01_signature.png', 'STORY_30-11_02_lien.png'] },
  { date: '2026-12-02', html: 'export-visuels-regle-0212.html', format: 'feed', names: ['POST_02-12_regle-2-PUBLIER.png'] },
  {
    date: '2026-12-03', html: 'export-visuels-video-0312.html', format: 'story',
    names: ['FRAME_0312_01_pas-tout-conakry.png', 'FRAME_0312_02_repere.png', 'FRAME_0312_03_piliers-flou.png', 'FRAME_0312_04_reserve.png'],
  },
  { date: '2026-12-04', html: 'export-visuels-question-0412.html', format: 'feed', names: ['POST_04-12_question-PUBLIER.png'] },
  {
    date: '2026-12-07', html: 'export-visuels-terrain-0712-1612.html', format: 'story',
    names: terrain.flatMap(([day, slugs]) => slugs.map((slug, i) => [
      `STORY_${day}_${String(i + 1).padStart(2, '0')}_${slug}.png`,
      `2026-${day.slice(3)}-${day.slice(0, 2)}`,
    ])),
  },
  { date: '2026-12-09', html: 'export-visuels-regle-0912.html', format: 'feed', names: ['POST_09-12_regle-3-PUBLIER.png'] },
  { date: '2026-12-17', html: 'export-visuels-prelaunch-1712.html', format: 'feed', names: ['POST_17-12_prelaunch-PUBLIER.png'] },
  { date: '2026-12-21', html: 'export-visuels-story-2112.html', format: 'story', names: ['STORY_21-12_01_j-3.png', 'STORY_21-12_02_noel.png'] },
  {
    date: '2026-12-23', html: 'export-visuels-carousel-2312.html', format: 'feed',
    names: ['CARROUSEL_23-12_01_24dec.png', 'CARROUSEL_23-12_02_piliers.png', 'CARROUSEL_23-12_03_signature.png', 'CARROUSEL_23-12_04_lien.png'],
  },
  {
    date: '2026-12-24', html: 'export-visuels-video-2412.html', format: 'story', santaHat: true,
    names: ['FRAME_2412_01_24dec.png', 'FRAME_2412_02_repere.png', 'FRAME_2412_03_app.png', 'FRAME_2412_04_logo.png', 'FRAME_2412_05_disponible.png', 'FRAME_2412_06_signature.png'],
  },
  {
    date: '2026-12-24', html: 'export-visuels-story-2412.html', format: 'story', santaHat: true,
    names: ['STORY_24-12_01_ouvert.png', 'STORY_24-12_02_lien.png', 'STORY_24-12_03_piliers.png', 'STORY_24-12_04_signature.png', 'STORY_24-12_05_merci.png'],
  },
  {
    date: '2026-12-25', html: 'export-visuels-template-fete.html', format: 'feed',
    names: [
      ['TEMPLATE_fete_neutre-PUBLIER.png', null],
      ['TEMPLATE_fete_noel-PUBLIER.png', '2026-12-25'],
      ['TEMPLATE_fete_fin-annee-PUBLIER.png', '2026-12-31'],
      ['TEMPLATE_fete_bonne-annee-PUBLIER.png', '2027-01-01'],
    ],
  },
  {
    date: '2026-12-25', html: 'export-visuels-template-fete-story.html', format: 'story', outDir: 'exports-png-telephone-fete',
    names: [
      ['FETE_neutre_9x16_TELEPHONE.png', null],
      ['FETE_noel_9x16_TELEPHONE.png', '2026-12-25'],
      ['FETE_fin-annee_9x16_TELEPHONE.png', '2026-12-31'],
      ['FETE_bonne-annee_9x16_TELEPHONE.png', '2027-01-01'],
    ],
  },
  { date: '2026-12-26', html: 'export-visuels-merci-2612.html', format: 'feed', names: ['POST_26-12_merci-PUBLIER.png', 'STORY_26-12_merci.png'] },
];

/** PNG déjà programmés (3/11 et 5/11) : jamais supprimés par `--clean`. */
export const lockedPngs = [
  'POST_3-11_feed-PUBLIER-3nov.png',
  'POST_3-11_reels-PUBLIER-3nov.png',
  'POST_5-11_citation-PUBLIER-5nov.png',
  'POST_5-11_reels-PUBLIER-5nov.png',
  'STORY_5-11_01_citation-l1.png',
  'STORY_5-11_02_citation-l2.png',
  'STORY_5-11_03_rappel-17nov.png',
];
export const lockedPrefixes = ['01__', '02__', '03__', '04__', '05__', '06__', '07__'];

export function entryItems(entry) {
  return entry.names.map((n) => (Array.isArray(n) ? { name: n[0], date: n[1] } : { name: n, date: entry.date }));
}
