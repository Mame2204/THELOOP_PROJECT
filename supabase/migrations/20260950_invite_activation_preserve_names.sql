-- Activation invité : l'identité saisie dans l'app prime sur les placeholders Membre / THE LOOP.
-- ensure_user_profile ne doit pas écraser un vrai nom déjà en base à la connexion.

CREATE OR REPLACE FUNCTION public._is_placeholder_first_name(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(COALESCE(p_name, ''))) IN ('membre', 'partenaire', 'administrateur', '');
$$;

CREATE OR REPLACE FUNCTION public._is_placeholder_last_name(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(COALESCE(p_name, ''))) IN ('the loop', '');
$$;

CREATE OR REPLACE FUNCTION public._merge_profile_first_name(p_incoming TEXT, p_existing TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN NOT public._is_placeholder_first_name(p_incoming) THEN NULLIF(trim(p_incoming), '')
    WHEN public._is_placeholder_first_name(p_incoming)
      AND NOT public._is_placeholder_first_name(p_existing)
      THEN NULLIF(trim(p_existing), '')
    ELSE COALESCE(NULLIF(trim(p_incoming), ''), NULLIF(trim(p_existing), ''), 'Membre')
  END;
$$;

CREATE OR REPLACE FUNCTION public._merge_profile_last_name(p_incoming TEXT, p_existing TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN NOT public._is_placeholder_last_name(p_incoming) THEN NULLIF(trim(p_incoming), '')
    WHEN public._is_placeholder_last_name(p_incoming)
      AND NOT public._is_placeholder_last_name(p_existing)
      THEN NULLIF(trim(p_existing), '')
    ELSE COALESCE(NULLIF(trim(p_incoming), ''), NULLIF(trim(p_existing), ''), 'THE LOOP')
  END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_user_profile(
  p_first_name TEXT DEFAULT 'Membre',
  p_last_name TEXT DEFAULT 'THE LOOP',
  p_phone TEXT DEFAULT NULL,
  p_user_role TEXT DEFAULT 'member',
  p_qr_token TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_qr TEXT;
  v_phone TEXT := NULLIF(trim(p_phone), '');
  v_in_first TEXT := COALESCE(NULLIF(trim(p_first_name), ''), 'Membre');
  v_in_last TEXT := COALESCE(NULLIF(trim(p_last_name), ''), 'THE LOOP');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT COALESCE(NULLIF(trim(email), ''), '') INTO v_email
  FROM auth.users
  WHERE id = v_uid;

  v_qr := COALESCE(
    NULLIF(trim(p_qr_token), ''),
    'LOOP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
  );

  INSERT INTO public.users (
    id, email, password_hash, phone_number,
    first_name, last_name, user_role, qr_code_token, is_active
  )
  VALUES (
    v_uid,
    v_email,
    'managed_by_supabase_auth',
    v_phone,
    v_in_first,
    v_in_last,
    COALESCE(NULLIF(trim(p_user_role), ''), 'member'),
    v_qr,
    TRUE
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = public._merge_profile_first_name(v_in_first, users.first_name),
    last_name = public._merge_profile_last_name(v_in_last, users.last_name),
    phone_number = COALESCE(EXCLUDED.phone_number, users.phone_number),
    user_role = COALESCE(NULLIF(EXCLUDED.user_role, ''), users.user_role),
    qr_code_token = COALESCE(NULLIF(EXCLUDED.qr_code_token, ''), users.qr_code_token),
    is_active = CASE WHEN users.is_active = FALSE THEN FALSE ELSE TRUE END,
    updated_at = CURRENT_TIMESTAMP;
END;
$$;

-- Marquer invite activée : statut seulement (identité = Edge / app).
CREATE OR REPLACE FUNCTION public.mark_admin_user_invite_activated(
  p_invite_id UUID,
  p_email TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
  v_updated INT;
BEGIN
  IF p_invite_id IS NULL OR v_email IS NULL OR v_email = '' THEN
    RETURN FALSE;
  END IF;

  UPDATE public.admin_user_invites i
  SET activated_at = NOW()
  WHERE i.id = p_invite_id
    AND i.activated_at IS NULL
    AND lower(trim(i.email)) = v_email;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    UPDATE public.users u
    SET
      account_status = 'active',
      is_active = TRUE,
      updated_at = NOW()
    WHERE lower(trim(u.email)) = v_email
      AND u.account_status = 'invited';
  END IF;

  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public._is_placeholder_first_name(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._is_placeholder_last_name(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._merge_profile_first_name(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._merge_profile_last_name(TEXT, TEXT) FROM PUBLIC;
