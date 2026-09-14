-- Autoriser aussi super_admin (et rôles connectés) à noter spots/outils

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
  WHERE u.id = v_user_id
    AND COALESCE(u.is_active, TRUE) = TRUE;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'rating_not_allowed';
  END IF;

  -- Tout compte authentifié actif peut noter (member, prime, partner, admin, super_admin, …)
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

DROP POLICY IF EXISTS "Users insert own establishment ratings" ON public.establishment_ratings;
CREATE POLICY "Users insert own establishment ratings"
  ON public.establishment_ratings FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.is_active, TRUE) = TRUE
        AND u.user_role IN ('member', 'prime', 'partner', 'admin', 'super_admin')
    )
  );
