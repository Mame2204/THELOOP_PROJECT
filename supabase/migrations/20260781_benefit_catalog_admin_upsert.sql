DROP INDEX IF EXISTS public.idx_benefit_catalog_local_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_benefit_catalog_local_id
  ON public.benefit_catalog (local_id);

-- RLS benefit_catalog : garantir gestion admin + RPC upsert (évite échec client RLS)

DROP POLICY IF EXISTS "Admin manage benefit catalog" ON public.benefit_catalog;
CREATE POLICY "Admin manage benefit catalog"
  ON public.benefit_catalog FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Lecture admin de toutes les lignes (actives et inactives)
DROP POLICY IF EXISTS "Admin read all benefit catalog" ON public.benefit_catalog;
CREATE POLICY "Admin read all benefit catalog"
  ON public.benefit_catalog FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.admin_upsert_benefit_catalog(p_row JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_local_id TEXT := NULLIF(trim(COALESCE(p_row->>'local_id', '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;

  IF v_local_id IS NULL THEN
    RAISE EXCEPTION 'local_id requis';
  END IF;

  INSERT INTO public.benefit_catalog (
    local_id,
    title,
    description,
    partner_name,
    default_validity_days,
    is_active,
    offering_partners,
    benefit_kind,
    quantity_per_grant,
    max_uses_per_grant,
    country_code,
    city,
    benefit_purpose,
    updated_at
  ) VALUES (
    v_local_id,
    COALESCE(NULLIF(trim(p_row->>'title'), ''), 'Avantage'),
    COALESCE(p_row->>'description', ''),
    NULLIF(trim(COALESCE(p_row->>'partner_name', '')), ''),
    GREATEST(COALESCE((p_row->>'default_validity_days')::INT, 30), 1),
    COALESCE((p_row->>'is_active')::BOOLEAN, FALSE),
    COALESCE(p_row->'offering_partners', '[]'::jsonb),
    COALESCE(NULLIF(trim(p_row->>'benefit_kind'), ''), 'unlimited'),
    NULLIF(p_row->>'quantity_per_grant', '')::INT,
    NULLIF(p_row->>'max_uses_per_grant', '')::INT,
    NULLIF(trim(COALESCE(p_row->>'country_code', '')), ''),
    NULLIF(trim(COALESCE(p_row->>'city', '')), ''),
    COALESCE(NULLIF(trim(p_row->>'benefit_purpose'), ''), 'standard'),
    NOW()
  )
  ON CONFLICT (local_id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    partner_name = EXCLUDED.partner_name,
    default_validity_days = EXCLUDED.default_validity_days,
    is_active = EXCLUDED.is_active,
    offering_partners = EXCLUDED.offering_partners,
    benefit_kind = EXCLUDED.benefit_kind,
    quantity_per_grant = EXCLUDED.quantity_per_grant,
    max_uses_per_grant = EXCLUDED.max_uses_per_grant,
    country_code = EXCLUDED.country_code,
    city = EXCLUDED.city,
    benefit_purpose = EXCLUDED.benefit_purpose,
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_benefit_catalog(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_benefit_catalog(JSONB) TO authenticated;
