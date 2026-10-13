# Visuels validés — lancement com 2026

Dossier unique : **`exports-png-v4-light/`**

## Acte A — validés (31 PNG)

| Date | Fichier | Usage |
|------|---------|--------|
| 3/11 | `POST_3-11_feed-PUBLIER-3nov.png` | Feed |
| 3/11 | `POST_3-11_reels-PUBLIER-3nov.png` | Reels / story |
| 5/11 | `POST_5-11_citation-PUBLIER-5nov.png` | Feed |
| 5/11 | `POST_5-11_reels-PUBLIER-5nov.png` | Reels / cover vidéo |
| 5/11 | `STORY_5-11_01` … `03_rappel-17nov.png` | Story / CapCut |
| 6/11 | `FRAME_0611_01` … `06_signature-fin.png` | Vidéo |
| 8/11 | `STORY_8-11_01` … `03_17nov.png` | Story |
| 11/11 | `CARROUSEL_11-11_01` … `04_en-clair-17nov.png` | Carrousel |
| 12/11 | `POST_12-11_J-5-PUBLIER.png` | Feed J-5 |
| 13/11 | `FRAME_1311_01` … `07_17nov.png` | Vidéo |
| 15/11 | `STORY_15-11_01` … `03_mardi-reserve.png` | Story |
| 16/11 | `POST_16-11_J-1-PUBLIER.png` | Feed J-1 |

## Acte B — 17/11 validé (16 PNG)

| Type | Fichiers |
|------|----------|
| Vidéo | `FRAME_1711_01_chaos.png` … `08_reserve.png` |
| Carrousel | `CARROUSEL_17-11_01_liste-ouverte.png` … `05_reserve.png` |
| Story | `STORY_17-11_01_ouvert.png` · `02_100-places.png` · `03_lien.png` |

Fiche : `fiches/10-2026-11-17.md`

## 19/11 validé (1 PNG)

| Date | Fichier |
|------|---------|
| 19/11 | `POST_19-11_merci-PUBLIER.png` |

Regénérer : `node scripts/export-merci-1911.mjs` · Fiche : `fiches/11-2026-11-19.md`

## 21/11 validé (6 PNG)

| Type | Fichiers |
|------|----------|
| Vidéo | `FRAME_2111_01_conakry-avance.png` … `06_reserve.png` |

Regénérer : `node scripts/export-video-2111-frames.mjs` · Fiche : `fiches/12-2026-11-21.md`

## 22/11 validé (2 PNG)

| Type | Fichiers |
|------|----------|
| Story | `STORY_22-11_01_sondage.png` · `STORY_22-11_02_reserve.png` |

Regénérer : `node scripts/export-story-2211.mjs` · Fiche : `fiches/13-2026-11-22.md`

## 25/11 validé (1 PNG)

| Date | Fichier |
|------|---------|
| 25/11 | `POST_25-11_regle-1-PUBLIER.png` |

Regénérer : `node scripts/export-regle-2511.mjs` · Fiche : `fiches/14-2026-11-25.md`

## 26/11 validé (5 PNG)

| Type | Fichiers |
|------|----------|
| Carrousel | `CARROUSEL_26-11_01_spots.png` … `05_reserve.png` |

Regénérer : `node scripts/export-carousel-2611.mjs` · Fiche : `fiches/15-2026-11-26.md`

## 28/11 validé (5 PNG)

| Type | Fichiers |
|------|----------|
| Vidéo | `FRAME_2811_01_monnaie.png` … `05_reserve.png` |

Regénérer : `node scripts/export-video-2811-frames.mjs` · Fiche : `fiches/16-2026-11-28.md`

## Lot A — validé (10 PNG) · 30/11 → 9/12

| Date | Fichiers |
|------|----------|
| 30/11 | `STORY_30-11_01_signature.png` · `STORY_30-11_02_lien.png` |
| 2/12 | `POST_02-12_regle-2-PUBLIER.png` |
| 4/12 | `POST_04-12_J-20-PUBLIER.png` |
| 5/12 | `FRAME_0512_01_pas-tout-conakry.png` … `04_reserve.png` |
| 9/12 | `POST_09-12_regle-3-PUBLIER.png` |

Regénérer le lot : `node scripts/export-lot-a-nov-dec.mjs` · Fiche : `fiches/17-LOT-A-30-11-09-12.md` · Plan : `PLAN-LOTS-PUBLICATION.md`

## Lot B — validé (31 PNG) · terrain 7–16/12

Préfixe `STORY_07-12_*` … `STORY_16-12_*` · fiche `fiches/18-LOT-B-terrain-7-16.md`  
Regénérer : `node scripts/export-terrain-7-16.mjs`

## Lot C — à valider (7 PNG) · 17/12 · 21/12 · 23/12

| Date | Fichiers |
|------|----------|
| 17/12 | `POST_17-12_prelaunch-PUBLIER.png` |
| 21/12 | `STORY_21-12_01_j-3.png` · `STORY_21-12_02_noel.png` |
| 23/12 | `CARROUSEL_23-12_01_24dec.png` … `04_lien.png` |

Regénérer : `node scripts/export-lot-c-dec.mjs` · Fiche : `fiches/19-LOT-C-17-23-12.md`

**Lot D :** 24/12 lancement (vidéo + stories)

**Montages .mp4** (CapCut) : 5/11, 6/11, 13/11, 17/11, 21/11, 28/11, **5/12** + lancement 24/12 (Lot D).
