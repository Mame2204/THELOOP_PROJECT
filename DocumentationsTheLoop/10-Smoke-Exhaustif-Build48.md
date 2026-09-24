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

## Guide session iOS build 48 — tests unitaires & packs

> **Objectif :** reprendre le smoke **une brique à la fois** ou **pack par pack**, sans relire toute la checklist.  
> **Format de réponse :** `A4-U3 PASS` · `A4-U3 FAIL: motif` · ou `PACK A4-1 OK` (tout le pack d’un coup).

### Position actuelle *(pilotée agent · pas le testeur device)*

| Élément | Valeur |
|---------|--------|
| **Avancement smoke** | **272 / 388** ≈ **70 %** global · **Web 75/109 (69 %)** · **iOS 110/181 (61 %)** · **Android 95/152 (63 %)** |
| **Admin-web 💻 (hors modération/retraits profonds)** | **~95 %** — reste B6 archiver/transfert · B8 · B9 négatif · PASS prix/messages · B5 planif. optionnel |
| **Prochain test** | **💻** B6 archiver/transfert · **B8** · **B9** délégué · B5 planifier *(option)* · **📱 build 49+** modération · refus privilège · octroi scan · LoopX |
| **Doc smoke** | **`DocumentationsTheLoop/10-Smoke-Exhaustif-Build48.md`** (build 48+) — pas une « version app », checklist QA |
| **Compte** | `admin@theloop.gn` (web) · membre perso achat PASS |
| **📱 iOS build 48** | A1 · A2 · A3 · A4 · A5 partiel · **achat PASS OM OK** |
| **🤖 Android build 48** | Smoke allégé + **achat PASS MTN OK** (cron · notif) · retour app **PR #9** |
| **Reporté build 49+** | LoopX · octroi individuel · **Accueil slider À la une** (migration `20260937`) · événements sans date (fallback app) · **A5-U23–U25 · Phase 1 · B2 refus · notifs modération** (PR #7) · **A4-4/5/6** 🤖 |
| **Règle session** | Bug identifié → noter FAIL · fix PR · retest build cible |

> Le testeur n’a pas à choisir la suite : l’agent tient ce tableau + le journal.

### Métriques — pourquoi deux pourcentages ?

| Libellé | Décompte | Rôle |
|---------|----------|------|
| **388 · checklists markdown** | Chaque ligne `- [ ]` / `- [x]` (Parties A–D, packs mobile, B5, etc.) | **Référence honnête** du fichier — aujourd’hui **272 / 388 ≈ 70 %**. |
| **505 · toutes cases `[ ]` / `[x]`** | Inclut **tableaux** (Phase 1 mobile, C1 push, colonnes inventaire routes, doublons 📱/🤖) | Plus large · **~327 / 505 ≈ 65 %** — normal qu’il soit **plus bas**. |
| **« 378 / 299 » (ancien pilotage)** | Estimation **manuelle** « cas QA prioritaires go-live », pas un grep automatique | **Obsolète** — remplacé par **388**. **Ce n’était pas un bug build 49.** |

### Avancement par plateforme *(décompte agent · 25 sept. 2026)*

> Chaque **ligne** `- [ ]` compte **une fois** dans le global. Une ligne **📱** ou **🤖** ne compte que pour cette plateforme ; **📱🤖** compte pour **iOS et Android**. Le global **68 %** reste bas surtout parce que la checklist inclut **tout le mobile** (A1–A5, parité 🤖, Phase 1, C1, admin mobile…) alors que le web a été massacré en QA cette semaine.

| Plateforme | Coché | Total | % | Commentaire |
|------------|------:|------:|---:|-------------|
| **💻 Web** | **75** | **109** | **69 %** | Lignes `💻` + colonne test inventaire routes (24 pages). |
| **📱 iOS** | **110** | **181** | **61 %** | Lignes `📱` + lignes `📱🤖` + colonne 📱 tableaux Phase 1 / C1 (18). |
| **🤖 Android** | **95** | **152** | **63 %** | Lignes `🤖` + lignes `📱🤖` + colonne 🤖 tableaux (18) — parité **liste A** testeur 24 sept. |
| **Global (1 ligne = 1 case)** | **272** | **388** | **70 %** | Une case cochée une seule fois, toutes plateformes confondues. |

**Build 49+** = une **partie** des ~32 % restants (LoopX, refus privilège, octroi scan, modération notifs…) — pas une erreur de pourcentage.

---

### Déjà fait (ne pas refaire)

| Bloc | Statut |
|------|--------|
| A1 sans compte | ✅ |
| A2 membre (nav · fiches · compte · interactions) | ✅ |
| A2 PassPayment / MyBenefits | ⏸ voir **A2-U1 / A2-U2** |
| A3 Prime (thème · Mon PASS · privilèges · nav) | ✅ |
| A3 LoopX / spots prime / contenu prime | 🔒 BLOCKED prochain build |

---

### A2 — Reste membre (optionnel · 2 unités)

| ID | Action | Compte | Attendu |
|----|--------|--------|---------|
| **A2-U1** | Profil → Découvrir Prime → forfait → **PassPayment** (sans payer si tu veux) | membre perso | Écran paiement s’ouvre · montant · moyens affichés |
| **A2-U2** | Chercher entrée **Mes privilèges** | membre perso | **N/A attendu** — pas de menu · noter si trouvé via notif |

---

### A4 — Partenaire

#### PACK A4-1 — Connexion & shell *(~3 min · enchaînable)*

| ID | Action | Attendu |
|----|--------|---------|
| **A4-U1** | Se déconnecter → se connecter **`contact@lavenue.gn`** | Login OK · Accueil partenaire |
| **A4-U2** | Regarder le thème global | **Teal / gris pro** (pas violet Prime · pas clair membre) |
| **A4-U3** | Bottom nav | **Accueil · Agenda · Spots · Outils · Favoris · Pro · Profil** — **pas** Stats en barre |
| **A4-U4** | Onglet **Pro** | Hub **PartnerProScreen** · tuiles modules visibles |

#### PACK A4-2 — Hub Pro lecture seule *(~5 min)*

| ID | Action | Attendu |
|----|--------|---------|
| **A4-U5** | Pro → **Mes contenus** | Listes publié / en attente / rejeté |
| **A4-U6** | Pro → **Performances** | `PartnerStatsScreen` s’ouvre |
| **A4-U7** | Pro → **À la une** | `PartnerFeaturedScreen` |
| **A4-U8** | Pro → **Privilèges offerts** | `PartnerBenefitsScreen` |
| **A4-U9** | Pro → **Récompenses** | `PartnerRewardsScreen` |

#### PACK A4-3 — Soumissions création *(~10 min · enchaîner U10→U12)*

| ID | Action | Attendu |
|----|--------|---------|
| **A4-U10** | Mes contenus → **Nouvel événement** → remplir minimum → soumettre | Statut **pending** · visible en attente |
| **A4-U11** | Idem **spot** | pending |
| **A4-U12** | Idem **outil** | pending |

#### PACK A4-4 — Soumissions cycle de vie *(~10 min)*

| ID | Action | Attendu |
|----|--------|---------|
| **A4-U13** | Modifier une soumission **pending** | Sauvegarde OK |
| **A4-U14** | **Annuler** une soumission pending | Disparaît ou statut annulé |
| **A4-U15** | Liste contenus **publiés** | Events/spots publiés visibles |
| **A4-U16** | Ouvrir un **rejeté** (si dispo) · lire motif · **resoumettre** | Motif affiché · resoumission OK |
| **A4-U17** | Créer/modifier event avec **intervenant sans titre** | Pas de crash · validation OK |

#### PACK A4-5 — Retraits *(~8 min · lie Phase 1 #2–#3)*

| ID | Action | Attendu |
|----|--------|---------|
| **A4-U18** | Sur contenu **publié** → demander **retrait** | Demande pending |
| **A4-U19** | **Annuler** le retrait pending | Contenu reste publié / visible Mon contenu |
| **A4-U20** | *(plus tard, après modération admin)* notif approve / refuse | Push ou cloche inbox |

#### PACK A4-6 — Validation privilèges *(~8 min)*

| ID | Action | Attendu |
|----|--------|---------|
| **A4-U21** | Pro → validation par **code** `CODE-XXXXX` | `PartnerValidationCodeScreen` · saisie OK |
| **A4-U22** | Pro → **scan QR** membre | `PartnerBenefitScanScreen` caméra / permission |
| **A4-U23** | Après scan → **accepter / refuser** | `PartnerBenefitConfirmScreen` |
| **A4-U24** | Vérifier notif **privilège à valider** dans Pro | Badge ou entrée visible |

#### PACK A4-7 — Catalogue public *(~3 min)*

| ID | Action | Attendu |
|----|--------|---------|
| **A4-U25** | Parcourir Accueil / Agenda / Spots / Outils / Profil | Comme membre · thème partenaire |
| **A4-U26** | **Favoris** (bottom nav) | Liste favoris partenaire OK |

---

### A5 — Admin mobile

> Compte : **`admin@theloop.gn`** · enchaîner les packs dans l’ordre.

#### PACK A5-1 — Accès & shell *(~3 min)*

| ID | Action | Attendu |
|----|--------|---------|
| **A5-U1** | Login admin | Onglet **Administration** visible |
| **A5-U2** | Thème | **Bordeaux** super admin |
| **A5-U3** | `AdminWorkspaceScreen` | Sidebar modules |
| **A5-U4** | *(si compte délégué dispo)* modules masqués selon droits | Sinon skip |

#### PACK A5-2 — Sidebar tour *(~15 min · 1 module = 1 réponse)*

| ID | Module | Attendu |
|----|--------|---------|
| **A5-U5** | Insights | Écran charge |
| **A5-U6** | Accueil admin | Écran charge |
| **A5-U7** | Onglets & Espace Pro | Écran charge |
| **A5-U8** | Hub THE LOOP | Écran charge |
| **A5-U9** | Contenu | Liste events/spots |
| **A5-U10** | Utilisateurs | Liste users |
| **A5-U11** | Demandes | Hub partenariats / modération / idées |
| **A5-U12** | Privilèges THE LOOP | Catalogue |
| **A5-U13** | Privilèges TEAMS | Overrides staff |
| **A5-U14** | Tirage au sort | Pool · historique |
| **A5-U15** | Gestion PASS | Octroi · catalogue |
| **A5-U16** | Compta PASS | Écran charge |
| **A5-U17** | Paramètres | Sous-menus accessibles |

#### PACK A5-3 — Actions critiques *(1 action = 1 unité · ~20 min)*

| ID | Action | Attendu |
|----|--------|---------|
| **A5-U18** | Modération → **approuver** événement partenaire (U10) | Visible Agenda public |
| **A5-U19** | Modération → **refuser** + motif | Modale au-dessus clavier · partenaire voit motif |
| **A5-U20** | Modération → **approuver retrait** | Contenu disparaît catalogue |
| **A5-U21** | Modération → **refuser retrait** | Notif partenaire |
| **A5-U22** | Users → changer rôle / suspendre | Persisté |
| **A5-U23** | PASS → octroi manuel | Membre voit PASS |
| **A5-U24** | Tirage → lancer · notif gagnant | Push « Nouveau privilège » |
| **A5-U25** | Push immédiat audience Tous | Reçu sur device test |

---

### Phase 1 — Retests bloquants *(croisés mobile + admin)*

| ID | Scénario | Qui teste | Prérequis |
|----|----------|-----------|-----------|
| **P1-U1** | Soumission partenaire → admin push + cloche | A4-U10 puis admin | Compte admin |
| **P1-U2** | Partenaire annule retrait pending | A4-U19 | U18 fait avant |
| **P1-U3** | Admin approuve retrait → disparaît app | A5-U20 | U18 fait |
| **P1-U4** | Tirage → push gagnant + fiche déverrouillée | A5-U24 | Compte Prime |
| **P1-U5** | Tirage membre non-Prime → pas « réservé Prime » | Tirage + membre | Compte membre |
| **P1-U6** | Privilège lié · Prime sans octroi = cadenas | Fiche contenu | Compte Prime |
| **P1-U7** | Event + intervenant sans titre → validation | A4-U17 + modération | Partenaire + admin |

---

### Ordre recommandé (tu peux t’arrêter après chaque pack)

```
A4-1 → A4-2 → A4-3 → A4-4 → A4-5 → A4-6 → A4-7
  → A5-1 → A5-2 → A5-3
  → P1-U1 … P1-U7
  → A2-U1 · A2-U2 (optionnel)
```

**Reprise :** envoie juste l’ID (`A4-U6 PASS`) — je coche la checklist principale + le journal.

---

## Phase 0 — Prérequis

### Environnement
- [x] **📱** Build cible installé — **build 48** · lancement OK *(20 sept. 2026)*
- [x] **🤖** Idem Android — **build 48** · installé · lancement OK *(20 sept. 2026)*
- [x] **💻** Admin-web déployé *(23 sept. 2026 · https://admin.theloop-app.com accessible · workflow « Deploy admin-web » vert sur `main`)*
- [x] **⏳** Serveur Render à jour *(23 sept. 2026 · `https://api.theloop-app.com/health` → 200 · invite mail → web OK · **≠** obligation d’exécuter les `.cmd` ops)*

> **Comment cocher Phase 0 (général)** : pas de procédure magique — tu confirmes que tu peux **utiliser** l’admin, que l’**API** répond, et que ton **build 48** tourne. Les scripts `test-auth-invite-urls.cmd` / `deploy-edge-invite.cmd` sont **optionnels** (vérif infra / redeploy Edge), **pas** une case du smoke invite.

### Qualité code
- [x] `cd mobile && npm run typecheck` → 0 erreur *(22 sept. 2026 · agent)*
- [x] `cd mobile && npm test` → 131 tests verts *(22 sept. 2026 · agent)*
- [x] `cd admin-web && npm run build` → OK *(22 sept. 2026 · agent · branche PR #7)*

### Migrations Supabase
- [x] `20260916_admin_push_campaign_failed_status.sql` *(23 sept. 2026 · testeur · Supabase prod OK)*
- [x] `20260916_support_email_contact_theloop_app.sql` *(23 sept. 2026 · OK)*
- [x] `20260918_partner_accept_activate_catalog.sql` *(23 sept. 2026 · OK)*
- [x] `20260919_event_speakers_default_empty_title.sql` *(23 sept. 2026 · OK)*
- [x] `20260925_admin_benefit_draws_draw_city.sql` — tirage `draw_city` *(23 sept. 2026 · OK)*
- [x] `20260935_individual_grant_redemption_materialize.sql` — octroi individuel + « Utiliser » *(23 sept. 2026 · OK · **retest device requis**)*
- [x] `20260936_partner_validation_partner_match.sql` — validation partenaire (rapprochement code / établissement) *(23 sept. 2026 · **OK Supabase** · retest device après **build mobile 49+**)*
- [x] `20260937_catalog_fingerprint_featured.sql` — resync mobile après « À la une » admin-web *(23 sept. 2026 · **OK Supabase prod** · retest « À la une » après build **49+**)*
- [x] `20260940_admin_benefit_grants_analytics_rpc.sql` — RPC octrois Insights *(24 sept. 2026 · **OK Supabase prod** · testeur)*
- [x] `20260941_admin_read_all_benefit_grants.sql` — admin lit tous les octrois *(24 sept. 2026 · **OK Supabase prod** · KPI Insights Privilèges PASS)*
- [ ] `20260939_invite_default_names_by_role.sql` — prénom défaut Partenaire / Membre selon rôle invite *(à appliquer Supabase · puis redeploy Edge `member-activate-invite`)*

### Gates (super admin → Paramètres)
- [x] **💻** Inscription ON/OFF *(23 sept. 2026 · super admin · Paramètres · prise en compte OK)*
- [x] **💻** Achat PASS ON/OFF *(23 sept. 2026 · idem)*
- [x] **💻** Maintenance ON/OFF *(23 sept. 2026 · idem)*
- [x] **💻** Pré-lancement ON/OFF *(23 sept. 2026 · idem)*

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

- [x] **📱** Gate maintenance ON → écran maintenance *(23 sept. 2026 · build 48 · bypass 4 taps logo OK)*
- [x] **🤖** Idem *(23 sept. 2026 · build 48)*
- [x] **📱** Gate pré-lancement ON → countdown / message *(23 sept. 2026 · bypass OK)*
- [x] **🤖** Idem *(23 sept. 2026)*
- [x] **📱** Bypass 4 taps logo (session) → accès app *(23 sept. 2026 · maintenance + pré-lancement)*
- [x] **🤖** Idem *(23 sept. 2026)*

---

## A1 — Non connecté (`USER_ANONYMOUS`)

> Pas de bottom nav · pile Auth uniquement.

### `AuthScreen` — modes
- [x] **📱** Mode **login** — écran initial · champs e-mail / MDP *(20 sept. 2026 · build 48)*
- [x] **🤖** Idem *(21 sept. 2026 · build 48 · A1 PASS)*
- [x] **📱** Mode **signup** — formulaire inscription (si gate ON) *(23 sept. 2026 · build 48)*
- [x] **🤖** Idem *(23 sept. 2026 · build 48)*
- [x] **📱** Gate signup OFF → pas d’onglet inscription *(20 sept. 2026 · build 48)*
- [x] **🤖** Idem *(21 sept. 2026 · build 48 · A1 PASS)*
- [x] **📱** Mode **activate** — activation compte invité *(23 sept. 2026 · build 48 · sans lien mail · e-mail invite + MDP · connecté)*
- [x] **🤖** Idem *(24 sept. 2026 · build 48 · e-mail invite + MDP · connecté)*
- [x] **📱** Mode **reset** — mot de passe oublié · e-mail reçu *(23 sept. 2026 · build 48)*
- [x] **🤖** Idem *(23 sept. 2026 · e-mail OK)*
- [ ] **📱** Mode **set_password** — page recovery **rendue** (boutons visibles · pas de balises HTML brutes) *(deploy Render : sync Storage text/html + site_url api · **nouvel e-mail** reset après deploy)*
- [ ] **🤖** Idem *(cause confirmée : URL Storage `app-public/auth/auth-callback.html` servie en **text/plain** — pas la page API)*
- [ ] **📱** Recovery → **set_password in-app** via « Ouvrir l’application » *(retest post-deploy auth-callback)*
- [ ] **🤖** Idem
- [x] **📱** Lien **Pro ? Rejoindre THE LOOP →** · demande partenariat *(23 sept. 2026 · build 48 · super admin reçoit la demande)*
- [x] **🤖** Idem *(23 sept. 2026)*
- [x] **📱** CGU / Politique confidentialité (modales) *(23 sept. 2026 · build 48)*
- [x] **🤖** Idem *(23 sept. 2026)*

### Stack Auth (routes autorisées)
- [x] **📱** `PartnerApplyScreen` — demande partenariat *(23 sept. 2026 · build 48 · inbox super admin OK)*
- [x] **🤖** Idem *(23 sept. 2026)*
- [x] **📱** `PartnerValidationCodeScreen` — double tap logo → code établissement *(23 sept. 2026 · build 48 · **🤖 Android OK**)*
- [x] **🤖** Idem *(23 sept. 2026)*
- [x] **📱** `PartnerBenefitScanScreen` — scan QR après code valide *(23 sept. 2026 · build 48 · Pro connecté · scan QR Prime — identité OK)*
- [x] **🤖** Idem *(23 sept. 2026 · idem Android)*
- [x] **📱** `PartnerBenefitConfirmScreen` — validation privilège membre *(23 sept. 2026 · privilège **inclus Prime** · scan après « Utiliser » · avantage coché · validé)*
- [x] **🤖** Idem *(23 sept. 2026 · Android)*
- [ ] **📱** `PartnerLoginScreen` — connexion jeton SPOT *(deep link / nav manuelle)*
- [ ] **🤖** Idem

### Bloqué sans connexion
- [x] **📱** Pas Accueil / Agenda / Spots / Outils / Favoris / Profil *(20 sept. 2026 · build 48)*
- [x] **🤖** Idem *(21 sept. 2026 · build 48 · A1 PASS · pile Auth seule)*
- [x] **📱** Pas fiches détail catalogue *(20 sept. 2026 · build 48 · pile Auth seule)*
- [x] **🤖** Idem *(21 sept. 2026 · build 48 · A1 PASS)*

---

## A2 — Membre gratuit (`member`)

### Bottom nav
- [x] **📱** `AccueilScreen` — hero · sondage · parcours · singulier · fragment *(20 sept. 2026 · build 48)*
- [x] **🤖** Idem *(21 sept. 2026 · build 48 · A2 PASS)*
- [x] **📱** `AgendaScreen` — liste événements · filtres · pull refresh *(20 sept. 2026 · build 48)*
- [x] **🤖** Idem *(21 sept. 2026 · build 48 · A2 PASS)*
- [x] **📱** `SpotsScreen` — liste spots · catégories *(20 sept. 2026 · build 48 · pas Loop Prime)*
- [x] **🤖** Idem *(21 sept. 2026 · build 48 · A2 PASS)*
- [x] **📱** `OutilsScreen` — liste outils *(20 sept. 2026 · build 48)*
- [x] **🤖** Idem *(21 sept. 2026 · build 48 · A2 PASS)*
- [x] **📱** `FavorisScreen` — via **bottom nav** (pas menu profil) *(20 sept. 2026 · build 48 · compte membre perso)*
- [x] **🤖** Idem *(21 sept. 2026 · build 48 · A2 PASS)*
- [x] **📱** `ProfilScreen` — infos · code parrain · liens compte *(20 sept. 2026 · build 48 · compte membre perso)*
- [x] **🤖** Idem *(21 sept. 2026 · build 48 · A2 PASS)*
- [x] **📱** Profil · CTA PASS : jamais eu de PASS → **Découvrir Prime** seul ; déjà eu un PASS → **Mon PASS** seul *(build 48 · règle prévue)*
- [x] **🤖** Idem *(23 sept. 2026 · build 48 · membre + Prime)*
- [x] **📱** Pas onglet Pro · pas onglet Admin *(20 sept. 2026 · build 48)*
- [x] **🤖** Idem *(21 sept. 2026 · build 48 · A2 PASS)*
- [x] **📱** Pas filtre LoopX / Loop Prime *(Agenda · build 48 · 20 sept. 2026)*
- [x] **🤖** Idem *(21 sept. 2026 · build 48 · A2 PASS)*
- [x] **📱** Contenu `prime` invisible / cadenas *(20 sept. 2026 · build 48 · compte membre perso)*
- [x] **🤖** Idem *(21 sept. 2026 · build 48 · A2 PASS)*

### Stack détail contenu
- [x] **📱** `EventDetailScreen` — depuis Agenda / Accueil / Favoris *(20 sept. 2026 · build 48)*
- [x] **🤖** Idem *(21 sept. 2026 · build 48 · A2 PASS)*
- [x] **📱** `SpotDetailScreen` — depuis Spots / Accueil *(20 sept. 2026 · build 48)*
- [x] **🤖** Idem *(21 sept. 2026 · build 48 · A2 PASS)*
- [x] **📱** `CreatorCornerDetailScreen` — Le Singulier *(20 sept. 2026 · build 48 · compte membre perso)*
- [x] **🤖** Idem *(24 sept. 2026 · build 48)*
- [x] **📱** `FragmentDetailScreen` — Le Fragment *(20 sept. 2026 · build 48 · compte membre perso)*
- [x] **🤖** Idem *(24 sept. 2026 · build 48)*
- [x] **📱** `LoopWalksListScreen` + `LoopWalkDetailScreen` — parcours *(20 sept. 2026 · build 48 · compte membre perso)*
- [x] **🤖** Idem *(24 sept. 2026 · build 48)*
- [x] **📱** `PartnerPublicScreen` — depuis parcours *(20 sept. 2026 · build 48 · compte membre perso)*
- [x] **🤖** Idem *(24 sept. 2026 · build 48)*

### Compte & services
- [x] **📱** `EditProfilScreen` — modifier nom / photo *(20 sept. 2026 · build 48 · compte membre perso)*
- [x] **🤖** Idem *(23 sept. 2026 · **changement mot de passe** profil OK)*
- [x] **📱** `SettingsScreen` — paramètres app *(20 sept. 2026 · build 48 · compte membre perso)*
- [x] **🤖** Idem *(23 sept. 2026 · build 48 · membre + Prime)*
- [x] **📱** `NotificationsScreen` — cloche header · inbox *(20 sept. 2026 · build 48)*
- [x] **🤖** Idem *(23 sept. 2026 · build 48 · réception notifs OK · membre + Prime)*
- [x] **📱** `ReferralScreen` — parrainage · code · compteur filleuls *(20 sept. 2026 · build 48 · compte membre perso)*
- [x] **🤖** Idem *(23 sept. 2026 · build 48 · code + compteur filleuls · membre + Prime)*
- [x] **📱** `SuggestionScreen` — envoyer idée *(20 sept. 2026 · build 48 · compte membre perso)*
- [x] **🤖** Idem *(24 sept. 2026 · build 48 · testeur OK)*
- [x] **📱** `PrimeScreen` — boutique PASS · forfaits + prix · bouton paiement *(20 sept. 2026 · build 48 · gate achat PASS ON · compte membre perso)*
- [x] **🤖** Idem *(23 sept. 2026 · build 48 · **📱🤖** boutique visible · achat OK)*
- [x] **📱** `AbonnementScreen` — Mon PASS *(20 sept. 2026 · build 48 · membre sans PASS actif · comportement prévu)*
- [x] **🤖** Idem *(23 sept. 2026 · build 48 · en cours + en attente · membre achat MTN)*
- [x] **📱** `PassPaymentScreen` — flux paiement Djomy *(23 sept. 2026 · build 48 · **📱🤖** OM / MTN · PASS + notif cloche · cron ~5 min · retour app Android PR #9)*
- [x] **🤖** `PassPaymentScreen` — achat PASS MTN membre *(23 sept. 2026 · build 48 · **PASS** en file + **notif cloche** · sync différée cron · abandon 1ʳᵉ tentative = ligne sans débit)*
- [ ] **📱** `MyBenefitsScreen` — Mes privilèges *(si entrée UI / notif)*
- [ ] **🤖** Idem

### Interactions
- [x] **📱** Ajouter / retirer favori *(20 sept. 2026 · build 48)*
- [x] **🤖** Idem *(21 sept. 2026 · build 48 · A2 PASS)*
- [x] **📱** Tentative favori sans compte → page connexion Auth *(20 sept. 2026 · build 48 · pile Auth sans compte)*
- [x] **🤖** Idem *(23 sept. 2026 · build 48 · pas d’accès favoris sans compte OK)*
- [x] **📱** Recherche inline (Agenda / Spots) *(20 sept. 2026 · build 48 · compte membre perso)*
- [x] **🤖** Idem *(23 sept. 2026 · barre de recherche OK)*
- [x] **📱** Profil → contact `contact@theloop-app.com` *(20 sept. 2026 · build 48 · compte membre perso)*
- [x] **🤖** Idem *(23 sept. 2026 · build 48)*

---

## A3 — Loop Prime (`prime` + PASS actif)

### Spécificités rôle
- [x] **📱** Thème sombre & or *(build 48 · compte carte membre Prime · **thème violet/indigo** en app — attendu mobile actuel)*
- [x] **🤖** Idem *(22 sept. 2026 · build 48 · **violet/indigo** — pas or · OK mobile actuel)*
- [x] **📱** Filtre **LoopX** (Agenda) visible *(20 sept. 2026 · build 48 · compte carte membre Prime · **BLOCKED** — absent sur ce build ; attendu PR #4 / prochain build)*
- [ ] **🤖** Idem *(24 sept. · testeur : **build 49+** · ne pas cocher avant binaire)*
- [x] **📱** Filtre **Loop Prime** (Spots) visible *(20 sept. 2026 · build 48 · compte carte membre Prime · **BLOCKED** — absent sur ce build ; attendu prochain build)*
- [ ] **🤖** Idem *(24 sept. · testeur : **build 49+**)*
- [x] **📱** Contenu `visibility: prime` accessible *(20 sept. 2026 · build 48 · compte carte membre Prime · **FAIL / BLOCKED** — Agenda n’inclut pas `primeEvents` · Spots exclut `visibility: prime` ; attendu PR #4 / prochain build)*
- [ ] **🤖** Idem *(24 sept. · testeur : **build 49+**)*
- [x] **📱** Favoris via menu profil (pas seulement bottom nav) *(20 sept. 2026 · build 48 · compte carte membre Prime · **écart mobile** — aucune entrée Favoris dans Profil · accès via **bottom nav** comme membre · spec PWA = menu profil Prime)*
- [x] **🤖** **PASS écart** *(22 sept. 2026 · build 48 · **pas de favoris via Profil** · favoris via nav — conforme mobile)*

### Écrans Prime (reprendre A2 +)
- [x] **📱** `AccueilScreen` — contenu Prime / hero *(20 sept. 2026 · build 48 · compte carte membre Prime · navigation OK · thème violet)*
- [x] **🤖** Accueil · blocs hero/sections *(22 sept. 2026 · build 48 · Prime Android)*
- [x] **📱** `AgendaScreen` — événements LoopX *(20 sept. 2026 · build 48 · navigation OK · LoopX contenu **BLOCKED** cf. A3.2)*
- [x] **🤖** Agenda / événements *(22 sept. 2026 · build 48 · nav OK)*
- [x] **📱** `SpotsScreen` — spots exclusifs *(20 sept. 2026 · build 48 · navigation OK · spots prime **BLOCKED** cf. A3.3)*
- [x] **🤖** Spots *(22 sept. 2026 · build 48)*
- [x] **🤖** `OutilsScreen` *(22 sept. 2026 · build 48 · Prime Android)*
- [x] **🤖** `FavorisScreen` · `ProfilScreen` *(22 sept. 2026 · build 48)*
- [x] **📱** `PrimeScreen` — statut PASS actif *(20 sept. 2026 · build 48 · **N/A statut** — statut PASS = **Profil / Mon PASS / Abonnement** ; `PrimeScreen` = **boutique achat** « Choisissez votre PASS » via « Acheter un autre PASS »)*
- [x] **🤖** `PrimeScreen` — boutique PASS *(23 sept. 2026 · build 48 · aligné 📱)*
- [x] **📱** `AbonnementScreen` — détail abonnement *(20 sept. 2026 · build 48 · compte carte membre Prime · **PASS en cours** + **1 en attente** · relais auto à expiration)*
- [x] **🤖** Mon PASS — **en cours** + **en attente** *(22 sept. 2026 · build 48)*
- [x] **🤖** `EditProfilScreen` · `SettingsScreen` · déconnexion *(22 sept. 2026 · build 48)*
- [x] **🤖** Profil — Nous contacter · numéro / e-mail / site · **Nous rejoindre** *(22 sept. 2026 · build 48)*

### Privilèges & fiches
- [x] **📱** Fiche event/spot avec privilège → **Utiliser chez le partenaire** *(20 sept. 2026 · build 48 · compte carte membre Prime · parcours complet : cadenas → octroi → utilisation → **quota atteint**)*
- [x] **🤖** Idem *(23 sept. 2026 · build 48 · Android · privilège **inclus Prime** · scan partenaire OK)*
- [x] **📱** Privilège sans octroi → cadenas *(20 sept. 2026 · build 48 · état initial observé avant octroi)*
- [x] **🤖** Idem *(23 sept. 2026 · Android · membre · cadenas sur fiches / spots)*
- [x] **📱** Privilège octroyé (tirage / admin / **Prime**) → déverrouillé *(20 sept. 2026 · build 48 · déverrouillé après octroi · puis consommé)*
- [x] **🤖** Idem *(23 sept. 2026 · Android · Prime · liste fiche détail déverrouillée)*
- [x] **📱** Notifs cloche Prime — **en attente validation** + **privilège validé** *(23 sept. 2026 · build 48 · après « Utiliser » puis validation partenaire · **📱 iOS + 🤖 Android**)*
- [x] **📱** `MyBenefitsScreen` — liste privilèges actifs *(20 sept. 2026 · build 48 · **BLOCKED / N/A** — écran « Mes privilèges » sans entrée UI visible dans l’app · privilèges consultés sur **fiche détail**)*
- [x] **🤖** Idem *(23 sept. 2026 · **N/A** — pas d’entrée menu · cohérent build 48)*
- [ ] **📱** **Octroi individuel** (admin → 1 membre) — validation partenaire scan QR *(23 sept. 2026 · **FAIL** build 48 · SQL `20260935`+`20260936` **OK** · **retest build 49+** + PR #13 mobile)*
- [ ] **🤖** Idem

---

## A4 — Partenaire (`partner`)

### Bottom nav & hub Pro
- [x] **📱** Thème teal partenaire *(20 sept. 2026 · build 48 · contact@lavenue.gn · A4-U2 PASS)*
- [x] **🤖** Idem *(21 sept. 2026 · build 48 · PACK A4-1 OK · A4-U2)*
- [x] **📱** `PartnerProScreen` (tab Pro) — hub modules *(20 sept. 2026 · build 48 · A4-U1/U3/U4 PASS · login partenaire · bottom nav avec Pro · hub tuiles OK)*
- [x] **🤖** Idem *(21 sept. 2026 · build 48 · PACK A4-1 OK · A4-U1/U3/U4)*
- [x] **📱** `PartnerContentScreen` — Mes contenus (publié / pending / rejeté) *(20 sept. 2026 · build 48 · A4-U5 PASS)*
- [x] **🤖** Idem *(21 sept. 2026 · build 48 · PACK A4-2 · A4-U5 PASS)*
- [x] **📱** `PartnerStatsScreen` — Performances (depuis Pro, pas bottom nav) *(20 sept. 2026 · build 48 · A4-U6 PASS)*
- [x] **🤖** Idem *(21 sept. 2026 · build 48 · PACK A4-2 · A4-U6 PASS · onglet **Tous** inclut refusés — **by design** · filtre « Refusé » dispo)*
- [x] **📱** `PartnerFeaturedScreen` — À la une *(20 sept. 2026 · build 48 · A4-U7 PASS)*
- [x] **🤖** Idem *(21 sept. 2026 · build 48 · PACK A4-2 · A4-U7 PASS)*
- [x] **📱** `PartnerBenefitsScreen` — Privilèges offerts *(20 sept. 2026 · build 48 · A4-U8 PASS)*
- [x] **🤖** Idem *(21 sept. 2026 · build 48 · PACK A4-2 · A4-U8 PASS)*
- [x] **📱** `PartnerRewardsScreen` — Récompenses THE LOOP *(20 sept. 2026 · build 48 · A4-U9 PASS)*
- [x] **🤖** Idem *(21 sept. 2026 · build 48 · PACK A4-2 · A4-U9 **FAIL partiel** · « Mes récompenses » vide malgré privilège validé · paliers ≠ validation catalogue · voir note)*

### Soumissions & modération
- [x] **📱** `PartnerSubmissionScreen` — créer **événement** → pending *(20 sept. 2026 · build 48 · A4-U10 PASS)*
- [x] **🤖** Idem *(22 sept. 2026 · build 48 · PACK A4-3 · pending OK · **FAIL** aperçu image noir Android)*
- [x] **📱** Soumettre **spot** → pending *(20 sept. 2026 · build 48 · A4-U11 PASS)*
- [x] **🤖** Idem *(22 sept. 2026 · build 48 · PACK A4-3 · pending OK)*
- [x] **📱** Soumettre **outil** → pending *(20 sept. 2026 · build 48 · A4-U12 PASS)*
- [x] **🤖** Idem *(22 sept. 2026 · build 48 · PACK A4-3 · pending OK)*
- [x] **📱** Modifier soumission pending *(20 sept. 2026 · build 48 · A4-U13 PASS)*
- [x] **🤖** Idem *(22 sept. 2026 · build 48 · A4-U13 PASS)*
- [x] **📱** Annuler soumission pending *(20 sept. 2026 · build 48 · A4-U14 PASS partiel · user incertain sur effet visible)*
- [x] **🤖** Idem *(22 sept. 2026 · build 48 · A4-U14 PASS)*
- [x] **📱** Événement · spot existant (liste publiés) *(20 sept. 2026 · build 48 · A4-U15 PASS · badge **Publié** dans Mes contenus · pas d’onglet séparé)*
- [ ] **🤖** Idem *(⏸ **N/A** — rien en **Publié** tant que modération admin · normal)*
- [x] **📱** Voir rejet + motif · resoumettre *(20 sept. 2026 · build 48 · A4-U16 PASS · **motif dans la liste** pas dans l’écran détail · resoumission OK)*
- [ ] **🤖** Idem *(⏸ reporté avec A4-4 complet)*
- [x] **📱** Intervenant sans titre (régression speakers) *(20 sept. 2026 · build 48 · A4-U17 PASS)*
- [ ] **🤖** Idem *(⏸ reporté)*

### Retraits
- [x] **📱** Demander retrait contenu publié *(20 sept. 2026 · build 48 · A4-U18 PASS)*
- [ ] **🤖** Idem *(⏸ **N/A** — pas de contenu publié · reprendre après modération admin)*
- [x] **📱** **Annuler** retrait pending (Phase 1) *(20 sept. 2026 · build 48 · A4-U19 PASS · contenu reste publié)*
- [ ] **🤖** Idem *(⏸ idem A4-5)*
- [ ] **📱** Notif approve / refuse retrait
- [ ] **🤖** Idem

### Validation privilèges
- [x] **📱** `PartnerValidationCodeScreen` — code `CODE-XXXXX` *(20 sept. 2026 · build 48 · A4-U21 **N/A compte connecté** — pas de saisie code sur session partenaire · flux prévu **sans connexion** serveurs / Auth · double-tap logo Auth)*
- [x] **🤖** Idem *(24 sept. 2026 · build 48 · saisie code établissement OK)*
- [x] **📱** `PartnerBenefitScanScreen` — scan QR membre *(20 sept. 2026 · build 48 · A4-U22 PASS · validation identité OK depuis Pro connecté)*
- [x] **🤖** Idem *(23 sept. 2026 · Android · scan Prime sans « Utiliser » puis avec privilège — OK)*
- [x] **📱** `PartnerBenefitConfirmScreen` — accepter / refuser *(20 sept. 2026 · build 48 · A4-U23 PASS)*
- [x] **🤖** Idem *(23 sept. 2026 · Android · privilège Prime coché / validé)*
- [x] **📱** Notif « privilège à valider » dans Pro *(20 sept. 2026 · build 48 · A4-U24 **N/A** — aucun privilège en attente · comportement attendu)*
- [x] **🤖** Flux complet membre Prime « Utiliser » → partenaire voit demande *(23 sept. 2026 · notifs côté Prime **📱🤖** observées)*

### Catalogue & favoris
- [x] **📱** Onglets Accueil / Agenda / Spots / Outils / Favoris / Profil *(20 sept. 2026 · build 48 · A4-U25 PASS)*
- [x] **🤖** Idem *(22 sept. 2026 · build 48 · **A4-7 PASS**)*
- [x] **📱** `FavorisScreen` — favoris partenaire *(20 sept. 2026 · build 48 · A4-U26 PASS)*
- [x] **🤖** Idem *(22 sept. 2026 · build 48 · **A4-7 PASS**)*

---

## A5 — Admin mobile (`super_admin` / `admin`)

### Accès Control Tower
- [x] **📱** Onglet **Administration** (`AdminWorkspaceScreen`) *(20 sept. 2026 · build 48 · A5-U1/U3 PASS · admin@theloop.gn super admin)*
- [x] **🤖** Idem *(22 sept. 2026 · build 48 · **A5-1 PASS**)*
- [x] **📱** Thème bordeaux (super) ou gris bleu (délégué) *(20 sept. 2026 · build 48 · A5-U2 PASS · thème **bordeaux** super admin)*
- [x] **🤖** Idem *(22 sept. 2026 · build 48 · **A5-1 PASS**)*
- [x] **📱** Sidebar — modules masqués selon permissions *(20 sept. 2026 · build 48 · A5-U4 **SKIP** session super admin · compte délégué dispo — retest dédié plus tard)*
- [x] **🤖** Idem *(22 sept. 2026 · build 48 · **A5-1 PASS** · U4 skip super admin)*

### Sidebar — panneaux principaux

| Module | Écran | 📱 | 🤖 |
|--------|-------|----|----|
| Insights | `AdminInsightsScreen` | [x] FAIL partiel | [ ] |
| Accueil | `AdminAccueilScreen` | [x] PASS | [ ] |
| Onglets & Espace Pro | `AdminRubriqueScreen` | [x] PASS | [ ] |
| Hub THE LOOP | `AdminLoopScreen` | [x] PASS *(sauf création hub · retest perf 📱49+)* | [ ] |
| Contenu | `AdminContentScreen` | [x] PASS | [ ] |
| Utilisateurs | `AdminUsersScreen` | [x] FAIL partiel | [ ] |
| Demandes | `AdminDemandesScreen` | [x] FAIL partiel | [ ] |
| Privilèges THE LOOP | `AdminPrimeBenefitsScreen` | [x] PASS | [ ] |
| Privilèges TEAMS | `AdminStaffBenefitsScreen` | [x] FAIL partiel | [ ] |
| Tirage au sort | `AdminBenefitDrawScreen` | [x] PASS | [ ] |
| Gestion PASS | `AdminPassManagementScreen` | [x] PASS | [ ] |
| Compta PASS | `AdminComptaScreen` | [x] PASS | [ ] |
| Paramètres | `AdminSuperSettingsScreen` | [x] PASS | [ ] |

### Hub Demandes (sous-écrans)
- [x] **📱** `AdminPartnershipsScreen` — partenariats pending / approuver / rejeter *(20 sept. 2026 · build 48 · **FAIL partiel** · noms « . » au 1er affichage · OK après pull refresh · cache-first)*
- [ ] **🤖** Idem
- [x] **📱** `AdminModerationScreen` — soumissions · retraits · valider / refuser *(20 sept. 2026 · build 48 · **PACK A5-3 OK** · U18 approuver · U19 refuser+motif · U20 retrait approuvé · U21 retrait refusé)*
- [ ] **🤖** Idem *(24 sept. 2026 · Android · **écran / liste OK** · **approuver · refuser soumission KO** → **build 49+** · aligné 💻 modération reportée)*
- [ ] **📱** `AdminSuggestionsScreen` — idées communauté
- [ ] **🤖** Idem

### Hub THE LOOP (stack)
- [x] **📱** `AdminLoopContentScreen` — **Mon contenu** THE LOOP (liste complète) *(23 sept. 2026 · build 48 · **PASS**)*
- [x] **🤖** Idem *(23 sept. 2026 · **PASS**)*
- [x] **💻** Idem admin-web `/loop?tab=contenu` *(23 sept. 2026 · **PASS**)*
- [x] **📱** `AdminLoopBenefitsScreen` — privilèges offerts *(contenu publié lié · pas modèles Paramètres)* *(23 sept. 2026 · **PASS**)*
- [x] **🤖** Idem *(23 sept. 2026 · **PASS**)*
- [x] **💻** Privilèges offerts web — alignement liste *(23 sept. 2026 · **PASS** · contenu publié lié · `/loop?tab=privileges`)*
- [x] **📱** `AdminLoopFeaturedScreen` — à la une THE LOOP *(23 sept. 2026 · build 48 · **PASS** · aligné web)*
- [x] **🤖** Idem *(23 sept. 2026 · **PASS**)*
- [x] **💻** À la une admin-web `/loop?tab=featured` *(23 sept. 2026 · **PASS**)*
- [x] **📱** `AdminLoopStatsScreen` — performances *(23 sept. 2026 · build 48 · **PASS** · retest **build 49+** : score clics×1+favoris×5+note×10 · pagination 20)*
- [x] **🤖** Idem *(23 sept. 2026 · **PASS** · idem retest build 49+)*
- [x] **💻** Performances web `/loop?tab=stats` *(23 sept. 2026 soir · **PASS** · Tous/Events/Spots/Outils · tri métrique · score engagement · pagination 20 · notes publiques off = 0 avis)*
- [ ] **📱** `PartnerSubmissionScreen` — **création** event/spot/outil depuis hub THE LOOP *(non testé · 23 sept.)*
- [ ] **🤖** Idem
- [x] **📱** `PartnerBenefitScanScreen` — scan QR **depuis compte admin** (hub THE LOOP) *(23 sept. 2026 · **PASS**)*
- [x] **🤖** Idem *(23 sept. 2026 · **PASS**)*

### Paramètres → sous-modules (stack)
- [ ] **📱** `AdminContentCountriesScreen` — pays contenu
- [ ] **📱** `AdminCategoriesScreen` — catégories
- [ ] **📱** `AdminSpotStarsScreen` — étoiles spots
- [ ] **📱** `AdminPartnerMilestonesScreen` — paliers · éditer · archiver
- [ ] **📱** `AdminReferralSettingsScreen` — parrainage
- [ ] **📱** `AdminAutomationJobsScreen` — automatisations · exécuter
- [ ] **📱** `AdminNotificationsScreen` — campagnes push mobile
- [ ] **📱** `AdminStandaloneBenefitScreen` — standalone · création désactivée · toggle actifs / tous · aligné web
- [ ] **📱** `AdminBenefitTypesScreen` — types (onglet standalone)
- [ ] **📱** `AdminLegalScreen` — CGU & légal
- [ ] **📱** `AdminOpeningHoursScreen` — horaires presets
- [ ] **📱** `AdminPermissionsScreen` — permissions admins délégués
- [ ] **🤖** Idem pour chaque sous-module ci-dessus

### Autres écrans admin (stack)
- [ ] **📱** `AdminCreateUserScreen` — créer compte
- [ ] **📱** `AdminWaitlistScreen` — waitlist · pré-créer
- [ ] **📱** `AdminFeaturedScreen` — carousel à la une
- [x] **📱** `AdminPaymentsScreen` — paiements · Resync Djomy *(23 sept. 2026 · build 48 · date **Vérifié Djomy** · badge **Sans débit** / onglet abandons · build 49 pour libellés Resync)*
- [ ] **📱** `PartnerSubmissionScreen` (mode admin) — depuis Contenu / Modération
- [ ] **🤖** Idem

### Actions admin critiques
- [x] **📱** Modération — approuver événement → Agenda public *(20 sept. 2026 · build 48 · A5-U18 PASS)*
- [x] **📱** Modération — refuser + motif · modale au-dessus clavier *(20 sept. 2026 · build 48 · A5-U19 PASS)*
- [x] **📱** Modération — approuver retrait catalogue *(20 sept. 2026 · build 48 · A5-U20 PASS)*
- [x] **📱** Modération — refuser retrait · notif partenaire *(20 sept. 2026 · build 48 · A5-U21 PASS)*
- [x] **📱** Users — changer rôle · suspendre *(20 sept. 2026 · build 48 · A5-U22 PASS)*
- [ ] **📱** PASS — octroi manuel · prix Guinée *(20 sept. 2026 · build 48 · **A5-U23 FAIL** · membre introuvable recherche · bouton grisé · fix PR #7 recherche Supabase)*
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
- [x] **💻** Session stable *(24 sept. 2026 · testeur · connexion / déconnexion / reconnexion OK · atterrit sur Insights)*
- [x] **💻** Déconnexion → `/login` *(24 sept. 2026 · **PASS**)*
- [x] **💻** Menu latéral — badge Demandes si pending *(24 sept. 2026 · **PASS** · ex. 4 = 2 partenariats actifs + 2 idées · onglet Idées à ouvrir pour voir les 2 · détail sur `/demandes` après deploy)*

## B1 — Navigation — toutes les routes

> **B1 = smoke navigation** : chaque entrée du menu latéral **s’ouvre sans erreur** + **coup d’œil** sur les onglets listés ci-dessous (pas de CRUD profond — voir B2–B6). Cocher la colonne **Chargement** quand c’est OK pour toi.

| Route | Page | Chargement | Actions clés | 🤖✓ |
|-------|------|------------|--------------|-----|
| `/insights` | Insights | [x] | **PASS 24 sept.** (testeur) · incl. onglet **Privilèges** après reset tables | [x] |
| `/accueil` | Accueil | [x] | **PASS 24 sept.** (testeur · Accueil web complet post PR #31) | [x] |
| `/onglets` | Onglets | [x] | **PASS 24 sept.** (testeur) | [x] |
| `/loop` | THE LOOP | [x] | Hub éditorial *(contenu · privilèges · à la une · perf — PASS 23 sept.)* · onglets **Contenu / Privilèges / À la une / Performances** — retest si besoin post-deploy Insights | [x] |
| `/contenu` | Contenu | [x] | Filtres · création · à la une *(web PASS · 23 sept.)* | [x] |
| `/contenu/editer/event` | ContentEditor | [ ] | Créer / modifier event | [x] |
| `/contenu/editer/spot` | ContentEditor | [ ] | Créer / modifier spot | [x] |
| `/contenu/editer/tool` | ContentEditor | [ ] | Créer / modifier outil | [x] |
| `/users` | Users | [x] | **PASS 24 sept. soir** (testeur · navigation + usage courant) | [x] |
| `/demandes` | Demandes | [x] | **Partenariats + Idées PASS** · Modération/retraits → **build 49+** | [x] |
| `/privileges` | Privilèges | [x] | **PASS 24 sept.** (testeur · module Privilèges web) | [x] |
| `/teams` | TEAMS | [x] | **PASS 24 sept.** · pack Admin + overrides **par admin** | [x] |
| `/tirage` | Tirage | [x] | **PASS 24 sept.** · pool · lancer · **filtres rôle** | [x] |
| `/pass` | PASS | [x] | **PASS 24 sept.** · octroi héritage gratuit limité · retrait → membre | [x] |
| `/payments` | Paiements | [x] | **PASS 24 sept.** · liste transactions | [x] |
| `/compta` | Compta | [x] | **PASS 24 sept.** · export CSV · revenus · paniers · pagination | [x] |
| `/notifications` | Notifications | [x] | **PASS 24 sept.** · envoi immédiat · rôles · favoris · anniversaire · e-mail ciblé (PR #36) | [x] |
| `/automation` | Automatisations | [ ] | Jobs · exécuter | [x] |
| `/milestones` | Paliers | [ ] | Éditer · archiver | [x] |
| `/etoiles` | Étoiles | [ ] | Spots / outils / parcours | [x] |
| `/horaires` | Horaires | [ ] | Presets ouverture | [x] |
| `/parametres` | Paramètres | [x] | **PASS 24 sept.** · B3 Gates · Pays · Catég. · Légal · Plus · Permissions (par admin) | [x] |
| `/types-privileges` | Types privilèges | [x] | **PASS 24 sept.** · création types *(CRUD déjà en page)* | [x] |
| `/privilege-standalone` | Standalone | [x] | **PASS 24 sept.** · CRUD · création **désactivée** · **Activer / Désactiver** · biblio octroi = actifs | [x] |

## B2 — Demandes (`/demandes`)

### Onglet Partenariats
- [x] **💻🤖✓** Chargement liste
- [x] **💻** Filtrer par statut (pending / to_contact / in_discussion / …) *(25 sept. 2026 · testeur **PASS**)*
- [x] **💻** Approuver demande → inviter partenaire *(24 sept. 2026 · testeur **PASS** · même flux qu’Inviter depuis Users)*
- [x] **💻** Rejeter avec motif *(24 sept. 2026 · testeur **PASS** · motif conservé dans fiche partenariat · **pas d’e-mail / push au demandeur** — attendu produit)*

### Onglet Modération

> **Build 48** : valider OK · refuser / notif partenaire → reporter **build 49** (PR #7).  
> **24 sept. testeur** : modération approfondie + **retraits** → **build 49+** (aligné bulle mobile).  
> **Types** : sous-onglets **Tous · Événements · Spots · Outils** + badge Type dans le tableau (liste « Tous » = les 3 types mélangés, c’est normal).

- [x] **💻🤖✓** Chargement soumissions pending
- [ ] **💻** Filtres event / spot / tool *(UI présente — retest build 49)*
- [x] **💻** **Valider** → publié mobile *(build 48 · 22 sept.)*
- [ ] **💻** **Valider** spot → visible app · notif partenaire *(reprise build 49)*
- [ ] **💻** **Valider** événement (intervenant sans titre) → Agenda
- [ ] **💻** **Refuser** + motif → absent catalogue
- [ ] **💻** Section **Demandes de retrait** — liste pending
- [ ] **💻** **Approuver retrait** → disparaît app (Phase 1)
- [ ] **💻** **Refuser retrait** → reste publié

### Onglet Idées
- [x] **💻🤖✓** Chargement suggestions *(24 sept. 2026 · 2 pending visibles après clic onglet · compte dans badge menu)*
- [x] **💻** Filtrer statut / type *(24 sept. 2026 · testeur **PASS** · usage courant)*
- [x] **💻** Changer statut idée *(24 sept. 2026 · testeur **PASS** · **pas de retour automatique au membre proposant** — attendu)*
- [x] **💻** Ouvrir éditeur contenu prérempli *(24 sept. 2026 · testeur **PASS** · workflow admin interne)*

## B3 — Paramètres (`/parametres`)

| Onglet | Tests | OK |
|--------|-------|-----|
| **Gates** | Inscription · PASS · pré-lancement · maintenance — lire / enregistrer | [x] *(23 sept. 2026 · 💻 toggle ON/OFF ×4 OK)* |
| **Pays** | Activer / désactiver pays contenu | [x] *(24 sept. 2026 · testeur **PASS**)* |
| **Catégories** | Éditer label · emoji · activer / désactiver | [x] *(24 sept. 2026 · testeur **PASS** · enregistrer OK)* |
| **Permissions** | Admin délégué · overrides **par compte admin** (pas le rôle global) | [x] *(24 sept. 2026 · testeur **PASS** · édition jeu de droits · reconnexion délégué · hub THE LOOP = tuiles selon modules cochés)* |
| **Légal** | CGU · politique · FAQ · e-mail support | [x] *(24 sept. 2026 · testeur **PASS** · infos affichées)* |
| **Plus** | Bouton suggestion · inscriptions · activations · switches | [x] *(24 sept. 2026 · testeur **PASS** · Djomy / catalogue PASS / standalone / onglets déjà couverts ailleurs)* |

Liens Param. → pages satellites :
- [x] **💻** `/notifications` accessible depuis Param. *(24 sept. 2026 · testeur **PASS** · campagnes immédiates)*
- [ ] **💻** `/automation` accessible
- [ ] **💻** `/milestones` accessible
- [ ] **💻** `/etoiles` accessible
- [ ] **💻** `/horaires` accessible

## B4 — Users · PASS · Paiements

### Users
- [x] **💻** Pagination · recherche *(24 sept. 2026 · testeur **PASS**)*
- [x] **💻** Éditer profil · rôle · suspendre *(24 sept. 2026 · testeur **PASS**)*
- [x] **💻** **Inviter** → e-mail reçu *(23 sept. 2026 · **PASS** · deploy Edge + mail → web → MDP · lien secours admin · retest corps mail sans URL brute : `configure-auth-invite-email.cmd`)*
- [x] **💻** **Waitlist** → statut `invited` *(23 sept. 2026 · **PASS** · envoi invitation depuis waitlist = même flux que Inviter)*

### PASS
- [x] **💻** Octroi manuel PASS *(24 sept. 2026 · héritage gratuit limité · utilisateur passe Prime puis retrait OK)*
- [ ] **💻** Prix Guinée · enregistrer *(non retesté ce tour)*
- [ ] **💻** Messages / modèles notification *(non retesté)*

### Paiements & Compta
- [x] **💻** Liste transactions · refs Djomy *(23 sept. 2026 · super admin · 2 lignes achat PASS test)*
- [x] **💻** **Resync** + libellé contextuel · colonne **Vérifié Djomy** · onglet **Sans débit** · pagination 20/ligne *(23 sept. 2026 · **test super admin OK** · abandon « Sans débit » + hint Resync)*
- [x] **💻** Export CSV *(23 sept. 2026 · super admin · export marchés / compta **OK**)*
- [x] **💻** Analytics revenus (Compta) *(24 sept. 2026 · testeur **PASS** · montants · rapports · paniers moyens · pagination)*

## B5 — Notifications push (admin-web)

> **25 sept. 2026 · testeur** : module **PASS** — immédiat (tous rôles dont **Prime**) · favoris · **anniversaire** (27 sept.) · e-mail ciblé · **historique paginé** · **panneau Détails destinataires** (RPC `20260942`/`20260943`) · actions **Supprimer** (0 dest.) / UI cohérente. **Planification cron +3 min** : optionnel · non testé ce tour.

- [x] **💻** Envoi **immédiat** audience Tous / rôles → statut envoyé *(25 sept. 2026 · testeur **PASS** · Prime inclus)*
- [x] **💻** Audiences : Membres · Prime · Partenaires · **Favoris par catégorie** · **Anniversaires du mois** · **E-mails ciblés** *(25 sept. 2026 · testeur **PASS**)*
- [x] **💻** Historique campagnes · pagination · badges statut · **Détails** liste destinataires *(25 sept. 2026 · testeur **PASS** · PR #39–#40)*
- [x] **💻** **Supprimer** campagne (dont **0 dest.**) · actions contextuelles tableau *(25 sept. 2026 · testeur **PASS** UI)*
- [ ] **💻** **Planifier** +3 min → **⏳** statut `sent`
- [ ] **💻** Modifier campagne planifiée
- [ ] **💻** **Annuler** → `cancelled` *(planifiée)*
- [ ] **⏳** Pas de doublon push (1 campagne = 1 notif)

> Détail : `07-Smoke-Push.md`

## B6 — Contenu & éditorial

- [x] **💻** Filtrer events / spots / outils / marché *(23 sept. 2026 · super admin · Contenu **PASS**)*
- [x] **💻** Créer event · spot · outil (ContentEditor) *(23 sept. 2026 · **PASS web** · sans date événement → agenda mobile faible jusqu’à edit / **build 49+**)*
- [x] **💻** À la une *(23 sept. 2026 · **PASS web** (Accueil → À la une) · **📱🤖 Accueil slider** → **build 49+** + `20260937` · republier/archiver : suite B6)*
- [ ] **💻** Archiver · republier (cycle de vie catalogue)
- [ ] **💻** Transfert propriétaire THE LOOP ↔ partenaire
- [x] **💻** Accueil — **vue d’ensemble** · **sondage** · **à la une** *(24 sept. soir · testeur **PASS**)*
- [x] **💻** Accueil — formulaires complets *(24 sept. · testeur **PASS web**)*
- [x] **💻** Loop hub — onglets contenu / privilèges / à la une / performances *(23 sept. PASS · 24 sept. deploy Insights sans régression attendue)*

## B6b — Insights admin-web (détail onglets)

> Retest testeur **24 sept. 2026 (soir)** · super admin · Guinée.

- [x] **💻** Vue d’ensemble — macro événements / spots / outils · **Modèles associés** seul (KPI privilèges simplifié · PR #31)
- [x] **💻** Onglet **Événements** — KPI statuts · listes Tous / Favoris / Clics
- [x] **💻** Onglet **Spots** — idem
- [x] **💻** Onglet **Outils** — idem
- [x] **💻** Onglet **Accueil** (super-admin) — corners · chroniques · sondages · parcours (métriques clics / favoris etc.)
- [x] **💻** Onglet **Privilèges** — KPI octrois / consommés *(24 sept. · **PASS** après migrations `20260940`+`20260941`)*

## B7 — Privilèges · TEAMS · Tirage

- [x] **💻** Privilèges — module `/privileges` *(24 sept. · testeur **PASS** · octroi individuel côté **web** OK)*
- [x] **💻** Privilège → partenaire + lieu · envoi validation *(24 sept. **PASS web**)*
- [x] **📱** Partenaire **accepte** *(24 sept. **PASS** build 48)*
- [ ] **📱** Partenaire **refuse** + motif *(**retest build 49+** · PR #34)*
- [x] **💻** TEAMS — navigation · overrides *(24 sept. soir · testeur **PASS web** · cas limites onglets vides = connu build 48)*
- [x] **💻** TEAMS — pack **Admin** (ensemble) + ajustements **par admin** *(24 sept. 2026 · testeur **PASS** · octroi / overrides individuels)*
- [x] **💻** Tirage — module `/tirage` *(24 sept. · testeur **PASS web** · pool · lancer · historique — smoke global)*
- [x] **💻** Tirage — filtres **par rôle** · scope *(24 sept. 2026 · testeur **PASS**)*
- [ ] **📱** Gagnant — notif « Nouveau privilège » (cross-platform)

## B8 — Automatisations · Paliers · Étoiles · Horaires

- [ ] **💻** Automation — liste jobs · exécuter manuellement
- [ ] **💻** Paliers — créer · éditer · archiver · voir Archives
- [ ] **💻** Étoiles — seuils spots / outils / parcours
- [ ] **💻** Horaires — presets · assignation

## B9 — Admin délégué (permissions réduites)

> Compte `admin` (non super) avec overrides **par utilisateur** (écran Param. → Permissions).

- [x] **💻** Login admin délégué → sidebar / modules alignés sur le jeu sauvegardé *(24 sept. 2026 · testeur **PASS** · reconnexion après edit permissions)*
- [x] **💻** Hub **THE LOOP** — tuiles visibles seulement si modules cochés (`content`, `featured`, `insights`, `prime_benefits`…) *(24 sept. 2026 · **PASS** · pas un bug catalogue)*
- [ ] **💻** Module **sans** permission → refus / redirect explicite
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
| Achat PASS Djomy → membre **inbox + push** (nouveau PASS) | [ ] | [x] *(23 sept. 2026 · build 48 · 🤖 MTN · après cron)* |

## C2 — Auth transversal

- [x] **📱** Login → Accueil · logout → Auth bloqué *(login + logout membre OK · build 48 · 20 sept. 2026)*
- [x] **🤖** Idem *(24 sept. 2026 · build 48 · connexion · Accueil · déconnexion → Auth)*
- [ ] **📱** Inscription → mail → lien → connecté
- [ ] **🤖** Idem
- [x] **📱** Mot de passe oublié → **e-mail reçu** *(23 sept. 2026 · build 48)*
- [x] **🤖** Idem *(23 sept. 2026)*
- [x] **📱** Lien e-mail → page **auth-callback** (choix app / web) *(23 sept. 2026 · build 48)*
- [x] **🤖** Idem *(23 sept. 2026 · même UX que iOS)*
- [ ] **📱** Bouton « Ouvrir l’application » → **set_password in-app**
- [ ] **🤖** Idem *(retest post-deploy auth-callback)*
- [x] **💻** Invitation admin-web → activation · bon rôle *(23 sept. 2026 · **PASS** mail + **PASS** activate in-app · rôle membre · prénom défaut selon rôle après migration `20260939`)*
- [ ] **📱** Partenaire invité → connexion → Espace Pro
- [ ] **🤖** Idem

## C3 — Contact & support

- [x] **📱** Profil → `contact@theloop-app.com` *(20 sept. 2026 · build 48 · A2)*
- [x] **🤖** Idem *(23 sept. 2026 · build 48)*
- [ ] **📱** mailto / WhatsApp sheet
- [ ] **📱** FAQ / CGU → e-mail support à jour
- [ ] **🤖** Idem

## C4 — Parrainage

- [x] **📱** Code parrain visible profil *(20 sept. 2026 · build 48 · ReferralScreen)*
- [x] **🤖** Idem *(23 sept. 2026 · build 48 · membre + Prime)*
- [x] **📱** Compteur filleuls visible *(23 sept. 2026 · build 48 · pas test +1 filleul)*
- [x] **🤖** Idem *(23 sept. 2026 · membre + Prime)*
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
- [x] **📱🤖** PASS Djomy *(23 sept. 2026 · 📱 OM · 🤖 MTN · cron OK · retour app Android PR #9)*

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
A1 sans compte (Auth seul · pas fiches détail) : PASS (build 48)
A2 membre : suite en pause (PassPayment · MyBenefits · reste A2)
A3.2 LoopX (Agenda) : BLOCKED (build 48 — PR #4)
A3.3 Loop Prime (Spots) : BLOCKED (build 48)
A3.4 contenu prime accessible : FAIL/BLOCKED (build 48 — non exposé Agenda/Spots)
A3 AbonnementScreen : PASS (build 48 — PASS en cours + 1 en attente)
A3 Profil/Mon PASS : PASS (build 48 — idem en cours + en attente)
A3 Favoris Profil : écart mobile (bottom nav seulement, pas Profil)
A3 fiche privilège : PASS (cadenas → octroi → utilisation → quota atteint)
A3 écrans Accueil/Agenda/Spots/Outils : PASS navigation (build 48)
A3 PrimeScreen : N/A statut (Mon PASS = Abonnement · PrimeScreen = boutique)
A3 MyBenefitsScreen : BLOCKED/N/A (pas d’entrée menu build 48)
PACK A4-1 : PASS (U1 login · U2 thème teal · U3 bottom nav · U4 hub Pro)
PACK A4-2 : PASS (U5 Mes contenus · U6 Stats · U7 À la une · U8 Privilèges · U9 Récompenses)
PACK A4-3 : PASS (U10 event · U11 spot · U12 outil → pending)
PACK A4-4 : PASS (U13–U17 · U14 partiel · U15 badge Publié · motif rejet = liste)
PACK A4-5 : PASS (U18 demander retrait · U19 annuler retrait pending)
PACK A4-6 : PASS (U22/U23 scan+confirm · U21 N/A connecté · U24 N/A vide)
PACK A4-7 : PASS (U25 catalogue · U26 favoris)
A4 partenaire : terminé build 48 (U20 notif retrait → après modération admin)
PACK A5-1 : PASS (U1–U3 super admin · U4 skip délégué)
PACK A5-2 : partiel (U5–U17 · écrans existent · bugs data ci-dessous)
A5 bugs smoke build 48 :
  - Insights : KPI privilèges / validation ne remontent pas correctement (cache local grants) · **💻 web** : fix clics events + UI alignée mobile (24 sept. deploy)
  - Utilisateurs : filtre « Sans activité » incohérent · seuil 30j → souhait 60j (2 mois)
  - Partenariats : cartes « . » jusqu’au refresh (cache sans refetch au focus)
  - THE LOOP hub : KPI contenu parfois 0 au 1er focus (race catalogue · TTL 90s)
  - TEAMS : super admin = 3 onglets (Super admin / Par admin / Admin pack) · onglet **Admin** vide si aucun privilège catalogue lié à contenu publié
  - TEAMS super admin : onglet **Par admin** vide (build 48) malgré admin délégué existant · fix PR #7 (fetch Supabase + UI sans blocage delegateOverrides)
  - TEAMS compte **délégué** : **pas** d’onglet « Par admin » (réservé super admin) · seulement onglet **Admin** (pack pays) · **vide build 48** si pack vide / permission `staff_benefits_team` / catalogue — **FAIL partiel** · fix PR #7
  - Gestion PASS : octroi manuel KO (recherche cache local) · liste « PASS accordés » mélange achats Prime · fix PR #7
  - Enhancement : pagination hub THE LOOP perf + privilèges web (**PASS 23 sept.**) · mobile perf **build 49+**
A5-U23 : FAIL build 48 · ⏸ retest build 49+ (PR #7)
Android build 48 (23 sept. 2026 · achat PASS MTN membre) :
  - **PASS métier OK** : 2 intents (1ʳᵉ abandon portail · 2ᵉ MTN payé) · PASS en file + **notif membre** après cron ~5 min
  - **FAIL UX retour app** : crash « Ouvrir THE LOOP » · PR #9 · retest build 49
  - **Admin** : ligne abandon = **Sans débit** (PR #9 · deploy web + API Render)
Build Android : **48**
Admin-web (23 sept. 2026 · paiements + gates) :
  - Paiements : onglet **Sans débit** · Resync abandon · **Vérifié Djomy** · libellé sous bouton — **PASS** (super admin)
  - **Export CSV / marchés (Compta)** — **PASS** (testeur 23 sept.)
  - Bandeau « paiement Djomy bloqué &gt; 5 min » : comptait aussi les **abandons** (tx sans débit) — **fix serveur** `isStuckPendingFulfillment` (aligné cron · deploy Render)
Android (23 sept. 2026 · build 48 · suite) :
  - **Double tap** logo Auth → code établissement — **PASS**
  - **Déconnexion** — **PASS**
Admin-web B4 Users (23 sept. 2026 · testeur) :
  - **PASS 💻** (soir) : Inviter · e-mail · activation **web** + **in-app** (« Activer un compte invité par l’équipe ») · deploy Edge 4/4 · Render auth-callback
  - **À faire** : `configure-auth-invite-email.cmd` (nouveau texte sans lien URL en clair) · migration `20260939` · waitlist non retestée
  - **Oubli MDP** : toujours **KO** (mobile · voir A4 set_password)
Admin-web B6 Contenu (23 sept. 2026 · testeur) :
  - **PASS 💻** : filtres events / spots / outils / marché · création event / spot / outil
  - **PASS 💻** : « À la une » (coché admin-web) — effet **immédiat web**
  - **Reporté 📱🤖 build 49+** : slider Accueil membre (fix empreinte `20260937` + binaire mobile) · date événement recommandée (fallback app build 49+)
  - Paramètres **Gates** : inscription · maintenance · pré-lancement · achat PASS — toggle ON/OFF — **PASS**
Admin-web B0 session (24 sept. 2026 · testeur) :
  - **PASS 💻** : déconnexion / reconnexion · landing **Insights** · badge Demandes **4** = **2** partenariats (libellé onglet) + **2** idées (après ouverture onglet Idées)
  - **PASS 💻** : `/loop?tab=contenu` · **privilèges offerts** (liste liée contenu publié) · **à la une** · **performances** (formule clics×1 + favoris×5 + note×10 · vues Tous/type · pagination)
Admin-web deploy (24 sept. 2026 · agent · `main`) :
  - **💻 Insights** PR #28 mergé · **push `main`** → Netlify admin-web · retest : clics événements ≠ 0 · onglets métriques · privilèges catalogue actifs associés · onglet Accueil (super-admin)
  - **💻 Accueil** (PR suivante) : sondage avec choix · parcours avec sélection étapes · Singulier/Fragment + picker contenu · logos URL/fichier local
Admin-web retest (24 sept. 2026 · soir · testeur) :
  - **PASS 💻** : Insights (vue d’ensemble · events · spots · outils · Accueil) · Accueil (vue d’ensemble · sondage · à la une) · Contenu · Users · TEAMS · Compta
  - **En cours 💻** : Insights onglet Privilèges (reset tables + jeu de test)
  - **Retest post PR #31** : Accueil logos (Storage) · édition parcours/Singulier/Fragment (contenu lié pré-sélectionné)
  - **PASS 💻** (24 sept. soir) : modules **Privilèges** + **Tirage** web
  - **PASS 💻** (24 sept. soir) : **Privilèges standalone** (`/privilege-standalone`) · Activer / Désactiver · création inactive par défaut
Admin-web B3 Paramètres (24 sept. 2026 · testeur) :
  - **PASS 💻** : Pays · Catégories · Légal · Plus (suggestion · inscriptions · activations · switches)
  - **PASS 💻** : Permissions — overrides **par admin délégué** · reconnexion · modules + hub THE LOOP cohérents avec cases cochées
Admin-web suite (24 sept. 2026 · testeur) :
  - **PASS 💻** Demandes **Partenariats** : approuver → inviter · rejeter + motif (sans mail demandeur)
  - **PASS 💻** Demandes **Idées** : filtres · statuts · éditeur (sans retour auto au membre)
  - **PASS 💻** Users : éditer profil · suspendre
  - **PASS 💻** TEAMS : pack pays + overrides **par admin**
  - **PASS 💻** Tirage : filtres par rôle
  - **⏸ build 49+** : Modération (refus/notif) · retraits · notifs **modération** partenaire
  - **PASS 💻** Users : pagination · recherche
  - **PASS 💻** Privilèges web : partenaire + lieu · validation · **📱 accepte** · **📱 refuse** → build 49+ (PR #34)
  - **PASS 💻 B5 Notifications** (25 sept.) : immédiat (Prime inclus) · favoris · anniversaire 27 sept. · e-mail ciblé · **historique + Détails destinataires** (RPC 42/43)
  - **Reste 💻** : B6 archiver/transfert · B8 · PASS prix/messages · B9 délégué · B5 planifier/annuler *(option)*
  - **FAIL 📱🤖 build 48** (confirmé testeur) : **octroi individuel** → « Utiliser » membre OK · **validation partenaire** (scan) KO · migrations `20260935`/`20260936` en prod · fix mobile **build 49+**
  - **Reporté 📱🤖 build 49+** : ruban logos Accueil membre · slider à la une · perf THE LOOP mobile · validation octroi individuel
  - **Produit** : notes membres masquées fiches publiques (`MEMBER_ESTABLISHMENT_RATINGS_ENABLED=false`) · code conservé
  - **Reporté 📱🤖 build 49+** : retest perf mobile après binaire (alignement formule + pagination)
Mobile A0 (23 sept. 2026 · build 48 · 📱🤖) :
  - Maintenance + pré-lancement ON · **bypass 4 taps** — **PASS**
Serveur (23 sept. 2026) :
  - **Fix cron** : plus d’alerte « Paiement bloqué » toutes les 5 min sur intent **abandon** (reconcile d’abord · alerte seulement si Djomy payé · dedup DB)
A2 compte & services (23 sept. 2026 · build 48 · **📱🤖**) :
  - Paramètres · cloche/notifs · parrainage (code + compteur filleuls membre/Prime) · boutique PASS · paiement PASS · Mon PASS — **PASS**
  - **SuggestionScreen** (envoyer idée) — **PASS 🤖** (24 sept. 2026)
Parité Android liste A (24 sept. 2026 · testeur · build 48) :
  - **PASS 🤖** : activate invité · Singulier · Fragment · parcours · PartnerPublic · suggestion · code établissement · login/déconnexion
  - **Déjà PASS 🤖** : Pro ? Rejoindre / PartnerApply (23 sept.)
  - **⏸ build 49+ 🤖** : LoopX · Loop Prime · contenu prime · modération admin **valider/refuser**
Auth MDP (23 sept. 2026 · build 48) :
  - Login · **signup (gate ON)** · **MDP profil** — **PASS 📱🤖**
  - **Oubli MDP** : e-mail OK · lien → **page auth-callback 📱🤖** (normal · pas d’auto-app) · **CGU / Politique 📱🤖 PASS**
  - **Pro ? Rejoindre THE LOOP** + **PartnerApply** — **PASS 📱🤖** (demande reçue super admin)
  - **Recovery HTML balises visibles** — fix **api.theloop-app.com/auth/callback** (deploy Render) · **nouvel e-mail** reset (build 48 OK · build 49 = URL dans l’APK)
  - **🤖 Interactions** : favori sans compte · recherche barre · profil contact — **PASS** (23 sept.)
Privilèges build 48 (23 sept. 2026 · retest testeur) :
  - **PASS 📱🤖** : privilège **inclus Prime** (tous Prime) · fiche détail · cadenas membre / déverrouillé Prime
  - **PASS 📱🤖** : partenaire — scan QR **identité** Prime (sans « Utiliser ») · puis scan après « Utiliser » · avantage affiché coché · validation OK
  - **PASS 📱🤖** : notifs cloche Prime (attente validation · privilège validé) — iOS + Android
  - **FAIL** : **octroi individuel** (1 utilisateur ciblé admin) — erreur serveur à la validation partenaire (rôle / Prime OK)
Supabase prod (23 sept. 2026 · testeur) :
  - Migrations Phase 0 : **20260916** (push failed · support email) · **20260918** partner accept catalog · **20260919** speakers title · **20260925** draw_city — **OK**
  - **20260935** individual grant materialize — **OK**
  - **20260936** partner validation match — **OK** → retest octroi individuel après **build mobile 49+**
Branch / commit : `main` PR #9 · deploy admin-web auto

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
