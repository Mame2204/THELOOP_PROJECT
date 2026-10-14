# Grille UTM — Lancement The Loop (2026)

**URL de base :** `https://theloop-app.com/`  
**Règle :** un UTM par **format × canal** (pas par post si même format).

| Campagne | `utm_campaign` | Canal | Format | `utm_source` | `utm_medium` | `utm_content` (exemple) |
|----------|----------------|-------|--------|--------------|--------------|-------------------------|
| Teasing dilemme 6/11 | `teasing_2026` | Facebook | Vidéo | `facebook` | `video` | `dilemme_0611` |
| Teasing envie 13/11 | `teasing_2026` | Facebook | Vidéo | `facebook` | `video` | `envie_1311` |
| Ouverture liste 17/11 | `waitlist_open_2026` | Facebook | Vidéo Reels/feed | `facebook` | `video` | `frequence_1711` |
| Ouverture liste 17/11 | `waitlist_open_2026` | Facebook | Carrousel | `facebook` | `carousel` | `100places_1711` |
| Ouverture liste 17/11 | `waitlist_open_2026` | Facebook | Story | `facebook` | `story` | `reserve_1711` |
| Rappel liste 19/11 | `waitlist_open_2026` | Facebook | Image feed | `facebook` | `image` | `merci_1911` |
| Pourquoi 21/11 | `waitlist_open_2026` | Facebook | Vidéo | `facebook` | `video` | `pourquoi_2111` |
| Sondage 22/11 | `waitlist_open_2026` | Facebook | Story (frame 2) | `facebook` | `story` | `sondage_2211` |
| Règle 1/3 25/11 | `waitlist_open_2026` | Facebook | Image feed | `facebook` | `image` | `regle1_2511` |
| 4 piliers 26/11 | `waitlist_open_2026` | Facebook | Carrousel | `facebook` | `carousel` | `4piliers_2611` |
| Outil 28/11 | `waitlist_open_2026` | Facebook | Vidéo | `facebook` | `video` | `outil_2811` |
| Signature 30/11 | `waitlist_open_2026` | Facebook | Story | `facebook` | `story` | `signature_3011` |
| Règle 2/3 2/12 | `waitlist_open_2026` | Facebook | Image | `facebook` | `image` | `regle2_0212` |
| J-20 4/12 | `waitlist_open_2026` | Facebook | Image | `facebook` | `image` | `j20_0412` |
| Anti-annuaire 5/12 | `waitlist_open_2026` | Facebook | Vidéo | `facebook` | `video` | `anti_annuaire_0512` |
| Règle 3/3 9/12 | `waitlist_open_2026` | Facebook | Image | `facebook` | `image` | `regle3_0912` |
| Teasing | `teasing_2026` | Instagram (secondaire) | Vidéo | `instagram` | `video` | `mirror_fb_*` |
| Pré-launch 17/12 | `prelaunch_2026` | E-mail | Invitation auto | `email` | `invite` | `batch_100` |
| Story J-3 21/12 | `launch_2026` | Facebook | Story | `facebook` | `story` | `j3_2112` |
| Teaser 23/12 | `launch_2026` | Facebook | Carrousel | `facebook` | `carousel` | `launch_teaser_2312` |
| Lancement 24/12 | `launch_2026` | Facebook | Vidéo | `facebook` | `video` | `noel_2412` |
| Terrain 7–16/12 | `terrain_gn_2026` | Facebook | Story | `facebook` | `story` | `jour_07` … `jour_16` |

**Exemple lien 17/11 (vidéo) :**

```
https://theloop-app.com/?utm_source=facebook&utm_medium=video&utm_campaign=waitlist_open_2026&utm_content=frequence_1711
```

**Suivi sans outil analytics lourd :** colonne ou tag côté table waitlist = `utm_content` si tu ajoutes un champ hidden sur la landing (option dev ultérieure). En attendant, différencier surtout **email vs Facebook vs story**.
