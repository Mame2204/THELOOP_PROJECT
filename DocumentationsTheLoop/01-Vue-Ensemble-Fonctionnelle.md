# 01 — Vue d’ensemble fonctionnelle

## 1. Qu’est-ce que THE LOOP ?

**THE LOOP** est une plateforme mobile-first (Guinée, extension Sénégal) qui agrège :

- un **agenda** d’événements à Conakry et pays activés ;
- un **guide** de spots (restaurants, hôtels, bars…) ;
- un **catalogue d’outils** (apps / services locaux) ;
- un écosystème **Loop Prime (PASS)** : abonnement, avantages partenaires, validation QR ;
- un **espace partenaire pro** : soumission de contenu, modération, stats, paliers ;
- une **Control Tower admin** : modération, insights, octroi avantages, PASS, tirages, paramètres plateforme.

L’application mobile de référence est dans `mobile/` (Expo). Une PWA web existe dans `src/` avec une logique métier proche mais une navigation différente.

---

## 2. Personas et rôles applicatifs

| Persona | Rôle technique | Accès principal |
|---------|----------------|-----------------|
| Sans compte | `USER_ANONYMOUS` | Écran Auth uniquement (connexion, inscription, partenariat, validation privilège) |
| Membre gratuit | `USER_FREE` | + Favoris, QR membre, parrainage, notifications |
| Loop Prime | `USER_PRIME` | + contenu exclusif Prime, avantages, achat/gestion PASS |
| Partenaire Pro | `PARTNER` | Espace pro (contenu, avantages, validation, stats) |
| Admin | `ADMIN` | Control Tower (modules selon permissions) |
| Super admin | `user_role = super_admin` en BDD | Tous modules + PASS + permissions + paramètres |

**Mapping base de données :** colonne `public.users.user_role`  
Valeurs : `member`, `prime`, `partner`, `admin`, `super_admin` (+ legacy `tool_partner` → traité comme partenaire).

---

## 3. Parcours utilisateur par persona

### 3.1 Sans compte (non connecté)

1. Ouvre l’app → écran **Auth** (connexion / inscription si gate activé).
2. Parcours autorisés sans compte : mot de passe oublié, activation invité, **demande partenariat**, connexion partenaire SPOT, double tap logo → validation privilège partenaire.
3. **Aucun accès** aux onglets Accueil, Agenda, Spots, Outils, Favoris tant que l’utilisateur n’est pas connecté.

> La PWA legacy (`src/`) permettait encore la lecture publique sans compte — **ce n’est plus le modèle mobile.**

### 3.2 Membre gratuit

1. Inscription : e-mail ou téléphone + OTP, acceptation **CGU** (`app_legal_content.cgu`).
2. **Profil** : QR membre rotatif, parrainage, paramètres.
3. **Favoris** (onglet barre basse) : événements, spots, outils.
4. Peut acheter un **PASS Prime** (Djomy) → devient Prime.

### 3.3 Loop Prime

1. Accès contenu et filtres exclusifs Prime.
2. **Mes avantages** : octrois catalogue (`prime_benefit_grants`).
3. **Abonnement / Mon PASS** : historique, renouvellement.
4. Favoris via **menu profil** (pas en barre basse — diffère de la PWA web).

### 3.4 Partenaire Pro

1. Connexion via **jeton SPOT** (`partner_tokens`, ex. format `SPOT-XXXX-YYYY`) — session **séparée** de Supabase Auth membre.
2. **Espace Pro** : soumettre événements / spots / outils → file **staging** → modération admin → publication.
3. **Avantages** : proposer des offres liées au catalogue.
4. **Validation** : scan QR membre, code partenaire (`partner_validation_codes`).
5. **Stats & paliers** : milestones (`partner_milestone_rules` / `partner_milestone_rewards`).

### 3.5 Admin / Super admin

1. Connexion compte admin (Supabase Auth).
2. Onglet **Admin** → workspace split (sidebar + panneau).
3. Modules selon **permissions** (modération, contenu, insights, avantages, tirage, etc.).
4. Super admin seul : **Gestion PASS**, **Paramètres** (permissions, pays, sections UI, légal, catégories…).

---

## 4. Modules métier (Control Tower)

| Module | Fonction |
|--------|----------|
| **Insights** | KPIs favoris, clics, catégories, avantages — agrège Supabase + cache local |
| **Accueil** | Sondages, walks, corner créateur, logos, hero |
| **Contenu** | Événements, spots, outils publiés + modération |
| **Étoiles spots** | Calcul engagement (clics, favoris, notes) → étoiles 1–5 |
| **Utilisateurs** | Liste `users`, rôles, lifecycle (suspendu, archivé…) |
| **Partenariats** | Candidatures `partnership_requests`, notes |
| **Avantages** | Catalogue `benefit_catalog`, octrois, suivi, tirage au sort |
| **PASS** | Catalogue PASS (`app_settings`), octrois `user_pass_grants`, messages activation |
| **Automatisations** | Jobs anniversaire, bienvenue, membre du mois, calcul étoiles |
| **Notifications** | Campagnes push admin, inbox `user_notifications` |
| **Légal** | CGU, conditions partenaires, mentions légales |
| **Catégories** | CRUD `content_categories` (source unique moderne) |

---

## 5. Workflow partenaire (publication contenu)

```
Partenaire crée brouillon (staging local + partner_*_submissions)
        ↓
Soumission status: pending
        ↓
Admin modère (approve / reject)
        ↓
Publication → events / establishments / tools (content_status = published)
        ↓
Rétraction possible (admin_withdraw_partner_content — migration 20260831)
```

**Statuts staging :** `pending`, `approved`, `rejected` (+ workflow rétraction admin).

---

## 6. Workflow avantages Prime

```
Admin crée entrée benefit_catalog (catalogue)
        ↓
Octroi manuel / programmé / tirage / automatisation (jobs)
        ↓
Ligne prime_benefit_grants par membre
        ↓
Membre consomme chez partenaire → benefit_redemptions (pending → validated)
        ↓
Comptabilisé dans paliers partenaire (partner_member_attributions, milestone_rewards)
```

---

## 7. Workflow PASS (Loop Prime)

```
Catalogue PASS (app_settings.pass_catalog_v1) : Heritage, Intermediaire, formules boutique…
        ↓
Achat Djomy (payment_intents) OU octroi admin (user_pass_grants)
        ↓
users.user_role → prime (si actif)
        ↓
Notifications activation (pass_activation_messages_v1)
```

**PASS Heritage :** gratuit, sans expiration, révocable super admin.  
**PassIntermediaire :** gel admin Prime → membre (restauration PASS d’origine).

---

## 8. Multi-pays

- **Pays contenu activés :** `app_settings.enabled_content_countries` (défaut `["GN","SN"]`).
- **Compte membre :** `users.country_code`, `users.city` (Guinée : référentiel `guinea_locations`).
- **Admin :** filtre pays via `AdminCountryContext` — insights, octrois, contenu filtrés par pays.

---

## 9. Contenus légaux obligatoires

Table `app_legal_content` — 3 clés :

| Clé | Usage |
|-----|-------|
| `cgu` | Inscription membre (écran Auth) |
| `partner_terms` | Espace partenaire (notice publication) |
| `mentions_legales` | Admin légal (affichage / édition) |

---

## 10. Mode démo vs Supabase

| | Supabase configuré | Mode démo |
|--|-------------------|-----------|
| Persistance | PostgreSQL + Auth | AsyncStorage uniquement |
| Détection | `isSupabaseConfigured()` dans `mobile/src/lib/supabase.ts` | `.env` absent |
| Comptes test web | — | `admin@theloop.gn`, `prime@theloop.gn`, etc. (PWA) |

**En production sandbox actuelle :** Supabase est configuré ; le mode démo ne s’applique pas sauf fallback offline.

---

## 11. État des deux frontends

| | Mobile (`mobile/`) | Web PWA (`src/`) |
|--|-------------------|-------------------|
| Statut | **Actif**, développement principal | Legacy / parité métier |
| Navigation | CustomTabBar (Accueil, Agenda, Spots, Outils, Favoris, Pro, Admin, Profil) | BottomNav (règles `.cursorrules`) |
| Stores | `mobile/src/lib/*` | `src/lib/*` (localStorage) |

Toute évolution récente (PASS Djomy, withdraw content, gallery images, lifecycle user) cible **mobile + migrations Supabase**.
