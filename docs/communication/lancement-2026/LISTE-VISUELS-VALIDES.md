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

## 25/11 — à valider (1 PNG)

| Date | Fichier |
|------|---------|
| 25/11 | `POST_25-11_regle-1-PUBLIER.png` |

Regénérer : `node scripts/export-regle-2511.mjs` · Fiche : `fiches/14-2026-11-25.md`

---

Regénérer (Acte A) : voir scripts `export-slides-png-v4.mjs`, `export-video-0611-frames.mjs`, `export-story-0811.mjs`, `export-carousel-1111.mjs`, `export-j5-1211.mjs`, `export-video-1311-frames.mjs`, `export-story-1511.mjs`, `export-j1-1611.mjs`

Regénérer 17/11 : `export-video-1711-frames.mjs` · `export-carousel-1711.mjs` · `export-story-1711.mjs`

**Pas encore validé côté montage :** export **.mp4** CapCut (5/11, 6/11, 13/11, 17/11, **21/11**).
