-- Notes utilisateur sur les outils (table tools, hors establishments)

CREATE TABLE IF NOT EXISTS public.tool_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES public.tools(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_tool_rating UNIQUE (user_id, tool_id)
);

CREATE INDEX IF NOT EXISTS idx_tool_ratings_tool ON public.tool_ratings(tool_id);
CREATE INDEX IF NOT EXISTS idx_tool_ratings_user ON public.tool_ratings(user_id);

COMMENT ON TABLE public.tool_ratings IS 'Note utilisateur (1–5) par compte et par outil.';

ALTER TABLE public.tools
  ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(4, 2) NOT NULL DEFAULT 0
    CHECK (rating_avg >= 0 AND rating_avg <= 5),
  ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0
    CHECK (rating_count >= 0);

ALTER TABLE public.tool_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own tool ratings" ON public.tool_ratings;
CREATE POLICY "Users read own tool ratings"
  ON public.tool_ratings FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Users insert own tool ratings" ON public.tool_ratings;
CREATE POLICY "Users insert own tool ratings"
  ON public.tool_ratings FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.is_active, TRUE) = TRUE
        AND u.user_role IN ('member', 'prime', 'partner', 'admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Users update own tool ratings" ON public.tool_ratings;
CREATE POLICY "Users update own tool ratings"
  ON public.tool_ratings FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

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
    (v_clicks * v_click_weight)
    + (v_favorites * v_favorite_weight)
    + (v_rating_avg * v_rating_weight)
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

CREATE OR REPLACE FUNCTION public.refresh_tool_rating_stats(p_tool_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tools t
  SET
    rating_avg = COALESCE(stats.avg_rating, 0),
    rating_count = COALESCE(stats.cnt, 0)
  FROM (
    SELECT
      AVG(r.rating)::NUMERIC(4, 2) AS avg_rating,
      COUNT(*)::INTEGER AS cnt
    FROM public.tool_ratings r
    WHERE r.tool_id = p_tool_id
  ) stats
  WHERE t.id = p_tool_id;

  PERFORM public.recalculate_tool_engagement(p_tool_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_tool_rating(
  p_tool_id UUID,
  p_rating SMALLINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'invalid_rating';
  END IF;

  SELECT u.user_role INTO v_role
  FROM public.users u
  WHERE u.id = v_user_id
    AND COALESCE(u.is_active, TRUE) = TRUE;

  IF v_role IS NULL OR v_role NOT IN ('member', 'prime', 'partner', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'rating_not_allowed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tools t
    WHERE t.id = p_tool_id AND t.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'tool_not_found';
  END IF;

  INSERT INTO public.tool_ratings (user_id, tool_id, rating)
  VALUES (v_user_id, p_tool_id, p_rating)
  ON CONFLICT (user_id, tool_id)
  DO UPDATE SET
    rating = EXCLUDED.rating,
    updated_at = NOW();

  PERFORM public.refresh_tool_rating_stats(p_tool_id);

  RETURN (
    SELECT jsonb_build_object(
      'establishment_id', t.id,
      'tool_id', t.id,
      'user_rating', p_rating,
      'rating_avg', t.rating_avg,
      'rating_count', t.rating_count,
      'engagement_score', t.engagement_score,
      'star_count', t.star_count,
      'stars_source', t.stars_source
    )
    FROM public.tools t
    WHERE t.id = p_tool_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_tool_rating(UUID, SMALLINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_tool_rating_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_tool_engagement(UUID) TO authenticated;
