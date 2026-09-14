-- Notes utilisateur sur spots / outils (1 note par compte et par établissement)
-- Formule engagement : (1 × clics) + (5 × favoris) + (10 × moyenne des notes)

-- -----------------------------------------------------------------------------
-- 1. Table des notes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.establishment_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_establishment_rating UNIQUE (user_id, establishment_id)
);

CREATE INDEX IF NOT EXISTS idx_establishment_ratings_establishment
  ON public.establishment_ratings(establishment_id);

CREATE INDEX IF NOT EXISTS idx_establishment_ratings_user
  ON public.establishment_ratings(user_id);

COMMENT ON TABLE public.establishment_ratings IS 'Note utilisateur (1–5) par compte et par spot/outil.';

-- -----------------------------------------------------------------------------
-- 2. Agrégats sur establishments
-- -----------------------------------------------------------------------------
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(4, 2) NOT NULL DEFAULT 0
    CHECK (rating_avg >= 0 AND rating_avg <= 5),
  ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0
    CHECK (rating_count >= 0);

COMMENT ON COLUMN public.establishments.rating_avg IS 'Moyenne des notes utilisateurs (1–5).';
COMMENT ON COLUMN public.establishments.rating_count IS 'Nombre de notes utilisateurs.';

-- -----------------------------------------------------------------------------
-- 3. Poids « note » dans les paramètres d''étoiles
-- -----------------------------------------------------------------------------
ALTER TABLE public.spot_star_settings
  ADD COLUMN IF NOT EXISTS rating_weight INTEGER NOT NULL DEFAULT 10 CHECK (rating_weight >= 0);

UPDATE public.spot_star_settings
SET rating_weight = 10
WHERE rating_weight IS DISTINCT FROM 10;

-- -----------------------------------------------------------------------------
-- 4. Recalcul engagement + étoiles auto
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_spot_star_settings(p_country_code TEXT)
RETURNS TABLE (
  settings_id UUID,
  click_weight INTEGER,
  favorite_weight INTEGER,
  rating_weight INTEGER
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT s.id, s.click_weight, s.favorite_weight, s.rating_weight
  FROM public.spot_star_settings s
  WHERE s.is_active
    AND (s.country_code = p_country_code OR s.country_code IS NULL)
  ORDER BY CASE WHEN s.country_code = p_country_code THEN 0 ELSE 1 END, s.updated_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.score_to_star_count(p_score INTEGER, p_settings_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_star INTEGER := 0;
BEGIN
  SELECT t.star_count
  INTO v_star
  FROM public.spot_star_tiers t
  WHERE t.settings_id = p_settings_id
    AND p_score >= t.min_score
    AND (t.max_score IS NULL OR p_score <= t.max_score)
  ORDER BY t.sort_order ASC
  LIMIT 1;

  IF v_star IS NULL THEN
    SELECT t.star_count
    INTO v_star
    FROM public.spot_star_tiers t
    WHERE t.settings_id = p_settings_id
    ORDER BY t.sort_order DESC
    LIMIT 1;
  END IF;

  RETURN COALESCE(v_star, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_establishment_engagement(p_establishment_id UUID)
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
    e.country_code,
    e.click_count,
    e.favorite_count,
    COALESCE(e.rating_avg, 0),
    e.stars_source,
    e.admin_star_override
  INTO
    v_country,
    v_clicks,
    v_favorites,
    v_rating_avg,
    v_stars_source,
    v_admin_override
  FROM public.establishments e
  WHERE e.id = p_establishment_id;

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

  UPDATE public.establishments
  SET
    engagement_score = v_score,
    star_count = v_star_count,
    last_star_calc_at = NOW()
  WHERE id = p_establishment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_establishment_rating_stats(p_establishment_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.establishments e
  SET
    rating_avg = COALESCE(stats.avg_rating, 0),
    rating_count = COALESCE(stats.cnt, 0)
  FROM (
    SELECT
      AVG(r.rating)::NUMERIC(4, 2) AS avg_rating,
      COUNT(*)::INTEGER AS cnt
    FROM public.establishment_ratings r
    WHERE r.establishment_id = p_establishment_id
  ) stats
  WHERE e.id = p_establishment_id;

  PERFORM public.recalculate_establishment_engagement(p_establishment_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_establishment_rating(
  p_establishment_id UUID,
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
  WHERE u.id = v_user_id;

  IF v_role NOT IN ('member', 'prime', 'partner', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'rating_not_allowed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.establishments e
    WHERE e.id = p_establishment_id AND e.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'establishment_not_found';
  END IF;

  INSERT INTO public.establishment_ratings (user_id, establishment_id, rating)
  VALUES (v_user_id, p_establishment_id, p_rating)
  ON CONFLICT (user_id, establishment_id)
  DO UPDATE SET
    rating = EXCLUDED.rating,
    updated_at = NOW();

  PERFORM public.refresh_establishment_rating_stats(p_establishment_id);

  RETURN (
    SELECT jsonb_build_object(
      'establishment_id', e.id,
      'user_rating', p_rating,
      'rating_avg', e.rating_avg,
      'rating_count', e.rating_count,
      'engagement_score', e.engagement_score,
      'star_count', e.star_count,
      'stars_source', e.stars_source
    )
    FROM public.establishments e
    WHERE e.id = p_establishment_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_establishment_rating(UUID, SMALLINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_establishment_engagement(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.establishment_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own establishment ratings" ON public.establishment_ratings;
CREATE POLICY "Users read own establishment ratings"
  ON public.establishment_ratings FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users insert own establishment ratings" ON public.establishment_ratings;
CREATE POLICY "Users insert own establishment ratings"
  ON public.establishment_ratings FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.user_role IN ('member', 'prime', 'partner', 'admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Users update own establishment ratings" ON public.establishment_ratings;
CREATE POLICY "Users update own establishment ratings"
  ON public.establishment_ratings FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
