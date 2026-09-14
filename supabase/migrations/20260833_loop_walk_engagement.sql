-- THE LOOP — Engagement Walks (favoris, notes, clics, étoiles)
-- Aligné sur establishments / tools + réutilise spot_star_settings / spot_star_tiers.

-- ─── 1. Colonnes engagement sur loop_walks ──────────────────────────────────
ALTER TABLE public.loop_walks
  ADD COLUMN IF NOT EXISTS click_count INTEGER NOT NULL DEFAULT 0 CHECK (click_count >= 0),
  ADD COLUMN IF NOT EXISTS favorite_count INTEGER NOT NULL DEFAULT 0 CHECK (favorite_count >= 0),
  ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(4, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  ADD COLUMN IF NOT EXISTS engagement_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS star_count INTEGER NOT NULL DEFAULT 0 CHECK (star_count BETWEEN 0 AND 5),
  ADD COLUMN IF NOT EXISTS stars_source TEXT NOT NULL DEFAULT 'auto'
    CHECK (stars_source IN ('auto', 'admin')),
  ADD COLUMN IF NOT EXISTS admin_star_override INTEGER
    CHECK (admin_star_override IS NULL OR admin_star_override BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS admin_star_override_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_star_override_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_star_calc_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_loop_walks_star_count ON public.loop_walks(star_count DESC);
CREATE INDEX IF NOT EXISTS idx_loop_walks_engagement ON public.loop_walks(engagement_score DESC);

-- ─── 2. Favoris parcours ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.favorite_walks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  walk_id UUID NOT NULL REFERENCES public.loop_walks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_walk_favorite UNIQUE (user_id, walk_id)
);

CREATE INDEX IF NOT EXISTS idx_favorite_walks_user ON public.favorite_walks(user_id);
CREATE INDEX IF NOT EXISTS idx_favorite_walks_walk ON public.favorite_walks(walk_id);

COMMENT ON TABLE public.favorite_walks IS 'Favoris parcours Loop Walks par utilisateur.';

ALTER TABLE public.favorite_walks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own favorite walks" ON public.favorite_walks;
CREATE POLICY "Users read own favorite walks"
  ON public.favorite_walks FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users insert own favorite walks" ON public.favorite_walks;
CREATE POLICY "Users insert own favorite walks"
  ON public.favorite_walks FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.is_active, TRUE) = TRUE
        AND u.user_role IN ('member', 'prime', 'partner', 'admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Users delete own favorite walks" ON public.favorite_walks;
CREATE POLICY "Users delete own favorite walks"
  ON public.favorite_walks FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ─── 3. Notes parcours ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.walk_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  walk_id UUID NOT NULL REFERENCES public.loop_walks(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_walk_rating UNIQUE (user_id, walk_id)
);

CREATE INDEX IF NOT EXISTS idx_walk_ratings_walk ON public.walk_ratings(walk_id);
CREATE INDEX IF NOT EXISTS idx_walk_ratings_user ON public.walk_ratings(user_id);

COMMENT ON TABLE public.walk_ratings IS 'Note utilisateur (1–5) par compte et par parcours.';

ALTER TABLE public.walk_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own walk ratings" ON public.walk_ratings;
CREATE POLICY "Users read own walk ratings"
  ON public.walk_ratings FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users insert own walk ratings" ON public.walk_ratings;
CREATE POLICY "Users insert own walk ratings"
  ON public.walk_ratings FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.is_active, TRUE) = TRUE
        AND u.user_role IN ('member', 'prime', 'partner', 'admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Users update own walk ratings" ON public.walk_ratings;
CREATE POLICY "Users update own walk ratings"
  ON public.walk_ratings FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── 4. Recalcul engagement / étoiles ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recalculate_walk_engagement(p_walk_id UUID)
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
    w.country_code,
    w.click_count,
    w.favorite_count,
    COALESCE(w.rating_avg, 0),
    w.stars_source,
    w.admin_star_override
  INTO
    v_country,
    v_clicks,
    v_favorites,
    v_rating_avg,
    v_stars_source,
    v_admin_override
  FROM public.loop_walks w
  WHERE w.id = p_walk_id;

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

  UPDATE public.loop_walks
  SET
    engagement_score = v_score,
    star_count = v_star_count,
    last_star_calc_at = NOW()
  WHERE id = p_walk_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_walk_rating_stats(p_walk_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.loop_walks w
  SET
    rating_avg = COALESCE(stats.avg_rating, 0),
    rating_count = COALESCE(stats.cnt, 0)
  FROM (
    SELECT
      AVG(r.rating)::NUMERIC(4, 2) AS avg_rating,
      COUNT(*)::INTEGER AS cnt
    FROM public.walk_ratings r
    WHERE r.walk_id = p_walk_id
  ) stats
  WHERE w.id = p_walk_id;

  PERFORM public.recalculate_walk_engagement(p_walk_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_walk_favorite_count(p_walk_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.loop_walks w
  SET favorite_count = (
    SELECT COUNT(*)::INTEGER FROM public.favorite_walks f WHERE f.walk_id = p_walk_id
  )
  WHERE w.id = p_walk_id;

  PERFORM public.recalculate_walk_engagement(p_walk_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_favorite_walks_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_walk_favorite_count(OLD.walk_id);
    RETURN OLD;
  END IF;
  PERFORM public.refresh_walk_favorite_count(NEW.walk_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_favorite_walks_count ON public.favorite_walks;
CREATE TRIGGER trg_favorite_walks_count
  AFTER INSERT OR DELETE ON public.favorite_walks
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_favorite_walks_count();

-- ─── 5. RPC clics & notes ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_walk_click(p_walk_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.loop_walks
  SET click_count = click_count + 1
  WHERE id = p_walk_id AND is_published = TRUE;

  IF FOUND THEN
    PERFORM public.recalculate_walk_engagement(p_walk_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_walk_rating(p_walk_id UUID, p_rating SMALLINT)
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

  SELECT u.user_role INTO v_role
  FROM public.users u
  WHERE u.id = v_user_id AND COALESCE(u.is_active, TRUE) = TRUE;

  IF v_role IS NULL OR v_role NOT IN ('member', 'prime', 'partner', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'rating_not_allowed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.loop_walks w
    WHERE w.id = p_walk_id AND w.is_published = TRUE
  ) THEN
    RAISE EXCEPTION 'walk_not_found';
  END IF;

  INSERT INTO public.walk_ratings (user_id, walk_id, rating)
  VALUES (v_user_id, p_walk_id, p_rating)
  ON CONFLICT (user_id, walk_id)
  DO UPDATE SET
    rating = EXCLUDED.rating,
    updated_at = NOW();

  PERFORM public.refresh_walk_rating_stats(p_walk_id);

  RETURN (
    SELECT jsonb_build_object(
      'walk_id', w.id,
      'user_rating', p_rating,
      'rating_avg', w.rating_avg,
      'rating_count', w.rating_count,
      'click_count', w.click_count,
      'favorite_count', w.favorite_count,
      'engagement_score', w.engagement_score,
      'star_count', w.star_count,
      'stars_source', w.stars_source
    )
    FROM public.loop_walks w
    WHERE w.id = p_walk_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_walk_click(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_walk_rating(UUID, SMALLINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_walk_engagement(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_walk_rating_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_walk_favorite_count(UUID) TO authenticated;

-- ─── 6. Spots : compteur favoris manquant (alignement outils) ───────────────
CREATE OR REPLACE FUNCTION public.refresh_establishment_favorite_count(p_establishment_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.establishments e
  SET favorite_count = (
    SELECT COUNT(*)::INTEGER FROM public.favorite_spots f WHERE f.establishment_id = p_establishment_id
  )
  WHERE e.id = p_establishment_id;

  PERFORM public.recalculate_establishment_engagement(p_establishment_id);
EXCEPTION
  WHEN undefined_function THEN
    NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_favorite_spots_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_establishment_favorite_count(OLD.establishment_id);
    RETURN OLD;
  END IF;
  PERFORM public.refresh_establishment_favorite_count(NEW.establishment_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_favorite_spots_count ON public.favorite_spots;
CREATE TRIGGER trg_favorite_spots_count
  AFTER INSERT OR DELETE ON public.favorite_spots
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_favorite_spots_count();

-- Batch init compteurs favoris spots existants
UPDATE public.establishments e
SET favorite_count = (
  SELECT COUNT(*)::INTEGER FROM public.favorite_spots f WHERE f.establishment_id = e.id
)
WHERE EXISTS (SELECT 1 FROM public.favorite_spots f WHERE f.establishment_id = e.id);

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.establishments WHERE favorite_count > 0 OR click_count > 0 LOOP
    PERFORM public.recalculate_establishment_engagement(r.id);
  END LOOP;
END $$;
