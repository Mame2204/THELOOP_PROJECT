-- =============================================================================
-- 20260954 — Sécurité, deuxième passe (audit pré-build 53)
-- =============================================================================
--   1. SPOT-DEMO-2026 révoqué : ce jeton est publié dans le dépôt et la doc,
--      il ouvrait une session partenaire complète sur contact@lavenue.gn.
--   2. Création de la ligne public.users depuis le client : le rôle et les
--      colonnes privilégiées sont imposés côté serveur. La garde de 20260928
--      ne couvrait que l'UPDATE ; un INSERT direct (upsert du profil quand
--      ensure_user_profile n'a pas encore créé la ligne) pouvait porter
--      user_role = 'super_admin'.
--   3. prime_benefit_grants : un membre pouvait modifier directement ses
--      octrois (repasser un privilège « used » en « active », repousser
--      expires_at). Les écritures membre passent toutes par des RPC SECURITY
--      DEFINER ; seule l'administration écrit en direct (révocation depuis la
--      console, qui n'avait d'ailleurs aucune policy pour le faire).
--   4. RPC internes ou réservées à l'administration, jusqu'ici appelables par
--      n'importe quel compte (voire anonymement).
-- Aucune fonction du parcours « Code établissement » (personnel sans compte)
-- n'est touchée.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Jeton SPOT de démonstration
-- -----------------------------------------------------------------------------

UPDATE public.partner_tokens
SET status = 'revoked', updated_at = NOW()
WHERE token_code = 'SPOT-DEMO-2026'
  AND status <> 'revoked';

-- -----------------------------------------------------------------------------
-- 2. INSERT public.users depuis le client
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER pour lire auth.users et appeler _trusted_invite_role ; le
-- contexte client est donc détecté via le JWT (auth.role()) et non via
-- current_user. Passer par ensure_user_profile donne le même résultat, la
-- coercition y est idempotente.

CREATE OR REPLACE FUNCTION public.tg_users_guard_client_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  IF COALESCE(auth.role(), '') NOT IN ('authenticated', 'anon') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  SELECT au.email INTO v_email FROM auth.users au WHERE au.id = NEW.id;

  NEW.user_role := COALESCE(public._trusted_invite_role(COALESCE(v_email, NEW.email)), 'member');
  NEW.is_active := TRUE;
  NEW.account_status := 'active';
  NEW.prime_role_locked := FALSE;
  NEW.partner_can_manage_events := TRUE;
  NEW.partner_can_manage_spots := TRUE;
  NEW.partner_can_manage_tools := TRUE;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_users_guard_client_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_users_guard_client_insert() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_users_guard_client_insert ON public.users;
CREATE TRIGGER trg_users_guard_client_insert
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_users_guard_client_insert();

-- -----------------------------------------------------------------------------
-- 3. prime_benefit_grants : plus d'UPDATE direct membre, UPDATE admin
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users update own benefit grants used" ON public.prime_benefit_grants;
DROP POLICY IF EXISTS "Users update own benefit grants" ON public.prime_benefit_grants;

DROP POLICY IF EXISTS "Admin update benefit grants" ON public.prime_benefit_grants;
CREATE POLICY "Admin update benefit grants"
  ON public.prime_benefit_grants FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 4. RPC internes / admin
-- -----------------------------------------------------------------------------

-- Appelée uniquement par les triggers de soumission (20260927).
REVOKE ALL ON FUNCTION public.admin_inbox_broadcast(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_inbox_broadcast(TEXT, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_inbox_broadcast(TEXT, TEXT, TEXT) TO service_role;

-- Appelée uniquement par admin_reassign_content_owner (SECURITY DEFINER).
REVOKE ALL ON FUNCTION public.sync_benefit_catalog_on_content_owner_change(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_benefit_catalog_on_content_owner_change(UUID, UUID, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_benefit_catalog_on_content_owner_change(UUID, UUID, TEXT, TEXT) TO service_role;

-- Aucun appel client ; écriture de la bande de logos de l'accueil.
REVOKE ALL ON FUNCTION public.upsert_benefit_home_partner_logos(JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_benefit_home_partner_logos(JSONB, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_benefit_home_partner_logos(JSONB, TEXT) TO service_role;

-- Intervenants d'un événement : édition depuis la console admin uniquement.
CREATE OR REPLACE FUNCTION public.sync_event_speakers(p_event_id UUID, p_speakers JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden: intervenants modifiables par l''administration uniquement'
      USING ERRCODE = '42501';
  END IF;
  PERFORM public.sync_event_speakers_core(p_event_id, p_speakers);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_event_speakers(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_event_speakers(UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_event_speakers(UUID, JSONB) TO authenticated, service_role;

-- Lecture de l'identifiant staff : ouverte comme avant. Création de la ligne
-- staff « master » : pour soi-même ou par l'administration seulement.
CREATE OR REPLACE FUNCTION public.ensure_partner_staff(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
BEGIN
  SELECT id INTO v_staff_id FROM public.partner_staff WHERE user_id = p_user_id LIMIT 1;
  IF v_staff_id IS NOT NULL THEN
    RETURN v_staff_id;
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND auth.uid() IS DISTINCT FROM p_user_id
     AND NOT public.is_admin()
  THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.partner_staff (user_id, staff_role)
  VALUES (p_user_id, 'master')
  RETURNING id INTO v_staff_id;

  RETURN v_staff_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_partner_staff(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_partner_staff(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_partner_staff(UUID) TO authenticated, service_role;
