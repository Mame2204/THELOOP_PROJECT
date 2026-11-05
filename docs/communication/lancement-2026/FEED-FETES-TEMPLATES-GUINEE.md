# Templates « bonne fête » — Guinée et calendrier

**Objectif :** une affiche réutilisable chaque année, **sans année inscrite** : logo The Loop (avec son point) + message court.

## Les 4 modèles prêts

| Modèle | Feed 4:5 (`exports-png-v4-light/`) | Téléphone 9:16 (`exports-png-telephone-fete/`) | Utilisation 2026 |
|--------|------------------------------------|-----------------------------------------------|------------------|
| **Neutre** « Joyeuses fêtes, Conakry » | `TEMPLATE_fete_neutre-PUBLIER.png` | `FETE_neutre_9x16_TELEPHONE.png` | toute fête (Tabaski, Indépendance…) |
| **Noël** (logo avec bonnet de Noël) | `TEMPLATE_fete_noel-PUBLIER.png` | `FETE_noel_9x16_TELEPHONE.png` | ven. 25/12 · 10h00 |
| **Fin d’année** | `TEMPLATE_fete_fin-annee-PUBLIER.png` | `FETE_fin-annee_9x16_TELEPHONE.png` | jeu. 31/12 · 19h00 |
| **Bonne année** | `TEMPLATE_fete_bonne-annee-PUBLIER.png` | `FETE_bonne-annee_9x16_TELEPHONE.png` | ven. 1/1/2027 · 10h00 |

Légendes 2026 : `fiches/21-APRES-24-12.md`.

## Créer une nouvelle fête

1. Copier un bloc dans `export-visuels-template-fete.html` (feed) **et** `export-visuels-template-fete-story.html` (téléphone).
2. Changer le surtitre, le titre et la phrase (ex. « Tabaski » · « Bonne fête » · « Paix et partage à Conakry. »).
3. Ajouter le nom du fichier dans `scripts/visuels-manifest.mjs`, puis : `node scripts/export-all.mjs`.

## Calendrier des fêtes (Conakry)

| Événement | Date | Message type |
|-----------|------|--------------|
| Nouvel An | 1/1 | Bonne année · Conakry |
| Journée internationale des droits des femmes | 8/3 | Hommage, sans promotion |
| Ramadan · Aïd el-Fitr (Korité) | calendrier lunaire | Bon Ramadan / Bonne fête |
| Pâques | variable | Joyeuses Pâques |
| Fête du travail | 1/5 | Bonne fête du travail |
| Tabaski (Aïd al-Adha) | calendrier lunaire | Bonne fête · paix et partage |
| Assomption | 15/8 | Bonne fête |
| Fête de l’Indépendance | 2/10 | Bonne fête de l’Indépendance, Guinée |
| Fête de l’Armée | 1/11 | Hommage · Conakry |
| Noël | 25/12 | Joyeux Noël |
| Fin d’année | 31/12 | Bonne fin d’année |

*Fêtes musulmanes : vérifier la date chaque année (calendrier lunaire, annonce officielle).*

## Règles

- **The Loop** visible, aucune promotion Pass / Prime.
- Vœux purs : pas de lien obligatoire ; lien du guide possible en légende après le 24/12.
- Décoration légère : le bonnet de Noël sur le logo uniquement pour Noël.
