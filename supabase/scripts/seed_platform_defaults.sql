-- =============================================================================
-- THE LOOP — Paramètres plateforme par défaut (SEED PROPRE)
-- Dernière alignement : août 2026 (clés app_settings par pays, rating_weight…)
--
-- ⚠️  À exécuter APRÈS purge_all_except_super_admin.sql
--     DELETE puis INSERT des valeurs canoniques (ne merge pas l'existant).
--     Catalogue, contenu publié, membres = vides volontairement.
--
-- Ordre sandbox :
--   1. Migrations à jour (dont 20260855 campaign_id)
--   2. purge_all_except_super_admin.sql
--   3. CE SCRIPT
-- =============================================================================

BEGIN;

-- ── 1. Réglages app (clés globales + suffixe _GN + alias legacy GN) ─────────
DELETE FROM public.app_settings;

INSERT INTO public.app_settings (key, value) VALUES
  ('community_ui', '{"showSuggestionButton": true}'::jsonb),
  ('admin_default_permissions', '["moderation","content","insights"]'::jsonb),
  ('enabled_content_countries', '["GN","SN"]'::jsonb),
  ('staff_team_pack_by_country', '{"byCountry":{},"updatedAt":"1970-01-01T00:00:00.000Z","updatedBy":null}'::jsonb),
  ('opening_hours_config', '{
    "modes": {
      "always_open": { "label": "Toujours ouvert", "enabled": true },
      "by_appointment": { "label": "Sur RDV", "enabled": true },
      "weekly": { "label": "Plages horaires", "enabled": true }
    },
    "presets": [
      { "id": "tue_sun", "label": "Mar–Dim", "preset": "tue_sun", "enabled": true },
      { "id": "sat_only", "label": "Sam uniquement", "preset": "sat_only", "enabled": true },
      { "id": "tue_sat_sun_split", "label": "Mar–Sam + Dim", "preset": "tue_sat_sun_split", "enabled": true }
    ],
    "defaultOpenTime": "12:00",
    "defaultCloseTime": "23:00",
    "defaultSunOpenTime": "12:00",
    "defaultSunCloseTime": "20:00",
    "updatedAt": "1970-01-01T00:00:00.000Z"
  }'::jsonb),
  ('benefit_types', '{
    "types": [
      {
        "id": "bt-unlimited",
        "slug": "unlimited",
        "label": "Sans limite de quantité",
        "description": "Avantage sans limite de quantité ni d''utilisations.",
        "mechanic": "unlimited",
        "defaultQuantity": null,
        "defaultMaxUses": null,
        "isActive": true,
        "sortOrder": 10,
        "isBuiltIn": true,
        "createdAt": "1970-01-01T00:00:00.000Z",
        "updatedAt": "1970-01-01T00:00:00.000Z"
      },
      {
        "id": "bt-quantity",
        "slug": "quantity",
        "label": "Quantité (ex. 2 entrées)",
        "description": "Ex. 2 entrées, 1 cocktail — quantité fixe par octroi.",
        "mechanic": "quantity",
        "defaultQuantity": 1,
        "defaultMaxUses": null,
        "isActive": true,
        "sortOrder": 20,
        "isBuiltIn": true,
        "createdAt": "1970-01-01T00:00:00.000Z",
        "updatedAt": "1970-01-01T00:00:00.000Z"
      },
      {
        "id": "bt-usage-limit",
        "slug": "usage_limit",
        "label": "Utilisations limitées (ex. -20%)",
        "description": "Ex. -20 % utilisable un nombre limité de fois.",
        "mechanic": "usage_limit",
        "defaultQuantity": null,
        "defaultMaxUses": 1,
        "isActive": true,
        "sortOrder": 30,
        "isBuiltIn": true,
        "createdAt": "1970-01-01T00:00:00.000Z",
        "updatedAt": "1970-01-01T00:00:00.000Z"
      }
    ],
    "updatedAt": "1970-01-01T00:00:00.000Z"
  }'::jsonb),
  (
    'app_sections_ui_GN',
    '{
      "accueil": { "hero": true, "poll": true, "corner": true, "chronique": true, "walks": true, "logos": true },
      "agenda": { "hero": false, "filters": true, "tabVisible": true },
      "spots": { "hero": false, "filters": true, "tabVisible": true },
      "outils": { "hero": false, "filters": true, "tabVisible": true },
      "partnerPro": {
        "content": true, "benefits": true, "featured": true,
        "rewards": true, "stats": true, "spaceVisible": true
      }
    }'::jsonb
  ),
  (
    'role_benefit_entitlements_GN',
    '{"member":[],"prime":[],"partner":[],"admin":[],"updatedAt":"1970-01-01T00:00:00.000Z","updatedBy":null}'::jsonb
  ),
  ('pass_shop_settings_v1_GN', '{"maxPendingPasses":3}'::jsonb),
  (
    'pass_catalog_v1_GN',
    '[
      {
        "id": "pass-heritage-builtin",
        "label": "PASS Heritage",
        "description": "Offert sans paiement, sans expiration. Révocable par super admin uniquement.",
        "priceGnf": 0,
        "validityDays": null,
        "grantableBySuperAdmin": true,
        "purchasableInShop": false,
        "shopBillingPeriod": null,
        "status": "active",
        "isBuiltin": true,
        "sortOrder": 0,
        "createdAt": "1970-01-01T00:00:00.000Z",
        "updatedAt": "1970-01-01T00:00:00.000Z"
      },
      {
        "id": "pass-intermediaire-builtin",
        "label": "PassIntermediaire",
        "description": "Gel administratif : le membre conserve son PASS d''origine (dates et avantages) en attente de réaffectation Prime.",
        "priceGnf": 0,
        "validityDays": null,
        "grantableBySuperAdmin": true,
        "purchasableInShop": false,
        "shopBillingPeriod": null,
        "status": "active",
        "isBuiltin": true,
        "sortOrder": 1,
        "createdAt": "1970-01-01T00:00:00.000Z",
        "updatedAt": "1970-01-01T00:00:00.000Z"
      }
    ]'::jsonb
  ),
  (
    'pass_activation_messages_v1_GN',
    '[
      {
        "id": "pass-msg-heritage",
        "passType": "heritage",
        "name": "Activation PASS Heritage",
        "titleTemplate": "Bonjour {firstName} !",
        "messageTemplate": "Félicitations — ton {passLabel} vient d''être activé. {validity}. Tu fais désormais partie de Loop Prime : avantages exclusifs, offres partenaires et expériences premium t''attendent.",
        "status": "active",
        "createdAt": "1970-01-01T00:00:00.000Z",
        "updatedAt": "1970-01-01T00:00:00.000Z"
      },
      {
        "id": "pass-msg-monthly",
        "passType": "monthly",
        "name": "Activation PASS Mensuel",
        "titleTemplate": "Bienvenue dans Loop Prime, {firstName} !",
        "messageTemplate": "Ton {passLabel} est actif. {validity}. Profite dès maintenant de tous les avantages Prime.",
        "status": "active",
        "createdAt": "1970-01-01T00:00:00.000Z",
        "updatedAt": "1970-01-01T00:00:00.000Z"
      },
      {
        "id": "pass-msg-default",
        "passType": "default",
        "name": "Activation PASS (générique)",
        "titleTemplate": "Bonjour {firstName} !",
        "messageTemplate": "Excellente nouvelle : ton {passLabel} vient d''être activé. {validity}. Bienvenue dans l''expérience Loop Prime !",
        "status": "active",
        "createdAt": "1970-01-01T00:00:00.000Z",
        "updatedAt": "1970-01-01T00:00:00.000Z"
      }
    ]'::jsonb
  );

-- Alias legacy GN (l'app migre progressivement vers les clés *_GN)
INSERT INTO public.app_settings (key, value)
SELECT 'app_sections_ui', value FROM public.app_settings WHERE key = 'app_sections_ui_GN';

INSERT INTO public.app_settings (key, value)
SELECT 'role_benefit_entitlements', value FROM public.app_settings WHERE key = 'role_benefit_entitlements_GN';

INSERT INTO public.app_settings (key, value)
SELECT 'pass_shop_settings_v1', value FROM public.app_settings WHERE key = 'pass_shop_settings_v1_GN';

INSERT INTO public.app_settings (key, value)
SELECT 'pass_catalog_v1', value FROM public.app_settings WHERE key = 'pass_catalog_v1_GN';

INSERT INTO public.app_settings (key, value)
SELECT 'pass_activation_messages_v1', value FROM public.app_settings WHERE key = 'pass_activation_messages_v1_GN';

-- ── 2. Contenus légaux ───────────────────────────────────────────────────────
DELETE FROM public.app_legal_content;

INSERT INTO public.app_legal_content (key, title, body) VALUES
  (
    'cgu',
    'Conditions générales d''utilisation',
    'En créant un compte, vous acceptez que vos données personnelles (nom, téléphone, e-mail, date de naissance) soient utilisées uniquement par THE LOOP pour la gestion de votre profil membre, vos favoris, notifications, PASS Prime et avantages. Vos informations ne sont pas revendues à des tiers. Vous pouvez demander la modification ou la suppression de vos données en contactant le service clientèle.'
  ),
  (
    'partner_terms',
    'Conditions partenaires',
    'THE LOOP se réserve le droit de retirer toute publication (événement, spot, outil) sans obligation de justification, notamment en cas de non-conformité, signalement ou décision éditoriale. Les partenaires sont informés que le contenu publié peut être désactivé à tout moment par l''équipe THE LOOP.'
  ),
  (
    'mentions_legales',
    'Mentions légales',
    E'Éditeur\nTHE LOOP — application mobile de découverte et d''expériences à Conakry (Guinée).\nContact : contact@theloop.gn\n\nDirecteur de la publication\n[À compléter par THE LOOP]\n\nHébergement\nSupabase Inc. — hébergement base de données et authentification.\nHébergeur applicatif : [À compléter]\n\nDonnées personnelles\nLes données collectées lors de l''inscription (nom, e-mail, téléphone, date de naissance) sont traitées par THE LOOP pour la gestion du compte membre, des favoris, notifications et avantages Loop Prime. Pour toute demande d''accès, rectification ou suppression : contact@theloop.gn\n\nPropriété intellectuelle\nL''ensemble des contenus, marques et éléments graphiques de THE LOOP sont protégés. Toute reproduction non autorisée est interdite.'
  );

-- ── 3. Catégories contenu ────────────────────────────────────────────────────
DELETE FROM public.content_categories;

INSERT INTO public.content_categories (kind, slug, label, emoji, sort_order, is_builtin, is_active)
VALUES
  ('event', 'corporate', 'Corporate', '💼', 0, TRUE, TRUE),
  ('event', 'nightlife', 'Nightlife', '🌙', 1, TRUE, TRUE),
  ('event', 'art_culture', 'Art & Culture', '🎨', 2, TRUE, TRUE),
  ('event', 'gastronomie', 'Gastronomie', '🍽️', 3, TRUE, TRUE),
  ('spot', 'fine_dining', 'Fine Dining', '🍽️', 0, TRUE, TRUE),
  ('spot', 'hotels', 'Hôtels', '🏨', 1, TRUE, TRUE),
  ('spot', 'bars_lounges', 'Bars & Lounges', '🍸', 2, TRUE, TRUE),
  ('tool', 'tool-productivite', 'Productivité', '🛠️', 0, TRUE, TRUE),
  ('tool', 'tool-finance', 'Finance', '🛠️', 1, TRUE, TRUE),
  ('tool', 'tool-commerce', 'Commerce', '🛠️', 2, TRUE, TRUE),
  ('tool', 'tool-social', 'Social', '🛠️', 3, TRUE, TRUE),
  ('tool', 'tool-sante', 'Santé', '🛠️', 4, TRUE, TRUE),
  ('tool', 'tool-education', 'Éducation', '🛠️', 5, TRUE, TRUE),
  ('tool', 'tool-autre', 'Autre', '🛠️', 6, TRUE, TRUE);

-- ── 4. Parrainage ────────────────────────────────────────────────────────────
DELETE FROM public.referral_settings;

INSERT INTO public.referral_settings (id, referrals_per_reward, reward_months, max_reward_months_per_year)
VALUES (1, 10, 1, 3);

-- ── 5. Étoiles spots (rating_weight requis depuis 20260833) ───────────────────
DELETE FROM public.spot_star_calc_runs;
DELETE FROM public.spot_star_tiers;
DELETE FROM public.spot_star_settings;

INSERT INTO public.spot_star_settings (country_code, click_weight, favorite_weight, rating_weight, is_active)
VALUES (NULL, 1, 5, 10, TRUE), ('GN', 1, 5, 10, TRUE);

INSERT INTO public.spot_star_tiers (settings_id, min_score, max_score, star_count, sort_order)
SELECT s.id, t.min_score, t.max_score, t.star_count, t.sort_order
FROM public.spot_star_settings s
CROSS JOIN (
  VALUES
    (0, 50, 1, 1),
    (51, 200, 2, 2),
    (201, 500, 3, 3),
    (501, 1000, 4, 4),
    (1001, NULL::INT, 5, 5)
) AS t(min_score, max_score, star_count, sort_order)
WHERE s.country_code IS NULL;

INSERT INTO public.spot_star_tiers (settings_id, min_score, max_score, star_count, sort_order)
SELECT s.id, t.min_score, t.max_score, t.star_count, t.sort_order
FROM public.spot_star_settings s
CROSS JOIN (
  VALUES
    (0, 50, 1, 1),
    (51, 200, 2, 2),
    (201, 500, 3, 3),
    (501, 1000, 4, 4),
    (1001, NULL::INT, 5, 5)
) AS t(min_score, max_score, star_count, sort_order)
WHERE s.country_code = 'GN';

-- ── 6. Paliers partenaires ───────────────────────────────────────────────────
DELETE FROM public.partner_milestone_rewards;
DELETE FROM public.partner_milestone_rules;

INSERT INTO public.partner_milestone_rules (
  name, description, metric_type, threshold, reward_type,
  duration_days, validity_days, push_title, push_message,
  country_code, period_months, sort_order, is_active, archived
)
VALUES
  (
    '20 validations ce mois',
    '20 avantages validés via votre code sur le mois en cours → à la une 1 semaine',
    'validations', 20, 'featured_week',
    7, 90, NULL, NULL,
    'GN', 1, 1, TRUE, FALSE
  ),
  (
    '50 validations ce mois',
    '50 validations cumulées sur le mois → push notification',
    'validations', 50, 'push_once',
    7, 90,
    'Coup de projecteur THE LOOP',
    'Découvrez notre partenaire — événement, spot ou outil mis en avant cette semaine.',
    'GN', 1, 2, TRUE, FALSE
  );

-- ── 7. Jobs d'automatisation ─────────────────────────────────────────────────
DELETE FROM public.admin_automation_jobs;

INSERT INTO public.admin_automation_jobs (id, name, job_type, status, schedule, country_code, city, payload)
VALUES
  (
    'job-birthday-default',
    'Anniversaires — cadeaux ville',
    'birthday_benefit', 'active', 'daily', 'GN', NULL,
    '{"benefitPurpose":"birthday","validityDays":30}'::jsonb
  ),
  (
    'job-welcome-default',
    'Bienvenue — avantage ville',
    'welcome_benefit', 'active', 'on_signup', 'GN', NULL,
    '{"benefitPurpose":"welcome","validityDays":30,"welcomeMessage":"Bienvenue dans THE LOOP ! Découvre tes avantages selon ta ville."}'::jsonb
  ),
  (
    'job-member-month-default',
    'Membre du mois — récompense',
    'member_of_month', 'active', 'monthly', 'GN', NULL,
    '{"benefitPurpose":"member_of_month","notifyAllMembers":true,"validityDays":30}'::jsonb
  ),
  (
    'job-spot-stars-default',
    'Étoiles spots — calcul quotidien',
    'spot_stars', 'active', 'daily', 'GN', NULL,
    '{}'::jsonb
  );

-- ── 8. Rôles plateforme ─────────────────────────────────────────────────────
-- admin et super_admin partagent app_role = ADMIN ; la distinction est :
--   • users.user_role = slug ('admin' | 'super_admin')
--   • theme_id : DELEGATED_ADMIN (gris) vs ADMIN (Control Tower or)
--   • permissions : super_admin bypass ; admin délégué = admin_permission_overrides
DELETE FROM public.platform_roles;

INSERT INTO public.platform_roles (slug, label, app_role, theme_id, is_admin, sort_order)
VALUES
  ('member', 'Membre', 'USER_FREE', 'FREE_MEMBER', FALSE, 0),
  ('prime', 'Loop Prime', 'USER_PRIME', 'PRIME_MEMBER', FALSE, 1),
  ('partner', 'Partenaire', 'PARTNER', 'PARTNER', FALSE, 2),
  ('admin', 'Admin délégué', 'ADMIN', 'DELEGATED_ADMIN', TRUE, 4),
  ('super_admin', 'Super admin', 'ADMIN', 'ADMIN', TRUE, 5);

-- ── 9. Overrides admin / staff (état initial vide) ───────────────────────────
DELETE FROM public.staff_benefit_overrides;
DELETE FROM public.admin_permission_overrides;

COMMIT;

-- Vérification
SELECT 'app_settings' AS table_name, count(*) AS rows FROM public.app_settings
UNION ALL SELECT 'content_categories', count(*) FROM public.content_categories
UNION ALL SELECT 'spot_star_settings', count(*) FROM public.spot_star_settings
UNION ALL SELECT 'admin_automation_jobs', count(*) FROM public.admin_automation_jobs
UNION ALL SELECT 'platform_roles', count(*) FROM public.platform_roles;

SELECT slug, label, app_role, theme_id, is_admin FROM public.platform_roles ORDER BY sort_order;
SELECT key FROM public.app_settings ORDER BY key;
