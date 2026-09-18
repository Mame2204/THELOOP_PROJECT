-- THE LOOP — Publication événement partenaire : intervenants sans titre/entreprise
-- Corrige NOT NULL sur event_speakers.professional_title (NULLIF → chaîne vide).

CREATE OR REPLACE FUNCTION public.sync_event_speakers_core(
  p_event_id UUID,
  p_speakers JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_speaker JSONB;
  v_name TEXT;
  v_title TEXT;
  v_company TEXT;
BEGIN
  IF p_event_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.event_speakers WHERE event_id = p_event_id;

  IF p_speakers IS NULL OR jsonb_typeof(p_speakers) <> 'array' THEN
    RETURN;
  END IF;

  FOR v_speaker IN SELECT value FROM jsonb_array_elements(p_speakers)
  LOOP
    v_name := COALESCE(
      NULLIF(trim(v_speaker->>'name'), ''),
      NULLIF(trim(v_speaker->>'full_name'), '')
    );
    IF v_name IS NULL THEN
      CONTINUE;
    END IF;

    v_title := COALESCE(
      NULLIF(trim(COALESCE(v_speaker->>'title', v_speaker->>'professional_title', '')), ''),
      ''
    );
    v_company := COALESCE(
      NULLIF(trim(COALESCE(v_speaker->>'company', v_speaker->>'company_name', '')), ''),
      ''
    );

    INSERT INTO public.event_speakers (event_id, full_name, professional_title, company_name)
    VALUES (p_event_id, v_name, v_title, v_company);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_event_speakers_core(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_event_speakers_core(UUID, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_event_speakers(p_event_id UUID, p_speakers JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_event_speakers_core(p_event_id, p_speakers);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_event_speakers(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_event_speakers(UUID, JSONB) TO authenticated, service_role;
