# Reels prêts à publier (générés dans le dépôt)

Les **7 Reels** du calendrier sont déjà montés, en **1080 × 1920**, **avec musique** (composée par le script, libre de droits) : aucun montage à faire.  
Le texte est **sur les images** : pas de voix off nécessaire. Active les sous-titres automatiques Meta seulement pour tes vidéos face caméra.

## Les 7 Reels

| Date | Heure | Fichier (`exports-mp4/`) | Durée | Ambiance | Couverture | Fiche |
|------|-------|--------------------------|-------|----------|------------|-------|
| ven. 6/11 | 19h00 | `VIDEO_0611_dilemme-PUBLIER.mp4` | 27 s | soirée + notification | `FRAME_0611_01_vendredi-19h.png` | 03 |
| ven. 13/11 | 19h00 | `VIDEO_1311_envie-PUBLIER.mp4` | 19 s | calme | `FRAME_1311_01_envie.png` | 07 |
| mer. 18/11 | 19h00 | `VIDEO_1811_frequence-PUBLIER.mp4` | 21 s | rythmée | `FRAME_1811_02_tout-crie.png` | 10b |
| ven. 20/11 | 19h00 | `VIDEO_2011_pourquoi-PUBLIER.mp4` | 18 s | rythmée | `FRAME_2011_01_conakry-avance.png` | 12 |
| ven. 27/11 | 19h00 | `VIDEO_2711_outil-PUBLIER.mp4` | 15 s | calme | `FRAME_2711_04_endroit.png` | 16 |
| jeu. 3/12 | 19h00 | `VIDEO_0312_anti-annuaire-PUBLIER.mp4` | 13 s | soirée | `FRAME_0312_02_repere.png` | 17 |
| jeu. 24/12 | 19h00 | `VIDEO_2412_noel-PUBLIER.mp4` | 18 s | Noël (clochettes) | `FRAME_2412_04_logo.png` | 20 |

Chaque Reel est publié **sur Facebook et Instagram** (publication croisée), puis partagé **en story** le même soir.  
**Pas de lien** dans les légendes du 6/11 et du 13/11 (la liste ouvre le 17/11).

## Tes 3 vidéos face caméra

À filmer toi-même (scripts dans `CALENDRIER-PUBLICATION-GUIDE-2026.md`), avec leur couverture prête :

| Date | Heure | Couverture |
|------|-------|------------|
| mar. 17/11 | 19h00 | `COVER_17-11_liste-ouverte.png` |
| jeu. 17/12 | 12h00 | `COVER_17-12_invitations.png` |
| jeu. 24/12 | 10h00 | `COVER_24-12_cest-ouvert.png` |

Dans Meta : **Modifier la couverture → Importer depuis la galerie**.

## Régénérer une vidéo (après modification d’un visuel)

```bash
cd docs/communication/lancement-2026
node scripts/export-all.mjs 2026-11-18      # regénère les images du jour
node scripts/render-videos.mjs 1811         # remonte le Reel du jour
```

`node scripts/render-videos.mjs` sans argument remonte les 7 Reels. Prérequis : `ffmpeg` installé.

## Plan B (si la vidéo ne passe pas)

Publier les images `FRAME_*` du jour **en stories**, à la suite, dans l’ordre des numéros.
