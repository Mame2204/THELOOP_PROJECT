# 6/11 — montage sans prise de tête

## Ce qui est **obligatoire** vs **non**

| | Obligatoire ? |
|---|----------------|
| **Voix off** | **Non** — option dans `video-0611-dilemme-weekend.md` |
| **Retaper du texte à l’écran** | **Non** — tout est **déjà sur les PNG** `FRAME_0611_*` |
| **CapCut** | **Non** |
| **B-roll plan 4** | **Non** — le PNG suffit |
| **Musique** | **Non** (Reels sans musique = OK ; tu peux en ajouter plus tard) |
| **Un mouvement le 6/11** | **Recommandé** : une vidéo **ou** un plan B ci-dessous |

Le calendrier vise une **vidéo** ce jour-là, pas un montage « cinéma ».

---

## Option A — Vidéo prête dans le repo (0 CapCut)

```bash
cd docs/communication/lancement-2026
node scripts/stitch-video-0611.mjs --smooth
```

Fichier : **`exports-mp4/VIDEO_0611_dilemme-PUBLIER.mp4`**

- Zoom léger + fondus entre plans  
- Texte = celui des frames (Vendredi 19h, question week-end, etc.)  
- Publier en **Reels** + légende fiche `03-2026-11-06.md` · **pas de lien**

Version plus sèche : `node scripts/stitch-video-0611.mjs` → `…-BROUILLON.mp4`

---

## Option B — Pas de vidéo du tout (plan secours)

Publier **6 stories** à la suite le même jour (ordre 01 → 06), une frame = une story :

1. `FRAME_0611_01_vendredi-19h.png`  
2. `FRAME_0611_02_question-weekend.png`  
3. … jusqu’à `06_signature-fin.png`  

Même légende sur la **dernière** story ou en commentaire épinglé sur un post feed **optionnel** (image plan 6 ou 5).

Moins « Reels », mais **valide** pour tenir l’Acte A si le montage te bloque.

---

## Option C — CapCut en 2 minutes (optionnel)

Importer **`VIDEO_0611_dilemme-PUBLIER.mp4`** → une piste **musique** (sans paroles) → export.  
**Ne pas** rajouter de texte (doublon).

---

## Rappel marque

- **Pas de lien** avant le 17/11  
- Pas d’app / enseigne lisible sur tes plans perso si tu en ajoutes plus tard
