# 05 — Cache local téléphone (AsyncStorage)

## 1. Pourquoi ce document existe

La **purge Supabase** ne touche **pas** le stockage local du téléphone.  
L’application mobile est conçue **offline-first** : de nombreux modules écrivent d’abord dans AsyncStorage, puis synchronisent avec Supabase.

**Symptôme typique post-purge :**

- Insights montrent des **clics** ou **favoris** sur des spots supprimés
- Onglet Avantages montre des **octrois** ou **tirages** alors que `prime_benefit_grants` = 0 en SQL
- PASS accordés visibles alors que `user_pass_grants` = 0
- Catégories admin différentes entre SQL et écran (cache `loop_admin_categories_v3`)
- Liste membres pour tirage au sort inclut d’anciens comptes (registre local)

---

## 2. Principe de fonctionnement

```
Lecture UI
    │
    ├─► Supabase (si configuré + online) ──► source de vérité cloud
    │
    └─► AsyncStorage (cache / fallback / merge)
            │
            └─► Peut SURVIVRE à une purge SQL
```

**Corrections août 2026** (stores alignés Supabase quand online) :

| Store | Comportement corrigé |
|-------|---------------------|
| `prime-benefits-store.ts` | `loadAll()` recharge depuis `prime_benefit_grants` |
| `admin-benefit-draw-store.ts` | Historique depuis `admin_benefit_draws` |
| `user-registry-store.ts` | Registre depuis `users` actifs |
| `pass-admin-store.ts` | PASS accordés depuis `user_pass_grants` |
| `user-notifications-store.ts` | Remote remplace local par user |
| `benefit-catalog-store.ts` | Remote vide → purge cache local (sauf pending sync) |
| `pass-catalog-store.ts` | Remote app_settings remplace cache |

**Encore partiellement local (risque fantômes) :**

| Store | Clé(s) | Risque |
|-------|--------|--------|
| `spot-stars-store.ts` | `loop_spot_engagement_v1` | **Clics / scores fantômes** |
| `admin-insights-store.ts` | `loop_local_favorite_counts_v1` | Favoris agrégés fantômes |
| `content-store.ts` | `loop_content_snapshot_v1` | Catalogue complet ancien |
| `subscription-history.ts` | `loop_subscriptions_{userId}` | Historique PASS local |
| `referral-store.ts` | `loop_referrals_v1`… | Parrainage local |
| `walk-engagement-store.ts` | `loop_walk_*` | Engagement walks local |

---

## 3. Inventaire complet des clés AsyncStorage

### 3.1 Auth & session

| Clé | Fichier | Contenu | Purge SQL |
|-----|---------|---------|-----------|
| Session Supabase Auth | (client supabase) | JWT | Partiel (auth.users) |
| `loop_demo_session` | demo-auth.ts | Session démo | Non |
| `loop_demo_favorites_{userId}` | demo-auth.ts | Favoris démo | Non |
| `loop_partner_spot_session_v1` | partner-session-store.ts | Session SPOT | Non |
| `loop_password_resets_v1` | password-reset-store.ts | Reset local | Non |

### 3.2 Utilisateurs & registre

| Clé | Fichier | Supabase |
|-----|---------|----------|
| `loop_user_registry_v1` | user-registry-store.ts | `users` (sync si online) |
| `loop_deactivated_user_ids_v1` | deactivated-users-store.ts | — |
| `loop_admin_user_invites_v1` | admin-invite-store.ts | `admin_user_invites` |

### 3.3 Catalogue & contenu

| Clé | Fichier | Supabase |
|-----|---------|----------|
| `loop_content_snapshot_v1` | content-store.ts | events, establishments, tools |
| `loop_admin_content_overrides_v1` | admin-content-store.ts | overrides admin |
| `loop_admin_featured_spots_v1` | admin-content-store.ts | featured |
| `loop_partner_staging_v2` | partner-staging-store.ts | partner_*_submissions |
| `loop_admin_categories_v3` | admin-categories-store.ts | content_categories |
| `loop_categories_cache_schema` | admin-categories-store.ts | version cache |
| `loop_enabled_content_countries_v2` | content-countries-store.ts | app_settings |
| `loop_inactive_categories_v1` | inactive-category-registry.ts | — |

### 3.4 Avantages & PASS

| Clé | Fichier | Supabase |
|-----|---------|----------|
| `loop_benefit_catalog_v2` | benefit-catalog-store.ts | benefit_catalog |
| `loop_prime_benefits_v2` | prime-benefits-store.ts | prime_benefit_grants |
| `loop_scheduled_benefit_grants_v1` | prime-benefits-store.ts | scheduled_benefit_grants |
| `loop_benefit_redemptions_v1` | benefit-redemption-store.ts | benefit_redemptions |
| `loop_admin_benefit_draws_v1` | admin-benefit-draw-store.ts | admin_benefit_draws |
| `loop_partner_benefit_offers_v1` | partner-benefit-offers-store.ts | — (local) |
| `loop_pass_catalog_v1` | pass-catalog-store.ts | app_settings.pass_catalog_v1 |
| `loop_pass_prices_v1` | pass-pricing-store.ts | — (local) |
| `loop_pass_shop_settings_v1` | pass-shop-settings-store.ts | app_settings |
| `loop_pass_activation_messages_v1` | pass-activation-messages-store.ts | app_settings |
| `loop_subscriptions_{userId}` | subscription-history.ts | user_pass_grants (partiel) |

### 3.5 Engagement & insights (**clics**)

| Clé | Fichier | Rôle |
|-----|---------|------|
| `loop_spot_engagement_v1` | spot-stars-store.ts | **Clics, favoris, score par spotId** |
| `loop_local_favorite_counts_v1` | admin-insights-store.ts | Compteurs favoris agrégés |
| `loop_spot_star_settings_v1` | spot-stars-store.ts | Cache paramètres étoiles |
| `loop_spot_stars_last_calc_v1` | spot-stars-store.ts | Dernier calcul |
| `loop_walk_clicks_v1` | walk-engagement-store.ts | Clics walks |
| `loop_walk_favorites_v1` | walk-engagement-store.ts | Favoris walks |
| `loop_walk_ratings_v1` | walk-engagement-store.ts | Notes walks |

### 3.6 Notifications

| Clé | Fichier | Supabase |
|-----|---------|----------|
| `loop_user_notifications_v1` | user-notifications-store.ts | user_notifications |
| `loop_admin_notifications_v3` | admin-notifications-store.ts | campagnes (local) |

### 3.7 Paramètres UI

| Clé | Fichier | Supabase |
|-----|---------|----------|
| `loop_app_sections_v1` | app-sections-store.ts | app_settings.app_sections_ui |
| `loop_app_settings_v1` | app-settings-store.ts | community_ui |
| `loop_legal_content_v1` | legal-content-store.ts | app_legal_content |
| `loop_opening_hours_settings_v1` | opening-hours-settings-store.ts | opening_hours_config |
| `loop_admin_country_v1` | AdminCountryContext | — (UI admin) |
| `loop_role_benefit_entitlements_v1` | role-benefit-entitlements-store.ts | app_settings |
| `loop_benefit_types_v1` | benefit-types-store.ts | app_settings |
| `loop_staff_benefit_overrides_v1` | staff-benefit-overrides-store.ts | staff_benefit_overrides |

### 3.8 Accueil & partenaire

| Clé | Fichier | Supabase |
|-----|---------|----------|
| `loop_home_poll_demo`, `loop_home_poll_votes_demo` | home-poll-store.ts | home_polls |
| `loop_poll_device_id` | home-poll-store.ts | — |
| `loop_walks_demo_v5` | loop-walks-store.ts | loop_walks |
| `loop_creator_corner_demo_v2` | creator-corner-store.ts | creator_corner_features |
| `loop_partner_validation_codes_v1` | partner-validation-code-store.ts | partner_validation_codes |
| `loop_partner_milestone_rules_v1` | partner-milestone-store.ts | rules (local copy) |
| `loop_partner_milestone_rewards_v1` | partner-milestone-store.ts | rewards local |
| `loop_partner_member_attributions_v1` | partner-milestone-store.ts | attributions |

### 3.9 Admin divers

| Clé | Fichier |
|-----|---------|
| `loop_admin_permissions_v1` | admin-permissions.ts |
| `loop_admin_automation_jobs_v1` | admin-automation-jobs-store.ts |
| `loop_referral_settings_v1` | referral-config-store.ts |
| `loop_referrals_v1`, `loop_referral_rewards_v1` | referral-store.ts |
| `loop_community_suggestions_v1` | suggestions-store.ts |
| `loop_birthday_grant_log_v1` | birthday-automation-store.ts |
| `loop_job_birthday_log_{jobId}` | admin-automation-runner.ts |

---

## 4. Fonction utilitaire purge cache appareil

**Fichier :** `mobile/src/lib/device-operational-cache.ts`

```typescript
import { clearOperationalDeviceCache } from '@/lib/device-operational-cache';

await clearOperationalDeviceCache();
```

Supprime les clés opérationnelles listées + tous les préfixes `loop_subscriptions_*`.

**Ne supprime pas :** paramètres UI légers, session auth (sauf si vous déconnectez), `loop_admin_country_v1`.

---

## 5. Checklist opérateur après purge SQL

- [ ] Requêtes audit SQL → opérationnel = 0
- [ ] Kill app mobile (swipe fermeture)
- [ ] Rouvrir + se reconnecter super_admin
- [ ] Pull-to-refresh : Insights, Avantages, PASS, Tirage
- [ ] Si fantômes : réinstaller app ou `clearOperationalDeviceCache()`
- [ ] Vérifier catégories : SQL `SELECT * FROM content_categories` vs écran admin
- [ ] Si seed exécuté : vérifier 14 catégories + 11 app_settings

---

## 6. Diagramme : origine des « clics » Insights

```
AdminInsightsScreen
        │
        ▼
getFullAdminInsights()
        │
        ├─► countLocalFavorites()
        │       ├─ loop_demo_favorites_{userId}  (registre local)
        │       └─ loop_local_favorite_counts_v1
        │
        ├─► favorite_events / favorite_spots (Supabase)  ← 0 après purge
        │
        └─► spot-stars / engagement
                ├─ establishments.click_count (Supabase)  ← 0 après purge
                └─ loop_spot_engagement_v1 (LOCAL)  ← PEUT être > 0
```

**Conclusion :** clics post-purge = **presque toujours** cache `loop_spot_engagement_v1` ou snapshot contenu référençant d’anciens IDs.
