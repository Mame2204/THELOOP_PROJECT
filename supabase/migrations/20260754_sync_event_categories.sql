-- Synchronise event_categories depuis content_categories (sandbox purge vide event_categories).
-- Corrige : insert or update on table "events" violates foreign key constraint "events_category_id_fkey"

CREATE UNIQUE INDEX IF NOT EXISTS event_categories_slug_unique
  ON public.event_categories (slug);

INSERT INTO public.event_categories (name, slug)
SELECT cc.label, cc.slug
FROM public.content_categories cc
WHERE cc.kind = 'event' AND cc.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM public.event_categories ec WHERE ec.slug = cc.slug
  );

INSERT INTO public.event_categories (name, slug)
SELECT 'Corporate', 'corporate'
WHERE NOT EXISTS (SELECT 1 FROM public.event_categories WHERE slug = 'corporate');

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

GRANT EXECUTE ON FUNCTION public.resolve_event_category_id(TEXT) TO authenticated;
