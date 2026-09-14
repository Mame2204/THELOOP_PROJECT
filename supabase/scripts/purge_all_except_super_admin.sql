-- =============================================================================
-- THE LOOP — Purge TOTALE sandbox (super_admin seul + référentiel Guinée)
-- Dernière alignement : août 2026
--
-- CONSERVE INTACT :
--   • guinea_locations     (4549 quartiers)
--   • public.users         (super_admin uniquement après purge)
--   • auth.users           (même compte)
--   • app_settings, app_legal_content, content_categories, platform_roles
--   • referral_settings, spot_star_settings, spot_star_tiers
--   • partner_milestone_rules, admin_automation_jobs
--
-- VIDE (TRUNCATE CASCADE) : tout le reste public.* (~50 tables opérationnelles)
--   catalogue, favoris, notifications, campagnes, octrois, PASS, partenaires…
--   + locations (resync après seed)
--
-- TABLES LEGACY Production V1.0 (vidées aussi, candidates DROP séparé) :
--   notifications_campaigns, advantages_catalog, payment_products, admin_users…
--   → voir migration 20260856_drop_legacy_v1_tables.sql (quand prêt)
--
-- Après purge :
--   • seed_platform_defaults.sql  (recommandé — reset paramètres canoniques)
--   • vider cache AsyncStorage mobile
-- =============================================================================

DO $$
DECLARE
  v_super_ids UUID[];
  v_super_id_texts TEXT[];
  v_preserve_tables TEXT[] := ARRAY[
    'guinea_locations',
    'app_settings',
    'app_legal_content',
    'content_categories',
    'platform_roles',
    'referral_settings',
    'spot_star_settings',
    'spot_star_tiers',
    'partner_milestone_rules',
    'admin_automation_jobs'
  ];
  v_row RECORD;
  v_truncated INTEGER := 0;
BEGIN
  -- ── 0. Résoudre le(s) super_admin à conserver ─────────────────────────────
  SELECT COALESCE(array_agg(DISTINCT u.id), ARRAY[]::UUID[])
  INTO v_super_ids
  FROM public.users u
  WHERE u.user_role = 'super_admin';

  IF array_length(v_super_ids, 1) IS NULL OR array_length(v_super_ids, 1) = 0 THEN
    RAISE EXCEPTION E'Aucun super_admin trouvé dans public.users.\n'
      'Exécutez d''abord : supabase/scripts/promote_super_admin.sql\n'
      '(adapter l''e-mail), puis relancez ce script.';
  END IF;

  v_super_id_texts := ARRAY(SELECT s::text FROM unnest(v_super_ids) AS s);

  RAISE NOTICE 'Super admin conservé(s) : % compte(s)', array_length(v_super_ids, 1);
  RAISE NOTICE 'IDs : %', v_super_ids;

  -- ── 1. Détacher les FK optionnelles vers des users supprimés ───────────────
  IF to_regclass('public.events') IS NOT NULL THEN
    UPDATE public.events
    SET master_id = NULL
    WHERE master_id IS NOT NULL AND master_id <> ALL (v_super_ids);
    UPDATE public.events
    SET organizer_id = v_super_ids[1]
    WHERE organizer_id IS NOT NULL AND organizer_id <> ALL (v_super_ids);
  END IF;

  IF to_regclass('public.tools') IS NOT NULL THEN
    UPDATE public.tools
    SET master_id = NULL
    WHERE master_id IS NOT NULL AND master_id <> ALL (v_super_ids);
  END IF;

  IF to_regclass('public.establishments') IS NOT NULL THEN
    UPDATE public.establishments
    SET admin_star_override_by = NULL
    WHERE admin_star_override_by IS NOT NULL AND admin_star_override_by <> ALL (v_super_ids);
  END IF;

  IF to_regclass('public.admin_benefit_draws') IS NOT NULL THEN
    UPDATE public.admin_benefit_draws SET drawn_by = NULL
    WHERE drawn_by IS NOT NULL AND drawn_by <> ALL (v_super_ids);
  END IF;

  IF to_regclass('public.partnership_notes') IS NOT NULL THEN
    UPDATE public.partnership_notes SET author_id = NULL
    WHERE author_id IS NOT NULL AND author_id <> ALL (v_super_ids);
  END IF;

  IF to_regclass('public.admin_push_campaigns') IS NOT NULL THEN
    UPDATE public.admin_push_campaigns SET created_by = NULL
    WHERE created_by IS NOT NULL AND created_by <> ALL (v_super_ids);
  END IF;

  IF to_regclass('public.admin_user_invites') IS NOT NULL THEN
    UPDATE public.admin_user_invites SET created_by = NULL
    WHERE created_by IS NOT NULL AND created_by <> ALL (v_super_ids);
  END IF;

  -- ── 2. TRUNCATE dynamique de toutes les tables public (sauf préservées) ───
  FOR v_row IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname <> ALL (v_preserve_tables)
      AND c.relname <> 'users'
    ORDER BY c.relname
  LOOP
    EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', v_row.tablename);
    v_truncated := v_truncated + 1;
    RAISE NOTICE 'Truncated public.%', v_row.tablename;
  END LOOP;

  RAISE NOTICE '% table(s) opérationnelles vidée(s) (paramètres + guinea_locations + users conservés).', v_truncated;

  -- ── 3. Comptes : garder super_admin uniquement ────────────────────────────
  DELETE FROM public.users WHERE id <> ALL (v_super_ids);

  IF to_regclass('auth.identities') IS NOT NULL THEN
    DELETE FROM auth.identities WHERE NOT (user_id = ANY (v_super_ids));
  END IF;
  IF to_regclass('auth.sessions') IS NOT NULL THEN
    DELETE FROM auth.sessions WHERE NOT (user_id = ANY (v_super_ids));
  END IF;
  IF to_regclass('auth.refresh_tokens') IS NOT NULL THEN
    -- auth.refresh_tokens.user_id est VARCHAR sur Supabase, pas UUID
    DELETE FROM auth.refresh_tokens
    WHERE user_id IS NULL OR NOT (user_id = ANY (v_super_id_texts));
  END IF;
  IF to_regclass('auth.mfa_factors') IS NOT NULL THEN
    DELETE FROM auth.mfa_factors WHERE NOT (user_id = ANY (v_super_ids));
  END IF;
  IF to_regclass('auth.mfa_challenges') IS NOT NULL THEN
    DELETE FROM auth.mfa_challenges
    WHERE factor_id IN (
      SELECT id FROM auth.mfa_factors WHERE NOT (user_id = ANY (v_super_ids))
    );
  END IF;
  IF to_regclass('auth.one_time_tokens') IS NOT NULL THEN
    DELETE FROM auth.one_time_tokens WHERE NOT (user_id = ANY (v_super_ids));
  END IF;

  DELETE FROM auth.users WHERE NOT (id = ANY (v_super_ids));

  -- Garantir le rôle super_admin actif
  UPDATE public.users
  SET user_role = 'super_admin', is_active = TRUE, updated_at = NOW()
  WHERE id = ANY (v_super_ids);

  RAISE NOTICE 'Purge terminée. Exécutez seed_platform_defaults.sql pour réinitialiser les paramètres.';
END $$;

-- ── Vérifications ────────────────────────────────────────────────────────────
SELECT 'auth.users' AS table_name, count(*) AS rows FROM auth.users
UNION ALL SELECT 'public.users', count(*) FROM public.users
UNION ALL SELECT 'guinea_locations (conservée)',
  CASE WHEN to_regclass('public.guinea_locations') IS NULL THEN 0::bigint
       ELSE (SELECT count(*) FROM public.guinea_locations)
  END
UNION ALL SELECT 'events', COALESCE((SELECT count(*) FROM public.events), 0)
UNION ALL SELECT 'establishments', COALESCE((SELECT count(*) FROM public.establishments), 0)
UNION ALL SELECT 'tools', COALESCE((SELECT count(*) FROM public.tools), 0)
UNION ALL SELECT 'partner_event_submissions',
  COALESCE((SELECT count(*) FROM public.partner_event_submissions), 0)
UNION ALL SELECT 'partner_spot_submissions',
  COALESCE((SELECT count(*) FROM public.partner_spot_submissions), 0)
UNION ALL SELECT 'benefit_catalog', COALESCE((SELECT count(*) FROM public.benefit_catalog), 0)
UNION ALL SELECT 'prime_benefit_grants', COALESCE((SELECT count(*) FROM public.prime_benefit_grants), 0)
UNION ALL SELECT 'user_pass_grants', COALESCE((SELECT count(*) FROM public.user_pass_grants), 0)
UNION ALL SELECT 'payment_intents', COALESCE((SELECT count(*) FROM public.payment_intents), 0)
UNION ALL SELECT 'loop_walks', COALESCE((SELECT count(*) FROM public.loop_walks), 0)
UNION ALL SELECT 'home_polls', COALESCE((SELECT count(*) FROM public.home_polls), 0)
UNION ALL SELECT 'partner_tokens', COALESCE((SELECT count(*) FROM public.partner_tokens), 0)
UNION ALL SELECT 'content_categories', COALESCE((SELECT count(*) FROM public.content_categories), 0)
UNION ALL SELECT 'app_settings', COALESCE((SELECT count(*) FROM public.app_settings), 0)
UNION ALL SELECT 'user_notifications', COALESCE((SELECT count(*) FROM public.user_notifications), 0)
UNION ALL SELECT 'admin_benefit_draws', COALESCE((SELECT count(*) FROM public.admin_benefit_draws), 0)
UNION ALL SELECT 'benefit_redemptions', COALESCE((SELECT count(*) FROM public.benefit_redemptions), 0)
UNION ALL SELECT 'scheduled_benefit_grants', COALESCE((SELECT count(*) FROM public.scheduled_benefit_grants), 0)
UNION ALL SELECT 'referrals', COALESCE((SELECT count(*) FROM public.referrals), 0);

SELECT id, email, user_role, is_active FROM public.users ORDER BY email;
