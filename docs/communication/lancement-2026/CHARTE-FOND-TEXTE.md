# Charte — fond « posts écrits » (validé)

## Quand l’utiliser
- **Acte A** (3 → 16/11) : toutes les **images** + cartes texte pour vidéos.
- **Posts texte** après 17/11 : J-x, citations, critères, CTA courts — **sans** capture app lisible.
- **Pas pour** : révélation app (≥ 17/12 pré-launch, 24/12 lancement) → captures nettes.

## Fichier source (version validée)
- HTML : `export-visuels-pack-acte-a-v4-light.html`
- **Style :** dégradé **v2** (`#ecf4f7 → #c8e3ec → #96c4d4`) + bandeau **Liste · 17 nov.** + stamp **BIENTÔT** + 4 piliers + signature (sans capture app).
- **Fichier #1 à poster :** `POST_3-11_feed-PUBLIER-3nov.png` (alias `POST_3-11_feed-final.png`).
- **Ne pas confondre :** `POST_3-11_feed-v2.png` = **uniquement** le fond teal (+3 %) — **aucun** bandeau / tampon / piliers. Comparaison visuelle : `GUIDE_DIFF_feed-v2-vs-PUBLIER-3nov.png`.

## Pourquoi tous les visuels changent en même temps ?
Un seul fichier **`export-visuels-pack-acte-a-v4-light.html`** contient **3 slides** (3/11 feed, Reels, 5/11). Quand on modifie le **fond** (CSS) et qu’on lance `export-slides-png-v4.mjs`, les PNG **`01_`, `02_`, `03_`** sont **regénérés** — même fond sur tout le pack.  
Les images vues **plus haut dans le chat** = anciennes captures à un instant T ; seuls comptent les fichiers **téléchargés** depuis `exports-png-v4-light/` après le dernier export.  
**Astuce :** enregistre sur ton tel avec un nom (`loop-3nov-v1.png`) quand tu valides une version.
- PNG : `exports-png-v4-light/` — `01_`, `02_`, `03_`
- Ignorer `COMPARAISON_NIVEAU_*` (tests).
- Regénérer : `node scripts/export-slides-png-v4.mjs`

## Recette visuelle
1. **Fond** : dégradé bleu-vert clair (#DFF0F4 → #B5DDE8 → teal light).
2. **Atmosphère** : capture app **blur 52px**, opacité ~0,42 (lumière, pas contenu).
3. **Overlay** : radial teal 20–28 %.
4. **Carte blanche** : bordure teal 12 %, ombre teal.
5. **Typo** : Manrope · titres #0A3A44 · surtitre #0F7A8E · accent #E6B93A.
6. **Squelettes** (option) : barres teal 8–12 % — « chargement » sans fiche.
7. **Watermark** : arc logo 7 % opacité.

## Nouveau texte (workflow)
1. Dupliquer une slide dans le HTML ou demander une export.
2. Changer `ey`, `h`, `p` uniquement.
3. Export PNG → photothèque → Facebook.

## Ce qui manque encore (volontairement ailleurs)
- **Chaleur humaine** → vidéos **6/11+** + **ta voix**.
- **Conakry réelle** → stories **7–16/12**.
- **Produit** → **17/12** mail 100, **24/12** public.
