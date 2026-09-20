# THE LOOP — Smoke test exhaustif (build 48+)

> **Créé :** 20 sept. 2026  
> **Périmètre :** 73 écrans mobile · 24 pages admin-web · 5 rôles · push  
> **Usage :** checklist QA complète avant build EAS / go-live  
> **Remplace :** `08-Smoke-Global.md` et `09-Smoke-Retest-Build48.md` pour les cycles QA

---

## Légende

| Symbole | Plateforme |
|---------|------------|
| **📱** | iPhone (TestFlight) |
| **🤖** | Android (Play internal) |
| **💻** | Admin-web `https://admin.theloop-app.com` |
| **⏳** | Attente cron Render (5–10 min) |
| **🤖✓** | Testé automatiquement par agent (admin-web navigation) |

Cocher `- [ ]` → `- [x]`. Noter PASS/FAIL dans le **Journal** (fin de doc).

**Ne pas committer de mots de passe** dans ce fichier.

---

## Comptes test

| Rôle | E-mail | Notes |
|------|--------|-------|
| Super admin | `admin@theloop.gn` | App + admin-web |
| Admin délégué | *(compte avec overrides)* | Permissions partielles |
| Membre | `membre@theloop.gn` | `member` |
| Prime | `prime@theloop.gn` | PASS actif |
| Partenaire | `contact@lavenue.gn` | Espace Pro |

Jetons démo : partenaire `SPOT-DEMO-2026` · VIP `INVIT-DEMO-2026` · OTP BL `1234`

---

## Phase 0 — Prérequis

### Environnement
- [x] **📱** Build cible installé — **build 48** · lancement OK *(20 sept. 2026)*
- [ ] **🤖** Idem Android
- [ ] **💻** Admin-web déployé
- [ ] **⏳** Serveur Render à jour (push planifiés)

### Qualité code
- [ ] `cd mobile && npm run typecheck` → 0 erreur
- [ ] `cd mobile && npm test` → 131 tests verts
- [ ] `cd admin-web && npm run build` → OK

### Migrations Supabase
- [ ] `20260916_admin_push_campaign_failed_status.sql`
- [ ] `20260916_support_email_contact_theloop_app.sql`
- [ ] `20260918_partner_accept_activate_catalog.sql`
- [ ] `20260919_event_speakers_default_empty_title.sql`
- [ ] `20260925` — tirage `draw_city`

### Gates (super admin → Paramètres)
- [ ] Inscription **OFF** (invite-only)
- [ ] Achat PASS **OFF** (sauf test paiement)
- [ ] Maintenance **OFF**
- [ ] Pré-lancement **OFF**

---

## Phase 1 — Retests bloquants (post-merge correctifs)

> Bloquer build EAS si FAIL.

| # | Scénario | 📱 | 🤖 | 💻 |
|---|----------|----|----|-----|
| 1 | Soumission partenaire → super admin **push OS + cloche inbox** | [ ] | [ ] | — |
| 2 | Partenaire **annule** demande retrait pending → contenu reste Mon contenu | [ ] | [ ] | — |
| 3 | Admin **approuve** retrait → contenu disparaît catalogue public | [ ] | [ ] | [ ] |
| 4 | Tirage → gagnant push **« Nouveau privilège »** + fiche déverrouillée | [ ] | — | [ ] |
| 5 | Tirage membre non-Prime → accès fiche sans « réservé Prime » | [ ] | — | — |
| 6 | Privilège contenu lié → Prime sans octroi = cadenas | [ ] | [ ] | — |
| 7 | Modération événement + intervenant **sans titre** → validation OK | [ ] | [ ] | [ ] |

---

# PARTIE A — Mobile & Auth

## A0 — System Gate (`SystemGateScreen`)

- [ ] **📱** Gate maintenance ON → écran maintenance (sauf admin connecté)
- [ ] **🤖** Idem
- [ ] **📱** Gate pré-lancement ON → countdown / message
- [ ] **🤖** Idem
- [ ] **📱** Bypass 4 taps logo (session) → accès app
- [ ] **🤖** Idem

---

## A1 — Non connecté (`USER_ANONYMOUS`)

> Pas de bottom nav · pile Auth uniquement.

### `AuthScreen` — modes
- [x] **📱** Mode **login** — écran initial · champs e-mail / MDP *(20 sept. 2026 · build 48)*
- [ ] **🤖** Idem
- [ ] **📱** Mode **signup** — formulaire inscription (si gate ON)
- [ ] **🤖** Idem
- [x] **📱** Gate signup OFF → pas d’onglet inscription *(20 sept. 2026 · build 48)*
- [ ] **🤖** Idem
- [ ] **📱** Mode **activate** — activation compte invité
- [ ] **🤖** Idem
- [ ] **📱** Mode **reset** — mot de passe oublié
- [ ] **🤖** Idem
- [ ] **📱** Mode **set_password** — lien recovery e-mail
- [ ] **🤖** Idem
- [ ] **📱** Lien **Pro ? Rejoindre THE LOOP →**
- [ ] **🤖** Idem
- [ ] **📱** CGU / Politique confidentialité (modales)
- [ ] **🤖** Idem

### Stack Auth (routes autorisées)
- [ ] **📱** `PartnerApplyScreen` — demande partenariat · alerte duplicate si pending
- [ ] **🤖** Idem
- [ ] **📱** `PartnerValidationCodeScreen` — double tap logo → code établissement
- [ ] **🤖** Idem
- [ ] **📱** `PartnerBenefitScanScreen` — scan QR après code valide
- [ ] **🤖** Idem
- [ ] **📱** `PartnerBenefitConfirmScreen` — validation privilège membre
- [ ] **🤖** Idem
- [ ] **📱** `PartnerLoginScreen` — connexion jeton SPOT *(deep link / nav manuelle)*
- [ ] **🤖** Idem

### Bloqué sans connexion
- [x] **📱** Pas Accueil / Agenda / Spots / Outils / Favoris / Profil *(20 sept. 2026 · build 48)*
- [ ] **🤖** Idem
- [ ] **📱** Pas fiches détail catalogue
- [ ] **🤖** Idem

---

## A2 — Membre gratuit (`member`)

### Bottom nav
- [x] **📱** `AccueilScreen` — hero · sondage · parcours · singulier · fragment *(20 sept. 2026 · build 48)*
- [ ] **🤖** Idem
- [x] **📱** `AgendaScreen` — liste événements · filtres · pull refresh *(20 sept. 2026 · build 48)*
- [ ] **🤖** Idem
- [x] **📱** `SpotsScreen` — liste spots · catégories *(20 sept. 2026 · build 48 · pas Loop Prime)*
- [ ] **🤖** Idem
- [x] **📱** `OutilsScreen` — liste outils *(20 sept. 2026 · build 48)*
- [ ] **🤖** Idem
- [x] **📱** `FavorisScreen` — via **bottom nav** (pas menu profil) *(20 sept. 2026 · build 48 · compte membre perso)*
- [ ] **🤖** Idem
- [x] **📱** `ProfilScreen` — infos · code parrain · liens compte *(20 sept. 2026 · build 48 · compte membre perso)*
- [x] **📱** Profil · CTA PASS : jamais eu de PASS → **Découvrir Prime** seul ; déjà eu un PASS → **Mon PASS** seul *(build 48 · règle prévue)*
- [ ] **🤖** Idem
- [x] **📱** Pas onglet Pro · pas onglet Admin *(20 sept. 2026 · build 48)*
- [ ] **🤖** Idem
- [x] **📱** Pas filtre LoopX / Loop Prime *(Agenda · build 48 · 20 sept. 2026)*
- [ ] **🤖** Idem
- [x] **📱** Contenu `prime` invisible / cadenas *(20 sept. 2026 · build 48 · compte membre perso)*
- [ ] **🤖** Idem

### Stack détail contenu
- [x] **📱** `EventDetailScreen` — depuis Agenda / Accueil / Favoris *(20 sept. 2026 · build 48)*
- [ ] **🤖** Idem
- [x] **📱** `SpotDetailScreen` — depuis Spots / Accueil *(20 sept. 2026 · build 48)*
- [ ] **🤖** Idem
- [x] **📱** `CreatorCornerDetailScreen` — Le Singulier *(20 sept. 2026 · build 48 · compte membre perso)*
- [ ] **🤖** Idem
- [x] **📱** `FragmentDetailScreen` — Le Fragment *(20 sept. 2026 · build 48 · compte membre perso)*
- [ ] **🤖** Idem
- [x] **📱** `LoopWalksListScreen` + `LoopWalkDetailScreen` — parcours *(20 sept. 2026 · build 48 · compte membre perso)*
- [ ] **🤖** Idem
- [x] **📱** `PartnerPublicScreen` — depuis parcours *(20 sept. 2026 · build 48 · compte membre perso)*
- [ ] **🤖** Idem

### Compte & services
- [x] **📱** `EditProfilScreen` — modifier nom / photo *(20 sept. 2026 · build 48 · compte membre perso)*
- [ ] **🤖** Idem
- [ ] **📱** `SettingsScreen` — paramètres app
- [ ] **🤖** Idem
- [x] **📱** `NotificationsScreen` — cloche header · inbox *(20 sept. 2026 · build 48)*
- [ ] **🤖** Idem
- [x] **📱** `ReferralScreen` — parrainage · code · compteur filleuls *(20 sept. 2026 · build 48 · compte membre perso)*
- [ ] **🤖** Idem
- [x] **📱** `SuggestionScreen` — envoyer idée *(20 sept. 2026 · build 48 · compte membre perso)*
- [ ] **🤖** Idem
- [x] **📱** `PrimeScreen` — boutique PASS · forfaits + prix · bouton paiement *(20 sept. 2026 · build 48 · gate achat PASS ON · compte membre perso)*
- [ ] **🤖** Idem
- [x] **📱** `AbonnementScreen` — Mon PASS *(20 sept. 2026 · build 48 · membre sans PASS actif · comportement prévu)*
- [ ] **🤖** Idem
- [ ] **📱** `PassPaymentScreen` — flux paiement (si gate PASS ON)
- [ ] **🤖** Idem
- [ ] **📱** `MyBenefitsScreen` — Mes privilèges *(si entrée UI / notif)*
- [ ] **🤖** Idem

### Interactions
- [x] **📱** Ajouter / retirer favori *(20 sept. 2026 · build 48)*
- [ ] **🤖** Idem
- [x] **📱** Tentative favori sans compte → page connexion Auth *(20 sept. 2026 · build 48 · pile Auth sans compte)*
- [ ] **🤖** Idem
- [x] **📱** Recherche inline (Agenda / Spots) *(20 sept. 2026 · build 48 · compte membre perso)*
- [ ] **🤖** Idem
- [x] **📱** Profil → contact `contact@theloop-app.com` *(20 sept. 2026 · build 48 · compte membre perso)*
- [ ] **🤖** Idem

---

## A3 — Loop Prime (`prime` + PASS actif)

### Spécificités rôle
- [x] **📱** Thème sombre & or *(build 48 · compte carte membre Prime · **thème violet/indigo** en app — attendu mobile actuel)*
- [ ] **🤖** Idem
- [ ] **📱** Filtre **LoopX** (Agenda) visible
- [ ] **🤖** Idem
- [ ] **📱** Filtre **Loop Prime** (Spots) visible
- [ ] **🤖** Idem
- [ ] **📱** Contenu `visibility: prime` accessible
- [ ] **🤖** Idem
- [ ] **📱** Favoris via menu profil (pas seulement bottom nav)
- [ ] **🤖** Idem

### Écrans Prime (reprendre A2 +)
- [ ] **📱** `AccueilScreen` — contenu Prime / hero
- [ ] **📱** `AgendaScreen` — événements LoopX
- [ ] **📱** `SpotsScreen` — spots exclusifs
- [ ] **📱** `PrimeScreen` — statut PASS actif
- [ ] **📱** `AbonnementScreen` — détail abonnement
- [ ] **🤖** Idem pour chaque écran ci-dessus

### Privilèges & fiches
- [ ] **📱** Fiche event/spot avec privilège → **Utiliser chez le partenaire**
- [ ] **🤖** Idem
- [ ] **📱** Privilège sans octroi → cadenas
- [ ] **🤖** Idem
- [ ] **📱** Privilège octroyé (tirage / admin) → déverrouillé
- [ ] **🤖** Idem
- [ ] **📱** `MyBenefitsScreen` — liste privilèges actifs
- [ ] **🤖** Idem

---

## A4 — Partenaire (`partner`)

### Bottom nav & hub Pro
- [ ] **📱** Thème teal partenaire
- [ ] **🤖** Idem
- [ ] **📱** `PartnerProScreen` (tab Pro) — hub modules
- [ ] **🤖** Idem
- [ ] **📱** `PartnerContentScreen` — Mes contenus (publié / pending / rejeté)
- [ ] **🤖** Idem
- [ ] **📱** `PartnerStatsScreen` — Performances (depuis Pro, pas bottom nav)
- [ ] **🤖** Idem
- [ ] **📱** `PartnerFeaturedScreen` — À la une
- [ ] **🤖** Idem
- [ ] **📱** `PartnerBenefitsScreen` — Privilèges offerts
- [ ] **🤖** Idem
- [ ] **📱** `PartnerRewardsScreen` — Récompenses THE LOOP
- [ ] **🤖** Idem

### Soumissions & modération
- [ ] **📱** `PartnerSubmissionScreen` — créer **événement** → pending
- [ ] **🤖** Idem
- [ ] **📱** Soumettre **spot** → pending
- [ ] **🤖** Idem
- [ ] **📱** Soumettre **outil** → pending
- [ ] **🤖** Idem
- [ ] **📱** Modifier soumission pending
- [ ] **🤖** Idem
- [ ] **📱** Annuler soumission pending
- [ ] **🤖** Idem
- [ ] **📱** Événement · spot existant (liste publiés)
- [ ] **🤖** Idem
- [ ] **📱** Voir rejet + motif · resoumettre
- [ ] **🤖** Idem
- [ ] **📱** Intervenant sans titre (régression speakers)
- [ ] **🤖** Idem

### Retraits
- [ ] **📱** Demander retrait contenu publié
- [ ] **🤖** Idem
- [ ] **📱** **Annuler** retrait pending (Phase 1)
- [ ] **🤖** Idem
- [ ] **📱** Notif approve / refuse retrait
- [ ] **🤖** Idem

### Validation privilèges
- [ ] **📱** `PartnerValidationCodeScreen` — code `CODE-XXXXX`
- [ ] **🤖** Idem
- [ ] **📱** `PartnerBenefitScanScreen` — scan QR membre
- [ ] **🤖** Idem
- [ ] **📱** `PartnerBenefitConfirmScreen` — accepter / refuser
- [ ] **🤖** Idem
- [ ] **📱** Notif « privilège à valider » dans Pro
- [ ] **🤖** Idem

### Catalogue & favoris
- [ ] **📱** Onglets Accueil / Agenda / Spots / Outils / Favoris / Profil
- [ ] **🤖** Idem
- [ ] **📱** `FavorisScreen` — favoris partenaire
- [ ] **🤖** Idem

---

## A5 — Admin mobile (`super_admin` / `admin`)

### Accès Control Tower
- [ ] **📱** Onglet **Administration** (`AdminWorkspaceScreen`)
- [ ] **🤖** Idem
- [ ] **📱** Thème bordeaux (super) ou gris bleu (délégué)
- [ ] **🤖** Idem
- [ ] **📱** Sidebar — modules masqués selon permissions
- [ ] **🤖** Idem

### Sidebar — panneaux principaux

| Module | Écran | 📱 | 🤖 |
|--------|-------|----|----|
| Insights | `AdminInsightsScreen` | [ ] | [ ] |
| Accueil | `AdminAccueilScreen` | [ ] | [ ] |
| Onglets & Espace Pro | `AdminRubriqueScreen` | [ ] | [ ] |
| Hub THE LOOP | `AdminLoopScreen` | [ ] | [ ] |
| Contenu | `AdminContentScreen` | [ ] | [ ] |
| Utilisateurs | `AdminUsersScreen` | [ ] | [ ] |
| Demandes | `AdminDemandesScreen` | [ ] | [ ] |
| Privilèges THE LOOP | `AdminPrimeBenefitsScreen` | [ ] | [ ] |
| Privilèges TEAMS | `AdminStaffBenefitsScreen` | [ ] | [ ] |
| Tirage au sort | `AdminBenefitDrawScreen` | [ ] | [ ] |
| Gestion PASS | `AdminPassManagementScreen` | [ ] | [ ] |
| Compta PASS | `AdminComptaScreen` | [ ] | [ ] |
| Paramètres | `AdminSuperSettingsScreen` | [ ] | [ ] |

### Hub Demandes (sous-écrans)
- [ ] **📱** `AdminPartnershipsScreen` — partenariats pending / approuver / rejeter
- [ ] **🤖** Idem
- [ ] **📱** `AdminModerationScreen` — soumissions · retraits · valider / refuser
- [ ] **🤖** Idem
- [ ] **📱** `AdminSuggestionsScreen` — idées communauté
- [ ] **🤖** Idem

### Hub THE LOOP (stack)
- [ ] **📱** `AdminLoopContentScreen` — contenu équipe
- [ ] **🤖** Idem
- [ ] **📱** `AdminLoopBenefitsScreen` — privilèges offerts équipe
- [ ] **🤖** Idem
- [ ] **📱** `AdminLoopFeaturedScreen` — à la une THE LOOP
- [ ] **🤖** Idem
- [ ] **📱** `AdminLoopStatsScreen` — performances
- [ ] **🤖** Idem
- [ ] **📱** `PartnerSubmissionScreen` (canal loop) — soumission admin
- [ ] **🤖** Idem
- [ ] **📱** `PartnerBenefitScanScreen` — depuis hub LOOP
- [ ] **🤖** Idem

### Paramètres → sous-modules (stack)
- [ ] **📱** `AdminContentCountriesScreen` — pays contenu
- [ ] **📱** `AdminCategoriesScreen` — catégories
- [ ] **📱** `AdminSpotStarsScreen` — étoiles spots
- [ ] **📱** `AdminPartnerMilestonesScreen` — paliers · éditer · archiver
- [ ] **📱** `AdminReferralSettingsScreen` — parrainage
- [ ] **📱** `AdminAutomationJobsScreen` — automatisations · exécuter
- [ ] **📱** `AdminNotificationsScreen` — campagnes push mobile
- [ ] **📱** `AdminStandaloneBenefitScreen` — privilège standalone
- [ ] **📱** `AdminBenefitTypesScreen` — types (onglet standalone)
- [ ] **📱** `AdminLegalScreen` — CGU & légal
- [ ] **📱** `AdminOpeningHoursScreen` — horaires presets
- [ ] **📱** `AdminPermissionsScreen` — permissions admins délégués
- [ ] **🤖** Idem pour chaque sous-module ci-dessus

### Autres écrans admin (stack)
- [ ] **📱** `AdminCreateUserScreen` — créer compte
- [ ] **📱** `AdminWaitlistScreen` — waitlist · pré-créer
- [ ] **📱** `AdminFeaturedScreen` — carousel à la une
- [ ] **📱** `AdminPaymentsScreen` — paiements · Resync Djomy
- [ ] **📱** `PartnerSubmissionScreen` (mode admin) — depuis Contenu / Modération
- [ ] **🤖** Idem

### Actions admin critiques
- [ ] **📱** Modération — approuver événement → Agenda public
- [ ] **📱** Modération — refuser + motif · modale au-dessus clavier
- [ ] **📱** Modération — approuver retrait catalogue
- [ ] **📱** Modération — refuser retrait · notif partenaire
- [ ] **📱** Users — changer rôle · suspendre
- [ ] **📱** PASS — octroi manuel · prix Guinée
- [ ] **📱** Tirage — lancer · historique · notif gagnant
- [ ] **📱** Push immédiat audience Tous
- [ ] **📱** Push planifié · annuler
- [ ] **📱** Transfert contenu THE LOOP ↔ partenaire
- [ ] **📱** Publier / archiver contenu
- [ ] **🤖** Idem pour chaque action

### Transfert contenu (code validation)
- [ ] **📱** THE LOOP → partenaire : code **partenaire** à la consommation
- [ ] **📱** Partenaire → THE LOOP : code **équipe THE LOOP**
- [ ] **🤖** Idem

---

# PARTIE B — Admin-web (💻)

> **1 rôle testé :** super_admin · Compte : `admin@theloop.gn`  
> Admin délégué : section B9.

## B0 — Session & shell

- [x] **💻🤖✓** Login → redirect dashboard
- [x] **💻🤖✓** Sélecteur pays **Guinée**
- [ ] **💻** Session stable 15 min
- [ ] **💻** Déconnexion → `/login`
- [ ] **💻** Menu latéral — badge Demandes si pending

## B1 — Navigation — toutes les routes

| Route | Page | Chargement | Actions clés | 🤖✓ |
|-------|------|------------|--------------|-----|
| `/insights` | Insights | [ ] | KPIs · graphiques | [x] |
| `/accueil` | Accueil | [ ] | Hero · sondage · parcours · singulier | [x] |
| `/onglets` | Onglets | [ ] | Visibilité tabs app | [x] |
| `/loop` | THE LOOP | [ ] | Hub éditorial | [x] |
| `/contenu` | Contenu | [ ] | Liste events/spots/outils | [x] |
| `/contenu/editer/event` | ContentEditor | [ ] | Créer / modifier event | [x] |
| `/contenu/editer/spot` | ContentEditor | [ ] | Créer / modifier spot | [x] |
| `/contenu/editer/tool` | ContentEditor | [ ] | Créer / modifier outil | [x] |
| `/users` | Users | [ ] | Liste · édition · invite | [x] |
| `/demandes` | Demandes | [ ] | Voir B2 | [x] |
| `/privileges` | Privilèges | [ ] | Catalogue · activer | [x] |
| `/teams` | TEAMS | [ ] | Overrides staff | [x] |
| `/tirage` | Tirage | [ ] | Pool · lancer · historique | [x] |
| `/pass` | PASS | [ ] | Catalogue · prix | [x] |
| `/payments` | Paiements | [ ] | Liste · Resync | [x] |
| `/compta` | Compta | [ ] | Export · analytics | [x] |
| `/notifications` | Notifications | [ ] | Voir B5 | [x] |
| `/automation` | Automatisations | [ ] | Jobs · exécuter | [x] |
| `/milestones` | Paliers | [ ] | Éditer · archiver | [x] |
| `/etoiles` | Étoiles | [ ] | Spots / outils / parcours | [x] |
| `/horaires` | Horaires | [ ] | Presets ouverture | [x] |
| `/parametres` | Paramètres | [ ] | Voir B3 | [x] |
| `/types-privileges` | Types privilèges | [ ] | CRUD types | [x] |
| `/privilege-standalone` | Standalone | [ ] | Avantage seul | [x] |

## B2 — Demandes (`/demandes`)

### Onglet Partenariats
- [x] **💻🤖✓** Chargement liste
- [ ] **💻** Filtrer par statut (pending / to_contact / in_discussion / …)
- [ ] **💻** Approuver demande → inviter partenaire depuis Users
- [ ] **💻** Rejeter avec motif

### Onglet Modération
- [x] **💻🤖✓** Chargement soumissions pending
- [ ] **💻** Filtres event / spot / tool
- [ ] **💻** **Valider** spot → visible app · notif partenaire
- [ ] **💻** **Valider** événement (intervenant sans titre) → Agenda
- [ ] **💻** **Refuser** + motif → absent catalogue
- [ ] **💻** Section **Demandes de retrait** — liste pending
- [ ] **💻** **Approuver retrait** → disparaît app (Phase 1)
- [ ] **💻** **Refuser retrait** → reste publié

### Onglet Idées
- [x] **💻🤖✓** Chargement suggestions
- [ ] **💻** Filtrer statut / type
- [ ] **💻** Changer statut idée
- [ ] **💻** Ouvrir éditeur contenu prérempli

## B3 — Paramètres (`/parametres`)

| Onglet | Tests | OK |
|--------|-------|-----|
| **Gates** | Inscription · PASS · pré-lancement · maintenance — lire / enregistrer | [ ] |
| **Pays** | Activer / désactiver pays contenu | [ ] |
| **Catégories** | Éditer label · emoji · activer / désactiver | [ ] |
| **Permissions** | Admin délégué · overrides grant/revoke | [ ] |
| **Légal** | CGU · politique · FAQ · e-mail support | [ ] |
| **Plus** | Bouton suggestion · autres réglages | [ ] |

Liens Param. → pages satellites :
- [ ] **💻** `/notifications` accessible depuis Param.
- [ ] **💻** `/automation` accessible
- [ ] **💻** `/milestones` accessible
- [ ] **💻** `/etoiles` accessible
- [ ] **💻** `/horaires` accessible

## B4 — Users · PASS · Paiements

### Users
- [ ] **💻** Pagination · recherche
- [ ] **💻** Éditer profil · rôle · suspendre
- [ ] **💻** **Inviter** → e-mail reçu
- [ ] **💻** **Waitlist** → statut `invited`

### PASS
- [ ] **💻** Prix Guinée · enregistrer
- [ ] **💻** Octroi manuel PASS
- [ ] **💻** Messages / modèles notification

### Paiements & Compta
- [ ] **💻** Liste transactions · refs Djomy
- [ ] **💻** **Resync** intent bloqué
- [ ] **💻** Export CSV
- [ ] **💻** Analytics revenus (Compta)

## B5 — Notifications push (admin-web)

- [ ] **💻** Envoi **immédiat** audience Tous → `sent`
- [ ] **💻** Audiences : Membres · Prime · Partenaires · Favoris · Anniversaires · Individuel
- [ ] **💻** **Planifier** +3 min → **⏳** statut `sent`
- [ ] **💻** Modifier campagne planifiée
- [ ] **💻** **Annuler** → `cancelled`
- [ ] **💻** **Supprimer** campagne
- [ ] **💻** Historique · badges `sent` / `failed` / `cancelled`
- [ ] **⏳** Pas de doublon push (1 campagne = 1 notif)

> Détail : `07-Smoke-Push.md`

## B6 — Contenu & éditorial

- [ ] **💻** Filtrer events / spots / outils / archivés
- [ ] **💻** Créer event · spot · outil (ContentEditor)
- [ ] **💻** À la une · archiver · republier
- [ ] **💻** Transfert propriétaire THE LOOP ↔ partenaire
- [ ] **💻** Accueil — hero · sondage · parcours · singulier · logos
- [ ] **💻** Loop hub — sections éditoriales

## B7 — Privilèges · TEAMS · Tirage

- [ ] **💻** Privilèges — catalogue actif / inactif
- [ ] **💻** Privilège associé contenu + partenaire → acceptation · catalogue actif
- [ ] **💻** TEAMS — toggle override par membre staff
- [ ] **💻** Tirage — pool éligibles > 0
- [ ] **💻** Tirage — filtres rôle · scope contenu / standalone / promo
- [ ] **💻** Tirage — lancer test → historique `draw_city`
- [ ] **📱** Gagnant — notif « Nouveau privilège » (cross-platform)

## B8 — Automatisations · Paliers · Étoiles · Horaires

- [ ] **💻** Automation — liste jobs · exécuter manuellement
- [ ] **💻** Paliers — créer · éditer · archiver · voir Archives
- [ ] **💻** Étoiles — seuils spots / outils / parcours
- [ ] **💻** Horaires — presets · assignation

## B9 — Admin délégué (permissions réduites)

> Compte `admin` (non super) avec overrides.

- [ ] **💻** Login admin délégué → modules limités sidebar
- [ ] **💻** Module **sans** permission → refus / redirect
- [ ] **💻** Modération OK si grant `moderation`
- [ ] **💻** Paramètres / PASS **inaccessibles** sans `manage_admins` / `pass_management`
- [ ] **📱** Admin mobile délégué — thème gris bleu · modules masqués
- [ ] **🤖** Idem

---

# PARTIE C — Push & transversal

## C1 — Push mobile (réception)

| Scénario | 📱 | 🤖 |
|----------|----|----|
| Campagne immédiate Membres → membre reçoit inbox + 1 push OS | [ ] | [ ] |
| Ciblage membre seul → Prime **ne reçoit pas** | [ ] | [ ] |
| Campagne planifiée Prime → **⏳** Prime reçoit | [ ] | [ ] |
| Annulation planifiée → pas d’envoi | [ ] | [ ] |
| Soumission partenaire → admin push + inbox | [ ] | [ ] |
| Tirage gagnant → « Nouveau privilège » | [ ] | [ ] |
| Modération décision → partenaire notifié | [ ] | [ ] |

## C2 — Auth transversal

- [x] **📱** Login → Accueil · logout → Auth bloqué *(login + logout membre OK · build 48 · 20 sept. 2026)*
- [ ] **🤖** Idem
- [ ] **📱** Inscription → mail → lien → connecté
- [ ] **🤖** Idem
- [ ] **📱** Mot de passe oublié → mail → set_password in-app
- [ ] **🤖** Idem
- [ ] **💻** Invitation admin-web → activation · bon rôle
- [ ] **📱** Partenaire invité → connexion → Espace Pro
- [ ] **🤖** Idem

## C3 — Contact & support

- [ ] **📱** Profil → `contact@theloop-app.com`
- [ ] **🤖** Idem
- [ ] **📱** mailto / WhatsApp sheet
- [ ] **📱** FAQ / CGU → e-mail support à jour
- [ ] **🤖** Idem

## C4 — Parrainage

- [ ] **📱** Code parrain visible profil
- [ ] **🤖** Idem
- [ ] **📱** Nouveau filleul → compteur +1
- [ ] **🤖** Idem
- [ ] **📱** 10 filleuls / an → mois Prime *(test long sandbox)*

---

# PARTIE D — Régression & parité

## D1 — Régression rapide (5 min)

- [ ] **📱** Cold start sans crash
- [ ] **🤖** Idem
- [ ] **📱** Arrière-plan → retour OK
- [ ] **🤖** Idem
- [ ] **📱** Images contenu chargées
- [ ] **🤖** Idem
- [ ] **📱** Admin publie → membre voit après refresh
- [ ] **🤖** Idem
- [ ] **📱** Navigation fluide (pas refresh loop)
- [ ] **🤖** Idem

## D2 — Parité iPhone vs Android

- [ ] **📱🤖** Auth bloqué identique
- [ ] **📱🤖** Tabs par rôle identiques
- [ ] **📱🤖** Push OS des deux côtés
- [ ] **📱🤖** Partenaire soumission + modération
- [ ] **📱🤖** Admin modération + push
- [ ] **📱🤖** PASS Djomy (si testé)

## D3 — Onglets masqués (AdminRubrique)

- [ ] **💻** Désactiver onglet Agenda → app masque tab
- [ ] **📱** Membre ne voit plus Agenda
- [ ] **🤖** Idem
- [ ] **💻** Réactiver → tab revient

---

## Résultats automatisés admin-web (20 sept. 2026)

Smoke Playwright prod — navigation + chargement (sans mutations destructives).

| Test | Résultat |
|------|----------|
| Login super_admin | **PASS** |
| 21 routes principales | **PASS** (26/28 checks) |
| Demandes › Partenariat · Modération · Idées | **PASS** |
| ContentEditor event | **PASS** |
| Retraits | Dans onglet **Modération** (pas tab séparé) |

**Non automatisé :** CRUD, modération approve/reject, tirage réel, push planifié cron, admin délégué.

---

## Journal de session

```
Date : 20 sept. 2026
Testeur :
Build iPhone : 48 — lancement OK
Compte membre iOS : compte perso
Compte Prime iOS : carte membre Prime (thème violet/indigo)
A2 contenu prime invisible : PASS (build 48)
A2 CreatorCornerDetail (Singulier) : PASS (build 48)
A2 FragmentDetail (Fragment) : PASS (build 48)
A2 LoopWalks list + detail : PASS (build 48)
A2 PartnerPublicScreen : PASS (build 48)
A2 EditProfilScreen : PASS (build 48)
Build Android :
Branch / commit :

Phase 1 retests (7)     : PASS / FAIL —
Partie A Mobile         : PASS / FAIL —
Partie B Admin-web      : PASS / FAIL —
Partie C Push           : PASS / FAIL —
Partie D Régression     : PASS / FAIL —

Bloquant build EAS ?    : oui / non
Notes :
```

---

## Références

| Doc | Usage |
|-----|-------|
| `07-Smoke-Push.md` | Push détaillé |
| `08-Smoke-Global.md` | Historique (legacy) |
| `15-Lancement-Gates-Prod.md` | Gates prod |
| `06-Roles-Permissions-Navigation.md` | Matrice rôles |

**Inventaire écrans :** 73 fichiers `mobile/src/screens/*.tsx` · 24 pages `admin-web/src/pages/*.tsx`
