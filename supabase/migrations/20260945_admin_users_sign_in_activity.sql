-- Admin : last_sign_in_at Auth pour la liste Users (évite N appels Render + échecs silencieux).

CREATE OR REPLACE FUNCTION public.admin_users_sign_in_activity(p_user_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  out JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  IF p_user_ids IS NULL OR cardinality(p_user_ids) = 0 THEN
    RETURN '{}'::JSONB;
  END IF;

  SELECT COALESCE(
    jsonb_object_agg(
      u.id::TEXT,
      jsonb_build_object('lastSignInAt', u.last_sign_in_at)
    ),
    '{}'::JSONB
  )
  INTO out
  FROM auth.users u
  WHERE u.id = ANY(p_user_ids[1:LEAST(cardinality(p_user_ids), 50)]);

  RETURN COALESCE(out, '{}'::JSONB);
END;
$$;

COMMENT ON FUNCTION public.admin_users_sign_in_activity(UUID[]) IS
  'Map user id → last_sign_in_at (Auth). Réservé admin (is_admin).';

GRANT EXECUTE ON FUNCTION public.admin_users_sign_in_activity(UUID[]) TO authenticated;
