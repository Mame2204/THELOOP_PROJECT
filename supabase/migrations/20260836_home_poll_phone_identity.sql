-- Mini-sondage : identité par compte (user_id) ou id téléphone local (voter_phone)

ALTER TABLE public.home_poll_votes
  DROP CONSTRAINT IF EXISTS home_poll_votes_identity;

ALTER TABLE public.home_poll_votes
  ADD CONSTRAINT home_poll_votes_identity CHECK (
    user_id IS NOT NULL
    OR voter_phone IS NOT NULL
    OR device_id IS NOT NULL
  );

COMMENT ON COLUMN public.home_poll_votes.voter_phone IS
  'Id téléphone local (anonyme) ou numéro canonique du profil connecté.';

DROP FUNCTION IF EXISTS public.claim_home_poll_votes(TEXT);

CREATE FUNCTION public.claim_home_poll_votes(p_phone_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  claimed INTEGER := 0;
BEGIN
  IF uid IS NULL OR p_phone_id IS NULL OR length(trim(p_phone_id)) = 0 THEN
    RETURN 0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.home_poll_votes v WHERE v.user_id = uid LIMIT 1
  ) THEN
    DELETE FROM public.home_poll_votes h
    WHERE h.user_id IS NULL
      AND (h.voter_phone = p_phone_id OR h.device_id = p_phone_id);
    GET DIAGNOSTICS claimed = ROW_COUNT;
    RETURN claimed;
  END IF;

  UPDATE public.home_poll_votes v
  SET user_id = uid,
      voter_phone = COALESCE(v.voter_phone, p_phone_id)
  WHERE v.user_id IS NULL
    AND (v.voter_phone = p_phone_id OR v.device_id = p_phone_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.home_poll_votes o
      WHERE o.poll_id = v.poll_id
        AND o.user_id = uid
    );

  GET DIAGNOSTICS claimed = ROW_COUNT;
  RETURN claimed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_home_poll_votes(TEXT) TO authenticated;

COMMENT ON FUNCTION public.claim_home_poll_votes(TEXT) IS
  'Rattache les votes anonymes (voter_phone = id téléphone local) au compte connecté.';
