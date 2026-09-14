-- Étoiles / engagement outils : recalcul après clic (comme spots après note/favori)

CREATE OR REPLACE FUNCTION public.increment_spot_click(p_establishment_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tools
  SET click_count = click_count + 1
  WHERE id = p_establishment_id;

  IF FOUND THEN
    PERFORM public.recalculate_tool_engagement(p_establishment_id);
    RETURN;
  END IF;

  UPDATE public.establishments
  SET click_count = click_count + 1
  WHERE id = p_establishment_id;

  IF FOUND THEN
    PERFORM public.recalculate_establishment_engagement(p_establishment_id);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_spot_click(UUID) TO anon, authenticated;

-- S'assurer que recalculate_tool_engagement est à jour (poids notes + paliers)
CREATE OR REPLACE FUNCTION public.recalculate_tool_engagement(p_tool_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_country TEXT;
  v_settings_id UUID;
  v_click_weight INTEGER;
  v_favorite_weight INTEGER;
  v_rating_weight INTEGER;
  v_clicks INTEGER;
  v_favorites INTEGER;
  v_rating_avg NUMERIC(4, 2);
  v_stars_source TEXT;
  v_admin_override INTEGER;
  v_score INTEGER;
  v_star_count INTEGER;
BEGIN
  SELECT
    t.country_code,
    t.click_count,
    t.favorite_count,
    COALESCE(t.rating_avg, 0),
    t.stars_source,
    t.admin_star_override
  INTO
    v_country,
    v_clicks,
    v_favorites,
    v_rating_avg,
    v_stars_source,
    v_admin_override
  FROM public.tools t
  WHERE t.id = p_tool_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT rs.settings_id, rs.click_weight, rs.favorite_weight, rs.rating_weight
  INTO v_settings_id, v_click_weight, v_favorite_weight, v_rating_weight
  FROM public.resolve_spot_star_settings(v_country) rs;

  v_click_weight := COALESCE(v_click_weight, 1);
  v_favorite_weight := COALESCE(v_favorite_weight, 5);
  v_rating_weight := COALESCE(v_rating_weight, 10);

  v_score := ROUND(
    (COALESCE(v_clicks, 0) * v_click_weight)
    + (COALESCE(v_favorites, 0) * v_favorite_weight)
    + (COALESCE(v_rating_avg, 0) * v_rating_weight)
  )::INTEGER;

  IF v_stars_source = 'admin' AND v_admin_override IS NOT NULL THEN
    v_star_count := v_admin_override;
  ELSIF v_settings_id IS NOT NULL THEN
    v_star_count := public.score_to_star_count(v_score, v_settings_id);
  ELSE
    v_star_count := 0;
  END IF;

  UPDATE public.tools
  SET
    engagement_score = v_score,
    star_count = v_star_count
  WHERE id = p_tool_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_tool_engagement(UUID) TO anon, authenticated;

-- Recalcul batch éventuel déjà stocké
UPDATE public.tools t
SET favorite_count = (
  SELECT COUNT(*)::INTEGER FROM public.favorite_tools f WHERE f.tool_id = t.id
)
WHERE EXISTS (SELECT 1 FROM public.favorite_tools f WHERE f.tool_id = t.id);

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.tools LOOP
    PERFORM public.recalculate_tool_engagement(r.id);
  END LOOP;
END $$;
