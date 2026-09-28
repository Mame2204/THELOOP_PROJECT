# Publication App Store / Google Play — dossier prêt à remplir

> Mis à jour : 28 sept. 2026 · complète `10-Smoke-Exhaustif-Build48.md` (tableau « Prérequis publication stores »).
> Aucun mot de passe dans ce fichier : les identifiants des comptes relecteurs se saisissent directement dans les consoles.

## 1. Suppression de compte (Apple 5.1.1(v) · Google « Account deletion »)

| Élément | État |
|---------|------|
| Chemin dans l'app | **Profil → Paramètres → Fermer mon compte → Demander la suppression** (build 54+) |
| Enregistrement | Table `account_deletion_requests` via la fonction `request_account_deletion` (migration `20260956`) |
| Alerte admin | Notification + push au **super admin** : nom, e-mail, téléphone du membre |
| Traitement | Super admin : Utilisateurs → fiche du membre → **Supprimer** (la demande passe automatiquement en « traitée ») |
| Délai affiché au membre | 30 jours maximum |
| URL web (exigée par Google) | https://www.theloop-app.com/suppression ✅ déjà en ligne |

⚠️ **Compte lié à des données (privilèges, PASS, parrainage)** : l'app propose seulement « Archiver ». Un compte archivé garde nom, e-mail et téléphone. Pour respecter la promesse « supprimées ou anonymisées », il faut effacer ces champs à l'archivage (chantier suivant, à valider).

## 2. Google Play — formulaire « Sécurité des données »

Réponses générales :
- Données collectées : **Oui**.
- Données partagées avec des tiers : **Non**. Supabase, Expo/Firebase (push), Djomy (paiement) et Render sont des sous-traitants, ce qui ne compte pas comme un partage.
- Chiffrement en transit : **Oui** (HTTPS).
- L'utilisateur peut demander la suppression : **Oui** (URL ci-dessus).

| Catégorie Google | Donnée | Collectée | Obligatoire | Finalités |
|------------------|--------|-----------|-------------|-----------|
| Infos personnelles | Nom | Oui | Oui | Fonctionnement de l'app, gestion du compte |
| Infos personnelles | Adresse e-mail | Oui | Oui | Gestion du compte, communications |
| Infos personnelles | Numéro de téléphone | Oui | Oui | Gestion du compte, paiement mobile money |
| Infos personnelles | Autres infos (date de naissance, ville, pays, entreprise/poste partenaire) | Oui | Non | Fonctionnement de l'app, personnalisation |
| Infos financières | Historique d'achats (PASS) | Oui | Non | Fonctionnement de l'app |
| Photos et vidéos | Photos (comptes partenaires : visuels des lieux/événements) | Oui | Non | Fonctionnement de l'app |
| Activité dans l'app | Interactions (favoris, privilèges, sondages) | Oui | Non | Fonctionnement de l'app, statistiques |
| Identifiants de l'appareil | Jeton de notification push | Oui | Non | Fonctionnement de l'app (notifications) |

Non collectés : localisation GPS, contacts, micro, SMS, historique web. La caméra sert uniquement à scanner un QR code : aucune image n'est stockée.

## 3. Apple — « Confidentialité de l'app » (App Privacy)

- **Suivi (tracking) : Non**. Pas de publicité ni de SDK de suivi : répondre « Non » partout.
- Toutes les données ci-dessous sont **liées à l'identité** et servent au **fonctionnement de l'app**.

| Catégorie Apple | Données |
|-----------------|---------|
| Coordonnées | Nom, adresse e-mail, numéro de téléphone |
| Achats | Historique d'achats (PASS) |
| Contenu utilisateur | Photos (partenaires) |
| Identifiants | ID de l'appareil (jeton push) |
| Données d'utilisation | Interactions avec le produit |
| Autres données | Date de naissance, ville, pays |

## 4. Textes légaux à corriger (landing **et** app)

Les deux versions contiennent des phrases qui ne correspondent plus à l'app. Relecteurs Apple et Google comparent ces textes avec l'app.

- App : Control Tower → Légal → `cgu` / `privacy_policy`.
- Site : pages `/cgu` et `/privacy`.

| Où | Texte actuel | Proposition |
|----|--------------|-------------|
| CGU §2 | « L'inscription nécessite un numéro de téléphone valide et une vérification par code (OTP). » | « L'inscription se fait avec une adresse e-mail et un mot de passe. Un numéro de téléphone est demandé pour le compte et le paiement mobile money. » |
| Confidentialité §9 | « La connexion … se fait par code de vérification (OTP) envoyé par SMS, sans stockage de mot de passe. » | « La connexion se fait par adresse e-mail et mot de passe. Le mot de passe est stocké chiffré (haché) par notre prestataire d'authentification et n'est jamais lisible par THE LOOP. Un code envoyé par e-mail peut être demandé pour activer une invitation ou réinitialiser le mot de passe. » |
| Confidentialité §2 | Liste des données | Ajouter : ville et pays, entreprise et poste (comptes partenaires), photos publiées par les partenaires, jeton de notification de l'appareil, historique des achats PASS. Préciser : « La caméra sert uniquement à scanner les QR codes ; aucune image n'est enregistrée. » |
| Confidentialité §5 | « … avec le service technique d'envoi des notifications. » | « … avec nos prestataires techniques : hébergement et base de données (Supabase), envoi des notifications (Expo / Google Firebase), paiement mobile money (Djomy). Ils n'utilisent pas vos données pour leur propre compte. » |
| Confidentialité §8 | Droits | Ajouter : « Depuis l'application : Profil → Paramètres → Fermer mon compte. » |
| Page `/suppression` | « Depuis l'application THE LOOP, si l'option est disponible dans Profil. » | « Depuis l'application : Profil → Paramètres → Fermer mon compte. » |

## 5. Notes pour les relecteurs (App Review / Play Console)

Texte à coller dans « Notes pour la vérification » :

> THE LOOP est un guide de sorties à Conakry (Guinée). Les privilèges du PASS Prime sont des réductions et avantages consommés physiquement chez des établissements partenaires (restaurants, lieux, événements) : le membre présente sa carte QR au comptoir et le partenaire valide sur place. Le paiement du PASS se fait par mobile money local (Orange Money / MTN via Djomy), le moyen de paiement dominant en Guinée.
> Compte membre de test : [e-mail] / [mot de passe]. Compte Prime de test : [e-mail] / [mot de passe].
> Suppression de compte : Profil → Paramètres → Fermer mon compte.

À préparer :
- [ ] Un compte **membre** et un compte **Prime** dédiés à la relecture, avec un contenu visible au Guinée. Ne pas utiliser un compte admin.
- [ ] Vérifier que ces comptes voient bien l'Accueil (l'app sans compte n'affiche que l'écran de connexion).

## 6. PASS vendu hors achat intégré (Apple 3.1.1 · Google Paiements)

C'est le risque de refus principal, surtout chez Apple. Il y a deux lignes de défense.

1. **Argument « service physique »** (Apple 3.1.3(e), Google « biens ou services physiques ») : le PASS donne accès à des avantages consommés hors de l'app, chez des partenaires. C'est défendable, mais les écrans Prime qui mettent en avant du contenu *dans* l'app (thème doré, événements LoopX) affaiblissent l'argument.
2. **Repli** : désactiver l'achat sur iOS avec l'interrupteur à distance `passPurchaseEnabled`, et vendre le PASS ailleurs (site, partenaires). L'app n'affiche alors plus ni prix ni lien d'achat (Apple 3.1.3(b), service multiplateforme).
   - Interdit : couper l'achat seulement pendant la relecture puis le rallumer. C'est une fonction cachée (Apple 2.3.1), sanctionnée par un retrait de l'app.
   - L'interrupteur est aujourd'hui commun à Android et iOS : le séparer par plateforme serait à développer si ce repli est choisi.

## 7. Clé Firebase (Android)

Le fichier `mobile/google-services.json` est inclus dans l'app : sa clé API est donc publique par nature. Il faut la restreindre dans Google Cloud Console :
- [ ] API et services → Identifiants → la clé « Android key (auto created by Firebase) ».
- [ ] Restrictions d'application : **Applications Android** → package `gn.theloop.app` + empreinte SHA-1 de signature Play (Play Console → Intégrité de l'app) + SHA-1 EAS (`eas credentials`).
- [ ] Restrictions d'API : limiter aux API Firebase utilisées (Firebase Installations API, FCM Registration API).
- [ ] Après restriction : tester une notification push sur un build installé depuis Play.

## 8. Tests à ajouter au smoke (build 54+, après migration `20260956`)

| # | Test | Attendu |
|---|------|---------|
| D1 | Membre : Profil → Paramètres → Fermer mon compte → Demander la suppression | Message « demande envoyée », délai 30 jours |
| D2 | Super admin : cloche + push | « Demande suppression compte » avec nom, e-mail, téléphone |
| D3 | Refaire D1 avec le même compte | « Une demande est déjà en cours » ; pas de 2ᵉ notification admin |
| D4 | Super admin supprime (ou archive) le compte | Table `account_deletion_requests` : statut `processed` |
| D5 | Compte super admin : Paramètres | Pas de bouton « Fermer mon compte » |
| W1 | Landing : inscription avec un nouvel e-mail | « Tu fais désormais partie du cercle » ; ligne visible dans Admin → Liste d'attente (`source` = landing) |
| W2 | Landing : même e-mail | « Tu es déjà dans le cercle » |
| W3 | Landing : 21ᵉ inscription en moins d’une heure depuis le même réseau | « Une erreur s'est produite » (limite anti-robot, normal) |
