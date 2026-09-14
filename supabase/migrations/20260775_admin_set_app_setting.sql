-- RPC admin pour écrire app_settings de façon fiable (community_ui, etc.)
-- Corrige le cas où l'upsert client échoue silencieusement sous RLS.

CREATE OR REPLACE FUNCTION public.admin_set_app_setting(
  p_key TEXT,
  p_value JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;

  IF p_key IS NULL OR length(trim(p_key)) = 0 THEN
    RAISE EXCEPTION 'Clé de réglage invalide';
  END IF;

  INSERT INTO public.app_settings (key, value, updated_at)
  VALUES (trim(p_key), COALESCE(p_value, '{}'::jsonb), NOW())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = NOW();

  RETURN COALESCE(p_value, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_app_setting(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_app_setting(TEXT, JSONB) TO authenticated;
