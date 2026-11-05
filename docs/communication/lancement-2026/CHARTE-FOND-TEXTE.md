# Charte — fonds et textes des visuels

## Quand utiliser le fond clair « posts écrits »

- **3 → 16/11** : toutes les images et cartes texte.
- **Après le 17/11** : J-x, citations, série « Une règle », CTA courts — **sans** capture d’app lisible.
- **À partir du 17/12** : captures nettes de l’app autorisées.

## Recette visuelle

1. **Fond** : dégradé bleu-vert clair (`#ecf4f7 → #c8e3ec → #96c4d4`).
2. **Atmosphère** : app très floutée (flou 52 px, opacité ~0,42) — de la lumière, pas du contenu.
3. **Voile** : radial teal 20–28 %.
4. **Carte blanche** : bordure teal 12 %, ombre teal.
5. **Typo** : Manrope · titres `#0A3A44` · surtitres `#0F7A8E` · accent or `#E6B93A`.
6. **Logo** : marque officielle **avec son point** sur chaque visuel (posée automatiquement par `scripts/export-all.mjs` si elle manque).

Les fonds sombres (vidéos, 17/12, 24/12, fêtes) gardent la même typo et le même or.

## Fichiers

- Pack 3/11 et 5/11 (**verrouillé**) : `export-visuels-pack-acte-a-v4-light.html` → `POST_3-11_*`, `POST_5-11_*`, `STORY_5-11_*`.
- Tous les autres visuels : `export-visuels-*.html` → `exports-png-v4-light/` via `node scripts/export-all.mjs`.

## Changer un texte

1. Dans le HTML du jour, changer seulement le surtitre (`ey`), le titre (`h`) et la phrase (`p`).
2. `node scripts/export-all.mjs AAAA-MM-JJ` (uniquement les visuels de cette date).
3. Vérifier dans `galerie-calendrier.html`, puis télécharger le PNG.
