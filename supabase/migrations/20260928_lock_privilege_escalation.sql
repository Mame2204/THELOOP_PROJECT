-- =============================================================================
-- Fermeture des deux élévations de privilèges critiques
--
-- 1) users : la policy « Users update own row » laissait un membre authentifié
--    modifier n'importe quelle colonne de sa propre ligne, user_role compris.
--    Une seule requête suffisait pour devenir super_admin.
--
-- 2) upsert_prime_benefit_grant : un membre pouvait créer de toutes pièces un
--    octroi d'avantage Prime pour lui-même, avec titre et statut arbitraires.
--
-- Principe retenu pour (1) : on ne touche pas aux policies (elles restent
-- nécessaires pour que l'utilisateur modifie son profil) mais on ajoute un
-- trigger qui refuse les colonnes privilégiées. La discrimination se fait sur
-- `current_user` : une requête client arrive sous le rôle `authenticated` ou
-- `anon`, alors qu'une fonction SECURITY DEFINER de confiance s'exécute sous
-- le propriétaire. Les fonctions légitimes (fulfillment Djomy, récompenses de
-- parrainage, octrois admin, serveur en service_role) continuent donc de
-- fonctionner sans aucune modification.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Garde-fou sur les colonnes privilégiées de public.users
-- -----------------------------------------------------------------------------

-- SECURITY INVOKER volontairement : le trigger doit observer le rôle réel de
-- l'appelant. En SECURITY DEFINER, current_user vaudrait toujours le
-- propriétaire et le garde-fou ne servirait plus à rien.
CREATE OR REPLACE FUNCTION public.tg_users_guard_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_from_client BOOLEAN := current_user IN ('authenticated', 'anon');
  v_touches_privileged BOOLEAN;
BEGIN
  v_touches_privileged :=
    NEW.user_role IS DISTINCT FROM OLD.user_role
    OR NEW.is_active IS DISTINCT FROM OLD.is_active
    OR NEW.prime_role_locked IS DISTINCT FROM OLD.prime_role_locked
    OR NEW.account_status IS DISTINCT FROM OLD.account_status;

  IF NOT v_touches_privileged THEN
    RETURN NEW;
  END IF;

  IF v_from_client AND NOT public.is_admin() THEN
    RAISE EXCEPTION
      'forbidden: le rôle et le statut du compte ne sont pas modifiables depuis le client'
      USING ERRCODE = '42501';
  END IF;

  -- Un admin simple ne doit pas pouvoir se hisser au rang de super admin.
  IF NEW.user_role IS DISTINCT FROM OLD.user_role
     AND NEW.user_role = 'super_admin'
     AND v_from_client
     AND NOT EXISTS (
       SELECT 1 FROM public.users u
       WHERE u.id = auth.uid() AND u.user_role = 'super_admin'
     )
  THEN
    RAISE EXCEPTION 'forbidden: seul un super admin peut promouvoir un super admin'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_guard_privileged_columns ON public.users;
CREATE TRIGGER trg_users_guard_privileged_columns
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_users_guard_privileged_columns();

COMMENT ON FUNCTION public.tg_users_guard_privileged_columns() IS
  'Refuse toute modification de user_role / is_active / prime_role_locked / account_status '
  'venant directement d''une session client non administrateur.';

-- -----------------------------------------------------------------------------
-- 2. Remplacement du sync de rôle client par un chemin serveur de confiance
--
-- L'application alignait jusqu'ici users.user_role sur l'état du PASS par un
-- UPDATE direct (mobile/src/lib/user-role-sync.ts), ce que le trigger ci-dessus
-- bloque désormais. Cette RPC fait le même travail mais recalcule le rôle à
-- partir des PASS réellement présents en base, sans faire confiance au client.
-- -----------------------------------------------------------------------------

-- p_desired : rôle que l'application pense correct. Il n'est jamais appliqué
-- tel quel, il sert uniquement de garde-fou. Si le serveur n'arrive pas à la
-- même conclusion que le client, on ne touche à rien — ce qui évite aussi bien
-- une promotion sans PASS qu'une rétrogradation pendant une synchronisation
-- encore incomplète.
CREATE OR REPLACE FUNCTION public.sync_my_pass_role(p_desired TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT;
  v_locked BOOLEAN;
  v_has_active_pass BOOLEAN;
  v_target TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT user_role, COALESCE(prime_role_locked, FALSE)
    INTO v_role, v_locked
  FROM public.users
  WHERE id = v_uid;

  IF v_role IS NULL THEN
    RETURN NULL;
  END IF;

  -- Les rôles à privilèges ne sont jamais dérivés du PASS.
  IF v_role IN ('admin', 'super_admin', 'partner', 'tool_partner') THEN
    RETURN v_role;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_pass_grants g
    WHERE g.user_id = v_uid
      AND g.status = 'active'
      AND (g.expires_at IS NULL OR g.expires_at > NOW())
  ) INTO v_has_active_pass;

  v_target := CASE
    WHEN v_has_active_pass AND NOT v_locked THEN 'prime'
    ELSE 'member'
  END;

  IF v_target = v_role THEN
    RETURN v_role;
  END IF;

  IF p_desired IS NOT NULL AND p_desired <> v_target THEN
    RETURN v_role;
  END IF;

  UPDATE public.users
  SET user_role = v_target, updated_at = NOW()
  WHERE id = v_uid;

  RETURN v_target;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_my_pass_role(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_my_pass_role(TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.sync_my_pass_role(TEXT) IS
  'Recalcule le rôle du membre connecté à partir de ses PASS actifs. '
  'Remplace l''UPDATE direct qui se faisait depuis l''application.';

-- -----------------------------------------------------------------------------
-- 3. upsert_prime_benefit_grant — la création redevient un acte privilégié
--
-- Seule exception conservée pour un membre : matérialiser un droit lié à son
-- rôle, tel que l'administrateur l'a configuré. L'identifiant doit alors suivre
-- exactement le motif déterministe produit par l'application, le catalogue doit
-- être actif, et l'association rôle / avantage doit exister réellement dans
-- app_settings. Le titre et la description sont repris du catalogue pour qu'un
-- membre ne puisse pas inventer le contenu de son avantage.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_prime_benefit_grant(
  p_local_id TEXT,
  p_user_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_partner_name TEXT,
  p_status TEXT,
  p_granted_at TIMESTAMPTZ,
  p_expires_at TIMESTAMPTZ,
  p_used_at TIMESTAMPTZ,
  p_grant_audience TEXT,
  p_grant_country_code TEXT DEFAULT NULL,
  p_grant_city TEXT DEFAULT NULL,
  p_catalog_local_id TEXT DEFAULT NULL,
  p_role_entitlement TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_jwt_role TEXT := COALESCE(auth.role(), 'anon');
  v_exists BOOLEAN;
  v_is_admin BOOLEAN := FALSE;
  v_user_role TEXT;
  v_allowed_kinds TEXT[];
  v_catalog RECORD;
  v_entitled BOOLEAN;
  v_title TEXT := p_title;
  v_description TEXT := p_description;
  v_partner_name TEXT := p_partner_name;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.prime_benefit_grants g
    WHERE p_local_id IS NOT NULL AND g.local_id = p_local_id
  ) INTO v_exists;

  IF v_jwt_role = 'service_role' THEN
    NULL;

  ELSIF auth.uid() IS NOT NULL THEN
    v_is_admin := public.is_admin();

    IF auth.uid() <> p_user_id AND NOT v_is_admin THEN
      RAISE EXCEPTION 'forbidden';
    END IF;

    -- Un membre sur son propre octroi : mise à jour libre, création encadrée.
    IF NOT v_is_admin AND NOT v_exists THEN
      IF p_local_id IS NULL OR p_catalog_local_id IS NULL OR p_role_entitlement IS NULL THEN
        RAISE EXCEPTION 'forbidden: création d''octroi réservée à l''administration';
      END IF;

      IF p_role_entitlement NOT IN ('member', 'prime', 'partner', 'admin') THEN
        RAISE EXCEPTION 'forbidden: droit de rôle inconnu';
      END IF;

      -- Identifiant déterministe : interdit d'inventer un octroi arbitraire.
      IF p_local_id <> format('role-ben-%s-%s-%s', p_user_id, p_catalog_local_id, p_role_entitlement) THEN
        RAISE EXCEPTION 'forbidden: création d''octroi réservée à l''administration';
      END IF;

      IF COALESCE(p_status, '') NOT IN ('active', 'pending_validation') THEN
        RAISE EXCEPTION 'forbidden: statut non autorisé à la création';
      END IF;

      SELECT user_role INTO v_user_role FROM public.users WHERE id = p_user_id;

      -- Le membre ne peut réclamer que les droits de son propre niveau.
      v_allowed_kinds := CASE v_user_role
        WHEN 'member' THEN ARRAY['member']
        WHEN 'prime' THEN ARRAY['member', 'prime']
        WHEN 'partner' THEN ARRAY['member', 'partner']
        WHEN 'tool_partner' THEN ARRAY['member', 'partner']
        WHEN 'admin' THEN ARRAY['member', 'prime', 'partner', 'admin']
        WHEN 'super_admin' THEN ARRAY['member', 'prime', 'partner', 'admin']
        ELSE ARRAY[]::TEXT[]
      END;

      IF NOT (p_role_entitlement = ANY (v_allowed_kinds)) THEN
        RAISE EXCEPTION 'forbidden: droit de rôle non applicable à ce compte';
      END IF;

      SELECT local_id, title, description, is_active
        INTO v_catalog
      FROM public.benefit_catalog
      WHERE local_id = p_catalog_local_id;

      IF v_catalog.local_id IS NULL OR v_catalog.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'forbidden: avantage inconnu ou inactif';
      END IF;

      -- L'association rôle / avantage doit avoir été configurée par un admin.
      SELECT EXISTS (
        SELECT 1
        FROM public.app_settings s,
             LATERAL jsonb_array_elements(
               CASE
                 WHEN jsonb_typeof((s.value::jsonb) -> p_role_entitlement) = 'array'
                   THEN (s.value::jsonb) -> p_role_entitlement
                 ELSE '[]'::jsonb
               END
             ) AS entry
        WHERE s.key LIKE 'role\_benefit\_entitlements%'
          AND entry ->> 'catalogId' = p_catalog_local_id
      ) INTO v_entitled;

      IF NOT v_entitled THEN
        RAISE EXCEPTION 'forbidden: cet avantage n''est pas ouvert à ce rôle';
      END IF;

      -- Le contenu de l'avantage vient du catalogue, pas du client.
      v_title := COALESCE(v_catalog.title, p_title);
      v_description := COALESCE(v_catalog.description, p_description);
    END IF;

  ELSE
    -- Client anon (validation partenaire) : jamais de création ex nihilo.
    IF p_local_id IS NULL OR NOT v_exists THEN
      RAISE EXCEPTION 'forbidden: création d''octroi réservée';
    END IF;
    IF COALESCE(p_status, '') NOT IN ('used', 'active', 'pending_validation', 'expired_unused') THEN
      RAISE EXCEPTION 'forbidden: statut anon non autorisé';
    END IF;
  END IF;

  INSERT INTO public.prime_benefit_grants (
    local_id, user_id, title, description, partner_name,
    status, granted_at, expires_at, used_at, grant_audience,
    grant_country_code, grant_city, catalog_local_id, role_entitlement
  ) VALUES (
    p_local_id, p_user_id, v_title, v_description, v_partner_name,
    p_status, p_granted_at, p_expires_at, p_used_at, p_grant_audience,
    p_grant_country_code, p_grant_city, p_catalog_local_id, p_role_entitlement
  )
  ON CONFLICT (local_id) WHERE local_id IS NOT NULL DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    partner_name = EXCLUDED.partner_name,
    status = CASE
      WHEN public.prime_benefit_grants.status = 'used'
        AND EXCLUDED.status IN ('active', 'pending_validation')
        THEN public.prime_benefit_grants.status
      ELSE EXCLUDED.status
    END,
    expires_at = EXCLUDED.expires_at,
    used_at = COALESCE(EXCLUDED.used_at, public.prime_benefit_grants.used_at),
    grant_audience = EXCLUDED.grant_audience,
    grant_country_code = EXCLUDED.grant_country_code,
    grant_city = EXCLUDED.grant_city,
    catalog_local_id = COALESCE(EXCLUDED.catalog_local_id, public.prime_benefit_grants.catalog_local_id),
    role_entitlement = EXCLUDED.role_entitlement
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_prime_benefit_grant(
  TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_prime_benefit_grant(
  TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.upsert_prime_benefit_grant(
  TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT
) IS
  'Octroi d''avantage. Création réservée à l''administration et au service, '
  'sauf matérialisation par un membre d''un droit de rôle réellement configuré.';
