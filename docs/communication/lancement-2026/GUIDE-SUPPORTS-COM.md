# Guide — où trouver les supports com (lancement 2026)

Tout le pack vit sous **`docs/communication/lancement-2026/`** dans le dépôt THE LOOP.

## À publier tel quel

| Besoin | Emplacement |
|--------|-------------|
| **Images** (feed, stories, carrousels, couvertures, fêtes) | [`exports-png-v4-light/`](./exports-png-v4-light/) |
| **Fêtes en format téléphone** (9:16) | [`exports-png-telephone-fete/`](./exports-png-telephone-fete/) |
| **Reels montés avec musique** | [`exports-mp4/`](./exports-mp4/) · [`VIDEOS-AUTO-REELS.md`](./VIDEOS-AUTO-REELS.md) |
| **Légendes + liens** | [`fiches/`](./fiches/) · index : [`fiches/00-INDEX.md`](./fiches/00-INDEX.md) · [`utm-grille.md`](./utm-grille.md) |
| **Tous les visuels par date** | [`galerie-calendrier.html`](./galerie-calendrier.html) |

## Documents de référence

| Document | Rôle |
|----------|------|
| [`CALENDRIER-PUBLICATION-GUIDE-2026.md`](./CALENDRIER-PUBLICATION-GUIDE-2026.md) | **Le calendrier maître** : date · heure · fichiers · tes scripts vidéo |
| [`PLAN-ATTRACTION-NOV-DEC-2026.md`](./PLAN-ATTRACTION-NOV-DEC-2026.md) | Attirer du monde : WhatsApp, relais, boosts, réponses |
| [`MESSAGES-RELAIS-WHATSAPP.md`](./MESSAGES-RELAIS-WHATSAPP.md) | Textes relais à copier-coller (16/11, 17/11, 24/12) |
| [`PREPARATION-17-11.md`](./PREPARATION-17-11.md) | Jour J liste ouverte : script vidéo, légendes, horaires |
| [`CHECKLIST-PUBLICATION-2026.md`](./CHECKLIST-PUBLICATION-2026.md) | Avant chaque programmation |
| [`STRATEGIE-ARC-NARRATIF.md`](./STRATEGIE-ARC-NARRATIF.md) | L’histoire racontée de novembre à Noël |
| [`VOIX-FONDATRICE.md`](./VOIX-FONDATRICE.md) | Le ton (« je » face caméra, « The Loop » en légende) |
| [`FEED-FETES-TEMPLATES-GUINEE.md`](./FEED-FETES-TEMPLATES-GUINEE.md) | Fêtes après le 24/12 · templates |
| [`CHARTE-FOND-TEXTE.md`](./CHARTE-FOND-TEXTE.md) | Couleurs de fond et de texte |
| [`archives/`](./archives/) | Anciennes versions — **ne pas utiliser** |

## Modifier un visuel

1. Modifier le texte dans le fichier `export-visuels-*.html` du jour (à la racine du dossier).
2. Regénérer :

```bash
cd docs/communication/lancement-2026
(cd scripts && npm install)                  # une seule fois (Playwright)
node scripts/export-all.mjs 2026-11-18       # uniquement les visuels du 18/11
node scripts/export-all.mjs                  # tout le pack
node scripts/render-videos.mjs 1811          # remonter le Reel du jour si c'était une vidéo
node scripts/build-galerie.mjs               # mettre à jour la galerie
```

| Script | Rôle |
|--------|------|
| `scripts/visuels-manifest.mjs` | **Liste unique** de tous les visuels : date, page HTML, nom des fichiers |
| `scripts/export-all.mjs` | Exporte les PNG et pose le logo officiel (avec son point) là où il manque · `--clean` supprime les PNG hors liste |
| `scripts/render-videos.mjs` | Monte les 7 Reels (zoom, fondus, musique) |
| `scripts/build-galerie.mjs` | Génère `galerie-calendrier.html` à partir de la liste |
| `scripts/loop-mark-svg.mjs` | Logo officiel (point inclus, bonnet de Noël en option) |

Les visuels du **3/11** et du **5/11** sont **verrouillés** (déjà publiés / programmés) : aucun script ne les modifie ni ne les supprime.

## Aperçu local

1. `cd docs/communication/lancement-2026 && python3 -m http.server 8765`
2. Ouvrir `http://localhost:8765/galerie-calendrier.html`

Sur téléphone : voir [`MOBILE-TELECHARGER.md`](./MOBILE-TELECHARGER.md).

## Règles visuelles

- Logo The Loop **avec son point** sur chaque visuel ; bonnet de Noël le 24/12 et le 25/12.
- CTA sur l’image : **Réserve ta place** / **theloop-app.com** ; le lien avec suivi reste **dans la légende**.
- Formulation marque : **« en clair »**.
- Aucune note de production sur les images publiées.
