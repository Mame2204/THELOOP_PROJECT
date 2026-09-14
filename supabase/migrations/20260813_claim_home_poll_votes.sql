-- Sondages Accueil : rattacher les votes appareil → compte à la connexion

CREATE OR REPLACE FUNCTION public.claim_home_poll_votes(p_device_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  attached INTEGER := 0;
  removed INTEGER := 0;
BEGIN
  IF uid IS NULL OR p_device_id IS NULL OR length(trim(p_device_id)) = 0 THEN
    RETURN 0;
  END IF;

  -- Si le compte a déjà voté sur le même sondage : retirer le vote anonyme appareil
  WITH doomed AS (
    SELECT v.id
    FROM public.home_poll_votes v
    WHERE v.device_id = p_device_id
      AND v.user_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.home_poll_votes o
        WHERE o.poll_id = v.poll_id
          AND o.user_id = uid
      )
  )
  DELETE FROM public.home_poll_votes h
  USING doomed d
  WHERE h.id = d.id;
  GET DIAGNOSTICS removed = ROW_COUNT;

  -- Sinon : rattacher le vote appareil au compte
  UPDATE public.home_poll_votes v
  SET user_id = uid
  WHERE v.device_id = p_device_id
    AND v.user_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.home_poll_votes o
      WHERE o.poll_id = v.poll_id
        AND o.user_id = uid
    );
  GET DIAGNOSTICS attached = ROW_COUNT;

  RETURN attached + removed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_home_poll_votes(TEXT) TO authenticated;

COMMENT ON FUNCTION public.claim_home_poll_votes(TEXT) IS
  'Rattache les votes anonymes (device_id) au compte connecté (auth.uid()).';
