-- Modèle vs déploiement : éviter les « doublons » title + THE LOOP / partenaire dans benefit_catalog.

ALTER TABLE public.benefit_catalog
  ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.benefit_catalog
  ADD COLUMN IF NOT EXISTS template_local_id TEXT NULL;

COMMENT ON COLUMN public.benefit_catalog.is_template IS
  'TRUE = modèle Paramètres (THE LOOP sans lieu). FALSE = déploiement (association partenaire / lieu).';
COMMENT ON COLUMN public.benefit_catalog.template_local_id IS
  'local_id du modèle source lors d''une association depuis Privilèges.';

CREATE OR REPLACE FUNCTION public.benefit_catalog_has_content_ref(p_offering JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_offering, '[]'::jsonb)) elem
    WHERE COALESCE(
      NULLIF(trim(elem->>'contentId'), ''),
      NULLIF(trim(elem->>'content_id'), '')
    ) IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.benefit_catalog_is_template_row(p_offering JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    jsonb_array_length(COALESCE(p_offering, '[]'::jsonb)) > 0
    AND NOT public.benefit_catalog_has_content_ref(p_offering)
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(p_offering, '[]'::jsonb)) elem
      WHERE COALESCE(
        NULLIF(trim(elem->>'partnerId'), ''),
        NULLIF(trim(elem->>'partner_id'), '')
      ) NOT IN ('__external__', 'loop', 'theloop-team')
    )
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(p_offering, '[]'::jsonb)) elem
      WHERE upper(trim(COALESCE(elem->>'displayName', elem->>'display_name', ''))) LIKE '%THE LOOP%'
    );
$$;

-- 1) Classifier les lignes existantes
UPDATE public.benefit_catalog bc
SET is_template = public.benefit_catalog_is_template_row(bc.offering_partners)
WHERE bc.is_template IS DISTINCT FROM public.benefit_catalog_is_template_row(bc.offering_partners);

UPDATE public.benefit_catalog bc
SET is_template = FALSE
WHERE public.benefit_catalog_has_content_ref(bc.offering_partners)
  AND bc.is_template = TRUE;

-- 2) Lier les déploiements au modèle (même titre + pays)
UPDATE public.benefit_catalog dep
SET template_local_id = tmpl.local_id,
    updated_at = NOW()
FROM public.benefit_catalog tmpl
WHERE dep.template_local_id IS NULL
  AND public.benefit_catalog_has_content_ref(dep.offering_partners)
  AND public.benefit_catalog_is_template_row(tmpl.offering_partners)
  AND lower(trim(tmpl.title)) = lower(trim(dep.title))
  AND COALESCE(tmpl.country_code, '') = COALESCE(dep.country_code, '')
  AND tmpl.local_id <> dep.local_id;

-- 3) Nettoyage : désactiver les modèles actifs doublons d''un déploiement actif (même titre / pays)
UPDATE public.benefit_catalog bc
SET
  is_active = FALSE,
  is_template = TRUE,
  updated_at = NOW()
WHERE bc.is_template = TRUE
  AND bc.is_active = TRUE
  AND EXISTS (
    SELECT 1
    FROM public.benefit_catalog dep
    WHERE dep.local_id <> bc.local_id
      AND dep.is_active = TRUE
      AND dep.is_template = FALSE
      AND public.benefit_catalog_has_content_ref(dep.offering_partners)
      AND lower(trim(dep.title)) = lower(trim(bc.title))
      AND COALESCE(dep.country_code, '') = COALESCE(bc.country_code, '')
  );

-- 4) Lecture publique : pas de modèles (octroi / app membre = déploiements uniquement)
DROP POLICY IF EXISTS "Public read active benefit catalog" ON public.benefit_catalog;
CREATE POLICY "Public read active benefit catalog"
  ON public.benefit_catalog FOR SELECT TO anon, authenticated
  USING (is_active = TRUE AND is_template = FALSE);

CREATE OR REPLACE FUNCTION public.admin_upsert_benefit_catalog(p_row JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_local_id TEXT := NULLIF(trim(COALESCE(p_row->>'local_id', '')), '');
  v_offering JSONB := COALESCE(p_row->'offering_partners', '[]'::jsonb);
  v_is_template BOOLEAN;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;

  IF v_local_id IS NULL THEN
    RAISE EXCEPTION 'local_id requis';
  END IF;

  IF p_row ? 'is_template' THEN
    v_is_template := COALESCE((p_row->>'is_template')::BOOLEAN, FALSE);
  ELSE
    v_is_template := public.benefit_catalog_is_template_row(v_offering);
  END IF;

  IF public.benefit_catalog_has_content_ref(v_offering) THEN
    v_is_template := FALSE;
  END IF;

  INSERT INTO public.benefit_catalog (
    local_id,
    title,
    description,
    partner_name,
    default_validity_days,
    validity_ends_at,
    validity_starts_on_activation,
    is_active,
    offering_partners,
    benefit_kind,
    quantity_per_grant,
    max_uses_per_grant,
    country_code,
    city,
    benefit_purpose,
    is_template,
    template_local_id,
    updated_at
  ) VALUES (
    v_local_id,
    COALESCE(NULLIF(trim(p_row->>'title'), ''), 'Avantage'),
    COALESCE(p_row->>'description', ''),
    NULLIF(trim(COALESCE(p_row->>'partner_name', '')), ''),
    GREATEST(COALESCE((p_row->>'default_validity_days')::INT, 30), 1),
    NULLIF(p_row->>'validity_ends_at', '')::TIMESTAMPTZ,
    COALESCE((p_row->>'validity_starts_on_activation')::BOOLEAN, TRUE),
    COALESCE((p_row->>'is_active')::BOOLEAN, FALSE),
    v_offering,
    COALESCE(NULLIF(trim(p_row->>'benefit_kind'), ''), 'unlimited'),
    NULLIF(p_row->>'quantity_per_grant', '')::INT,
    NULLIF(p_row->>'max_uses_per_grant', '')::INT,
    NULLIF(trim(COALESCE(p_row->>'country_code', '')), ''),
    NULLIF(trim(COALESCE(p_row->>'city', '')), ''),
    COALESCE(NULLIF(trim(p_row->>'benefit_purpose'), ''), 'standard'),
    v_is_template,
    NULLIF(trim(COALESCE(p_row->>'template_local_id', '')), ''),
    NOW()
  )
  ON CONFLICT (local_id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    partner_name = EXCLUDED.partner_name,
    default_validity_days = EXCLUDED.default_validity_days,
    validity_ends_at = EXCLUDED.validity_ends_at,
    validity_starts_on_activation = EXCLUDED.validity_starts_on_activation,
    is_active = EXCLUDED.is_active,
    offering_partners = EXCLUDED.offering_partners,
    benefit_kind = EXCLUDED.benefit_kind,
    quantity_per_grant = EXCLUDED.quantity_per_grant,
    max_uses_per_grant = EXCLUDED.max_uses_per_grant,
    country_code = EXCLUDED.country_code,
    city = EXCLUDED.city,
    benefit_purpose = EXCLUDED.benefit_purpose,
    is_template = EXCLUDED.is_template,
    template_local_id = COALESCE(EXCLUDED.template_local_id, public.benefit_catalog.template_local_id),
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_benefit_catalog(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_benefit_catalog(JSONB) TO authenticated;
