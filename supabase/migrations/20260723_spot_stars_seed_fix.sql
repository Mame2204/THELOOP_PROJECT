-- Correctif 20260723 — seed spot_star_settings (si la migration a échoué sur ON CONFLICT)
-- Exécuter uniquement si les tables existent déjà mais le seed est incomplet.

INSERT INTO public.spot_star_settings (country_code, click_weight, favorite_weight)
SELECT NULL, 1, 5
WHERE NOT EXISTS (
  SELECT 1 FROM public.spot_star_settings WHERE country_code IS NULL
);

INSERT INTO public.spot_star_settings (country_code, click_weight, favorite_weight)
SELECT 'GN', 1, 5
WHERE NOT EXISTS (
  SELECT 1 FROM public.spot_star_settings WHERE country_code = 'GN'
);

DO $$
DECLARE
  global_id UUID;
  gn_id UUID;
BEGIN
  SELECT id INTO global_id FROM public.spot_star_settings WHERE country_code IS NULL LIMIT 1;
  SELECT id INTO gn_id FROM public.spot_star_settings WHERE country_code = 'GN' LIMIT 1;

  IF global_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.spot_star_tiers WHERE settings_id = global_id) THEN
    INSERT INTO public.spot_star_tiers (settings_id, min_score, max_score, star_count, sort_order) VALUES
      (global_id, 0, 50, 1, 1),
      (global_id, 51, 200, 2, 2),
      (global_id, 201, 500, 3, 3),
      (global_id, 501, 1000, 4, 4),
      (global_id, 1001, NULL, 5, 5);
  END IF;

  IF gn_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.spot_star_tiers WHERE settings_id = gn_id) THEN
    INSERT INTO public.spot_star_tiers (settings_id, min_score, max_score, star_count, sort_order) VALUES
      (gn_id, 0, 50, 1, 1),
      (gn_id, 51, 200, 2, 2),
      (gn_id, 201, 500, 3, 3),
      (gn_id, 501, 1000, 4, 4),
      (gn_id, 1001, NULL, 5, 5);
  END IF;
END $$;
