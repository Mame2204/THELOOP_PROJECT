-- =============================================================================
-- THE LOOP — Purge TOTALE : admin seul + référentiel Guinée (guinea_locations)
--
-- Supprime : users (sauf admin), tout le catalogue, soumissions, favoris,
--            ancienne table locations (Kaloum/Dixinn…), catégories, hero, etc.
-- Conserve : compte admin + table guinea_locations (4549 quartiers)
-- Supprime aussi : benefit_catalog, partner_tokens, partner_staff, spot_star_*,
--                  partner_milestone_*, referral_settings, app_settings,
--                  app_legal_content, content_categories, staff_benefit_overrides,
--                  admin_permission_overrides
-- Ne recopie rien : exécuter seed_platform_defaults.sql après pour les paramètres.
--
-- ⚠️  IRRÉVERSIBLE
-- Exécuter dans Supabase SQL Editor
--
-- Ordre recommandé pour sandbox prod vide :
--   1. Migration 20260747_guinea_locations.sql (si pas encore appliquée)
--   2. seed_guinea_locations.sql (alimente guinea_locations)
--   3. Ce script (purge)
--   4. seed_platform_defaults.sql (paramètres canoniques — sans recopier l'existant)
-- =============================================================================

DO $$
DECLARE
  v_keep_emails TEXT[] := ARRAY['admin@theloop.gn'];
  v_admin_ids UUID[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT x.id), ARRAY[]::UUID[])
  INTO v_admin_ids
  FROM (
    SELECT au.id FROM auth.users au
    WHERE lower(COALESCE(au.email, '')) = ANY (SELECT lower(e) FROM unnest(v_keep_emails) AS e)
    UNION
    SELECT u.id FROM public.users u
    WHERE lower(COALESCE(u.email, '')) = ANY (SELECT lower(e) FROM unnest(v_keep_emails) AS e)
       OR u.user_role IN ('admin', 'super_admin')
  ) AS x;

  IF array_length(v_admin_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Aucun admin trouvé — modifiez v_keep_emails.';
  END IF;

  -- ── 1. Données utilisateurs ───────────────────────────────────────────────
  IF to_regclass('public.favorite_events') IS NOT NULL THEN
    DELETE FROM public.favorite_events WHERE user_id <> ALL (v_admin_ids);
  END IF;
  IF to_regclass('public.favorite_spots') IS NOT NULL THEN
    DELETE FROM public.favorite_spots WHERE user_id <> ALL (v_admin_ids);
  END IF;
  IF to_regclass('public.user_favorite_locations') IS NOT NULL THEN
    DELETE FROM public.user_favorite_locations WHERE user_id <> ALL (v_admin_ids);
  END IF;
  IF to_regclass('public.user_notifications') IS NOT NULL THEN
    DELETE FROM public.user_notifications WHERE user_id <> ALL (v_admin_ids);
  END IF;
  IF to_regclass('public.referrals') IS NOT NULL THEN
    DELETE FROM public.referrals
    WHERE referrer_user_id <> ALL (v_admin_ids) OR referred_user_id <> ALL (v_admin_ids);
  END IF;
  IF to_regclass('public.referral_rewards') IS NOT NULL THEN
    DELETE FROM public.referral_rewards WHERE referrer_user_id <> ALL (v_admin_ids);
  END IF;
  IF to_regclass('public.prime_benefit_grants') IS NOT NULL THEN
    DELETE FROM public.prime_benefit_grants;
  END IF;
  IF to_regclass('public.benefit_redemptions') IS NOT NULL THEN
    DELETE FROM public.benefit_redemptions;
  END IF;
  IF to_regclass('public.partner_member_attributions') IS NOT NULL THEN
    DELETE FROM public.partner_member_attributions;
  END IF;
  IF to_regclass('public.community_suggestions') IS NOT NULL THEN
    DELETE FROM public.community_suggestions;
  END IF;
  IF to_regclass('public.partner_event_submissions') IS NOT NULL THEN
    DELETE FROM public.partner_event_submissions;
  END IF;
  IF to_regclass('public.partner_spot_submissions') IS NOT NULL THEN
    DELETE FROM public.partner_spot_submissions;
  END IF;
  IF to_regclass('public.partner_validation_codes') IS NOT NULL THEN
    DELETE FROM public.partner_validation_codes;
  END IF;
  IF to_regclass('public.admin_user_invites') IS NOT NULL THEN DELETE FROM public.admin_user_invites; END IF;
  IF to_regclass('public.scheduled_benefit_grants') IS NOT NULL THEN DELETE FROM public.scheduled_benefit_grants; END IF;
  IF to_regclass('public.admin_benefit_draws') IS NOT NULL THEN DELETE FROM public.admin_benefit_draws; END IF;
  IF to_regclass('public.admin_push_campaigns') IS NOT NULL THEN DELETE FROM public.admin_push_campaigns; END IF;
  IF to_regclass('public.partnership_notes') IS NOT NULL THEN DELETE FROM public.partnership_notes; END IF;
  IF to_regclass('public.partnership_requests') IS NOT NULL THEN DELETE FROM public.partnership_requests; END IF;
  IF to_regclass('public.admin_automation_jobs') IS NOT NULL THEN DELETE FROM public.admin_automation_jobs; END IF;

  -- ── 1b. Référentiels / seeds migrations (démo Phase 2, Prime, partenaires…) ─
  IF to_regclass('public.spot_star_calc_runs') IS NOT NULL THEN
    DELETE FROM public.spot_star_calc_runs;
  END IF;
  IF to_regclass('public.spot_star_tiers') IS NOT NULL THEN
    DELETE FROM public.spot_star_tiers;
  END IF;
  IF to_regclass('public.spot_star_settings') IS NOT NULL THEN
    DELETE FROM public.spot_star_settings;
  END IF;
  IF to_regclass('public.benefit_catalog') IS NOT NULL THEN
    DELETE FROM public.benefit_catalog;
  END IF;
  IF to_regclass('public.partner_tokens') IS NOT NULL THEN
    DELETE FROM public.partner_tokens;
  END IF;
  IF to_regclass('public.partner_milestone_rules') IS NOT NULL THEN
    DELETE FROM public.partner_milestone_rules;
  END IF;
  IF to_regclass('public.partner_milestone_periods') IS NOT NULL THEN
    DELETE FROM public.partner_milestone_periods;
  END IF;
  IF to_regclass('public.referral_settings') IS NOT NULL THEN
    DELETE FROM public.referral_settings;
  END IF;
  IF to_regclass('public.platform_roles') IS NOT NULL THEN
    DELETE FROM public.platform_roles;
  END IF;
  IF to_regclass('public.app_settings') IS NOT NULL THEN
    DELETE FROM public.app_settings;
  END IF;
  IF to_regclass('public.app_legal_content') IS NOT NULL THEN
    DELETE FROM public.app_legal_content;
  END IF;
  IF to_regclass('public.content_categories') IS NOT NULL THEN
    DELETE FROM public.content_categories;
  END IF;
  IF to_regclass('public.staff_benefit_overrides') IS NOT NULL THEN
    DELETE FROM public.staff_benefit_overrides;
  END IF;
  IF to_regclass('public.admin_permission_overrides') IS NOT NULL THEN
    DELETE FROM public.admin_permission_overrides;
  END IF;

  -- ── 2. Catalogue (events, spots, outils, hero…) ───────────────────────────
  IF to_regclass('public.event_speakers') IS NOT NULL THEN DELETE FROM public.event_speakers; END IF;
  IF to_regclass('public.event_schedules') IS NOT NULL THEN DELETE FROM public.event_schedules; END IF;
  IF to_regclass('public.events') IS NOT NULL THEN DELETE FROM public.events; END IF;

  IF to_regclass('public.establishment_photos') IS NOT NULL THEN DELETE FROM public.establishment_photos; END IF;
  IF to_regclass('public.establishment_schedules') IS NOT NULL THEN DELETE FROM public.establishment_schedules; END IF;
  IF to_regclass('public.establishments') IS NOT NULL THEN DELETE FROM public.establishments; END IF;

  IF to_regclass('public.hero_banners') IS NOT NULL THEN DELETE FROM public.hero_banners; END IF;
  IF to_regclass('public.partner_milestone_rewards') IS NOT NULL THEN DELETE FROM public.partner_milestone_rewards; END IF;

  -- Ancienne table quartiers (Conakry seed Phase 2) — remplacée par guinea_locations
  IF to_regclass('public.locations') IS NOT NULL THEN
    DELETE FROM public.locations;
  END IF;

  -- partner_staff : vide (recréé à la 1ère publication via ensure_partner_staff)
  IF to_regclass('public.partner_staff') IS NOT NULL THEN
    DELETE FROM public.partner_staff;
  END IF;

  -- ── 3. Comptes ───────────────────────────────────────────────────────────
  DELETE FROM public.users WHERE id <> ALL (v_admin_ids);
  DELETE FROM auth.users WHERE id <> ALL (v_admin_ids);

  RAISE NOTICE 'Purge terminée — admin seul, guinea_locations intacte, reste vide.';
END $$;

-- Vérifications sandbox prod vide
SELECT 'auth.users' AS table_name, count(*) AS rows FROM auth.users
UNION ALL SELECT 'public.users', count(*) FROM public.users
UNION ALL SELECT 'events', count(*) FROM public.events
UNION ALL SELECT 'establishments', count(*) FROM public.establishments
UNION ALL SELECT 'locations (legacy vide)', count(*) FROM public.locations
UNION ALL SELECT 'guinea_locations (conservée)',
  CASE WHEN to_regclass('public.guinea_locations') IS NULL THEN 0::bigint
       ELSE (SELECT count(*) FROM public.guinea_locations)
  END
UNION ALL SELECT 'benefit_catalog', count(*) FROM public.benefit_catalog
UNION ALL SELECT 'partner_tokens', count(*) FROM public.partner_tokens
UNION ALL SELECT 'partner_staff', count(*) FROM public.partner_staff
UNION ALL SELECT 'spot_star_settings', count(*) FROM public.spot_star_settings
UNION ALL SELECT 'spot_star_tiers', count(*) FROM public.spot_star_tiers
UNION ALL SELECT 'spot_star_calc_runs', count(*) FROM public.spot_star_calc_runs
UNION ALL SELECT 'referral_settings', count(*) FROM public.referral_settings
UNION ALL SELECT 'partner_milestone_rules', count(*) FROM public.partner_milestone_rules
UNION ALL SELECT 'app_settings', count(*) FROM public.app_settings
UNION ALL SELECT 'app_legal_content', count(*) FROM public.app_legal_content
UNION ALL SELECT 'content_categories', count(*) FROM public.content_categories
UNION ALL SELECT 'staff_benefit_overrides', count(*) FROM public.staff_benefit_overrides
UNION ALL SELECT 'admin_permission_overrides', count(*) FROM public.admin_permission_overrides;

SELECT id, email, user_role FROM public.users;
