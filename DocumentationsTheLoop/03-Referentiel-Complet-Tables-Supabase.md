# 03 — Référentiel complet des tables Supabase

## Légende des types

| Type | Signification | Exemple après purge sandbox |
|------|---------------|----------------------------|
| **PARAMÈTRE** | Configuration plateforme, référentiel, jobs — **conservé** par purge (ou re-seed) | `app_settings`, `content_categories` |
| **OPÉRATIONNEL** | Données utilisateurs, contenu publié, transactions — **vidé** par purge | `events`, `prime_benefit_grants` |
| **HYBRIDE** | Structure paramétrable + lignes métier dynamiques | `benefit_catalog`, `home_polls` |
| **RÉFÉRENTIEL** | Données géographiques / lookup — conservé | `guinea_locations` |
| **LEGACY** | Ancien modèle `schema.sql`, coexiste avec V1.0 | `profiles`, `locations` (UUID) |

---

## A. Comptes & auth

### `auth.users` (schéma auth Supabase)

| | |
|--|--|
| **Type** | OPÉRATIONNEL (identités) |
| **Rôle** | Comptes authentification (e-mail, téléphone, JWT) |
| **Contenu** | id UUID, email, encrypted_password, metadata… |
| **Purge** | Garde uniquement le(s) super_admin |

### `public.users`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | Profil métier extension de auth.users |
| **Contenu clé** | `first_name`, `last_name`, `email`, `phone_number`, `user_role` (member/prime/partner/admin/super_admin), `qr_code_token`, `referral_code`, `referred_by_code`, `birth_date`, `country_code`, `city`, `is_active`, `account_status`, `prime_role_locked`, scopes partenaire (`partner_can_manage_*`), `company`, `job_title` |
| **Purge** | 1 ligne super_admin conservée |

### `public.profiles` (LEGACY)

| | |
|--|--|
| **Type** | LEGACY / OPÉRATIONNEL |
| **Rôle** | Ancien profil PWA (enum user_role app) |
| **Note** | Coexiste ; mobile privilégie `public.users` |

### `public.platform_roles`

| | |
|--|--|
| **Type** | **PARAMÈTRE** |
| **Rôle** | Mapping slug → app_role + theme_id |
| **Contenu seed** | member, prime, partner, admin, super_admin (5 lignes) |
| **Purge** | **Conservée** |

### `public.admin_permission_overrides`

| | |
|--|--|
| **Type** | HYBRIDE (config par admin) |
| **Rôle** | Grants/revokes permissions modules admin délégués |
| **Purge** | Vidée (non dans liste preserve) |

### `public.staff_benefit_overrides`

| | |
|--|--|
| **Type** | HYBRIDE |
| **Rôle** | Overrides avantages pour staff/admin |
| **Purge** | Vidée |

---

## B. Paramètres plateforme (KV & légal)

### `public.app_settings`

| | |
|--|--|
| **Type** | **PARAMÈTRE** |
| **Rôle** | Clé-valeur JSON — paramètres globaux app |
| **Purge** | **Conservée** |

| Clé | Contenu | Seed ? | Migration ? |
|-----|---------|--------|-------------|
| `community_ui` | `{ showSuggestionButton: bool }` | ✓ | 20260742 |
| `admin_default_permissions` | `["moderation","content","insights"]` | ✓ | 20260748 |
| `role_benefit_entitlements` | `{ member:[], prime:[], admin:[] }` | ✓ (+ admin) | 20260745 |
| `enabled_content_countries` | `["GN","SN"]` | ✓ | 20260749 |
| `staff_team_pack_by_country` | Packs équipe par pays | ✓ | 20260749 |
| `opening_hours_config` | Modes horaires spots | ✓ | 20260755 |
| `app_sections_ui` | Toggles onglets / blocs accueil | ✓ | **Seed seul** |
| `pass_shop_settings_v1` | `{ maxPendingPasses: 3 }` | ✓ | **Seed seul** |
| `pass_catalog_v1` | Catalogue PASS (Heritage, Intermediaire…) | ✓ | **Seed seul** |
| `pass_activation_messages_v1` | Templates notif activation PASS | ✓ | **Seed seul** |
| `benefit_types` | Types avantages (unlimited, quantity, usage_limit) | ✓ | **Seed seul** |

**⚠️ Écart :** modifications admin en prod (prix PASS custom, sections UI…) **ne sont pas** dans le seed sauf si vous les y copiez manuellement.

### `public.app_legal_content`

| | |
|--|--|
| **Type** | **PARAMÈTRE** |
| **Rôle** | Textes légaux éditables admin |
| **Clés** | `cgu`, `partner_terms`, `mentions_legales` |
| **Purge** | **Conservée** ; seed fait DELETE+INSERT si exécuté |

### `public.referral_settings`

| | |
|--|--|
| **Type** | **PARAMÈTRE** (singleton id=1) |
| **Contenu** | 10 filleuls → 1 mois Prime, max 3 mois/an |
| **Purge** | **Conservée** ; seed réinitialise si exécuté |

---

## C. Catégories & référentiels

### `public.content_categories`

| | |
|--|--|
| **Type** | **PARAMÈTRE** (structure) + lignes custom admin |
| **Rôle** | **Source de vérité** catégories event/spot/tool |
| **Contenu seed (14 lignes builtin)** | Voir section D du doc 04 |
| **Purge** | **Conservée** — **ne reflète pas** les modifs admin si purge sans seed |
| **Sync** | Alimente `event_categories`, `establishment_categories` |

### `public.event_categories` / `public.establishment_categories`

| | |
|--|--|
| **Type** | **PARAMÈTRE** (miroir legacy) |
| **Rôle** | FK INT pour `events.category_id`, `establishments.category_id` |
| **Purge** | Vidées (non preserve) — **recréées** par sync depuis content_categories lors migrations / admin |

### `public.guinea_locations`

| | |
|--|--|
| **Type** | **RÉFÉRENTIEL** |
| **Rôle** | 4549 quartiers Guinée (région → district) |
| **Purge** | **Conservée** |
| **Seed séparé** | `seed_guinea_locations.sql` |

### `public.locations` (LEGACY)

| | |
|--|--|
| **Type** | LEGACY |
| **Rôle** | Ancien quartiers INT (Conakry) — parallèle à guinea_locations |

---

## D. Contenu publié (catalogue)

### `public.events`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Contenu** | Événements publiés : titre, dates, bannière, `gallery_images`, catégories (slug + FK), `organizer_id`, `partner_id`, `content_status`, `content_origin`, `country_code`, `is_active`, `favorite_count`, visibilité Prime… |
| **Purge** | Vidée (0 lignes) |

### `public.event_speakers` / `public.event_schedules`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | Détail événement (intervenants, programme) |

### `public.establishments`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Contenu** | Spots : nom, adresse, catégories, horaires, photos, engagement (`click_count`, `favorite_count`, `engagement_score`, `star_count`, `rating_avg`), `content_status`, `partner_id`, `master_id`… |
| **Purge** | Vidée — **clics remis à zéro en base** |

### `public.establishment_photos` / `public.establishment_schedules`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | Galerie et horaires spots |

### `public.tools`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | Catalogue outils (équivalent spots pour apps/services) |

### `public.tool_photos`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |

### `public.hero_banners`

| | |
|--|--|
| **Type** | HYBRIDE |
| **Rôle** | Slider hero admin → référence event/spot publié |

---

## E. Staging & workflow partenaire

### `public.partner_tokens`

| | |
|--|--|
| **Type** | HYBRIDE |
| **Rôle** | Jetons connexion SPOT (`SPOT-DEMO-2026` en migration démo) |
| **Purge** | Vidée |

### `public.partner_event_submissions`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | Brouillons / soumissions événements partenaire |
| **Colonnes clés** | `local_id`, status, `published_event_id`, payload JSON |

### `public.partner_spot_submissions`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | Brouillons spots **et** outils |
| **Colonnes clés** | `published_establishment_id`, `published_tool_id` |

### `public.partner_validation_codes`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | Codes validation avantages (`CODE-XXXXX`) par partenaire |

### `public.partner_staff`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | Lien user ↔ établissement (master staff) |

### `public.partnership_requests`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | Candidatures partenariat (formulaire public) |

### `public.partnership_notes`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | Notes admin sur candidatures |

---

## F. Engagement & favoris

### `public.favorite_events` / `public.favorite_spots` / `public.favorite_tools`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | Favoris par user |
| **Purge** | Vidées |

### `public.establishment_ratings` / `public.tool_ratings`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | Notes 1–5 par utilisateur |

### `public.spot_star_settings` / `public.spot_star_tiers`

| | |
|--|--|
| **Type** | **PARAMÈTRE** |
| **Rôle** | Poids clics/favoris + paliers score → étoiles |
| **Purge** | **Conservées** ; seed réinitialise tiers si exécuté |

### `public.spot_star_calc_runs`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | Journal des calculs quotidiens étoiles |
| **Purge** | Vidée |

---

## G. Avantages Prime & PASS

### `public.benefit_catalog`

| | |
|--|--|
| **Type** | HYBRIDE |
| **Rôle** | Catalogue avantages admin (titres, validité, partenaires offrants, kind…) |
| **Purge** | Vidée ; migration démo avait 2 entrées (L'Avenue, Sky Lounge) — seed laisse **vide** |

### `public.prime_benefit_grants`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | **Octrois individuels** par membre |
| **Colonnes clés** | `user_id`, `local_id`, `catalog_local_id`, `status`, `grant_audience`, `role_entitlement`, dates validité/usage |
| **Purge** | Vidée (0) |

### `public.scheduled_benefit_grants`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | Octrois programmés (audience, date) |
| **Purge** | Vidée |

### `public.admin_benefit_draws`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | Historique tirages au sort admin |
| **Contenu** | rôles cibles, gagnants JSONB, catalogue, validité |
| **Purge** | Vidée |

### `public.benefit_redemptions`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | Validations partenaire (pending → validated) |

### `public.user_pass_grants`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | PASS octroyés ou achetés (statut, dates, catalog_id, snapshot gelé) |
| **Purge** | Vidée |

### `public.payment_intents`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | Paiements Djomy (référence marchande, fulfillment) |
| **Purge** | Vidée |

---

## H. Parrainage

### `public.referrals` / `public.referral_rewards`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | Filleuls et récompenses mois Prime |
| **RLS** | Activé **sans policy client** → accès via backend/RPC |
| **Purge** | Vidées |

---

## I. Partenaire — paliers & attributions

### `public.partner_milestone_rules`

| | |
|--|--|
| **Type** | **PARAMÈTRE** |
| **Rôle** | Règles paliers (validations, membres uniques → récompense) |
| **Purge** | **Conservée** |

### `public.partner_milestone_rewards`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | Récompenses gagnées par partenaire |
| **Purge** | Vidée |

### `public.partner_member_attributions`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | Première validation membre chez un partenaire |

---

## J. Accueil & éditorial

### `public.home_polls` / `public.home_poll_votes`

| | |
|--|--|
| **Type** | HYBRIDE / OPÉRATIONNEL |
| **Rôle** | Sondage accueil + votes (user ou device) |

### `public.loop_walks`

| | |
|--|--|
| **Type** | HYBRIDE |
| **Rôle** | Parcours guidés (steps JSON) |

### `public.creator_corner_features`

| | |
|--|--|
| **Type** | HYBRIDE |
| **Rôle** | Mise en avant créateur |

### `public.home_partner_logos`

| | |
|--|--|
| **Type** | HYBRIDE |
| **Rôle** | Ruban logos partenaires accueil |

---

## K. Admin & notifications

### `public.admin_automation_jobs`

| | |
|--|--|
| **Type** | **PARAMÈTRE** |
| **Rôle** | Jobs cron : anniversaires, bienvenue, membre du mois, étoiles |
| **Purge** | **Conservée** |

### `public.admin_push_campaigns`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | Campagnes notification push planifiées |

### `public.admin_user_invites`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | Invitations création comptes admin |

### `public.user_notifications`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | Inbox notifications membre |
| **Colonnes** | `user_id`, `title`, `message`, `audience`, `recipient_phone`, `read_at`, `campaign_id` |
| **Purge** | Vidée |

### `public.community_suggestions`

| | |
|--|--|
| **Type** | OPÉRATIONNEL |
| **Rôle** | Suggestions communauté (bouton accueil) |

---

## L. Tables LEGACY (`schema.sql` — peu ou pas utilisées mobile)

| Table | Rôle |
|-------|------|
| `partner_partnership_applications` | Anciennes candidatures |
| `partner_location_submissions` | Staging adresses legacy |
| `handshake_requests` | Handshake VIP |
| `conversations`, `conversation_participants`, `messages` | Messagerie |
| `user_favorite_events`, `user_favorite_locations` | Favoris legacy (profiles) |
| `analytics_events` | Analytics |
| `prime_invitations` | Jetons invitation Prime |

---

## M. Table fantôme (ne pas utiliser)

| Table | Statut |
|-------|--------|
| `partner_benefit_offers` | Référencée en 20260828 puis **absente** — utiliser `benefit_catalog` + stores mobile |

---

## N. Récapitulatif purge `purge_all_except_super_admin.sql`

### Tables **CONSERVÉES** (paramètres)

```
guinea_locations
app_settings
app_legal_content
content_categories
platform_roles
referral_settings
spot_star_settings
spot_star_tiers
partner_milestone_rules
admin_automation_jobs
users (super_admin uniquement après DELETE)
```

### Tout le reste `public.*` → **TRUNCATE CASCADE**

Inclut notamment : `events`, `establishments`, `tools`, `benefit_catalog`, `prime_benefit_grants`, `user_pass_grants`, `user_notifications`, `favorite_*`, `partner_*_submissions`, `home_polls`, `loop_walks`, `payment_intents`, `admin_benefit_draws`, `spot_star_calc_runs`, `partner_milestone_rewards`, etc.

### Auth

Garde uniquement `auth.users` + identities/sessions du super_admin.

---

## O. Requête audit rapide post-purge

```sql
SELECT 'events' t, count(*) FROM public.events
UNION ALL SELECT 'establishments', count(*) FROM public.establishments
UNION ALL SELECT 'prime_benefit_grants', count(*) FROM public.prime_benefit_grants
UNION ALL SELECT 'user_pass_grants', count(*) FROM public.user_pass_grants
UNION ALL SELECT 'user_notifications', count(*) FROM public.user_notifications
UNION ALL SELECT 'content_categories', count(*) FROM public.content_categories
UNION ALL SELECT 'app_settings', count(*) FROM public.app_settings
UNION ALL SELECT 'users', count(*) FROM public.users;
```

Attendu sandbox : opérationnel = **0**, paramètres = **>0**, users = **1**.
