-- Suppression « orphelin » : retirer aussi auth.users (sinon ré-invite même e-mail = compte déjà existant).

CREATE OR REPLACE FUNCTION public.admin_delete_user_if_orphan(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
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

  DELETE FROM auth.users au
  WHERE au.id = p_user_id;

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

-- Activation via lien web (mot de passe seul) : reprendre prénom/nom saisis à l'invitation si présents.
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
  v_invite_first TEXT;
  v_invite_last TEXT;
  v_role TEXT;
BEGIN
  IF p_invite_id IS NULL OR v_email IS NULL OR v_email = '' THEN
    RETURN FALSE;
  END IF;

  SELECT NULLIF(trim(i.first_name), ''), NULLIF(trim(i.last_name), ''), i.user_role
  INTO v_invite_first, v_invite_last, v_role
  FROM public.admin_user_invites i
  WHERE i.id = p_invite_id
    AND lower(trim(i.email)) = v_email
  LIMIT 1;

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
      first_name = COALESCE(
        v_invite_first,
        CASE
          WHEN lower(trim(u.first_name)) IN ('membre', 'partenaire', 'administrateur') OR NULLIF(trim(u.first_name), '') IS NULL
            THEN CASE lower(COALESCE(v_role, u.user_role, 'member'))
              WHEN 'partner' THEN 'Partenaire'
              WHEN 'admin' THEN 'Administrateur'
              ELSE 'Membre'
            END
          ELSE u.first_name
        END
      ),
      last_name = COALESCE(
        v_invite_last,
        CASE
          WHEN lower(trim(u.last_name)) IN ('the loop', '') OR u.last_name IS NULL THEN 'THE LOOP'
          ELSE u.last_name
        END
      ),
      updated_at = NOW()
    WHERE lower(trim(u.email)) = v_email
      AND u.account_status = 'invited';
  END IF;

  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user_if_orphan(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_if_orphan(UUID) TO authenticated;
