-- THE LOOP — Suppression orphelin : effacer toute l'identité (pas seulement l'e-mail).
-- Cas typique : membre « Fermer mon compte » → admin mobile « Supprimer » (sans contenu lié).
-- Avant : auth.users supprimé + e-mail factice, prénom/nom/DOB/ville pouvaient rester.
-- Après : _anonymize_user_data puis retrait auth.users + account_status = deleted.

CREATE OR REPLACE FUNCTION public.admin_delete_user_if_orphan(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_links INTEGER := 0;
  v_status TEXT;
  v_role TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT u.account_status, u.user_role INTO v_status, v_role
  FROM public.users u
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN_SELF';
  END IF;

  IF v_status = 'invited' THEN
    RETURN public.admin_cancel_pending_invite(p_user_id);
  END IF;

  IF v_role IN ('admin', 'super_admin') AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN_ADMIN';
  END IF;

  v_links := public._admin_user_linked_content_count(p_user_id);

  IF v_links > 0 THEN
    RAISE EXCEPTION 'LINKED_CONTENT';
  END IF;

  PERFORM public._anonymize_user_data(p_user_id);

  DELETE FROM auth.users au
  WHERE au.id = p_user_id;

  UPDATE public.users
  SET account_status = 'deleted',
      updated_at = NOW()
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user_if_orphan(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_user_if_orphan(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_if_orphan(UUID) TO authenticated;

COMMENT ON FUNCTION public.admin_delete_user_if_orphan IS
  'Supprime auth.users et efface identité (RPC _anonymize_user_data) si aucun contenu partenaire lié.';
