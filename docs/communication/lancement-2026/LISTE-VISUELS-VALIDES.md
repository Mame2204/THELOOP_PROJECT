# Visuels validés — Acte A (→ 13/11)

Dossier unique : **`exports-png-v4-light/`** (27 fichiers, pas de doublons).

| Date | Fichier | Usage |
|------|---------|--------|
| 3/11 | `POST_3-11_feed-PUBLIER-3nov.png` | Feed |
| 3/11 | `POST_3-11_reels-PUBLIER-3nov.png` | Reels / story |
| 5/11 | `POST_5-11_citation-PUBLIER-5nov.png` | Feed |
| 5/11 | `POST_5-11_reels-PUBLIER-5nov.png` | Reels / cover vidéo |
| 5/11 | `STORY_5-11_01_citation-l1.png` | Story / CapCut plan 1 |
| 5/11 | `STORY_5-11_02_citation-l2.png` | Story / CapCut plan 2 |
| 5/11 | `STORY_5-11_03_rappel-17nov.png` | Story / CapCut plan 3 |
| 6/11 | `FRAME_0611_01_vendredi-19h.png` … `06_signature-fin.png` | Vidéo CapCut |
| 8/11 | `STORY_8-11_01_marque.png` | Story 1/3 |
| 8/11 | `STORY_8-11_02_piliers.png` | Story 2/3 |
| 8/11 | `STORY_8-11_03_17nov.png` | Story 3/3 |
| 11/11 | `CARROUSEL_11-11_01_ne-liste-pas-tout.png` | Carrousel 1/4 |
| 11/11 | `CARROUSEL_11-11_02_respire.png` | Carrousel 2/4 |
| 11/11 | `CARROUSEL_11-11_03_plus-value.png` | Carrousel 3/4 |
| 11/11 | `CARROUSEL_11-11_04_en-clair-17nov.png` | Carrousel 4/4 |
| 12/11 | `POST_12-11_J-5-PUBLIER.png` | Feed J-5 |
| 13/11 | `FRAME_1311_01_envie.png` … `07_17nov.png` | Vidéo CapCut (7 plans) |

Regénérer #1–#2 : `node scripts/export-slides-png-v4.mjs`  
Regénérer #3 : `node scripts/export-video-0611-frames.mjs`  
Regénérer story 8/11 : `node scripts/export-story-0811.mjs`  
Regénérer carrousel 11/11 : `node scripts/export-carousel-1111.mjs`  
Regénérer J-5 12/11 : `node scripts/export-j5-1211.mjs`  
Regénérer vidéo 13/11 : `node scripts/export-video-1311-frames.mjs`

### Story 15/11 + J-1 16/11 (à valider)
`STORY_15-11_01_J-2.png` · `02_100-places.png` · `03_mardi-reserve.png` · `POST_16-11_J-1-PUBLIER.png`

Regénérer : `node scripts/export-story-1511.mjs` · `node scripts/export-j1-1611.mjs`

**Pas encore validé par toi :** export **.mp4** après montage CapCut (vidéos 5/11, 6/11, 13/11).
