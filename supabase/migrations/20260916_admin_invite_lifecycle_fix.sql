-- Invitations admin : statut invited, suppression sans partner_id, annulation + renvoi e-mail.

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_account_status_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_account_status_check
  CHECK (account_status IN ('active', 'suspended', 'archived', 'deleted', 'invited'));

COMMENT ON COLUMN public.users.account_status IS
  'active | suspended | archived | deleted | invited — invited = compte Auth créé, activation en attente.';

-- Comptage contenu lié (sans colonnes partner_id absentes en prod).
CREATE OR REPLACE FUNCTION public._admin_user_linked_content_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((
      SELECT COUNT(*)::INTEGER FROM public.events
      WHERE organizer_id = p_user_id OR master_id = p_user_id
    ), 0)
    + COALESCE((
      SELECT COUNT(*)::INTEGER FROM public.establishments
      WHERE master_id = p_user_id
    ), 0)
    + COALESCE((
      SELECT COUNT(*)::INTEGER FROM public.tools
      WHERE master_id = p_user_id
    ), 0)
    + COALESCE((
      SELECT COUNT(*)::INTEGER FROM public.partner_event_submissions
      WHERE (partner_user_id = p_user_id OR master_user_id = p_user_id)
        AND (
          status IN ('pending', 'draft', 'rejected')
          OR (status = 'approved' AND published_event_id IS NOT NULL)
        )
    ), 0)
    + COALESCE((
      SELECT COUNT(*)::INTEGER FROM public.partner_spot_submissions
      WHERE partner_user_id = p_user_id
        AND (
          status IN ('pending', 'draft', 'rejected')
          OR (status = 'approved' AND (published_establishment_id IS NOT NULL OR published_tool_id IS NOT NULL))
        )
    ), 0);
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_user_if_orphan(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_links INTEGER := 0;
  v_status TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT u.account_status INTO v_status
  FROM public.users u
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_status = 'invited' THEN
    RETURN public.admin_cancel_pending_invite(p_user_id);
  END IF;

  v_links := public._admin_user_linked_content_count(p_user_id);

  IF v_links > 0 THEN
    RAISE EXCEPTION 'LINKED_CONTENT';
  END IF;

  UPDATE public.users
  SET
    account_status = 'deleted',
    is_active = FALSE,
    email = CONCAT('deleted+', p_user_id::TEXT, '@theloop.invalid'),
    phone_number = NULL,
    updated_at = NOW()
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cancel_pending_invite(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT;
  v_role TEXT;
  v_status TEXT;
  v_links INTEGER := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT lower(trim(u.email)), u.user_role, u.account_status
  INTO v_email, v_role, v_status
  FROM public.users u
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_role IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'FORBIDDEN_ADMIN';
  END IF;

  IF v_status <> 'invited' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.admin_user_invites i
      WHERE lower(trim(i.email)) = v_email
        AND i.activated_at IS NULL
    ) THEN
      RAISE EXCEPTION 'NOT_PENDING_INVITE';
    END IF;
  END IF;

  v_links := public._admin_user_linked_content_count(p_user_id);
  IF v_links > 0 THEN
    RAISE EXCEPTION 'LINKED_CONTENT';
  END IF;

  DELETE FROM public.admin_user_invites i
  WHERE lower(trim(i.email)) = v_email
    AND i.activated_at IS NULL;

  DELETE FROM public.user_notifications n
  WHERE n.user_id = p_user_id;

  DELETE FROM public.users u
  WHERE u.id = p_user_id;

  DELETE FROM auth.users au
  WHERE au.id = p_user_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_name TEXT := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'first_name'), ''), 'Membre');
  v_last_name TEXT := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'last_name'), ''), 'THE LOOP');
  v_phone TEXT := NULLIF(trim(NEW.raw_user_meta_data->>'phone_number'), '');
  v_user_role TEXT := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'user_role'), ''), 'member');
  v_qr_token TEXT := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'qr_code_token'), ''),
    'LOOP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
  );
  v_email TEXT := COALESCE(NULLIF(trim(NEW.email), ''), '');
  v_admin_invite BOOLEAN := COALESCE(
    (NEW.raw_user_meta_data->>'invited_by_admin')::BOOLEAN,
    FALSE
  ) OR lower(COALESCE(NEW.raw_user_meta_data->>'invited_by_admin', '')) = 'true';
  v_country TEXT := NULLIF(upper(trim(COALESCE(NEW.raw_user_meta_data->>'country_code', ''))), '');
  v_city TEXT := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'city', '')), '');
BEGIN
  INSERT INTO public.users (
    id, email, password_hash, phone_number,
    first_name, last_name, user_role, qr_code_token,
    is_active, account_status, country_code, city
  )
  VALUES (
    NEW.id,
    v_email,
    'managed_by_supabase_auth',
    v_phone,
    v_first_name,
    v_last_name,
    v_user_role,
    v_qr_token,
    NOT v_admin_invite,
    CASE WHEN v_admin_invite THEN 'invited' ELSE 'active' END,
    v_country,
    v_city
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    phone_number = EXCLUDED.phone_number,
    user_role = COALESCE(NULLIF(EXCLUDED.user_role, ''), users.user_role),
    qr_code_token = COALESCE(NULLIF(EXCLUDED.qr_code_token, ''), users.qr_code_token),
    country_code = COALESCE(EXCLUDED.country_code, users.country_code),
    city = COALESCE(EXCLUDED.city, users.city),
    is_active = CASE
      WHEN users.account_status = 'invited' THEN FALSE
      WHEN users.is_active = FALSE THEN FALSE
      ELSE EXCLUDED.is_active
    END,
    account_status = CASE
      WHEN users.account_status IN ('suspended', 'archived', 'deleted') THEN users.account_status
      WHEN v_admin_invite AND users.account_status = 'invited' THEN 'invited'
      WHEN users.account_status = 'invited' THEN 'invited'
      ELSE COALESCE(users.account_status, 'active')
    END,
    updated_at = CURRENT_TIMESTAMP;

  RETURN NEW;
END;
$$;

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

-- Rétro-taguer les comptes créés par invite mais jamais activés.
UPDATE public.users u
SET
  account_status = 'invited',
  is_active = FALSE,
  updated_at = NOW()
FROM public.admin_user_invites i
WHERE lower(trim(u.email)) = lower(trim(i.email))
  AND i.activated_at IS NULL
  AND u.account_status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = u.id
      AND au.last_sign_in_at IS NOT NULL
  );

REVOKE ALL ON FUNCTION public._admin_user_linked_content_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_cancel_pending_invite(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_cancel_pending_invite(UUID) TO authenticated;
