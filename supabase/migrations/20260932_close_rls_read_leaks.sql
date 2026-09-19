-- =============================================================================
-- Fermeture des fuites de lecture relevées par l'audit RLS.
--
-- 1. public.users            — un membre connecté lisait toutes les fiches,
--                              dont `qr_code_token`, secret du QR tournant :
--                              n'importe qui pouvait rejouer le QR d'un abonné
--                              Prime chez un partenaire.
-- 2. public.home_poll_votes  — lisible sans compte, avec `voter_phone`.
-- 3. public.partnership_requests — le `OR status = 'pending'` ouvrait les
--                              coordonnées des candidats et les notes internes
--                              à tout compte connecté.
--
-- Les politiques permissives sont supprimées par balayage de pg_policies :
-- l'historique du dépôt ne permet pas de connaître leur nom exact en base.
-- Seules les politiques de LECTURE sont touchées ; les droits d'écriture
-- existants (insertion d'un vote, RPC de candidature) restent intacts.
-- =============================================================================

-- --- 1. users ----------------------------------------------------------------

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.users', r.policyname);
  END LOOP;
END $$;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own row"
  ON public.users FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Admin read all users"
  ON public.users FOR SELECT TO authenticated
  USING (public.is_admin());

-- --- 2. partnership_requests -------------------------------------------------

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'partnership_requests' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.partnership_requests', r.policyname);
  END LOOP;
END $$;

ALTER TABLE public.partnership_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read partnership requests"
  ON public.partnership_requests FOR SELECT TO authenticated
  USING (public.is_admin());

-- --- 3. home_poll_votes ------------------------------------------------------

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'home_poll_votes' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.home_poll_votes', r.policyname);
  END LOOP;
END $$;

ALTER TABLE public.home_poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read poll votes"
  ON public.home_poll_votes FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Voter reads own poll vote"
  ON public.home_poll_votes FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Résultats agrégés : remplace la lecture ligne à ligne côté application.
-- Corrige au passage un comptage tronqué à 15 votes côté client.
CREATE OR REPLACE FUNCTION public.get_home_poll_results(
  p_poll_id UUID,
  p_phone_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_options JSONB;
  v_counts JSONB := '{}'::JSONB;
  v_total INTEGER := 0;
  v_mine TEXT;
  v_phone TEXT := NULLIF(trim(COALESCE(p_phone_id, '')), '');
  r RECORD;
BEGIN
  SELECT options INTO v_options
  FROM public.home_polls
  WHERE id = p_poll_id;

  IF v_options IS NULL THEN
    RETURN jsonb_build_object('counts', '{}'::JSONB, 'total', 0, 'userOptionId', NULL);
  END IF;

  FOR r IN SELECT jsonb_array_elements(v_options) AS opt LOOP
    IF r.opt ? 'id' THEN
      v_counts := v_counts || jsonb_build_object(r.opt->>'id', 0);
    END IF;
  END LOOP;

  FOR r IN
    SELECT v.option_id, COUNT(*)::INTEGER AS n
    FROM public.home_poll_votes v
    WHERE v.poll_id = p_poll_id
    GROUP BY v.option_id
  LOOP
    -- Une option retirée du sondage depuis le vote ne doit pas fausser le total.
    IF v_counts ? r.option_id THEN
      v_counts := v_counts || jsonb_build_object(r.option_id, r.n);
      v_total := v_total + r.n;
    END IF;
  END LOOP;

  IF auth.uid() IS NOT NULL THEN
    SELECT v.option_id INTO v_mine
    FROM public.home_poll_votes v
    WHERE v.poll_id = p_poll_id AND v.user_id = auth.uid()
    LIMIT 1;
  ELSIF v_phone IS NOT NULL THEN
    SELECT v.option_id INTO v_mine
    FROM public.home_poll_votes v
    WHERE v.poll_id = p_poll_id AND v.voter_phone = v_phone
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'counts', v_counts,
    'total', v_total,
    'userOptionId', v_mine
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_home_poll_results(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_home_poll_results(UUID, TEXT) TO anon, authenticated, service_role;
