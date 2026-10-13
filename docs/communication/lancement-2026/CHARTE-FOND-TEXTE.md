# Charte — fond « posts écrits » (validé)

## Quand l’utiliser
- **Acte A** (3 → 16/11) : toutes les **images** + cartes texte pour vidéos.
- **Posts texte** après 17/11 : J-x, citations, critères, CTA courts — **sans** capture app lisible.
- **Pas pour** : révélation app (≥ 17/12 pré-launch, 24/12 lancement) → captures nettes.

## Fichier source (version validée · dégradé clair + carte)
- HTML : `export-visuels-pack-acte-a-v4-light.html` *(baseline v4 — dégradé, atmo floue, squelettes)*
- PNG exportés : `exports-png-v4-light/` — fichiers `01_`, `02_`, `03_`
- **Ne pas utiliser** les PNG `COMPARAISON_NIVEAU_*` (tests écartés).
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
