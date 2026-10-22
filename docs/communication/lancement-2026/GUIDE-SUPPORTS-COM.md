# Guide — où trouver les supports com (lancement 2026)

Tout le pack vit sous **`docs/communication/lancement-2026/`** dans le dépôt THE LOOP.

## À publier tel quel (Meta)

| Besoin | Emplacement |
|--------|-------------|
| **PNG finaux** (feed, story, frames vidéo) | [`exports-png-v4-light/`](./exports-png-v4-light/) |
| **Sous-titres vidéo** (.srt) | [`srt/`](./srt/) |
| **Légendes + liens UTM** (pas sur les visuels) | [`fiches/`](./fiches/) + [`utm-grille.md`](./utm-grille.md) |

## Sources pour modifier le texte / le design

| Besoin | Emplacement |
|--------|-------------|
| Maquettes HTML (texte, couleurs, slides) | `export-visuels-*.html` à la racine du dossier |
| Pack Acte A (#1–#3 nov.) | [`export-visuels-pack-acte-a-v4-light.html`](./export-visuels-pack-acte-a-v4-light.html) |
| Charte fond / texte | [`CHARTE-FOND-TEXTE.md`](./CHARTE-FOND-TEXTE.md) |

Après édition HTML → regénérer les PNG avec le script indiqué dans la fiche du post ou dans [`LISTE-VISUELS-VALIDES.md`](./LISTE-VISUELS-VALIDES.md).

## Scripts de regénération (Playwright)

Dossier : [`scripts/`](./scripts/)

| Commande (depuis `docs/communication/lancement-2026/`) | Contenu |
|--------------------------------------------------------|---------|
| `node scripts/export-slides-png-v4.mjs` | Acte A pack (#1–#3) |
| `node scripts/export-j5-1211.mjs` · `export-j1-1611.mjs` | J-5 / J-1 |
| `node scripts/export-carousel-1711.mjs` · `export-story-1711.mjs` · `export-video-1711-frames.mjs` | 17/11 |
| `node scripts/export-merci-1911.mjs` · `export-video-2111-frames.mjs` · `export-story-2211.mjs` | 19–22/11 |
| `node scripts/export-regle-2511.mjs` · `export-carousel-2611.mjs` · `export-video-2811-frames.mjs` | 25–28/11 |
| `node scripts/export-lot-a-nov-dec.mjs` | Lot A (30/11–9/12) |
| `node scripts/export-terrain-7-16.mjs` | Lot B terrain (7–16/12) |
| `node scripts/export-lot-c-dec.mjs` | Lot C (17–23/12) |
| `node scripts/export-lot-d-2412.mjs` | Lot D (24/12) |
| `node scripts/export-polish-v5.mjs` | **Tous les visuels touchés par le polish v5** (nov. → 24/12 + terrain + Acte A) |
| `node scripts/export-regenerate-all-affiches.mjs` | **Regénère tout le pack** après correction logo (point + chapeau Noël) |
| `node scripts/patch-all-loop-marks.mjs` | Réapplique le SVG marque officielle dans les HTML `export-visuels-*` |

Prérequis : `npm install` à la racine du repo (Playwright).

## Calendrier & statut

| Document | Rôle |
|----------|------|
| [`CALENDRIER-PUBLICATION-GUIDE-2026.md`](./CALENDRIER-PUBLICATION-GUIDE-2026.md) | **Vue simple** : date · format · objectif · légende résumée · vidéo toi |
| [`calendrier-chronologique-complet.md`](./calendrier-chronologique-complet.md) | Dates, actes, légendes type (détail) |
| [`FEED-FETES-TEMPLATES-GUINEE.md`](./FEED-FETES-TEMPLATES-GUINEE.md) | Fêtes post-24/12 · templates |
| [`PLAN-LOTS-PUBLICATION.md`](./PLAN-LOTS-PUBLICATION.md) | Lots A–D |
| [`CHECKLIST-PUBLICATION-2026.md`](./CHECKLIST-PUBLICATION-2026.md) | Avant publication Meta |
| [`STATUT-COM-2026.md`](./STATUT-COM-2026.md) | État du pack |
| [`fiches/00-INDEX-20-POSTS.md`](./fiches/00-INDEX-20-POSTS.md) | Index fiches par date |

## Aperçu local

1. Terminal : `cd docs/communication/lancement-2026`
2. `python3 -m http.server 8765`
3. Navigateur : [`galerie-preview-lots.html`](./galerie-preview-lots.html) ou [`galerie-polish-v5.html`](./galerie-polish-v5.html) (échantillon post-polish)

Sur téléphone : voir [`MOBILE-TELECHARGER.md`](./MOBILE-TELECHARGER.md) (ZIP de la branche PR).

## Montage vidéo (hors repo)

Scripts VO + repères montage : `video-*.md` (ex. [`video-1711-montage-la-frequence.md`](./video-1711-montage-la-frequence.md)).  
Tu importes les **PNG frames** + tes plans **CapCut** → export `.mp4`. Les notes prod (UTM, sticker Meta, B-roll) restent dans les **fiches**, pas sur les PNG.

## Règle polish v5 (visuels)

- **Acte A** : pas d’URL / app lisible ; textes orientés **17 novembre** plutôt que « pas de lien ».
- **Acte B+** : CTA **Réserve ta place** / **theloop-app.com** sur le visuel ; **UTM uniquement** dans la légende (fiche + `utm-grille.md`).
- Formulation marque : **« en clair »** (plus « en français simple » sur les visuels publics).
