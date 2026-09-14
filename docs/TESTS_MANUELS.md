# THE LOOP — Journal de tests manuels (sandbox prod)

> Fichier tenu au fil de vos sessions de test.  
> Compte super admin de référence : `admin@theloop.gn`  
> OTP dev (si activé) : `1234`

## Légende

| Statut | Signification |
|--------|---------------|
| ✅ | Test réussi |
| ❌ | Test échoué (détail en note) |
| ⏳ | À tester |
| ➖ | Non applicable / reporté |

---

## Session — 16 juillet 2026

### Environnement

- **Rôle testé** : super_admin
- **Écran** : Admin → Catégories (`AdminCategories`)
- **Source données** : Supabase `content_categories`

### Tests effectués

| # | Module | Action | Types | Résultat | Notes |
|---|--------|--------|-------|----------|-------|
| 1 | Catégories | Créer une catégorie | Événement, Spot, Outil | ✅ | Validé par MKABA |
| 2 | Catégories | Modifier (libellé / emoji) | Événement, Spot, Outil | ✅ | Validé par MKABA |
| 3 | Catégories | Désactiver (toggle Activé/Désactivé) | Événement, Spot, Outil | ✅ | Validé par MKABA — anciennement libellé « Archiver » |
| 4 | Catégories | Supprimer (y compris intégrées) | Événement, Spot, Outil | ✅ | Validé par MKABA — bouton visible sur toutes les catégories |
| 5 | Catégories | Désactiver puis vérifier Agenda / Spots / Outils | Corporate, Fine Dining, Outil | ✅ | Validé par MKABA — filtre absent + contenus masqués (event, spot, tool) |
| 6 | Catégories | Réactiver | Événement, Spot, Outil | ✅ | Validé par MKABA — filtres et contenus réapparaissent sans reload catalogue |

**Correctifs appliqués (16 juil., soir)** : désactivation masque les contenus rattachés ; toggle instantané (sans rechargement complet du catalogue).

> **Module Catégories — validé ✅** (CRUD + activation/désactivation + masquage contenus).

---

## Session en cours — Pays du contenu

### Environnement

- **Rôle testé** : super_admin
- **Écrans** : Admin → Pays du contenu (`AdminContentCountries`) ; Profil → Paramètres ; création événement / spot / outil (`PartnerSubmission`)
- **Source données** : Supabase `app_settings` (`enabled_content_countries`)

### Tests effectués

| # | Module | Action | Résultat | Notes |
|---|--------|--------|----------|-------|
| 8 | Pays du contenu | Activer plusieurs pays (admin) | ✅ | Validé par MKABA — Control Tower → Pays du contenu |
| 9 | Pays du contenu | Switch vers un autre pays (super_admin, THE LOOP) | ✅ | Validé par MKABA — exploration / changement de catalogue |
| 10 | Pays du contenu | Créer publication (event / spot / outil) | ✅ | Validé par MKABA — « Pays du contenu » = uniquement pays activés |
| 11 | Paramètres | UI sélecteur pays (un seul drapeau) | ✅ | Validé par MKABA |
| 12 | Paramètres | Header logo THE LOOP | ✅ | Validé par MKABA — logo + en-tête marque OK |

### Correctifs appliqués (16 juil., nuit)

- Paramètres / sélecteur pays : **un seul drapeau** affiché (plus de doublon flag + libellé).
- Création événement / spot / outil : champ « Pays du contenu » limité aux **pays activés** par le super admin (admin inclus).
- Paramètres : **logo THE LOOP** + en-tête marque (comme Mes avantages, Profil).

> **Module Pays du contenu + Paramètres (UI)** — validé ✅ (drapeau unique, logo header, filtre pays activés).

---

## Session — 17 juillet 2026 (après-midi) — Contenu / onglets

### Environnement

- **Rôle testé** : super_admin / admin
- **Écrans** : Agenda, Spots, Outils (affichage public catalogue)
- **Contexte** : table `tools` séparée, onglets Spots / Outils

### Tests effectués

| # | Module | Action | Types | Résultat | Notes |
|---|--------|--------|-------|----------|-------|
| 29 | Affichage catalogue | Onglets / listes visibles | Événement, Spot, Outil | ✅ | Validé par MKABA — affichage event, spot et outil OK |
| 30a | Étoiles / engagement | Score & étoiles sur fiche / carte | Spot | ✅ | Validé par MKABA — « ça marche sur spot » (17 juil.) |
| 30b | Étoiles / engagement | Calcul étoiles (clics, favoris, notes) | Spot, Outil | ✅ | Validé par MKABA — « calcul étoile ok » (17 juil. 16:59) |
| 30c | Favoris | Ajout / retrait favoris | Spot, Outil | ✅ | Validé par MKABA — « favoris ok » (17 juil. 16:59) |

> **Affichage Agenda / Spots / Outils — validé ✅**  
> **Favoris — validé ✅** · **Calcul étoiles (spots + outils) — validé ✅**

### En attente de validation (livré, pas encore testé OK)

| # | Module | À tester | Statut |
|---|--------|----------|--------|
| 31 | Onglet THE LOOP | Pubs admin/super admin uniquement (pas partenaires) | ⏳ |
| 32 | Control Tower → Contenu | Catalogue global (partenaires + équipe) | ⏳ |
| 33 | Transfert gestion | Event / spot / outil → compte partenaire (ou reprise équipe) | ⏳ |
| 34 | Modération event / spot + refus motif | Valider → publié partenaire ; Refuser → motif visible | ✅ | Validé par MKABA — « moderation event et spot ok refus bien gere » (17 juil.) |
| 34b | Modération outil partenaire | Soumission → file Outils → valider / refuser | ✅ | Validé par MKABA — « outil moderé ok testé » (17 juil.) |
| 35 | PASS Heritage actif | Pas de bouton Acheter / renouveler | ⏳ | Livré 17 juil. — à tester |
| 36 | Suggestions — bouton Visible/Masqué | « Nous contacter » : Suggestion masquée, WhatsApp OK | ✅ | Validé par MKABA — « suggestion contact whatsapp testé ok » (17 juil.) |
| 37 | Auth — Créer un compte | Inscription membre | ✅ | Validé par MKABA — « creer compte ok testé » (17 juil.) |
| 38 | Auth — Se connecter | Connexion membre | ✅ | Validé par MKABA — « se connecté ok testé » (17 juil.) |
| 39 | Nous contacter | Flux contact (Suggestion / WhatsApp) | ✅ | Validé par MKABA — « nous contacter » (17 juil.) |
| 40 | Validation avantage partenaire | Notification au bénéficiaire « avantage X chez Y » | ⏳ | Livré 17 juil. — à tester |
| 41 | Compte partenaire créé par super admin | Invitation admin → finalisation par l'utilisateur | ✅ | Validé par MKABA — création super admin + finalisation user OK (17 juil.) |

> **Contact communauté (Suggestion masquée + WhatsApp) — validé ✅**  
> **Créer un compte — validé ✅** · **Se connecter — validé ✅** · **Nous contacter — validé ✅**  
> **Compte partenaire (création super admin + finalisation user) — validé ✅**

### Migrations liées (si pas encore appliquées)

`20260768` → `20260779` (outils, notes, favoris, engagement, content_origin, transfert owner, modération outils)

---

## Session en cours — Suite tests (17 juillet 2026)

### Prérequis migrations (si pas encore fait)

Appliquer dans l'ordre : `20260756` → `20260757` → `20260758` → `20260759`.

### Prochaine passe (ordre recommandé)

| # | Test | Attendu | Statut |
|---|------|---------|--------|
| 13 | Désactiver un pays en admin | Contenu masqué ; sélecteur membre mis à jour | ⏳ |
| 14 | Catégories custom + soumission partenaire | Visible dans le formulaire de création | ⏳ |
| 15 | Inscription membre (téléphone + OTP) | Compte BDD, thème FREE_MEMBER | ✅ | Validé 17 juil. — « creer compte ok » |
| 15b | Connexion membre | Session OK | ✅ | Validé 17 juil. — « se connecté ok » |
| 15c | Compte partenaire créé par super admin + finalisation user | Compte partenaire activé | ✅ | Validé 17 juil. |
| 16 | Compte `prime` en BDD | Thème PRIME_MEMBER terracotta | ⏳ |
| 17 | Compte `partner` + jeton SPOT | Espace Pro, thème vert | ⏳ |
| 18 | Admin délégué vs super_admin | Thèmes bordeaux / gris-bleu | ⏳ |
| 19 | CGU à l'inscription | Texte depuis `app_legal_content` | ⏳ |
| 20 | Admin → Utilisateurs | Liste Supabase uniquement | ⏳ |
| 21 | Événement multi-catégories + modération | Visible Agenda avec tous les filtres matchés | ✅ | Validé 17 juil. — modération event OK + refus motif OK |
| 22 | Soumission spot + validation admin | Visible Spots | ✅ | Validé 17 juil. — modération spot OK + refus motif OK |
| 23 | Scan QR membre (partenaire) | Résolution BDD | ⏳ |
| 24 | Modules Pro partenaire (admin) | Désactiver Outils → partenaire ne voit plus outils | ⏳ |
| 25 | Partenaire unifié | Event + spot + outil depuis modal Pro | ⏳ |
| 26 | Staging publication | Pas de doublon après modération | ⏳ |
| 26b | Modération outil partenaire | File Outils → publié après validation | ✅ | Validé 17 juil. — « outil moderé ok testé » |
| 27 | Job bienvenue inscription | Selon `admin_automation_jobs` | ⏳ |
| 28 | Catalogue avantages vide | Admin ajoute avantage sans fantômes | ⏳ |

---

## Tests recommandés (prochaine passe — archive)

### Catégories — suite

| # | Test | Attendu | Statut |
|---|------|---------|--------|
| 14 | Catégories custom + soumission partenaire | Visible dans le formulaire de création | ⏳ |

> Réinitialisation catégories en masse : via SQL `seed_platform_defaults.sql` uniquement.

### Comptes & rôles (vous recréez les comptes vous-même)

| # | Test | Attendu | Statut |
|---|------|---------|--------|
| 15 | Inscription membre (téléphone + OTP) | Compte créé en BDD, thème **FREE_MEMBER** (bleu) | ✅ | Validé 17 juil. |
| 15b | Connexion membre | Session restaurée, accès app | ✅ | Validé 17 juil. |
| 15c | Compte partenaire créé par super admin + finalisation user | Compte partenaire activé | ✅ | Validé 17 juil. |
| 16 | Passer un compte en `prime` en BDD | Thème **PRIME_MEMBER** (terracotta `#C4704B`) | ⏳ |
| 17 | Compte `partner` + jeton SPOT actif | Espace Pro accessible, thème vert | ⏳ |
| 18 | Admin délégué vs super_admin | Super = bordeaux ; délégué = gris-bleu (`platform_roles`) | ⏳ |

### Paramètres plateforme

| # | Test | Attendu | Statut |
|---|------|---------|--------|
| 19 | CGU à l'inscription | Texte lu depuis `app_legal_content` (pas de texte en dur) | ⏳ |
| 20 | Admin → Utilisateurs | Liste depuis Supabase uniquement (pas de comptes demo) | ⏳ |

### Contenu & partenaires

| # | Test | Attendu | Statut |
|---|------|---------|--------|
| 21 | Publier un événement test (admin ou partenaire) | **Une seule** catégorie assignée ; visible dans Agenda | ✅ | Validé 17 juil. — modération event + refus OK |
| 22 | Soumission spot + validation admin | Catégorie spot correcte, visible dans Spots | ✅ | Validé 17 juil. — modération spot + refus OK |
| 23 | Scan QR membre (partenaire) | Résolution via BDD, pas de fallback comptes demo | ⏳ |

### Automatisations & avantages

| # | Test | Attendu | Statut |
|---|------|---------|--------|
| 24 | Job bienvenue à l'inscription | Notification / avantage déclenché selon `admin_automation_jobs` | ⏳ |
| 25 | Catalogue avantages vide au départ | Admin peut ajouter un avantage Prime sans données fantômes | ⏳ |
| 26 | Création avantage (super admin) — liste lieux partenaire | Un seul item par contenu (pas de doublon staging + publié) | ⏳ |
| 27 | Création avantage → Validations | Reste en validation (pas d'auto 7j) ; admin : détails / modifier / archiver / supprimer | ⏳ |
| 28 | Partenaire accepte avantage | Avantage activé + notif admin | ⏳ |
| 29 | Partenaire refuse avec motif | Admin voit refus + motif ; avantage non actif | ⏳ |
| 30 | Super admin — Types d'avantage | CRUD libellés / mécaniques ; types visibles à la création catalogue | ⏳ |

---

---

## Session — 26 août 2026 — Durcissement Security Advisor (migrations 70→74)

### Environnement

- **Projet Supabase** : `eeyhtulpixvftvhppinz`
- **Compte prod connu** : `admin@theloop.gn` / `Loop1234!`
- **Script auto** : `supabase/scripts/smoke_security_post_74.mjs`

### Dashboard — protection mots de passe compromis (à faire une fois)

1. Ouvrir [Auth → Email → Passwords](https://supabase.com/dashboard/project/eeyhtulpixvftvhppinz/auth/providers?provider=Email)
2. Activer **Prevent use of leaked passwords** (HaveIBeenPwned)
3. Recommandé : longueur min **10**, caractères requis **digits + lower + upper + symbols**
4. Sauvegarder, puis relancer le smoke test (dernier test doit passer)

> Nécessite le plan **Pro** Supabase. Si le toggle est grisé, upgrade ou laisser le warning Security Advisor.

### Tests automatisés (API)

| # | Test | Résultat | Notes |
|---|------|----------|-------|
| A1 | Anon bloqué sur `admin_create_event_direct` | ✅ | permission denied |
| A2 | Allowlist anon `check_signup_email_available` | ✅ | |
| A3 | Précheck login (`admin@` = registered, inconnu = available) | ✅ | |
| A4 | Login mauvais MDP → Invalid login credentials | ✅ | |
| A5 | RPC invite invité `find_pending_admin_invite_by_email` | ✅ | |
| A6 | QR anon `verify_member_qr_payload` (pas permission denied) | ✅ | |
| A7 | Transfert anon bloqué `admin_reassign_content_owner` | ✅ | |
| A8 | Transfert admin callable (erreur métier `partner_not_found`) | ✅ | grants OK |
| A9 | HIBP — rejet `password123` à l'inscription | ⏳ | **Activer dans Dashboard** |

Commande :

```powershell
cd mobile
..\.tools\node\node.exe ..\supabase\scripts\smoke_security_post_74.mjs
```

### Tests manuels app mobile (Expo)

| # | Flux | Étapes | Résultat | Notes |
|---|------|--------|----------|-------|
| M1 | **Connexion — email inconnu** | Auth → email fictif → continuer | ⏳ | Popup « Compte introuvable » |
| M2 | **Connexion — mauvais MDP** | `admin@theloop.gn` + mauvais MDP | ⏳ | « Mot de passe incorrect » |
| M3 | **Connexion — OK** | `admin@theloop.gn` + `Loop1234!` | ⏳ | Session admin |
| M4 | **Activation invité** | Admin crée invite → Auth « Activer compte invité » → même email + MDP | ⏳ | RPC 72 |
| M5 | **Validation avantage QR** | Loop Prime → double-tap logo partenaire → scan QR membre | ⏳ | client anon `apply_partner_benefit_validation` |
| M6 | **Transfert partenaire** | Admin → contenu partenaire → réassigner event/spot/outil → vérifier Espace Pro destinataire | ⏳ | migration 71 |

---

## Historique des sessions

| Date | Résumé |
|------|--------|
| 2026-08-26 | Security Advisor post-74 : grants RPC OK ; HIBP à activer Dashboard ; checklist mobile |
| 2026-07-17 | Modération event/spot ✅ + refus avec motif ✅ (MKABA) |
| 2026-07-17 | Affichage Event/Spot/Outil ✅ ; favoris ✅ ; calcul étoiles ✅ (MKABA) |
| 2026-07-17 | Paramètres : logo header THE LOOP validé (MKABA) |
| 2026-07-16 | Pays du contenu : multi-pays, switch catalogue, filtre création — OK (MKABA) |
| 2026-07-16 | Module Catégories validé ; début module Pays du contenu (UI drapeau + filtre pays activés) |
| 2026-07-16 | CRUD catégories + activation/désactivation (event / spot / tool) — OK ; masquage contenus + toggle rapide |

---

## Comment alimenter ce fichier

Dites simplement dans le chat ce que vous avez testé, par exemple :

> « J'ai créé un membre prime, thème OK »

Le journal sera mis à jour ici avec la date, le statut ✅/❌ et les notes.
