# Publication App Store / Google Play — dossier prêt à remplir

> Mis à jour : 30 sept. 2026 · complète `10-Smoke-Exhaustif-Build48.md` et `12-Checklist-Validation-Store.md`.
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

**Stratégie validation (build 58+, oct. 2026) :** pendant la review, gate **achat PASS = ON** (parcours visible). Deux comptes dédiés. Paiement **Djomy prod** : les relecteurs **n’ont pas** de mobile money guinéen → demander **annulation sur le portail**, puis tester l’expérience **Prime** avec le second compte (Prime **déjà actif**, octroi admin, pas via Djomy).

**Description publique (fiche store) :** peut rester orientée guide / privilèges sans détailler la vente en ligne ; **ne pas** affirmer « aucun achat dans l’app » pendant une review où l’achat est visible. Les **notes ci-dessous** (champ privé) portent le détail achat + Djomy. La description marketing peut être **mise à jour plus tard en prod** sans nouveau binaire.

### Gates pendant la review (figées à l’envoi)

| Gate | Valeur review |
|------|----------------|
| Inscription (`signupEnabled`) | **OFF** |
| Achat PASS (`passPurchaseEnabled`) | **ON** |
| Privilèges (`privilegesVisible`) | **Visible** (recommandé) |
| Pré-lancement | **OFF** |

Après **approbation** : piloter gates (ex. PASS OFF + pré-lancement ON jusqu’à décembre) **sans nouveau build** si le **même binaire** a été approuvé avec l’achat montré — cf. §6.

### Texte FR — « Notes pour la vérification »

> THE LOOP est un guide de sorties et d'expériences à Conakry (Guinée). Les privilèges Loop Prime se consomment **sur place** chez les établissements partenaires (carte QR, validation au comptoir).
>
> **Compte membre (test achat PASS)**  
> E-mail : [MEMBRE_REVIEW] · Mot de passe : [MDP]  
> Pour vérifier l'achat : ouvrir l'écran Loop Prime / abonnement, choisir une formule, lancer le paiement. Une page **Djomy** (mobile money Guinée) s'ouvre dans le navigateur. **Merci de ne pas finaliser le paiement** : annuler ou fermer la page, puis revenir à l'application. Un paiement complet nécessite un numéro mobile money guinéen, indisponible pour la relecture.
>
> **Compte Loop Prime (expérience complète)**  
> E-mail : [PRIME_REVIEW] · Mot de passe : [MDP]  
> Ce compte est **déjà** Loop Prime (attribution interne). Utilisez-le pour parcourir privilèges et contenu réservé **sans passer par l'achat**.
>
> Suppression de compte : Profil → Paramètres → Fermer mon compte.  
> URL : https://www.theloop-app.com/suppression

### Texte EN — App Store (recommandé)

> THE LOOP is a city guide for Conakry, Guinea. Loop Prime benefits are redeemed **in person** at partner venues (member QR card, validated by staff).
>
> **Member account (PASS purchase flow)**  
> Email: [MEMBER_REVIEW] · Password: [PWD]  
> To review purchase UI: open Loop Prime / subscription, pick a plan, start checkout. A **Djomy** page (Guinea mobile money) opens in the browser. **Please do not complete payment** — cancel or close the page and return to the app. Full payment requires a Guinean mobile-money wallet, which reviewers typically do not have.
>
> **Loop Prime account (full experience)**  
> Email: [PRIME_REVIEW] · Password: [PWD]  
> This account is **already** Loop Prime (internal grant). Use it to explore Prime features **without purchasing**.
>
> Account deletion: Profile → Settings → Close my account.  
> https://www.theloop-app.com/suppression

### À préparer avant envoi

- [ ] Compte **membre** review : jamais Prime, sert au parcours achat + annulation Djomy.
- [ ] Compte **Prime** review : statut Prime **actif en base** (admin), pas via paiement test.
- [ ] Contenu visible (Guinée) ; **pas** de compte admin pour la review.
- [ ] L'app sans compte n'affiche que la **connexion** — les reviewers doivent se connecter.
- [ ] Parcours complet : `12-Checklist-Validation-Store.md`.

## 6. PASS Prime et achats intégrés (Apple 3.1.1 / 3.1.3(e) · Google Paiements)

### Comportement technique (build 54+)

Interrupteur **`passPurchaseEnabled`** (Super admin → Paramètres · Control Tower) :
- **OFF** : écrans / prix / boutons d'achat PASS masqués ; serveur refuse `POST /api/create-payment` (403) ; notification d'expiration PASS sans CTA renouvellement agressif.
- **ON** : parcours achat + redirection **Djomy** (Render `api.theloop-app.com`, prod ou sandbox selon config serveur).

Interrupteur **`privilegesVisible`** (défaut **Visible**) : affichage sections / badges privilèges sur les fiches, indépendamment de l'achat PASS.

### Stratégie retenue pour la validation stores (2026)

1. **Soumission (oct.)** : build **58** avec **PASS ON** à la review + notes §5 (membre + Prime, annulation Djomy).
2. **Ping-pong** review jusqu'à approbation (nov.–déc.) : **gel** gates / prod sauf réponses aux stores ou build correctif si rejet.
3. **Après approbation** : publication manuelle (Apple) / rollout (Google) quand prêt ; **décembre** invite-only + pré-lancement selon `15-Lancement-Gates-Prod.md`.
4. **Vente PASS au public** : activer le gate **ON** sur le **binaire déjà approuvé** — pas de « fonction cachée » (Apple 2.3.1) **si** l'achat a été visible à la review. Sinon : nouveau build + review.
5. **Fiche store (description, captures)** : modifiable **en prod sans nouveau build** ; ajouter le wording vente PASS le jour de l'ouverture commerciale.

### Argumentaire paiement (si Apple / Google posent la question)

- PASS = accès à des **services physiques** chez partenaires (privilèges sur place), pas du contenu digital seul.
- Paiement = **mobile money** via prestataire **Djomy** (hors IAP), cohérent avec biens / services physiques (Apple 3.1.3(e), politique Google associée).
- Ne pas mettre en avant un « thème doré » ou du contenu purement in-app comme **seule** contrepartie du PASS dans l'argumentaire review.

### Ancienne variante (référence uniquement)

Soumettre avec **PASS OFF** et notes « pas de vente in-app » : plus simple à la review, mais **ouverture vente ultérieure** = **nouveau build + review** (achat non montré la première fois).

**Repli si refus Apple sur paiement externe :** achat coupé sur iOS, vente hors app (site / partenaires), sans prix dans l'app iOS (3.1.3(b)) — nécessite interrupteur par plateforme si un jour implémenté.

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
| L5 | Compte connecté : Profil → Paramètres → Informations légales | CGU, Politique de confidentialité et Mentions légales s'ouvrent (texte de la base) |
| L4 | Membre gratuit : fiche avec privilège Prime | « Ce privilège est réservé aux membres Loop Prime. », sans bouton d'achat |
| P1 | Achat PASS **coupé**, Privilèges **Visible** : Prime ouvre une fiche avec privilège | Section « Privilèges » affichée ; le privilège s'utilise normalement |
| P2 | Même réglage : membre gratuit sur la même fiche | Fiche verrouillée, bouton « Fermer », aucun prix ni bouton d'achat |
| P3 | Super Settings → Privilèges **Masqué** | Plus de section « Privilèges » sur les fiches, plus de badge sur les cartes, plus de ligne « Vos N privilèges » à l'Accueil |
| P4 | Control Tower → Paramètres : enregistrer un autre réglage | L'état de l'interrupteur « Privilèges » est conservé |
