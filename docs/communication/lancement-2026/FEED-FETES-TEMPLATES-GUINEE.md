# Templates « bonne fête » — Guinée & calendrier (hors lancement)

**Objectif :** une **affiche réutilisable** (story ou feed) : logo The Loop + message + **option** décoration (Noël, etc.).  
**Hors pack 3/11→24/12** sauf **24/12** déjà couvert par Lot D.

## Fichier maquette HTML (à regénérer en PNG)

- **Source :** `export-visuels-template-fete.html`  
- **Regénérer feed 4:5 :** `node scripts/export-template-fete.mjs`  
- **Téléphone / Story / Reels 9:16 :** `exports-png-telephone-fete/` · `node scripts/export-template-fete-telephone.mjs`  
- **Année :** champ `data-annee="2026"` — laisser **vide** dans le HTML pour une version **sans année** (réutilisable).

## Liste suggérée (priorité Conakry / communauté)

| Événement | Date (2026 indicatif) | Message type |
|-----------|------------------------|--------------|
| **Noël** | 24–25/12 | *(Lot D lancement — ne pas doubler)* · vœux simple 25/12 possible |
| **Fin d’année** | 31/12 | Bonne fin d’année · à l’année prochaine sur The Loop |
| **Nouvel An** | 1/1/2027 | Bonne année · Conakry |
| **Fête de l’Indépendance (GN)** | 2/10 | Bonne fête · Guinée |
| **Fête des mères** | (variable) | Bonne fête |
| **Tabaski (Aïd al-Adha)** | (lune) | Bonne fête · paix |
| **Ramadan / fin Ramadan (Aïd el-Fitr)** | (lune) | Bon Ramadan / Bonne fête |
| **Fête des armées (GN)** | 1/11 | Hommage · Conakry |
| **8 Mars** | 8/3 | Journée des droits des femmes |
| **Assomption** | 15/8 | Bonne fête |
| **Pâques / Ascension** | (variable) | Bonne fête |
| **1er mai** | 1/5 | Bonne fête du travail |

*Dates islamiques : recaler chaque année (calendrier lunaire).*

## Règles marque (templates fêtes)

- **The Loop** visible · pas de promo agressive Pass/Prime  
- **Pas de lien** obligatoire sur vœux purs · lien app **optionnel** si post = « on est ouvert »  
- Décoration **légère** (filet or, motif discret) — pas mascotte Noël lourde sur tout le feed  
- **Noël lancement 24/12** : utiliser **Lot D**, pas le template générique

## Prochaine étape design

1. Valider **1 visuel** template (fond clair Loop + bandeau « Bonne fête » + sous-titre éditable).  
2. Dupliquer en variantes **Noël** / **Neutre** / **Indépendance** (couleur ruban).  
3. Après validation : script export PNG + entrée dans ce doc.
