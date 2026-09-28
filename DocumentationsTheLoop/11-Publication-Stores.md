# Publication App Store / Google Play — dossier prêt à remplir

> Mis à jour : 28 sept. 2026 · complète `10-Smoke-Exhaustif-Build48.md` (tableau « Prérequis publication stores »).
> Aucun mot de passe dans ce fichier : les identifiants des comptes relecteurs se saisissent directement dans les consoles.

## 1. Suppression de compte (Apple 5.1.1(v) · Google « Account deletion »)

| Élément | État |
|---------|------|
| Chemin dans l'app | **Profil → Paramètres → Fermer mon compte → Demander la suppression** (build 54+) |
| Enregistrement | Table `account_deletion_requests` via la fonction `request_account_deletion` (migration `20260956`) |
| Alerte admin | Notification + push au **super admin** : nom, e-mail, téléphone du membre |
| Traitement | Super admin : Utilisateurs → fiche du membre → **Supprimer**. La demande passe automatiquement en « traitée » |
| Compte rattaché à du contenu (partenaire) | « Supprimer » propose **Archiver** ou **Anonymiser**. L'anonymisation est automatique à l'archivage si le membre a fait la demande dans l'app |
| Délai affiché au membre | 30 jours maximum |
| URL web (exigée par Google) | https://www.theloop-app.com/suppression ✅ déjà en ligne |

**Anonymisation** (`admin_anonymize_user`, super admin uniquement) :
- **Effacé :** prénom, nom, e-mail, téléphone, date de naissance, ville, fonction, carte QR, favoris, notifications, jetons push, coordonnées des votes et des suggestions, ligne de liste d'attente et invitations au même e-mail.
- **Compte de connexion :** e-mail remplacé, mot de passe vidé, compte bloqué définitivement, sessions fermées.
- **Conservé, sans identité :** nom de l'établissement, contenu publié, historique des privilèges et des paiements (comptabilité).
- **Pour une demande reçue par e-mail ou WhatsApp :** Utilisateurs → fiche → Supprimer → **Anonymiser**.

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

## 4. Textes légaux — une seule source (base Supabase)

Les textes affichés par l'app et par le site viennent désormais tous de la table `app_legal_content`.

- **Migration `20260957_legal_texts_unified.sql` :** réécrit `cgu`, `privacy_policy`, `mentions_legales`, `conditions_pass_prime` et `politique_cookies`, alignés sur l'app actuelle :
  - connexion e-mail + mot de passe ;
  - suppression de compte dans l'app, puis anonymisation ;
  - toutes les données collectées, dont le téléphone visible par le partenaire au scan de la carte ;
  - prestataires techniques ;
  - aucun cookie ni suivi ;
  - PASS présenté comme un accès à des privilèges consommés sur place.
- **Modifier ensuite un texte :** Control Tower → Légal. Le site suit automatiquement, sans redéploiement.
- **Landing (dépôt `theloop-landing`) :** copier le contenu de `DocumentationsTheLoop/landing-legal/` à la racine du dépôt landing, puis pousser (Vercel redéploie) :
  - `assets/legal-loader.js` : charge le texte depuis la base ;
  - `cgu/`, `privacy/`, `mentions/` : texte de secours identique, affiché si la base est injoignable ;
  - `suppression/` : page statique, chemin exact dans l'app, délai et anonymisation.

## 5. Notes pour les relecteurs (App Review / Play Console)

Texte à coller dans « Notes pour la vérification » :

> THE LOOP est un guide de sorties à Conakry (Guinée). Les privilèges (réductions, accueil privilégié) sont consommés physiquement chez des établissements partenaires : le membre présente sa carte QR au comptoir et le partenaire valide sur place. Cette version ne vend rien dans l'application : le statut Prime est attribué par THE LOOP (parrainage, invitations).
> Compte membre de test : [e-mail] / [mot de passe]. Compte Prime de test : [e-mail] / [mot de passe].
> Suppression de compte : Profil → Paramètres → Fermer mon compte.

À préparer :
- [ ] Un compte **membre** et un compte **Prime** dédiés à la relecture, avec un contenu visible au Guinée. Ne pas utiliser un compte admin.
- [ ] Vérifier que ces comptes voient bien l'Accueil (l'app sans compte n'affiche que l'écran de connexion).

## 6. PASS Prime et achats intégrés (Apple 3.1.1 / 3.1.3(e) · Google Paiements)

**V1 (build 54+) : achat coupé** (`passPurchaseEnabled` = false, valeur par défaut). Vérifié dans le code :
- l'écran Prime, l'écran de paiement et le bouton « Passer en Loop Prime » sont masqués ;
- les prix et la carte « Passez à l'expérience premium » du profil sont masqués ;
- le message « L'abonnement en ligne arrive bientôt » est retiré, car Apple refuse les annonces de fonctions à venir.

Le statut Prime reste possible via le parrainage ou une attribution admin : aucune vente, donc aucune règle d'achat intégré ne s'applique.

⚠️ **Effet de bord à trancher avant le build 54** : aujourd'hui, l'interrupteur coupé masque aussi toute la section « Privilèges » des fiches Agenda / Spot / Outil, **pour tous les comptes** (membres, Prime, partenaires, admins). Personne ne peut donc demander un privilège depuis l'app. Autres constats :
- le badge « Privilège » reste affiché sur les cartes, ce qui est incohérent ;
- l'écran « Mes privilèges » existe, mais aucun bouton n'y mène.

**Plus tard, pour ouvrir la vente :**
- **Qualification :** le PASS est bien une vente, mais d'un **accès à des services physiques** consommés chez les partenaires. Apple 3.1.3(e) et Google (biens et services physiques) **interdisent** alors l'achat intégré : le paiement mobile money est autorisé.
- **Condition :** ce que l'app met en avant comme contrepartie du PASS doit rester physique (privilèges chez les partenaires). Avant d'activer :
  - retirer de l'argumentaire Prime les avantages purement numériques, comme le « thème exclusif doré » ;
  - présenter les événements LoopX comme des événements réels réservés aux membres, pas comme du contenu à débloquer.
- **Ne jamais activer la vente seulement après la relecture :** c'est une fonction cachée (Apple 2.3.1). Annoncer l'ouverture dans une mise à jour relue par Apple et Google, avec une note qui explique le PASS.
- **Repli si Apple refuse :** laisser l'achat coupé sur iOS seulement et vendre le PASS ailleurs (site, partenaires), sans lien ni prix dans l'app iOS (Apple 3.1.3(b)). Cela demande de séparer l'interrupteur par plateforme.

## 7. Clé Firebase (Android)

Le fichier `mobile/google-services.json` est inclus dans l'app : sa clé API est donc publique par nature. Il faut la restreindre dans Google Cloud Console :
- [ ] API et services → Identifiants → la clé « Android key (auto created by Firebase) ».
- [ ] Restrictions d'application : **Applications Android** → package `gn.theloop.app` + empreinte SHA-1 de signature Play (Play Console → Intégrité de l'app) + SHA-1 EAS (`eas credentials`).
- [ ] Restrictions d'API : limiter aux API Firebase utilisées (Firebase Installations API, FCM Registration API).
- [ ] Après restriction : tester une notification push sur un build installé depuis Play.

## 8. Tests à ajouter au smoke (build 54+, après migrations `20260956` et `20260957`)

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
| A1 | Super admin : partenaire test avec contenu → Supprimer → **Anonymiser** | Fiche « Compte supprimé », sans e-mail ni téléphone ; le contenu reste publié |
| A2 | Se connecter avec l'ancien e-mail et mot de passe du compte anonymisé | Connexion impossible |
| A3 | Compte de test avec demande dans l'app, puis super admin → **Archiver** | Anonymisation automatique (comme A1) |
| L1 | App : Inscription → lien CGU / Politique de confidentialité | Nouveaux textes (e-mail + mot de passe, Fermer mon compte) |
| L2 | Site : /cgu, /privacy, /mentions | Mêmes textes que l'app, date du jour de la migration |
| L3 | Control Tower → Légal : modifier une phrase de la CGU | Visible sur le site /cgu après rechargement |
| L4 | Membre gratuit : fiche avec privilège Prime | « Ce privilège est réservé aux membres Loop Prime. », sans bouton d'achat |
