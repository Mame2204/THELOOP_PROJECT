# Suivi review — build 70

> 22 octobre 2026. Les deux stores sont en examen. Ce document fige ce qui a été envoyé.
> Aucun mot de passe ici : il est déjà saisi dans App Store Connect et Play Console.

## 1. Ce qui est en examen

| Store | Version | Numéro | État |
|-------|---------|--------|------|
| Google Play | 1.0.0 | versionCode **70** | Envoyé pour examen |
| App Store | 1.0.0 | build **70** | Envoyé pour vérification |

Binaire construit depuis `main` après le commit `7864ad6` (iOS et Android au 70, permission photo Android retirée).

Le 69 Android ne doit pas être renvoyé : il déclarait `READ_MEDIA_IMAGES`.

## 2. Gates figées

Tant qu’Apple et Google n’ont pas répondu, ne pas changer ces interrupteurs dans le Control Tower.

| Gate | Valeur |
|------|--------|
| Inscription | **OFF** |
| Achat PASS | **ON** |
| Privilèges | **Visible** |
| Pré-lancement | **OFF** |

Comptes laissés aux relecteurs :

- Membre, jamais Prime, sert au parcours d’achat : `member@theloop-app.com`
- Loop Prime déjà actif, sert à l’expérience complète : `prime@theloop-app.com`

Pas de compte admin dans les notes. Les relecteurs ouvrent Djomy puis annulent. Ils ne finalisent pas le paiement.

## 3. Réponses déjà enregistrées

### Google Play

| Déclaration | Réponse |
|-------------|---------|
| Accès à l’app | Fonctionnalités limitées, connexion obligatoire, inscription désactivée |
| Identifiant publicitaire | Non |
| Applis gouvernementales | Non |
| Fonctionnalités financières | Aucune. Le PASS est un achat de privilèges sur place, payé chez Djomy |
| Photos | Aucune permission `READ_MEDIA_*` dans le 70. Ne pas remplir de justification galerie |

### App Store

| Champ | Réponse |
|-------|---------|
| Connexion requise | Oui. Compte du champ principal : `prime@theloop-app.com` |
| Chiffrement | Déjà dans le binaire (`ITSAppUsesNonExemptEncryption: false`). Pas de document à déposer |
| Identifiant publicitaire | Absent du binaire. Suivi : Non |
| Confidentialité | https://www.theloop-app.com/privacy |
| Données | Liées au compte, finalité **Fonctionnalité de l’app** uniquement : nom, e-mail, téléphone, photos, historique d’achats, identifiant appareil (push), interactions, date de naissance, ville, pays |
| Catégorie | Style de vie. Secondaire : Divertissement |
| Âge | Remplacement **18+** (la politique réserve l’app aux personnes majeures) |
| Copyright | `2026 THE LOOP` |
| Droits sur le contenu | Oui, contenu tiers (fiches partenaires) avec les droits |
| Tarif | Gratuit. 175 pays. Pas de précommande |
| Législation sur les services numériques | Commerçant, personne physique, adresse réelle |
| Licence de jeu Vietnam | Non concerné |

Suppression de compte, des deux côtés : Profil → Paramètres → Fermer mon compte. Page : https://www.theloop-app.com/suppression

## 4. Pendant l’attente

- Ne pas republier un binaire, ne pas changer les mots de passe des deux comptes, ne pas réactiver l’inscription.
- Ne pas couper l’achat PASS : les relecteurs doivent voir le parcours.
- Réveiller une fois `https://api.theloop-app.com` si le paiement doit s’ouvrir pendant la relecture (démarrage à froid possible).
- Les testeurs externes (TestFlight externe, tests fermés Play) peuvent continuer en parallèle. Ils utilisent les mêmes comptes, pas un compte admin.

## 5. Si un store refuse

| Motif | Action |
|-------|--------|
| Permission photo Android | Vérifier que l’AAB examiné est bien le **70**, pas le 69 |
| Compte inutilisable | Remettre le compte en état sans changer l’e-mail, puis répondre dans la console |
| Paiement Djomy | Rappeler dans la réponse : annuler sur la page Djomy, puis utiliser le compte Prime déjà actif |
| Âge, confidentialité, droits | Corriger la fiche. Un nouveau binaire n’est nécessaire que si Apple ou Google le demandent |
| Correctif de code | Build **71** sur les deux stores, même numéro, puis resoumission |

## 6. Après approbation

| Store | Action |
|-------|--------|
| Apple | Publication **manuelle**. Ne pas publier tant que le lancement n’est pas décidé |
| Google | Pas de mise en production tant que le rollout n’est pas décidé |

Ensuite, les gates se pilotent sans nouveau binaire, selon `15-Lancement-Gates-Prod.md` : pré-lancement possible, inscription encore OFF, achat PASS laissé tel que la review l’a vu tant que la vente publique n’est pas ouverte.

La description publique des fiches peut changer sans nouveau binaire. Ne pas écrire « aucun achat dans l’app » tant que l’achat PASS est visible.
