# THE LOOP — Smoke test retest (build 48)

> **Créé :** 20 sept. 2026 · Document **neuf** pour tests manuels réels  
> **Remplace en usage :** `08-Smoke-Global.md` (historique, trop long) pour les prochains cycles QA  
> **Build mobile cible :** **48** (iOS TestFlight + Android Play internal)  
> **Admin-web :** `https://admin.theloop-app.com`  
> **API :** `https://api.theloop-app.com`

---

## Comment utiliser ce document

1. Cocher `- [ ]` → `- [x]` au fur et à mesure.
2. Noter **PASS / FAIL / BLOCKED** + commentaire court dans la section **Journal de session** (fin).
3. Symboles plateforme :
   - **📱** iPhone · **🤖** Android · **💻** Admin-web · **⏳** Attente cron Render (5–10 min)
4. **Ne pas committer de mots de passe** dans ce fichier — les garder dans votre gestionnaire de secrets.

---

## Prérequis (Phase 0)

### Environnement

- [ ] **📱** Build **48** installé (TestFlight)
- [ ] **🤖** Build **48** installé (Play internal)
- [ ] **💻** Admin-web accessible (`https://admin.theloop-app.com` → 200)
- [ ] **⏳** Admin-web + serveur Render déployés (obligatoire pour push planifiés)

### Qualité code (avant EAS)

- [ ] `cd mobile && npm run typecheck` → **0 erreur**
- [ ] `cd mobile && npm test` → **131 tests** verts
- [ ] `cd admin-web && npm run build` → build OK

### Migrations Supabase critiques

- [ ] `20260916_admin_push_campaign_failed_status.sql`
- [ ] `20260916_support_email_contact_theloop_app.sql`
- [ ] `20260919_event_speakers_default_empty_title.sql`
- [ ] `20260918_partner_accept_activate_catalog.sql` (privilèges associés)
- [ ] `20260925` — tirage `draw_city`

### Comptes test

| Rôle | E-mail type | Notes |
|------|-------------|-------|
| Super admin | `admin@theloop.gn` | App + admin-web |
| Membre | `membre@theloop.gn` | `member` |
| Prime | `prime@theloop.gn` | PASS actif |
| Partenaire | `contact@lavenue.gn` | Espace Pro |

> Jetons démo legacy : partenaire `SPOT-DEMO-2026` · VIP `INVIT-DEMO-2026` · OTP BL `1234`

### Gates lancement (super admin → Paramètres)

| Gate | Attendu phase invite-only |
|------|---------------------------|
| Inscription (`signupEnabled`) | **OFF** |
| Achat PASS (`passPurchaseEnabled`) | **OFF** (sauf test paiement) |
| Maintenance | **OFF** |

### Base propre (optionnel sandbox)

- [ ] `payment_intents` sans intents bloqués « PASS non activé » en cron
- [ ] Purge sandbox si besoin : voir `supabase/scripts/purge_all_except_super_admin.sql`

---

## Phase 1 — Retests prioritaires (correctifs sept. 2026)

> **Bloquer le prochain build EAS** tant qu’un point ci-dessous est FAIL.  
> Correctifs livrés : retraits catalogue, cloche admin, tirage + entitlements.

### 1.1 Cloche admin — soumission partenaire

**Prérequis :** compte partenaire · super admin connecté sur **📱** et **🤖**

| # | Action | Attendu | 📱 | 🤖 |
|---|--------|---------|----|----|
| 1 | Partenaire soumet un **événement** pending | Statut pending côté partenaire | [ ] | [ ] |
| 2 | Super admin reçoit **push OS** | Notification système | [ ] | [ ] |
| 3 | Super admin ouvre **cloche / inbox** | Entrée modération visible (pas cloche vide) | [ ] | [ ] |

**Notes :** fix session inbox SPOT + seed cache push build 44+.

### 1.2 Retrait partenaire — annuler demande pending

**Prérequis :** contenu **publié** côté partenaire · demande retrait **pending**

| # | Action | Attendu | 📱 | 🤖 |
|---|--------|---------|----|----|
| 1 | Partenaire → **Demander retrait** | Demande pending | [ ] | [ ] |
| 2 | Partenaire → **Annuler** la demande (encore pending) | Demande disparaît · contenu reste publié dans Mon contenu | [ ] | [ ] |
| 3 | Catalogue public | Contenu toujours visible Agenda/Spots | [ ] | [ ] |

### 1.3 Retrait partenaire — approuver (admin)

**Prérequis :** autre contenu publié · demande retrait pending

| # | Action | Attendu | 💻 | 📱 | 🤖 |
|---|--------|---------|----|----|----|
| 1 | Admin-web → Demandes → Retraits → **Approuver** | Succès sans erreur | [ ] | — | — |
| 2 | Membre/Prime → Agenda ou Spots (refresh) | Contenu **disparu** du catalogue | — | [ ] | [ ] |
| 3 | Partenaire → notification | Retrait approuvé | — | [ ] | [ ] |

**Variante mobile admin :** refuser retrait → contenu reste publié · notif partenaire OK.

### 1.4 Tirage privilèges — gagnant

**Prérequis :** pool éligibles > 0 · privilège catalogue actif (de préférence **associé à un contenu**)

| # | Action | Attendu | 💻 | 📱 |
|---|--------|---------|----|-----|
| 1 | Admin-web → Tirage → lancer tirage (1 gagnant Prime) | Historique enregistré | [ ] | — |
| 2 | Gagnant → inbox + push OS | Titre **« Nouveau privilège »** | — | [ ] |
| 3 | Gagnant Prime → fiche contenu liée | Privilège **sans cadenas** · bouton **Utiliser chez le partenaire** | — | [ ] |
| 4 | Autre Prime **sans** octroi | Privilège **cadenas** / non utilisable | — | [ ] |

### 1.5 Tirage — gagnant non-Prime (membre)

| # | Action | Attendu | 📱 |
|---|--------|---------|-----|
| 1 | Tirage ciblant rôle **Membre** | Gagnant = compte `member` | [ ] |
| 2 | Gagnant → fiche contenu liée | Accès fiche · **pas** « réservé aux Prime » | [ ] |
| 3 | Gagnant → inbox | « Nouveau privilège » | [ ] |

### 1.6 Modération — publication événement (régression intervenants)

| # | Action | Attendu | 📱 | 🤖 | 💻 |
|---|--------|---------|----|----|-----|
| 1 | Partenaire soumet événement avec **intervenant sans titre** | Pending OK | [ ] | [ ] | — |
| 2 | Admin valide | **Sans** erreur `professional_title` | [ ] | [ ] | [ ] |
| 3 | Agenda public (refresh) | Événement visible | [ ] | [ ] | — |

---

## Phase 2 — Admin-web (💻)

> Parcours bureau complet · compte **super_admin** recommandé.

### 2.1 Accès & session

- [ ] Login e-mail + mot de passe → redirection dashboard (Insights ou Accueil)
- [ ] Session stable (navigation 10 min sans déconnexion involontaire)
- [ ] Sélecteur **Pays → Guinée** · données filtrées GN
- [ ] Menu latéral masque modules sans permission (tester admin délégué si dispo)
- [ ] Déconnexion → retour `/login`

### 2.2 Modules — chargement sans crash

Cocher quand la page affiche du contenu métier (pas écran blanc / erreur).

| Module | Route | OK |
|--------|-------|-----|
| Insights | `/insights` | [ ] |
| Accueil | `/accueil` | [ ] |
| Onglets | `/onglets` | [ ] |
| THE LOOP | `/loop` | [ ] |
| Contenu | `/contenu` | [ ] |
| Users | `/users` | [ ] |
| Demandes | `/demandes` | [ ] |
| Privilèges | `/privileges` | [ ] |
| TEAMS | `/teams` | [ ] |
| Tirage | `/tirage` | [ ] |
| PASS | `/pass` | [ ] |
| Paiements | `/payments` | [ ] |
| Compta | `/compta` | [ ] |
| Notifications | `/notifications` | [ ] |
| Paramètres | `/parametres` | [ ] |

> **Note QA :** la page Users peut être lente (polling) — attendre le contenu, ne pas conclure FAIL si le spinner finit par disparaître.

### 2.3 Demandes

- [ ] Onglet **Partenariat** — liste + statuts pending / to_contact / in_discussion
- [ ] Onglet **Modération** — soumissions spots / événements / outils pending
- [ ] Onglet **Retraits** — demandes partenaire
- [ ] Onglet **Idées / Suggestions** — pending
- [ ] Badge sidebar **Demandes** = somme des pending (si > 0)

#### Modération soumission (non destructif ou sandbox)

- [ ] Valider un **spot** pending → visible Spots app · notif partenaire
- [ ] Valider un **événement** pending → visible Agenda · notif partenaire
- [ ] Refuser une soumission → motif · contenu **absent** du catalogue public

#### Retraits (voir Phase 1.2 / 1.3)

- [ ] Refuser retrait → contenu reste publié
- [ ] Approuver retrait → contenu disparaît app mobile

### 2.4 Users · PASS · paiements

- [ ] Users — liste paginée · recherche · édition rôle
- [ ] **Inviter** utilisateur → e-mail reçu
- [ ] **Waitlist** → pré-création compte `invited`
- [ ] PASS — prix Guinée · octroi manuel
- [ ] Paiements — liste · **Resync** Djomy · refs transaction
- [ ] Export CSV / analytics revenus (si visible)

### 2.5 Contenu & éditorial

- [ ] Contenu — filtres events / spots / outils
- [ ] Créer / modifier via ContentEditor
- [ ] À la une · archiver
- [ ] Idée communautaire → ouvrir éditeur prérempli
- [ ] Transfert propriétaire (THE LOOP ↔ partenaire) — voir Phase 3.5 mobile

### 2.6 Loop · privilèges · TEAMS

- [ ] Loop hub — sections éditoriales
- [ ] Privilège **associé** (partenaire + contenu) → catalogue actif après acceptation
- [ ] TEAMS — toggles overrides par membre staff

### 2.7 Paramètres

- [ ] Gates (inscription, PASS, maintenance, pré-lancement)
- [ ] Pays · catégories · permissions admins délégués
- [ ] Types privilège · standalone benefit
- [ ] Automatisations · jobs
- [ ] Horaires · onglets app
- [ ] **Paliers** partenaires — éditer · archiver · voir Archives

### 2.8 Tirage (admin-web)

- [ ] Pool éligibles affiché (> 0 en prod GN typiquement)
- [ ] Filtres rôles · scope contenu / standalone
- [ ] Tirage test → historique mis à jour (`draw_city`)
- [ ] **Ne pas spammer** : 1 tirage test suffit par session QA

### 2.9 Notifications

- [ ] Envoi immédiat audience **Tous** → statut `sent`
- [ ] Audiences : favoris · anniversaires · individuel
- [ ] Planifier · modifier · **annuler** · supprimer campagne
- [ ] Historique — statuts `sent` / `failed` / `cancelled`

> Détail push : `07-Smoke-Push.md`

---

## Phase 3 — Mobile par rôle (📱🤖)

### 3.1 Non connecté (gate Auth)

- [ ] App ouverte → **écran Connexion** uniquement (pas Accueil)
- [ ] Pas de bottom nav · pas de catalogue
- [ ] Connexion · inscription (si gate ON) · mot de passe oublié · activation invité
- [ ] Lien **Pro ? Rejoindre THE LOOP**
- [ ] Double tap logo → **Code établissement** (validation privilège)
- [ ] CGU / Politique confidentialité

### 3.2 Membre gratuit (`member`)

- [ ] Thème clair · Accueil · Agenda · Spots · Outils
- [ ] Favoris via **bottom nav** (pas menu profil)
- [ ] Pas de filtre LoopX / Loop Prime · pas de contenu `prime`
- [ ] Profil · code parrain · contact `contact@theloop-app.com`

### 3.3 Loop Prime (`prime` + PASS actif)

- [ ] Thème sombre & or
- [ ] Filtres LoopX (agenda) · Loop Prime (spots)
- [ ] Contenu `visibility: prime` accessible
- [ ] Répertoire · Abonnement via profil / nav Prime
- [ ] Favoris via **menu profil** (pas seulement bottom nav selon build)

### 3.4 Partenaire (`partner`)

- [ ] Thème teal · onglet **Pro** · Stats depuis Espace Pro
- [ ] Soumission event/spot/outil → pending · modifier · annuler pending
- [ ] Rejet admin + motif · resoumission
- [ ] Demande retrait · annulation · notif décision admin
- [ ] Scan QR / code établissement · validation privilège membre
- [ ] Favoris onglet dédié

### 3.5 Admin mobile (`super_admin` / `admin`)

- [ ] Onglet Administration · thème bordeaux (super) ou gris bleu (délégué)
- [ ] Modération · users · PASS · paiements · contenu · accueil
- [ ] Push Control Tower — immédiat + planifié + annulation
- [ ] Paramètres · paliers · parrainage (super admin)
- [ ] **Transfert contenu** THE LOOP ↔ partenaire :
  - [ ] THE LOOP → partenaire : code validation = code **partenaire**
  - [ ] Partenaire → THE LOOP : code validation = code **équipe THE LOOP**

---

## Phase 4 — Push notifications

### 4.1 Immédiat (sans cron)

- [ ] **💻** Campagne « Membres » → `sent`
- [ ] **📱🤖** Compte membre : inbox + **1** push OS
- [ ] Compte Prime **ne reçoit pas** (ciblage membre seul)

### 4.2 Planifié (**⏳**)

- [ ] **💻** Planifier Prime dans **+3 min**
- [ ] **⏳** Attendre 5–10 min → statut `sent`
- [ ] **📱🤖** Prime reçoit inbox + push
- [ ] Annulation campagne planifiée → `cancelled` · pas d’envoi
- [ ] **Pas de doublon** (1 campagne = 1 notif)

### 4.3 Échec

- [ ] Campagne `failed` → badge **Échec** historique admin-web

---

## Phase 5 — Transversal & régression rapide

### Auth & comptes

- [ ] Login → Accueil · logout → Auth bloqué
- [ ] Mot de passe oublié → mail → nouvel MDP in-app
- [ ] Invitation admin-web → activation compte · bon rôle

### Contact & support

- [ ] Profil → `contact@theloop-app.com` · feuille contact mailto
- [ ] FAQ / CGU → e-mail support à jour (migration)

### Parrainage

- [ ] Code parrain visible profil
- [ ] Nouveau filleul → compteur +1
- [ ] 10 filleuls / an → mois Prime *(test long — compte dédié sandbox)*

### Régression 5 min

- [ ] Cold start sans crash
- [ ] Retour arrière-plan OK
- [ ] Images contenu chargées
- [ ] Publication admin → visible membre après refresh
- [ ] Navigation fluide (pas de refresh loop)

### Parité 📱 vs 🤖

- [ ] Auth bloqué identique
- [ ] Navigation par rôle identique
- [ ] Push OS des deux côtés
- [ ] Partenaire soumission + modération OK
- [ ] Admin modération OK

---

## Résultats automatisés admin-web (20 sept. 2026)

Smoke Playwright + API Supabase exécuté par agent cloud (prod).

| Test | Résultat | Détail |
|------|----------|--------|
| Site `/login` | **PASS** | HTTP 200 |
| Auth Supabase | **PASS** | `super_admin` · actif · pays GN |
| Permissions RPC | **PASS** | 17 permissions |
| Login UI → redirect | **PASS** | `/insights` |
| Sélecteur pays Guinée | **PASS** | |
| Insights · Accueil · Contenu | **PASS** | |
| Users | **PASS** | Charge en ~4 s (domcontentloaded) |
| Demandes · Privilèges · Tirage | **PASS** | ~800 éligibles tirage |
| PASS · Notifications · Param. | **PASS** | |
| Demandes onglets | **PASS** | Partenariat · Modération · Idée |

**Non testé automatiquement (manuel requis) :** modération approve/reject, retrait approve, tirage réel, push planifié cron, mutations données.

---

## Journal de session

```
Date :
Testeur :
Build iPhone :
Build Android :
Admin-web déployé : oui / non
Render à jour : oui / non
Branch / PR :

Phase 1 retests :
  1.1 Cloche admin        : PASS / FAIL / BLOCKED — 
  1.2 Annuler retrait     : PASS / FAIL / BLOCKED — 
  1.3 Approuver retrait   : PASS / FAIL / BLOCKED — 
  1.4 Tirage Prime        : PASS / FAIL / BLOCKED — 
  1.5 Tirage membre       : PASS / FAIL / BLOCKED — 
  1.6 Modération speakers : PASS / FAIL / BLOCKED — 

Phase 2 admin-web         : PASS / FAIL / BLOCKED — 
Phase 3 mobile            : PASS / FAIL / BLOCKED — 
Phase 4 push              : PASS / FAIL / BLOCKED — 

Bloquant build EAS ?      : oui / non
Notes :
```

---

## Références

- Smoke historique (détail legacy) : `08-Smoke-Global.md`
- Push détaillé : `07-Smoke-Push.md`
- Gates prod : `15-Lancement-Gates-Prod.md`
- Rôles & nav : `06-Roles-Permissions-Navigation.md`
