-- Corrige : INSERT is not allowed in a non-volatile function
-- resolve_*_category_id synchronise les catégories (INSERT/UPDATE) → doit être VOLATILE.

CREATE OR REPLACE FUNCTION public.resolve_establishment_category_id(p_sub_category TEXT)
RETURNS INT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id INT;
  v_slug TEXT := COALESCE(NULLIF(trim(p_sub_category), ''), 'fine_dining');
BEGIN
  INSERT INTO public.establishment_categories (name, slug)
  SELECT cc.label, cc.slug
  FROM public.content_categories cc
  WHERE cc.kind IN ('spot', 'tool') AND cc.slug = v_slug AND cc.is_active = TRUE
    AND NOT EXISTS (SELECT 1 FROM public.establishment_categories ec WHERE ec.slug = cc.slug);

  UPDATE public.establishment_categories ec
  SET name = cc.label
  FROM public.content_categories cc
  WHERE cc.kind IN ('spot', 'tool') AND cc.slug = v_slug AND ec.slug = cc.slug;

  SELECT id INTO v_id FROM public.establishment_categories WHERE slug = v_slug LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.establishment_categories (name, slug)
  SELECT cc.label, cc.slug
  FROM public.content_categories cc
  WHERE cc.kind IN ('spot', 'tool') AND cc.is_active = TRUE
    AND NOT EXISTS (SELECT 1 FROM public.establishment_categories ec WHERE ec.slug = cc.slug);

  SELECT id INTO v_id FROM public.establishment_categories WHERE slug = 'fine_dining' LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT id INTO v_id FROM public.establishment_categories WHERE slug = 'tools' LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT id INTO v_id FROM public.establishment_categories ORDER BY id LIMIT 1;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'no_establishment_category_available';
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_event_category_id(p_category TEXT)
RETURNS INT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id INT;
  v_slug TEXT := COALESCE(NULLIF(trim(p_category), ''), 'corporate');
BEGIN
  INSERT INTO public.event_categories (name, slug)
  SELECT cc.label, cc.slug
  FROM public.content_categories cc
  WHERE cc.kind = 'event' AND cc.slug = v_slug AND cc.is_active = TRUE
    AND NOT EXISTS (SELECT 1 FROM public.event_categories ec WHERE ec.slug = cc.slug);

  UPDATE public.event_categories ec
  SET name = cc.label
  FROM public.content_categories cc
  WHERE cc.kind = 'event' AND cc.slug = v_slug AND ec.slug = cc.slug;

  SELECT id INTO v_id FROM public.event_categories WHERE slug = v_slug LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.event_categories (name, slug)
  SELECT cc.label, cc.slug
  FROM public.content_categories cc
  WHERE cc.kind = 'event' AND cc.is_active = TRUE
    AND NOT EXISTS (SELECT 1 FROM public.event_categories ec WHERE ec.slug = cc.slug);

  SELECT id INTO v_id FROM public.event_categories WHERE slug = 'corporate' LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT id INTO v_id FROM public.event_categories ORDER BY id LIMIT 1;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'no_event_category_available';
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.extract_category_slugs(
  p_payload JSONB,
  p_single_key TEXT,
  p_fallback TEXT
)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_slugs TEXT[];
BEGIN
  IF jsonb_typeof(p_payload->'categories') = 'array' AND jsonb_array_length(p_payload->'categories') > 0 THEN
    SELECT COALESCE(array_agg(trim(both '"' from elem::text)), ARRAY[]::TEXT[])
    INTO v_slugs
    FROM jsonb_array_elements(p_payload->'categories') AS elem
    WHERE trim(both '"' from elem::text) <> '';
    IF array_length(v_slugs, 1) > 0 THEN
      RETURN v_slugs;
    END IF;
  END IF;

  IF p_payload->>p_single_key IS NOT NULL AND trim(p_payload->>p_single_key) <> '' THEN
    RETURN ARRAY[trim(p_payload->>p_single_key)];
  END IF;

  RETURN ARRAY[COALESCE(NULLIF(trim(p_fallback), ''), 'corporate')];
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_establishment_category_id(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_event_category_id(TEXT) TO authenticated;
