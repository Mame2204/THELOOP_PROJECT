# THE LOOP — Smoke test complet (à cocher)

> **Màj :** 20 sept. 2026 · Coche `- [ ]` → `- [x]` au fur et à mesure  
> **App mobile :** build **48** (TestFlight + Play internal)  
> **Admin web :** `https://admin.theloop-app.com`  
> **Serveur :** `https://api.theloop-app.com` (cron push, paiements)  
> **Qualité code :** `mobile npm run typecheck` = 0 erreur · 131 tests Jest verts

---

## Les 4 rôles (comptes connectés)

| Rôle | C’est qui ? | DB `user_role` | Comment tester |
|------|-------------|----------------|----------------|
| **Membre** | Compte **gratuit** | `member` | Inscription ou compte test membre |
| **Prime** | Abonné **Loop Prime** (PASS actif) | `prime` | Compte avec PASS actif ou octroi admin |
| **Partenaire** | Pro THE LOOP | `partner` | Invitation admin (rôle Partenaire) **ou** e-mail pro + MDP |
| **Admin** | Control Tower | `admin` / `super_admin` | Compte admin · app + admin-web |

### Non connecté ≠ un rôle

Quand tu n’es **pas** connecté, tu n’es pas « visiteur » qui parcourt l’app : tu es sur l’**écran Auth** uniquement.

| État | Accès |
|------|--------|
| **Non connecté** | Auth · partenariat · validation privilège (double tap logo) · **aucun** Accueil / Agenda / Spots |
| **Connecté** | Un des **4 rôles** ci-dessus → onglets catalogue |

> **Termes obsolètes :** « visiteur », « sans compte = persona » — ne plus les utiliser.  
> En code : `USER_ANONYMOUS` = état technique « pas de session », pas un rôle produit.

---

## Où tester ? (symboles)

| Symbole | Où | URL / app |
|---------|-----|-----------|
| **📱** | iPhone | App THE LOOP (TestFlight) |
| **🤖** | Android | App THE LOOP (Play internal) |
| **💻** | Admin web | `https://admin.theloop-app.com` |
| **⏳** | Après redeploy | Admin-web + Render à jour (push planifiés, cron) |

**Render** = pas de site à ouvrir. Tu crées la campagne sur **💻**, tu attends 5–10 min, tu vérifies sur **📱/🤖**.

**🔜 Build 37+** = auth bienvenue améliorée, e-mail support `contact@theloop-app.com` dans le binaire (build 36 peut encore afficher l’ancien e-mail en dur).

---

## 0 — Avant de commencer

### Environnement
- [ ] **📱** Build **48** installé (TestFlight)
- [ ] **🤖** Build **48** installé (Play internal)
- [ x ] **💻** Admin-web accessible
- [ x ] **⏳** Redeploy admin-web + Render faits (si tests push planifiés § H)

### Migrations Supabase appliquées
- [ x ] `20260916_admin_push_campaign_failed_status.sql` (statut `failed`)
- [ x ] `20260916_support_email_contact_theloop_app.sql` (e-mail `contact@theloop-app.com` dans FAQ / légal / pages)
- [ x ] `20260919_event_speakers_default_empty_title.sql` (publication événement · intervenants sans titre)

### Comptes test prêts
- [ x ] Membre (`member`)
- [ x ] Prime (`prime` + PASS actif)
- [ x ] Partenaire (compte pro invité · rôle `partner` · e-mail + MDP)
- [ x ] Admin (`admin` ou `super_admin`)

### Base propre
- [ x ] `payment_intents` nettoyés (plus d’alertes « Paiement bloqué — PASS non activé » en cron)

---

# A — Non connecté (gate Auth)

*Pas un rôle — état avant connexion.*

### Écran bloqué sur Auth
- [ x ] **📱** App ouverte déconnecté → écran **Connexion** (pas Accueil)
- [ x ] **🤖** Idem
- [ x ] **📱** Pas de bottom nav · pas d’onglets catalogue
- [ x ] **🤖** Idem
- [ x ] **📱** Impossible d’atteindre Agenda, Spots, Outils, Favoris, fiches détail
- [ x ] **🤖** Idem

### Parcours autorisés (stack Auth)
- [ x ] **📱** Connexion e-mail + mot de passe
- [ x ] **🤖** Idem
- [ x ] **📱** Inscription (si gate inscription **ON**)
- [ x ] **🤖** Idem
- [ x ] **📱** Gate inscription **OFF** → pas d’onglet Inscription (invite-only)
- [ x ] **🤖** Idem
- [ x ] **📱** « Mot de passe oublié ? »
- [ x ] **🤖** Idem
- [ x ] **📱** « Activer un compte invité par l’équipe »
- [ x ] **🤖** Idem
- [ x ] **📱** Lien **Pro ? Rejoindre THE LOOP →** (demande partenariat)
- [ x ] **📱** Même e-mail + demande **en cours** (`pending` / `to_contact` / `in_discussion`) → alerte **Demande déjà enregistrée** (pas « duplicate » brut Postgres)
- [ x ] **📱** Nouvelle demande autorisée si statut admin **rejeté** ou **approuvé**
- [ x ] **📱** Après envoi : **tous** les appareils admin (iOS + Android) reçoivent la notif inbox + push OS (pas seulement l’appareil du test)
- [ x ] **🤖** Idem
- [ x ] **📱** CGU / Politique de confidentialité (modales légales)
- [ x ] **🤖** Idem

### Validation privilège (double tap logo)
- [ x ] **📱** **Double tap** logo THE LOOP → écran **Code établissement**
- [ x ] **🤖** Idem
- [ x ] **📱** Code partenaire `CODE-XXXXX` → scan / validation privilège membre
- [ x ] **🤖** Idem
- [ x ] **📱** Retour Auth possible
- [ x ] **🤖** Idem

### Ce qui doit rester bloqué
- [ x ] **📱** Aucun contenu catalogue (événement, spot, outil, parcours, singulier)
- [ x ] **🤖** Idem
- [ x ] **📱** Pas de favoris · pas de recherche catalogue
- [ x ] **🤖** Idem

---

# B — Membre gratuit

*Compte `member` connecté — pas Prime.*

### Navigation & thème
- [ x ] **📱** Bottom nav : **Accueil · Agenda · Spots · Outils · Favoris · Profil** (selon sections admin actives)
- [ x ] **🤖** Idem
- [ x ] **📱** Thème **teal clair** (membre gratuit)
- [ x ] **🤖** Idem
- [ x ] **📱** Pas de badge Prime sur Profil
- [ x ] **🤖** Idem

### Catalogue & favoris
- [ x ] **📱** Accueil : hero, sondage, blocs éditoriaux (selon config admin)
- [ x ] **🤖** Idem
- [ x ] **📱** Agenda / Spots / Outils : liste + fiche détail
- [ x ] **🤖** Idem
- [ x ] **📱** Contenu `visibility: prime` **non visible**
- [ x ] **🤖** Idem
- [ x ] **📱** Ajouter / retirer favori · relancer app → persiste
- [ x ] **🤖** Idem

### Profil & upgrade (gate achat PASS **ON**)
- [ x ] **📱** Profil : QR membre · parrainage · paramètres
- [ x ] **🤖** Idem
- [ x ] **📱** **Membre jamais Prime** → carte **« Passez à l’expérience premium »** (Découvrir Prime) · **pas** de bouton **Mon PASS**
- [ x ] **🤖** Idem
- [ x ] **📱** **Membre ex-Prime** (PASS expiré / historique en base ou local) → **Mon PASS** visible · **pas** de carte Découvrir Prime
- [ x ] **🤖** Idem
- [ x ] **📱** Pas d’accès aux privilèges Prime octroyés (tant que rôle `member`)
- [ x ] **🤖** Idem

### Notifications
- [ x ] **📱** Boîte notifications · lire · marquer lu
- [ x ] **🤖** Idem
- [ x ] **📱** Push OS si campagne admin ciblée « Membres »
- [ x ] **🤖** Idem

---

# C — Loop Prime

*Compte `prime` + PASS actif.*

### Apparence
- [ x ] **📱** Thème **indigo** Loop Prime
- [ x ] **🤖** Idem
- [ x ] **📱** Badge Prime sur onglet Profil
- [ x ] **🤖** Idem

### Navigation & contenu
- [ x ] **📱** Mêmes onglets que membre (+ accès contenu exclusif Prime)
- [ x ] **🤖** Idem
- [ x ] **📱** Profil → bouton **Mon PASS** (pas de carte « Découvrir Prime ») · historique PASS
- [ x ] **🤖** Idem
> **Note :** « Profil → Mes avantages » n’existe plus. L’écran `MyBenefits` (« Mes privilèges ») est enregistré mais **sans lien de navigation**. Les privilèges s’affichent sur les **fiches événement / spot**.

- [ x ] **📱** Contenu et offres réservés Prime accessibles
- [ x ] **🤖** Idem

### Privilèges (fiches contenu + validation)
- [ x ] **📱** Fiche événement ou spot → section privilèges · **Utiliser chez le partenaire**
- [ x ] **🤖** Idem
- [ x ] **📱** Scanner QR privilège partenaire → validation OK
- [ x ] **🤖** Idem
- [ x ] **📱** Utiliser un privilège octroyé → succès côté partenaire
- [ x ] **🤖** Idem

### Achat PASS Djomy (si gate PASS ON)
- [ x ] **📱** Écran Abonnement · prix GNF affiché
- [ x ] **🤖** Idem
- [ x ] **📱** Paiement Orange Money ou carte · succès
- [ x ] **🤖** Idem
- [ x ] **📱** Rôle Prime actif · notif confirmation
- [ x ] **🤖** Idem
- [ x ] **💻** Paiement visible admin-web → Paiements
- [ x ] **📱** Échec paiement → message clair · pas Prime fantôme
- [ x ] **🤖** Idem
- [ x ] **📱** PASS déjà actif → achat suivant **en file d’attente** (pending) · date de démarrage affichée
- [ x ] **🤖** Idem

---

# D — Partenaire Pro

*Compte `partner` — connexion e-mail + MDP (après invitation admin).*

### Connexion
- [ x ] **📱** Connexion compte pro (e-mail + MDP · compte invité partenaire)
- [ x ] **🤖** Idem
- [ x ] **📱** Thème **vert teal** partenaire
- [ x ] **🤖** Idem

### Navigation
- [ x ] **📱** Bottom nav inclut onglet **Pro** (+ Accueil, Agenda, Spots, Outils, Favoris, Profil selon sections)
- [ x ] **🤖** Idem
- [ x ] **📱** **Stats** accessibles depuis Espace Pro (pas dans la barre)
- [ x ] **🤖** Idem

### Publications
- [ x ] **📱** Soumettre événement → statut **pending**
- [ x ] **🤖** Idem
- [ x ] **📱** Soumettre spot / outil → pending
- [ x ] **🤖** Idem
- [ x ] **📱** Modifier une soumission pending (retest post-fix `editId` + sync Supabase)
- [ x ] **🤖** Idem
- [ x ] **📱** **Annuler** une soumission pending (avant validation admin)
- [ x ] **🤖** Idem
- [ x ] **📱** Création événement · **Spot existant** (liste spots publiés)
- [ x ] **🤖** Idem
- [ x ] **📱** Voir rejet admin + motif · resoumettre
- [ x ] **🤖** Idem
- [ x ] **📱/🤖** **Validation admin → publication Agenda** : voir § E — *Validation publication événement partenaire*

### Retrait & favoris
- [ x ] **📱** Demander retrait d’un contenu **publié**
- [ x ] **🤖** Idem
- [ k ] **📱** Annuler demande retrait (si encore pending) — contenu disparaît Mon contenu (fix build **44**)
- [ k ] **🤖** Idem
- [ x ] **📱** Notif quand admin approuve / refuse retrait
- [ x ] **🤖** Idem
- [ x ] **💻** Demande visible admin-web → Demandes
- [ x ] **📱** Favoris via onglet **Favoris**
- [ x ] **🤖** Idem

### Validation privilèges
- [ x ] **📱** Scan QR membre · validation code partenaire
- [ x ] **🤖** Idem
- [ x ] **📱** Code établissement `CODE-XXXXX` fonctionnel
- [ x ] **🤖** Idem
- [ x ] **📱** Notif **privilège à valider** · accepter / refuser (Espace Pro)
- [ x ] **🤖** Idem

---

# E — Admin mobile (Control Tower)

*Connecté admin dans l’app **📱/🤖**.*

### Accès & thème
- [ x ] **📱** Onglet **Administration** visible
- [ x ] **🤖** Idem
- [ x ] **📱** Thème bordeaux (super admin) ou gris bleu (admin délégué)
- [ x ] **🤖** Idem
- [ x ] **📱** Modules masqués selon permissions
- [ x ] **🤖** Idem

### Modération
- [ x ] **📱** Voir soumissions pending partenaire
- [ x ] **🤖** Idem
- [ x ] **📱** Approuver → contenu public
- [ x ] **🤖** Idem
- [ x ] **📱** Rejeter + motif → partenaire informé
- [ x ] **🤖** Idem
- [ k ] **📱** Soumission partenaire → super admin **push OS OK** mais **cloche vide** (fix cache build **44**)
- [ k ] **🤖** Idem
- [ x ] **📱** Retrait partenaire → **Retirer du catalogue** ne retire pas l’événement (fix ordre delete build **44**)
- [ x ] **🤖** Idem
- [ x ] **📱** Retrait partenaire → **Garder publié** (refus) OK · notif partenaire
- [ x ] **🤖** Idem
- [ x ] **📱** Valider / refuser soumission → notif partenaire OK
- [ x ] **🤖** Idem

### Validation publication événement partenaire

*Prérequis : migration `20260919_event_speakers_default_empty_title.sql` appliquée (intervenants sans titre → chaîne vide, plus d’erreur `professional_title` NOT NULL).*

#### Préparer la soumission (partenaire)
- [ x ] **📱** Compte **partenaire** → soumettre un **événement** (statut pending)
- [ x ] **🤖** Idem
- [ x ] **📱** Inclure au moins un **intervenant sans titre** (nom seul, champs titre/entreprise vides) — cas régression build 40
- [ x ] **🤖** Idem
- [ x ] **📱** Notif admin à réception de la soumission (retest build 40)

#### Approuver (super admin / admin modération)
- [ x ] **📱** Admin → **Modération** → onglet Événements → **Valider** la soumission
- [ x ] **🤖** Idem
- [ x ] **📱** Succès **sans** message `professional_title` / « vérifiez la connexion »
- [ x ] **🤖** Idem
- [ x ] **📱** Événement visible sur **Agenda** public (pull-to-refresh)
- [ x ] **🤖** Idem
- [ x ] **📱** Partenaire : statut **approuvé** · événement dans Espace Pro
- [ x ] **🤖** Idem
- [ x ] **💻** (optionnel) SQL : ligne `events` publiée · `partner_event_submissions.status = approved` · `event_speakers` synchronisés

#### Refuser (modale motif)
- [ x ] **📱** Admin → **Refuser** une autre soumission pending → saisir motif
- [ x ] **🤖** Idem
- [ x ] **📱** Modale refus : champ motif **visible au-dessus du clavier** (fix UI build **41+**)
- [ x ] **🤖** Idem
- [ x ] **📱** Partenaire reçoit motif · peut resoumettre
- [ x ] **🤖** Idem

### Users & équipe
- [ x ] **📱** Liste users · pagination · filtre inactifs 30j
- [ x ] **🤖** Idem
- [ x ] **📱** Changer rôle · suspendre compte
- [ x ] **🤖** Idem
- [ x ] **📱** TEAMS · activer/désactiver privilège par membre
- [ x ] **🤖** Idem
- [ x ] **📱** Permissions admin délégué (super admin)
- [ x ] **🤖** Idem

### PASS & paiements
- [ x ] **📱** Gestion PASS · prix Guinée (super admin)
- [ x ] **🤖** Idem
- [ x ] **📱** Paiements · refs Djomy · **Resync**
- [ x ] **🤖** Idem
- [ x ] **📱** Octroi manuel privilège
- [ x ] **🤖** Idem

### Contenu & accueil
- [ x ] **📱** Publier / archiver contenu
- [ x ] **🤖** Idem
- [ x ] **📱** Accueil : hero · sondage · parcours · singulier
- [ x ] **🤖** Idem
- [ x ] **📱** Partenariat approuvé → note système · inviter le contact (Utilisateurs · rôle **Partenaire**)
- [ x ] **🤖** Idem
- [ x ] **📱** Idée utilisateur → préremplir éditeur contenu
- [ x ] **🤖** Idem

### Transfert contenu THE LOOP ↔ partenaire

*Fiche contenu publiée (événement / spot / outil) · mode admin · bouton **Transférer / changer le partenaire** (`admin_reassign_content_owner`).*

> **Code validation privilège** (règle produit) : le code demandé à la consommation suit le **`content_origin`** du contenu publié, pas le libellé « THE LOOP » sur l’association catalogue.
> - Contenu **équipe** (`admin` / `loop`) → code **THE LOOP équipe** (`theloop-team` / `CODE-96NDE`)
> - Contenu **partenaire** (`partner`) → code **du partenaire propriétaire** (`CODE-XXXXX` de son compte)

#### THE LOOP → partenaire
- [ x ] **📱** Admin ouvre fiche événement ou spot créé par THE LOOP → **Transférer** vers compte partenaire X
- [ x ] **🤖** Idem
- [ x ] **📱** Transfert OK · propriétaire affiché = partenaire X
- [ x ] **🤖** Idem
- [ x ] **📱** Compte partenaire X → contenu visible dans **Espace Pro** (gestion / stats)
- [ x ] **🤖** Idem
- [ x ] **💻** (optionnel) SQL ou admin : `content_origin = partner` · `partner_user_id` = X sur le contenu publié

#### Privilège lié au contenu transféré (THE LOOP → partenaire)
- [ x ] **📱** Préparer : privilège catalogue **actif**, associé au contenu transféré (offrant THE LOOP ou partenaire)
- [ x ] **📱** Compte **Prime** → fiche du contenu → **Utiliser chez le partenaire**
- [ x ] **🤖** Idem
- [ x ] **📱** À la validation : scanner / saisie demande le code **partenaire X** (pas le code THE LOOP équipe)
- [ x ] **🤖** Idem
- [ x ] **📱** Saisie code partenaire X → validation **OK**
- [ x ] **🤖** Idem

#### Partenaire → THE LOOP (retour équipe)
- [ x ] **📱** Admin → même fiche → **Transférer** vers **THE LOOP** (reprise gestion équipe · `partner_user_id` null)
- [ x ] **🤖** Idem
- [ x ] **📱** `content_origin = admin` (ou `loop` selon canal création)
- [ x ] **📱** Compte Prime → consommer privilège sur ce contenu → code **THE LOOP équipe** demandé
- [ x ] **🤖** Idem

#### Sécurité
- [ x ] **💻** Compte non admin ne peut pas appeler `admin_reassign_content_owner` (cf. `docs/TESTS_MANUELS.md` A7)
- [ x ] **📱** Membre / partenaire : pas de bouton transfert sur la fiche

### Push (Control Tower mobile)
- [ x ] **📱** Notifications → envoi immédiat audience « Tous »
- [ x ] **🤖** Idem
- [ x ] **📱** Planifier campagne · **Annuler** une planifiée
- [ x ] **🤖** Idem
- [ x ] **📱** Audiences favoris · anniversaires
- [ x ] **🤖** Idem

---

# F — Auth & comptes

*Flux transverses — tous rôles.*

### Connexion / déconnexion
- [ x ] **📱** Connexion e-mail + MDP → **Accueil**
- [ x ] **🤖** Idem
- [ x ] **📱** Déconnexion → retour **Auth** (contenu inaccessible)
- [ x ] **🤖** Idem

### Inscription & e-mail
- [ x ] **📱** Inscription → mail reçu → clic lien → connecté
- [ x ] **🤖** Idem
- [ x ] **🔜** Notif **Bienvenue** inbox immédiate après 1ʳᵉ connexion (build 37+)
- [ x ] **📱** Gate inscription OFF → inscription bloquée (invite-only)
- [ x ] **🤖** Idem

### Mot de passe oublié
- [ x ] **📱** « Mot de passe oublié » → mail reçu
- [ x ] **🤖** Idem
- [ x ] **📱** Clic lien → **écran nouveau MDP dans l’app**
- [ x ] **🤖** Idem
- [ x ] **📱** Connexion avec nouveau MDP OK
- [ x ] **🤖** Idem

### Invitations & waitlist
- [ x ] **💻** Users → **Inviter** → mail invitation reçu
- [ x ] **💻** Inviter un **partenaire** (rôle Partenaire) après validation demande partenariat § E
- [ x ] **📱** Clic lien → compte activé · bon rôle
- [ x ] **🤖** Idem
- [ x ] **📱** Partenaire invité → connexion e-mail + MDP → Espace Pro
- [ x ] **🤖** Idem
- [ x ] **💻** Users → **Waitlist** → pré-créer compte → statut `invited`
- [ x ] **📱** Admin mobile → Waitlist → pré-créer (même flux)
- [ x ] **🤖** Idem

---

# G — Admin web (bureau)

*Tout sur **💻** `admin.theloop-app.com`.*

### Accès
- [ x ] **💻** Login admin · session stable
- [ x ] **💻** Sélecteur pays GN · données filtrées
- [ x ] **💻** Menu masque modules sans permission

### Users · PASS · paiements
- [ x ] **💻** Users · liste · édition · invite · waitlist
- [ x ] **💻** PASS · prix · octrois manuels
- [ x ] **💻** Paiements · liste · Resync · refs Djomy
- [ x ] **💻** Export CSV · analytics revenus
- [ x ] **💻** Demandes · modération · retraits partenaire

#### Modération soumissions partenaire (admin-web)
- [ x ] **💻** Partenaire soumet **spot** pending → admin **Valider** → visible Agenda/Spots · notif partenaire OK
- [ x ] **💻** Partenaire soumet **événement** pending → admin **Valider** → visible Agenda · notif partenaire OK
- [ x ] **💻** Admin **Refuser** une soumission (spot ou événement) → **plus visible** dans l’app (catalogue retiré) · notif partenaire avec motif
- [ x ] **💻** Cas régression : refus **après** publication accidentelle → contenu **disparaît** du public (pas « refusé mais publié »)

#### Retraits partenaire (admin-web)
- [ x ] **💻** Demande retrait pending → **refuser** (garder publié) · sync app mobile
- [ k ] **💻** Demande retrait pending → **approuver** (retirer catalogue) · disparaît app public (retest build **44** mobile)

### Contenu
- [ x ] **💻** Contenu · liste events / spots / outils
- [ x ] **💻** Créer / modifier (ContentEditor)
- [ x ] **💻** À la une · archiver
- [ x ] **💻** Idée → ouvrir éditeur prérempli
- [ x ] **💻** Transfert propriétaire contenu · retest smoke **§ E — Transfert contenu** (effectué sur **📱** admin mobile)

### Accueil · Loop · étoiles
- [ x ] **💻** Accueil · sondage · parcours · singulier · logos
- [ x ] **💻** Loop hub · privilèges
- [ x ] **💻** Privilège associé (partenaire + contenu) → notif partenaire · validation · **catalogue actif** (retest post-migration `20260918_partner_accept_activate_catalog`)
- [ x ] **💻** Étoiles · spots (et outils / parcours si dispo)
- [ x ] **💻** TEAMS · toggles overrides par membre

### Paramètres
- [ x ] **💻** Gates · pays · catégories · permissions · legal
- [ x ] **💻** Types privilège · standalone benefit
- [ x ] **💻** Automatisations · jobs · exécuter (si bouton présent)
- [ x ] **💻** Horaires · onglets · **paliers** (éditer / archiver · OK build **45**)
- [ x ] **💻** Tirage · historique (migration `20260925` `draw_city`)

#### Paliers partenaires (Paramètres)
- [ x ] **💻** Paramètres → Paliers → **Éditer** un palier existant (seuil, période, récompense)
- [ x ] **💻** Paramètres → Paliers → **Archiver** → disparaît liste · visible via « Archives »
- [ x ] **📱** Admin → Paramètres → Paliers → éditer / archiver (icônes carte · build **44**)

#### Parrainage admin (super admin)
- [ x ] **📱** Paramètres → Parrainage → modifier seuils · enregistrement OK
- [ x ] **🤖** Idem

#### Tirage privilèges (admin-web)
- [ x ] **💻** Pool éligibles > 0 (rôle Prime coché · compte Prime GN)
- [ x ] **💻** Tirage OK → historique enregistré (migration `20260925` `draw_city`)
- [ k ] **📱** Gagnant reçoit notif inbox + push **« Nouveau privilège »** (fix `notify_user` + push admin-web)
- [ k ] **📱** Gagnant Prime → fiche événement liée → privilège **sans cadenas** · **Utiliser chez le partenaire** (build **43+**)
- [ k ] **📱** Gagnant **non-Prime** (membre tiré) → accès fiche · pas « réservé aux Prime »
- [ k ] **📱** Privilège **associé à un contenu** → pas visible pour **tous** les Prime sans octroi (cadenas / entitlements)

### Notifications (admin-web)
- [ x ] **💻** Envoi immédiat · audience Tous
- [ x ] **💻** Audiences : favoris · anniversaires · individuel
- [ x ] **💻** Planifier · modifier · annuler · **supprimer** campagne (retest post-deploy `2a1a1ce`)
- [ x ] **💻** Historique · statuts `sent` / `failed` / `cancelled`

> Détail push : voir aussi `07-Smoke-Push.md`

---

# H — Push notifications

### Immédiat (sans attendre le serveur)
- [ x ] **💻** Campagne immédiate « Membres » → statut `sent`
- [ x ] **📱** Compte membre : inbox + push OS **1 fois**
- [ x ] **🤖** Idem Android
- [ x ] **📱** Compte Prime **ne reçoit pas** (si ciblage membre seul)
- [ x ] **🤖** Idem

### Planifié (**⏳** redeploy admin-web + Render)
- [ x ] **⏳💻** Planifier campagne Prime dans **+3 minutes**
- [ x ] **⏳** Attendre 5–10 min (cron serveur)
- [ x ] **⏳💻** Statut passe à `sent`
- [ x ] **⏳📱** Compte Prime reçoit inbox + push
- [ x ] **⏳🤖** Idem Android
- [ x ] **⏳💻** Annuler une campagne planifiée → `cancelled` · pas d’envoi

### Pas de doublon
- [ x ] **⏳** Une campagne planifiée = **1 seule** notif (pas 2 push)

### Échec (`failed`)
- [ x ] **💻** Campagne en échec → badge **Échec** dans l’historique

---

# I — Contact & support

- [ x ] **📱** Profil → pied de page **contact@theloop-app.com**
- [ x ] **🤖** Idem
- [ x ] **📱** Feuille contact (WhatsApp / e-mail) → `mailto:contact@theloop-app.com`
- [ x ] **🤖** Idem
- [ x ] **📱** FAQ / pages / CGU (contenu Supabase) → e-mail **contact@theloop-app.com** (après migration)
- [ x ] **🤖** Idem

---

# J — Parrainage

- [ x ] **📱** Code parrain visible profil membre
- [ x ] **🤖** Idem
- [ x ] **📱** Nouveau filleul inscrit → compteur parrain +1
- [ x ] **🤖** Idem
- [ ] **📱** 10 filleuls / an → mois Prime parrain *(test manuel : nécessite 10 filleuls validés sur un compte parrain en environnement de test — non automatisable en CI)*
- [ ] **🤖** Idem *(même scénario que 📱)*

---

# K — Régression rapide (5 min)

- [ x ] **📱** Cold start · pas crash au lancement
- [ x ] **🤖** Idem
- [ x ] **📱** App en arrière-plan · retour → OK
- [ x ] **🤖** Idem
- [ x ] **📱** Images contenu chargées (pas tout gris)
- [ x ] **🤖** Idem
- [ x ] **📱** Admin publie → membre voit après refresh
- [ x ] **🤖** Idem
- [ x ] **📱** Pas lag / refresh excessif en navigation normale
- [ x ] **🤖** Idem

---

# L — Parité iPhone vs Android

*Coche seulement si les **deux** OK.*

- [ x ] **📱🤖** Non connecté → Auth bloqué identique
- [ x ] **📱🤖** Login / logout identique
- [ x ] **📱🤖** Navigation par rôle identique
- [ x ] **📱🤖** Push OS reçu sur les deux
- [ x ] **📱🤖** Partenaire : soumission + modération OK
- [ x ] **📱🤖** Admin : modération OK
- [ x ] **📱🤖** PASS Djomy (si testé) OK des deux côtés

---

# M — Plus tard (non bloquant)

- [ x ] **🔜** Build **37** TestFlight + Play (quota EAS)
- [ x ] **🔜** E-mail support dans le binaire app (build 37+)
- [ x ] **🔜** Refaire § F (bienvenue immédiate) sur build 37
- [ x ] **🔜** Reset MDP via page web sans app installée

---

## Notes de session

```
Date : 20 sept. 2026
Testeur :
Build iPhone : 48 à tester
Build Android : 48 à tester
Admin-web à jour : oui
Serveur Render à jour : oui
TypeScript mobile : 0 erreur (lot CountryCode + permissions + écrans admin)
```

### Tests prioritaires avant prochain build EAS (points `[ k ]`)

> **Correctifs code livrés (sept. 2026)** — retest manuel requis avant **un seul** build :
> retraits (cancel/approve + cache catalogue), cloche admin (session SPOT + seed inbox push),
> tirage (titre « Nouveau privilège », refresh octrois fiche, push admin-web await).

1. **Cloche admin** — soumission partenaire + demande retrait → push **et** inbox super admin.
2. **Modération spots/outils** — soumission partenaire visible admin mobile + admin-web.
3. **Tirage** — gagnant : push + cloche « Nouveau privilège » · fiche contenu **déverrouillée**.
4. **Privilège contenu** — Prime sans octroi : cadenas · gagnant tirage : accès.
5. **Parrainage partenaire** — écran sans bloc récompense Prime (code + filleuls OK).
6. **Retrait** — approuver retrait catalogue · **annuler** retrait pending (partenaire).
7. **Push planifié** — voir aussi `07-Smoke-Push.md` (cron Render, pas de doublon).
