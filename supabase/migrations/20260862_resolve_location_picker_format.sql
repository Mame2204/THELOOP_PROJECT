-- Extrait le quartier d'un libellé picker `COMMUNE · QUARTIER` avant résolution locations.
CREATE OR REPLACE FUNCTION public.resolve_location_id(
  p_neighborhood TEXT,
  p_city TEXT DEFAULT 'Conakry',
  p_country TEXT DEFAULT 'Guinée'
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id INT;
  v_raw TEXT := COALESCE(NULLIF(trim(p_neighborhood), ''), 'Conakry');
  v_name TEXT;
BEGIN
  IF position(' · ' IN v_raw) > 0 THEN
    v_name := trim(split_part(v_raw, ' · ', 2));
  ELSE
    v_name := v_raw;
  END IF;

  IF v_name IS NULL OR v_name = '' THEN
    v_name := v_raw;
  END IF;

  SELECT id INTO v_id
  FROM public.locations
  WHERE lower(neighborhood_name) = lower(v_name)
    AND lower(city) = lower(p_city)
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.locations (neighborhood_name, city, country)
  VALUES (v_name, p_city, p_country)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_location_id(TEXT, TEXT, TEXT) TO authenticated;
