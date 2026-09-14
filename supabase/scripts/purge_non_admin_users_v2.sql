-- =============================================================================
-- THE LOOP — Purge v2 : garder admin uniquement (Auth + public.users)
-- Exécuter APRÈS diagnose_supabase_state.sql
--
-- ⚠️  Modifiez l'e-mail admin ci-dessous si différent de admin@theloop.gn
-- =============================================================================

DO $$
DECLARE
  v_keep_emails TEXT[] := ARRAY['admin@theloop.gn'];
  v_admin_ids UUID[];
  v_auth_count INTEGER;
  v_public_count INTEGER;
  v_deleted_public INTEGER;
  v_deleted_auth INTEGER;
BEGIN
  -- Admin : Auth d'abord, puis public.users (rôle admin)
  SELECT COALESCE(array_agg(DISTINCT x.id), ARRAY[]::UUID[])
  INTO v_admin_ids
  FROM (
    SELECT au.id
    FROM auth.users au
    WHERE lower(COALESCE(au.email, '')) = ANY (
      SELECT lower(e) FROM unnest(v_keep_emails) AS e
    )
    UNION
    SELECT u.id
    FROM public.users u
    WHERE lower(COALESCE(u.email, '')) = ANY (
      SELECT lower(e) FROM unnest(v_keep_emails) AS e
    )
       OR u.user_role IN ('admin', 'super_admin')
  ) AS x;

  SELECT count(*) INTO v_auth_count FROM auth.users;
  SELECT count(*) INTO v_public_count FROM public.users;

  RAISE NOTICE '── Avant purge ──';
  RAISE NOTICE 'Auth users : % | public.users : %', v_auth_count, v_public_count;

  IF array_length(v_admin_ids, 1) IS NULL OR array_length(v_admin_ids, 1) = 0 THEN
    RAISE EXCEPTION E'Aucun admin trouvé pour %.\nVérifiez auth.users et modifiez v_keep_emails dans le script.',
      array_to_string(v_keep_emails, ', ');
  END IF;

  RAISE NOTICE 'Admin conservé(s) : % id(s)', array_length(v_admin_ids, 1);

  -- ── Détacher le catalogue des users supprimés (FK events / establishments) ───
  IF to_regclass('public.events') IS NOT NULL THEN
    UPDATE public.events
    SET master_id = NULL
    WHERE master_id IS NOT NULL AND master_id <> ALL (v_admin_ids);

    UPDATE public.events
    SET organizer_id = v_admin_ids[1]
    WHERE organizer_id IS NOT NULL AND organizer_id <> ALL (v_admin_ids);
  END IF;

  IF to_regclass('public.establishments') IS NOT NULL THEN
    UPDATE public.establishments
    SET admin_star_override_by = NULL
    WHERE admin_star_override_by IS NOT NULL AND admin_star_override_by <> ALL (v_admin_ids);
  END IF;

  IF to_regclass('public.partner_staff') IS NOT NULL THEN
    INSERT INTO public.partner_staff (user_id, staff_role)
    SELECT v_admin_ids[1], 'master'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.partner_staff ps WHERE ps.user_id = v_admin_ids[1]
    );

    UPDATE public.establishments e
    SET master_id = (
      SELECT ps.id FROM public.partner_staff ps
      WHERE ps.user_id = v_admin_ids[1] LIMIT 1
    )
    WHERE e.master_id IN (
      SELECT ps.id FROM public.partner_staff ps
      WHERE ps.user_id <> ALL (v_admin_ids)
    );

    DELETE FROM public.partner_staff WHERE user_id <> ALL (v_admin_ids);
  END IF;

  IF to_regclass('public.admin_benefit_draws') IS NOT NULL THEN
    UPDATE public.admin_benefit_draws SET drawn_by = NULL
    WHERE drawn_by IS NOT NULL AND drawn_by <> ALL (v_admin_ids);
  END IF;

  IF to_regclass('public.partnership_notes') IS NOT NULL THEN
    UPDATE public.partnership_notes SET author_id = NULL
    WHERE author_id IS NOT NULL AND author_id <> ALL (v_admin_ids);
  END IF;

  IF to_regclass('public.admin_push_campaigns') IS NOT NULL THEN
    UPDATE public.admin_push_campaigns SET created_by = NULL
    WHERE created_by IS NOT NULL AND created_by <> ALL (v_admin_ids);
  END IF;

  IF to_regclass('public.admin_user_invites') IS NOT NULL THEN
    UPDATE public.admin_user_invites SET created_by = NULL
    WHERE created_by IS NOT NULL AND created_by <> ALL (v_admin_ids);
  END IF;

  -- ── Données transactionnelles / utilisateurs ─────────────────────────────
  IF to_regclass('public.favorite_events') IS NOT NULL THEN
    DELETE FROM public.favorite_events WHERE user_id <> ALL (v_admin_ids);
  END IF;
  IF to_regclass('public.favorite_spots') IS NOT NULL THEN
    DELETE FROM public.favorite_spots WHERE user_id <> ALL (v_admin_ids);
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
    DELETE FROM public.prime_benefit_grants WHERE user_id <> ALL (v_admin_ids);
  END IF;
  IF to_regclass('public.benefit_redemptions') IS NOT NULL THEN
    DELETE FROM public.benefit_redemptions WHERE user_id <> ALL (v_admin_ids);
  END IF;
  IF to_regclass('public.partner_member_attributions') IS NOT NULL THEN
    DELETE FROM public.partner_member_attributions WHERE user_id <> ALL (v_admin_ids);
  END IF;
  IF to_regclass('public.community_suggestions') IS NOT NULL THEN
    DELETE FROM public.community_suggestions WHERE user_id IS NULL OR user_id <> ALL (v_admin_ids);
  END IF;
  IF to_regclass('public.partner_event_submissions') IS NOT NULL THEN
    DELETE FROM public.partner_event_submissions
    WHERE partner_user_id IS NULL OR partner_user_id <> ALL (v_admin_ids);
  END IF;
  IF to_regclass('public.partner_spot_submissions') IS NOT NULL THEN
    DELETE FROM public.partner_spot_submissions
    WHERE partner_user_id IS NULL OR partner_user_id <> ALL (v_admin_ids);
  END IF;
  IF to_regclass('public.partner_validation_codes') IS NOT NULL THEN
    DELETE FROM public.partner_validation_codes
    WHERE user_id IS NULL OR user_id <> ALL (v_admin_ids);
  END IF;
  IF to_regclass('public.admin_user_invites') IS NOT NULL THEN DELETE FROM public.admin_user_invites; END IF;
  IF to_regclass('public.scheduled_benefit_grants') IS NOT NULL THEN DELETE FROM public.scheduled_benefit_grants; END IF;
  IF to_regclass('public.admin_benefit_draws') IS NOT NULL THEN DELETE FROM public.admin_benefit_draws; END IF;
  IF to_regclass('public.admin_push_campaigns') IS NOT NULL THEN DELETE FROM public.admin_push_campaigns; END IF;
  IF to_regclass('public.partnership_notes') IS NOT NULL THEN DELETE FROM public.partnership_notes; END IF;
  IF to_regclass('public.partnership_requests') IS NOT NULL THEN DELETE FROM public.partnership_requests; END IF;

  -- public.users (y compris orphelins sans Auth)
  DELETE FROM public.users WHERE id <> ALL (v_admin_ids);
  GET DIAGNOSTICS v_deleted_public = ROW_COUNT;

  -- Auth (connexion Expo)
  DELETE FROM auth.users WHERE id <> ALL (v_admin_ids);
  GET DIAGNOSTICS v_deleted_auth = ROW_COUNT;

  RAISE NOTICE '── Après purge ──';
  RAISE NOTICE 'public.users supprimés : % | auth.users supprimés : %', v_deleted_public, v_deleted_auth;
  RAISE NOTICE 'Vérifiez Authentication → Users (1 seul compte).';
END $$;

SELECT 'auth.users' AS source, count(*) AS total FROM auth.users
UNION ALL
SELECT 'public.users', count(*) FROM public.users;

SELECT id, email, user_role, phone_number FROM public.users ORDER BY email;
