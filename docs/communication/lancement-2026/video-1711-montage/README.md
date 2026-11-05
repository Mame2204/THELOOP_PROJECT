# 17/11 · Dossier montage CapCut

**Vidéo finale prête à publier :** `VIDEO_17-11_vendredi-scroll_VOIX.mp4` (~49 s · voix féminine de synthèse) + sous-titres `VIDEO_17-11_vendredi-scroll.srt`.  
Regénérer : `node scripts/render-video-1711-voix.mjs` (nécessite `pip install edge-tts`).

Pour remonter à la main : suis `SCENARIO-VENDREDI-SCROLL.md`. Tout ce qu’il faut est à la racine de ce dossier.

| À la racine (à utiliser) | Rôle |
|--------------------------|------|
| `SCROLL_reseaux-bulles.mp4` | Scroll avec étiquettes Facebook / Instagram / TikTok |
| `SEARCH_recherche-efface.mp4` | Ta recherche (suggestions floutées au montage) |
| `APP_fragment-seuil-com.png` | Le Fragment « Le seuil » |
| `AFFICHE_1711_02` → `05` | Affiches de fin (9:16) |
| `AFFICHE_1711_01_cover-reels.png` | Couverture du Reel dans Meta |
| `VOIX-OFF-17-11.txt` | Texte à enregistrer |

`_ancien/` = anciens montages (cartes MOOD, captures Agenda/Spots/Outils, timecodes précédents). **Ne pas utiliser.**  
`B-roll-main.mp4` et `BULLE_reseau-*.png` = sources du scroll, déjà intégrées dans `SCROLL_reseaux-bulles.mp4`.

Regénérer les affiches : `node scripts/export-all.mjs 2026-11-17` (source `export-visuels-video-1711-affiches.html`).
