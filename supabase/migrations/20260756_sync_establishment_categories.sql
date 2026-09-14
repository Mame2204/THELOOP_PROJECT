-- Synchronise establishment_categories depuis content_categories (sandbox purge vide la table).
-- Corrige : null value in column "category_id" of relation "establishments" violates not-null constraint

CREATE UNIQUE INDEX IF NOT EXISTS establishment_categories_slug_unique
  ON public.establishment_categories (slug);

INSERT INTO public.establishment_categories (name, slug)
SELECT cc.label, cc.slug
FROM public.content_categories cc
WHERE cc.kind IN ('spot', 'tool') AND cc.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM public.establishment_categories ec WHERE ec.slug = cc.slug
  );

INSERT INTO public.establishment_categories (name, slug)
SELECT 'Fine Dining', 'fine_dining'
WHERE NOT EXISTS (SELECT 1 FROM public.establishment_categories WHERE slug = 'fine_dining');

INSERT INTO public.establishment_categories (name, slug)
SELECT 'Outils', 'tools'
WHERE NOT EXISTS (SELECT 1 FROM public.establishment_categories WHERE slug = 'tools');

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

GRANT EXECUTE ON FUNCTION public.resolve_establishment_category_id(TEXT) TO authenticated;
