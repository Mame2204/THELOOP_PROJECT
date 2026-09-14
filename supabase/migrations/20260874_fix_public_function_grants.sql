-- THE LOOP — Corrige les GRANT EXECUTE hérités via PUBLIC (anon voit encore les RPC admin)
-- Complète 20260873 : REVOKE FROM PUBLIC puis GRANT explicites par rôle.
-- Storage content-media : aucune policy SELECT (URLs publiques via bucket public, pas de listing API).

DO $$
DECLARE
  r RECORD;
  v_allow_anon TEXT[] := ARRAY[
    'check_signup_email_available',
    'assert_signup_email_allowed',
    'find_pending_admin_invite_by_email',
    'mark_admin_user_invite_activated',
    'apply_partner_benefit_validation',
    'list_partner_pending_validations',
    'list_member_pending_benefit_redemptions',
    'request_benefit_redemption',
    'verify_member_qr_payload',
    'verify_member_qr_partner',
    'find_partner_by_validation_code',
    'validate_partner_spot_token',
    'fetch_member_benefit_grants_public',
    'record_partner_member_attribution',
    'resolve_partner_token_user_id',
    'upsert_prime_benefit_grant'
  ];
  v_block_api TEXT[] := ARRAY[
    'handle_new_auth_user',
    'sync_published_event_links_from_submission',
    'trg_favorite_events_count',
    'trg_favorite_spots_count',
    'trg_favorite_tools_count',
    'trg_favorite_walks_count',
    'trg_partner_spot_set_origin'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname AS name
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.oid::regprocedure);

    IF r.name = ANY(v_block_api) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', r.oid::regprocedure);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.oid::regprocedure);
      CONTINUE;
    END IF;

    IF r.name = ANY(v_allow_anon) THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role',
        r.oid::regprocedure
      );
      CONTINUE;
    END IF;

    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.oid::regprocedure);
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role',
      r.oid::regprocedure
    );
  END LOOP;
END $$;

-- Bucket public : pas de SELECT sur storage.objects (évite listing ; getPublicUrl OK)
DROP POLICY IF EXISTS "Authenticated read content media object" ON storage.objects;
DROP POLICY IF EXISTS "Public read content media" ON storage.objects;
