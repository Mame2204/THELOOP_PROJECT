-- Partenariat : resoumission après rejet / approbation + RPC sécurisée (évite duplicate key email).

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'partnership_requests'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) ILIKE '%email%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.partnership_requests DROP CONSTRAINT IF EXISTS %I',
      r.conname
    );
  END LOOP;
END $$;

DROP INDEX IF EXISTS partnership_requests_email_unique;
DROP INDEX IF EXISTS idx_partnership_requests_email_unique;
DROP INDEX IF EXISTS partnership_requests_one_open_email;

CREATE UNIQUE INDEX partnership_requests_one_open_email
  ON public.partnership_requests (lower(trim(email)))
  WHERE status IN ('pending', 'to_contact', 'in_discussion');

COMMENT ON INDEX public.partnership_requests_one_open_email IS
  'Une seule candidature en cours par e-mail ; nouvelle demande après rejet ou approbation.';

CREATE OR REPLACE FUNCTION public.submit_partnership_request(
  p_manager_name text,
  p_establishment_name text,
  p_email text,
  p_phone text,
  p_country_code text DEFAULT 'GN',
  p_admin_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_id uuid;
BEGIN
  IF v_email = '' OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'email_invalid' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.partnership_requests pr
    WHERE lower(trim(pr.email)) = v_email
      AND pr.status IN ('pending', 'to_contact', 'in_discussion')
  ) THEN
    RAISE EXCEPTION 'open_request_exists' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.partnership_requests (
    manager_name,
    establishment_name,
    email,
    phone,
    country_code,
    status,
    admin_notes
  ) VALUES (
    trim(p_manager_name),
    trim(p_establishment_name),
    v_email,
    coalesce(nullif(trim(p_phone), ''), 'non_renseigne'),
    upper(coalesce(nullif(trim(p_country_code), ''), 'GN')),
    'pending',
    nullif(trim(p_admin_notes), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_partnership_request(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_partnership_request(text, text, text, text, text, text) TO anon, authenticated;

INSERT INTO public.app_legal_content (key, title, body, updated_at)
VALUES (
  'privacy_policy',
  'Politique de confidentialité',
  E'Informations sur la collecte, l''utilisation et la protection de vos données personnelles.\n\nDonnées collectées\nNom, prénom, e-mail, téléphone, date de naissance, favoris, historique PASS et notifications.\n\nFinalités\nGestion du compte membre, PASS Loop Prime, avantages partenaires et communications THE LOOP.\n\nConservation\nLe temps de la relation contractuelle et des obligations légales.\n\nVos droits\nAccès, rectification, suppression : contact@theloop-app.com\n\nNous ne revendons pas vos données à des tiers.',
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  body = EXCLUDED.body,
  title = EXCLUDED.title,
  updated_at = NOW()
WHERE length(trim(app_legal_content.body)) < 80;
