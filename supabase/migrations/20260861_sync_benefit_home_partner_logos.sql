-- Logos Accueil : sync auto depuis avantages actifs (source = benefit)

ALTER TABLE public.home_partner_logos
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS partner_key TEXT;

COMMENT ON COLUMN public.home_partner_logos.source IS
  'manual = curaté admin ; benefit = auto depuis avantage actif (couverture contenu).';
COMMENT ON COLUMN public.home_partner_logos.partner_key IS
  'Clé stable partenaire (UUID ou nom normalisé) pour upsert benefit.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_home_partner_logos_benefit_key
  ON public.home_partner_logos (country_code, partner_key)
  WHERE source = 'benefit' AND partner_key IS NOT NULL;

/**
 * Upsert en masse des logos issus des avantages actifs.
 * p_logos: [{ partner_key, name, logo_url, website_url?, sort_order? }]
 */
CREATE OR REPLACE FUNCTION public.upsert_benefit_home_partner_logos(
  p_logos JSONB,
  p_country_code TEXT DEFAULT 'GN'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item JSONB;
  touched INT := 0;
  v_key TEXT;
  v_name TEXT;
  v_logo TEXT;
  v_web TEXT;
  v_sort INT;
  v_country TEXT;
  v_id UUID;
BEGIN
  IF p_logos IS NULL OR jsonb_typeof(p_logos) <> 'array' THEN
    RETURN 0;
  END IF;

  v_country := COALESCE(nullif(trim(p_country_code), ''), 'GN');

  FOR item IN SELECT * FROM jsonb_array_elements(p_logos)
  LOOP
    v_key := nullif(trim(item->>'partner_key'), '');
    v_name := nullif(trim(item->>'name'), '');
    v_logo := nullif(trim(item->>'logo_url'), '');
    v_web := nullif(trim(item->>'website_url'), '');
    v_sort := COALESCE((item->>'sort_order')::INT, 0);

    IF v_key IS NULL OR v_name IS NULL OR v_logo IS NULL THEN
      CONTINUE;
    END IF;

    SELECT h.id INTO v_id
    FROM public.home_partner_logos h
    WHERE h.source = 'benefit'
      AND h.country_code = v_country
      AND h.partner_key = v_key
    LIMIT 1;

    IF v_id IS NOT NULL THEN
      UPDATE public.home_partner_logos
      SET
        name = v_name,
        logo_url = v_logo,
        website_url = COALESCE(v_web, website_url),
        sort_order = v_sort,
        is_active = true,
        updated_at = NOW()
      WHERE id = v_id;
    ELSE
      INSERT INTO public.home_partner_logos (
        name, logo_url, website_url, sort_order, is_active, country_code, source, partner_key, updated_at
      ) VALUES (
        v_name, v_logo, v_web, v_sort, true, v_country, 'benefit', v_key, NOW()
      );
    END IF;

    touched := touched + 1;
  END LOOP;

  RETURN touched;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_benefit_home_partner_logos(JSONB, TEXT) TO anon, authenticated;
