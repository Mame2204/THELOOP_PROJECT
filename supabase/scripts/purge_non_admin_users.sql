-- =============================================================================
-- THE LOOP — Purge comptes (garder admin uniquement)
-- ⚠️  IRRÉVERSIBLE — faire une sauvegarde Supabase avant d'exécuter.
--
-- Conserve :
--   - Compte admin (admin@theloop.gn ou rôle admin/super_admin)
--   - Catalogue (events, establishments, contenu seed)
--   - Réglages globaux (app_settings, benefit_catalog, spot_star_settings…)
--
-- Supprime :
--   - Tous les autres utilisateurs (Auth + public.users)
--   - Données liées : favoris, avantages, notifications, parrainage, soumissions…
--   - Invitations en attente, demandes partenariat, suggestions communauté
--
-- ⚠️  Utilisez plutôt purge_non_admin_users_v2.sql (corrige Auth + orphelins)
-- Puis vérifier : Authentication → Users (1 seul compte admin)
-- =============================================================================

DO $$
DECLARE
  v_keep_emails TEXT[] := ARRAY['admin@theloop.gn'];
  v_admin_ids UUID[];
  v_deleted_auth INTEGER;
BEGIN
  SELECT COALESCE(array_agg(u.id), ARRAY[]::UUID[])
  INTO v_admin_ids
  FROM public.users u
  WHERE lower(u.email) = ANY (SELECT lower(e) FROM unnest(v_keep_emails) AS e)
     OR u.user_role IN ('admin', 'super_admin');

  IF array_length(v_admin_ids, 1) IS NULL OR array_length(v_admin_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Aucun compte admin trouvé (%). Abandon.', array_to_string(v_keep_emails, ', ');
  END IF;

  RAISE NOTICE 'Comptes admin conservés : %', array_length(v_admin_ids, 1);

  -- ── Données transactionnelles / utilisateurs ─────────────────────────────

  IF to_regclass('public.favorite_events') IS NOT NULL THEN
    DELETE FROM public.favorite_events WHERE user_id <> ALL (v_admin_ids);
  END IF;
  IF to_regclass('public.favorite_spots') IS NOT NULL THEN
    DELETE FROM public.favorite_spots WHERE user_id <> ALL (v_admin_ids);
  END IF;
  IF to_regclass('public.user_favorite_events') IS NOT NULL THEN
    DELETE FROM public.user_favorite_events WHERE user_id <> ALL (v_admin_ids);
  END IF;
  IF to_regclass('public.user_favorite_locations') IS NOT NULL THEN
    DELETE FROM public.user_favorite_locations WHERE user_id <> ALL (v_admin_ids);
  END IF;

  IF to_regclass('public.user_notifications') IS NOT NULL THEN
    DELETE FROM public.user_notifications WHERE user_id <> ALL (v_admin_ids);
  END IF;

  IF to_regclass('public.referrals') IS NOT NULL THEN
    DELETE FROM public.referrals
    WHERE referrer_user_id <> ALL (v_admin_ids)
       OR referred_user_id <> ALL (v_admin_ids);
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
    DELETE FROM public.community_suggestions
    WHERE user_id IS NULL OR user_id <> ALL (v_admin_ids);
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

  -- ── Remise à zéro des flux de test ─────────────────────────────────────────

  IF to_regclass('public.admin_user_invites') IS NOT NULL THEN
    DELETE FROM public.admin_user_invites;
  END IF;
  IF to_regclass('public.scheduled_benefit_grants') IS NOT NULL THEN
    DELETE FROM public.scheduled_benefit_grants;
  END IF;
  IF to_regclass('public.admin_benefit_draws') IS NOT NULL THEN
    DELETE FROM public.admin_benefit_draws;
  END IF;
  IF to_regclass('public.admin_push_campaigns') IS NOT NULL THEN
    DELETE FROM public.admin_push_campaigns;
  END IF;

  IF to_regclass('public.partnership_notes') IS NOT NULL THEN
    DELETE FROM public.partnership_notes;
  END IF;
  IF to_regclass('public.partnership_requests') IS NOT NULL THEN
    DELETE FROM public.partnership_requests;
  END IF;

  -- ── Détacher les références optionnelles sur le contenu ───────────────────

  IF to_regclass('public.events') IS NOT NULL THEN
    UPDATE public.events
    SET master_id = NULL
    WHERE master_id IS NOT NULL AND master_id <> ALL (v_admin_ids);
  END IF;
  IF to_regclass('public.establishments') IS NOT NULL THEN
    UPDATE public.establishments
    SET admin_star_override_by = NULL
    WHERE admin_star_override_by IS NOT NULL AND admin_star_override_by <> ALL (v_admin_ids);
  END IF;

  -- ── Suppression Auth (cascade → public.users + FK en cascade) ─────────────

  DELETE FROM auth.users
  WHERE id <> ALL (v_admin_ids);

  GET DIAGNOSTICS v_deleted_auth = ROW_COUNT;
  RAISE NOTICE 'Comptes Auth supprimés : %', v_deleted_auth;
  RAISE NOTICE 'Purge terminée. Vérifiez Authentication → Users dans le dashboard.';
END $$;

-- Vérification rapide
SELECT id, email, user_role, phone_number, created_at
FROM public.users
ORDER BY created_at;
