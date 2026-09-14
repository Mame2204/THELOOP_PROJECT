-- THE LOOP — Sync e-mail Auth ↔ public.users
-- =============================================================================
-- Erreur 42501 « permission denied for schema public » ?
--   → Vous n'êtes pas connecté en superutilisateur (postgres).
--   → Solution recommandée : utiliser le serveur THE LOOP (service role)
--     POST /api/admin/sync-user-email — déjà branché dans l'app admin mobile
--     si EXPO_PUBLIC_PAYMENT_API_URL pointe vers server/ (port 8787).
--
-- Sinon : Supabase Dashboard → SQL Editor → exécuter BLOC PAR BLOC (pas tout d'un coup).
-- =============================================================================

-- ── BLOC 0 — Diagnostic (optionnel) ─────────────────────────────────────────
SELECT
  current_user AS role_actuel,
  has_schema_privilege(current_user, 'public', 'USAGE') AS public_usage,
  has_schema_privilege(current_user, 'public', 'CREATE') AS public_create;

-- Si public_usage = false → ne pas continuer ici. Utilisez le serveur ou contactez Supabase.

-- ── BLOC 1 — Droits schéma public (superutilisateur requis) ─────────────────
GRANT USAGE ON SCHEMA public TO postgres, supabase_admin, service_role, authenticator;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;

-- ── BLOC 2 — Fonction RPC (copie de la migration 20260842) ──────────────────
CREATE OR REPLACE FUNCTION public.admin_sync_auth_user_email(
  p_user_id UUID,
  p_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
  v_conflict UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;

  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'email_required';
  END IF;

  IF length(v_email) > 254 OR v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' THEN
    RAISE EXCEPTION 'email_invalid';
  END IF;

  IF v_email ~ '^[0-9]+@theloop\.gn$' THEN
    RAISE EXCEPTION 'synthetic_email_blocked';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  SELECT au.id INTO v_conflict
  FROM auth.users au
  WHERE lower(trim(au.email)) = v_email
    AND au.id <> p_user_id
  LIMIT 1;

  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'email_already_used';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_user_id) THEN
    RAISE EXCEPTION 'auth_user_not_found';
  END IF;

  UPDATE auth.users
  SET
    email = v_email,
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
  WHERE id = p_user_id;

  IF to_regclass('auth.identities') IS NOT NULL THEN
    UPDATE auth.identities
    SET
      identity_data = jsonb_set(
        jsonb_set(COALESCE(identity_data, '{}'::jsonb), '{email}', to_jsonb(v_email), true),
        '{email_verified}',
        'true'::jsonb,
        true
      ),
      provider_id = v_email,
      updated_at = NOW()
    WHERE user_id = p_user_id
      AND provider = 'email';
  END IF;

  UPDATE public.users
  SET email = v_email, updated_at = CURRENT_TIMESTAMP
  WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'user_id', p_user_id, 'email', v_email);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_sync_auth_user_email(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_sync_auth_user_email(UUID, TEXT) TO authenticated, service_role;

-- ── BLOC 3 — Rattrapage comptes déjà désynchronisés (superutilisateur) ──────
UPDATE auth.users au
SET
  email = lower(trim(pu.email)),
  email_confirmed_at = COALESCE(au.email_confirmed_at, NOW()),
  updated_at = NOW()
FROM public.users pu
WHERE au.id = pu.id
  AND pu.email IS NOT NULL
  AND trim(pu.email) <> ''
  AND lower(trim(pu.email)) <> lower(trim(au.email))
  AND pu.email !~* '^[0-9]+@theloop\.gn$'
  AND NOT EXISTS (
    SELECT 1
    FROM auth.users other
    WHERE lower(trim(other.email)) = lower(trim(pu.email))
      AND other.id <> au.id
  );

UPDATE auth.identities i
SET
  identity_data = jsonb_set(
    jsonb_set(
      COALESCE(i.identity_data, '{}'::jsonb),
      '{email}',
      to_jsonb(lower(trim(pu.email))),
      true
    ),
    '{email_verified}',
    'true'::jsonb,
    true
  ),
  provider_id = lower(trim(pu.email)),
  updated_at = NOW()
FROM public.users pu
JOIN auth.users au ON au.id = pu.id
WHERE i.user_id = pu.id
  AND i.provider = 'email'
  AND pu.email IS NOT NULL
  AND trim(pu.email) <> ''
  AND pu.email !~* '^[0-9]+@theloop\.gn$'
  AND lower(trim(au.email)) = lower(trim(pu.email))
  AND lower(trim(COALESCE(i.provider_id, ''))) <> lower(trim(pu.email));
