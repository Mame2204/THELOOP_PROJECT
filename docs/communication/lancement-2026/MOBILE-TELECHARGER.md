# Télécharger les visuels sur téléphone

Branche : **`main`** · Dossiers : **`exports-png-v4-light/`** (images), **`exports-png-telephone-fete/`** (fêtes 9:16), **`exports-mp4/`** (Reels)  
Vue d’ensemble par date : `galerie-calendrier.html` · calendrier : `CALENDRIER-PUBLICATION-GUIDE-2026.md`

---

## Méthode 1 — ZIP (la plus simple)

1. Sur un PC (ou GitHub web) :
   https://github.com/Mame2204/THELOOP_PROJECT/archive/refs/heads/main.zip
2. Dézipper.
3. Ouvrir `THELOOP_PROJECT-…/docs/communication/lancement-2026/`.
4. Envoyer sur le téléphone les fichiers de la semaine (WhatsApp « Moi-même », Google Drive, AirDrop…).

Astuce : un envoi par semaine (ex. tous les `STORY_07-12_*` à `STORY_12-12_*` pour la semaine terrain).

---

## Méthode 2 — App GitHub (un fichier à la fois)

1. Dépôt **THELOOP_PROJECT** → branche **`main`**
2. `docs` → `communication` → `lancement-2026` → dossier voulu
3. Ouvrir le fichier → menu **⋯** → **Télécharger**

---

## Méthode 3 — Galerie sur PC

```bash
cd docs/communication/lancement-2026
python3 -m http.server 8765
```

Navigateur : http://localhost:8765/galerie-calendrier.html — tous les visuels et Reels, classés par date.

---

## Lien direct vers un fichier

Remplacer `DOSSIER/NOM_DU_FICHIER` :

```
https://raw.githubusercontent.com/Mame2204/THELOOP_PROJECT/main/docs/communication/lancement-2026/DOSSIER/NOM_DU_FICHIER
```

Exemple (Reel du 6/11) :

https://raw.githubusercontent.com/Mame2204/THELOOP_PROJECT/main/docs/communication/lancement-2026/exports-mp4/VIDEO_0611_dilemme-PUBLIER.mp4

---

## Légendes

`fiches/00-INDEX.md` → une fiche par date, avec la légende à copier-coller.
