-- THE LOOP — RBAC admin : super_admin + permissions modulaires par admin

-- -----------------------------------------------------------------------------
-- 1. Overrides par admin (grant = ajout, revoke = retrait vs défaut global)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_permission_overrides (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('grant', 'revoke')),
  granted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_admin_permission_overrides_user
  ON public.admin_permission_overrides (user_id);

-- Permissions de base pour TOUS les admins (modifiable par super_admin)
INSERT INTO public.app_settings (key, value)
VALUES (
  'admin_default_permissions',
  '["moderation","content","insights"]'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Helpers SQL
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.user_role = 'super_admin'
      AND u.is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_user(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = COALESCE(p_user_id, auth.uid())
      AND u.user_role IN ('admin', 'super_admin')
      AND u.is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.get_admin_default_permissions()
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw JSONB;
  v_out TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT value INTO v_raw
  FROM public.app_settings
  WHERE key = 'admin_default_permissions'
  LIMIT 1;

  IF v_raw IS NULL OR jsonb_typeof(v_raw) <> 'array' THEN
    RETURN v_out;
  END IF;

  SELECT COALESCE(array_agg(trim(elem)), ARRAY[]::TEXT[])
  INTO v_out
  FROM jsonb_array_elements_text(v_raw) AS elem
  WHERE trim(elem) <> '';

  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_admin_permissions(p_user_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_defaults TEXT[];
  v_effective TEXT[];
  r RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN ARRAY[]::TEXT[];
  END IF;

  IF p_user_id IS DISTINCT FROM auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT user_role INTO v_role FROM public.users WHERE id = p_user_id LIMIT 1;

  IF v_role = 'super_admin' THEN
    RETURN ARRAY[
      'content_countries','content','categories','spot_stars','featured','insights',
      'users','partnerships','partner_milestones','suggestions','automation',
      'legal','prime_benefits','benefit_draw','notifications','moderation','manage_admins'
    ];
  END IF;

  IF v_role <> 'admin' THEN
    RETURN ARRAY[]::TEXT[];
  END IF;

  v_defaults := public.get_admin_default_permissions();
  v_effective := v_defaults;

  FOR r IN
    SELECT permission, mode
    FROM public.admin_permission_overrides
    WHERE user_id = p_user_id
  LOOP
    IF r.mode = 'grant' THEN
      IF NOT r.permission = ANY (v_effective) THEN
        v_effective := array_append(v_effective, r.permission);
      END IF;
    ELSIF r.mode = 'revoke' THEN
      v_effective := array_remove(v_effective, r.permission);
    END IF;
  END LOOP;

  RETURN (
    SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), ARRAY[]::TEXT[])
    FROM unnest(v_effective) AS x
    WHERE x IS NOT NULL AND x <> ''
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_admin_permissions()
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_admin_permissions(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.admin_has_permission(p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
    OR p_permission = ANY (public.get_my_admin_permissions());
$$;

-- -----------------------------------------------------------------------------
-- 3. RPC gestion (super_admin uniquement)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_admin_default_permissions(p_permissions TEXT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;

  INSERT INTO public.app_settings (key, value, updated_at)
  VALUES (
    'admin_default_permissions',
    to_jsonb(COALESCE(p_permissions, ARRAY[]::TEXT[])),
    NOW()
  )
  ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'defaults', public.get_admin_default_permissions()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_admin_permission_overrides(
  p_target_user_id UUID,
  p_grants TEXT[],
  p_revokes TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  g TEXT;
  r TEXT;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;

  SELECT user_role INTO v_role FROM public.users WHERE id = p_target_user_id LIMIT 1;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;
  IF v_role = 'super_admin' THEN
    RAISE EXCEPTION 'cannot_override_super_admin';
  END IF;
  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'target_must_be_admin';
  END IF;

  DELETE FROM public.admin_permission_overrides WHERE user_id = p_target_user_id;

  IF p_grants IS NOT NULL THEN
    FOREACH g IN ARRAY p_grants LOOP
      IF g IS NULL OR trim(g) = '' THEN CONTINUE; END IF;
      INSERT INTO public.admin_permission_overrides (user_id, permission, mode, granted_by)
      VALUES (p_target_user_id, trim(g), 'grant', auth.uid());
    END LOOP;
  END IF;

  IF p_revokes IS NOT NULL THEN
    FOREACH r IN ARRAY p_revokes LOOP
      IF r IS NULL OR trim(r) = '' THEN CONTINUE; END IF;
      INSERT INTO public.admin_permission_overrides (user_id, permission, mode, granted_by)
      VALUES (p_target_user_id, trim(r), 'revoke', auth.uid());
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'user_id', p_target_user_id,
    'effective', public.get_user_admin_permissions(p_target_user_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_admin_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_admin_permissions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_default_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_admin_default_permissions(TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_admin_permission_overrides(UUID, TEXT[], TEXT[]) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.admin_permission_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin read permission overrides" ON public.admin_permission_overrides;
CREATE POLICY "Super admin read permission overrides"
  ON public.admin_permission_overrides FOR SELECT TO authenticated
  USING (public.is_super_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS "Super admin manage permission overrides" ON public.admin_permission_overrides;
CREATE POLICY "Super admin manage permission overrides"
  ON public.admin_permission_overrides FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Mettre à jour is_admin() existante (inclut super_admin)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin_user(auth.uid());
$$;

-- Promouvoir le compte admin principal (adapter l'email si besoin)
UPDATE public.users
SET user_role = 'super_admin', updated_at = NOW()
WHERE lower(email) = 'admin@theloop.gn'
  AND user_role IN ('admin', 'super_admin');
