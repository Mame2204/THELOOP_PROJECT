-- =============================================================================
-- Durcissement sécurité (audit build 53)
--
-- 1) Rôle à l'inscription / à la connexion : plus jamais repris du client.
--    ensure_user_profile (SECURITY DEFINER) et handle_new_auth_user écrivaient
--    le user_role fourni par l'app ou par les métadonnées Auth, que l'utilisateur
--    contrôle. Le rôle vient désormais uniquement d'une invitation admin
--    (admin_user_invites, écriture réservée aux admins) ou vaut 'member'.
-- 2) Colonnes partenaire (partner_can_manage_*) ajoutées au garde-fou users.
-- 3) Soumissions partenaires : un partenaire ne peut ni pointer une soumission
--    vers la fiche publiée d'un autre (published_*), ni s'auto-approuver, ni
--    modifier la soumission d'un autre via ON CONFLICT des RPC d'upsert.
-- 4) Invitations : mark_admin_user_invite_activated réservé au titulaire de
--    l'e-mail (ou admin / service) ; téléphone masqué pour les appels anonymes.
-- 5) request_benefit_redemption : plus exécutable sans session.
-- 6) admin_delete_user_if_orphan : ni soi-même, ni un admin (sauf super admin).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Rôle de confiance issu d'une invitation admin
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._trusted_invite_role(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_role TEXT;
  v_created_by UUID;
BEGIN
  IF v_email = '' THEN
    RETURN NULL;
  END IF;

  -- Invitation en attente, ou activée très récemment (l'activation peut être
  -- marquée avant la création du profil public).
  SELECT lower(trim(i.user_role)), i.created_by
    INTO v_role, v_created_by
  FROM public.admin_user_invites i
  WHERE lower(trim(i.email)) = v_email
    AND (i.activated_at IS NULL OR i.activated_at > NOW() - INTERVAL '1 day')
  ORDER BY (i.activated_at IS NULL) DESC, i.created_at DESC
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN ('member', 'prime', 'partner', 'tool_partner', 'admin', 'super_admin') THEN
    RETURN NULL;
  END IF;

  -- Un admin délégué ne peut pas fabriquer un super admin par invitation.
  IF v_role = 'super_admin' AND NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_created_by AND u.user_role = 'super_admin'
  ) THEN
    v_role := 'admin';
  END IF;

  RETURN v_role;
END;
$$;

REVOKE ALL ON FUNCTION public._trusted_invite_role(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._trusted_invite_role(TEXT) FROM anon, authenticated;

-- p_user_role est conservé pour la compatibilité des apps déjà installées,
-- mais il n'est plus appliqué.
CREATE OR REPLACE FUNCTION public.ensure_user_profile(
  p_first_name TEXT DEFAULT 'Membre',
  p_last_name TEXT DEFAULT 'THE LOOP',
  p_phone TEXT DEFAULT NULL,
  p_user_role TEXT DEFAULT 'member',
  p_qr_token TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_qr TEXT;
  v_phone TEXT := NULLIF(trim(p_phone), '');
  v_in_first TEXT := COALESCE(NULLIF(trim(p_first_name), ''), 'Membre');
  v_in_last TEXT := COALESCE(NULLIF(trim(p_last_name), ''), 'THE LOOP');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT COALESCE(NULLIF(trim(email), ''), '') INTO v_email
  FROM auth.users
  WHERE id = v_uid;

  v_qr := COALESCE(
    NULLIF(trim(p_qr_token), ''),
    'LOOP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
  );

  INSERT INTO public.users (
    id, email, password_hash, phone_number,
    first_name, last_name, user_role, qr_code_token, is_active
  )
  VALUES (
    v_uid,
    v_email,
    'managed_by_supabase_auth',
    v_phone,
    v_in_first,
    v_in_last,
    COALESCE(public._trusted_invite_role(v_email), 'member'),
    v_qr,
    TRUE
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = public._merge_profile_first_name(v_in_first, users.first_name),
    last_name = public._merge_profile_last_name(v_in_last, users.last_name),
    phone_number = COALESCE(EXCLUDED.phone_number, users.phone_number),
    qr_code_token = COALESCE(NULLIF(EXCLUDED.qr_code_token, ''), users.qr_code_token),
    is_active = CASE WHEN users.is_active = FALSE THEN FALSE ELSE TRUE END,
    updated_at = CURRENT_TIMESTAMP;
END;
$$;

ALTER FUNCTION public.ensure_user_profile(TEXT, TEXT, TEXT, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.ensure_user_profile(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_user_profile(TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_user_profile(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- Les métadonnées Auth (raw_user_meta_data) sont modifiables par l'utilisateur
-- lui-même (signUp / updateUser) : seul le rôle d'invitation fait foi.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := COALESCE(NULLIF(trim(NEW.email), ''), '');
  v_user_role TEXT := COALESCE(public._trusted_invite_role(NEW.email), 'member');
  v_first_name TEXT := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'first_name'), ''),
    CASE lower(v_user_role)
      WHEN 'partner' THEN 'Partenaire'
      WHEN 'admin' THEN 'Administrateur'
      ELSE 'Membre'
    END
  );
  v_last_name TEXT := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'last_name'), ''), 'THE LOOP');
  v_phone TEXT := NULLIF(trim(NEW.raw_user_meta_data->>'phone_number'), '');
  v_qr_token TEXT := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'qr_code_token'), ''),
    'LOOP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
  );
  v_admin_invite BOOLEAN := COALESCE(
    (NEW.raw_user_meta_data->>'invited_by_admin')::BOOLEAN,
    FALSE
  ) OR lower(COALESCE(NEW.raw_user_meta_data->>'invited_by_admin', '')) = 'true';
  v_country TEXT := COALESCE(
    NULLIF(upper(trim(COALESCE(NEW.raw_user_meta_data->>'country_code', ''))), ''),
    'GN'
  );
  v_city TEXT := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'city', '')), '');
BEGIN
  INSERT INTO public.users (
    id, email, password_hash, phone_number,
    first_name, last_name, user_role, qr_code_token,
    is_active, account_status, country_code, city
  )
  VALUES (
    NEW.id,
    v_email,
    'managed_by_supabase_auth',
    v_phone,
    v_first_name,
    v_last_name,
    v_user_role,
    v_qr_token,
    NOT v_admin_invite,
    CASE WHEN v_admin_invite THEN 'invited' ELSE 'active' END,
    v_country,
    v_city
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    phone_number = EXCLUDED.phone_number,
    qr_code_token = COALESCE(NULLIF(EXCLUDED.qr_code_token, ''), users.qr_code_token),
    country_code = COALESCE(EXCLUDED.country_code, users.country_code),
    city = COALESCE(EXCLUDED.city, users.city),
    is_active = CASE
      WHEN users.account_status = 'invited' THEN FALSE
      WHEN users.is_active = FALSE THEN FALSE
      ELSE EXCLUDED.is_active
    END,
    account_status = CASE
      WHEN users.account_status IN ('suspended', 'archived', 'deleted') THEN users.account_status
      WHEN v_admin_invite AND users.account_status = 'invited' THEN 'invited'
      WHEN users.account_status = 'invited' THEN 'invited'
      ELSE COALESCE(users.account_status, 'active')
    END,
    updated_at = CURRENT_TIMESTAMP;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Garde-fou users : ajout des droits de publication partenaire
-- -----------------------------------------------------------------------------

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
    OR NEW.account_status IS DISTINCT FROM OLD.account_status
    OR NEW.partner_can_manage_events IS DISTINCT FROM OLD.partner_can_manage_events
    OR NEW.partner_can_manage_spots IS DISTINCT FROM OLD.partner_can_manage_spots
    OR NEW.partner_can_manage_tools IS DISTINCT FROM OLD.partner_can_manage_tools;

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

-- -----------------------------------------------------------------------------
-- 3. Soumissions partenaires : colonnes réservées à la modération
--
-- Pas de test sur current_user ici : les RPC d'upsert partenaire sont SECURITY
-- DEFINER, c'est donc l'identité JWT (auth.uid()) qui compte. Sans JWT (service
-- role, cron) ou pour un admin, rien n'est filtré.
-- Les valeurs interdites sont neutralisées plutôt que refusées, pour ne pas
-- casser les resynchronisations automatiques de l'app partenaire.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_partner_submission_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_event BOOLEAN := TG_TABLE_NAME = 'partner_event_submissions';
BEGIN
  IF v_uid IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_is_event THEN
      NEW.published_event_id := NULL;
    ELSE
      NEW.published_establishment_id := NULL;
      NEW.published_tool_id := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.partner_user_id IS DISTINCT FROM v_uid
     AND NOT (v_is_event AND OLD.master_user_id IS NOT DISTINCT FROM v_uid)
  THEN
    RAISE EXCEPTION 'forbidden: soumission d''un autre partenaire'
      USING ERRCODE = '42501';
  END IF;

  NEW.partner_user_id := OLD.partner_user_id;
  IF v_is_event THEN
    NEW.published_event_id := OLD.published_event_id;
  ELSE
    NEW.published_establishment_id := OLD.published_establishment_id;
    NEW.published_tool_id := OLD.published_tool_id;
  END IF;

  -- Transitions partenaire autorisées : brouillon / en attente / resoumission,
  -- demande de retrait d'un contenu approuvé, et annulation de cette demande.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'approved' AND OLD.status <> 'withdrawal_requested' THEN
      NEW.status := OLD.status;
    ELSIF NEW.status = 'withdrawal_requested' AND OLD.status <> 'approved' THEN
      NEW.status := OLD.status;
    ELSIF NEW.status = 'rejected' THEN
      NEW.status := OLD.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partner_event_submission_guard ON public.partner_event_submissions;
CREATE TRIGGER trg_partner_event_submission_guard
  BEFORE INSERT OR UPDATE ON public.partner_event_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_partner_submission_guard();

DROP TRIGGER IF EXISTS trg_partner_spot_submission_guard ON public.partner_spot_submissions;
CREATE TRIGGER trg_partner_spot_submission_guard
  BEFORE INSERT OR UPDATE ON public.partner_spot_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_partner_submission_guard();

COMMENT ON FUNCTION public.tg_partner_submission_guard() IS
  'Un partenaire ne modifie que ses soumissions, sans toucher aux liens de publication ni aux statuts de modération.';

-- -----------------------------------------------------------------------------
-- 4. Invitations
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_admin_user_invite_activated(
  p_invite_id UUID,
  p_email TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
  v_updated INT;
  v_caller_email TEXT;
BEGIN
  IF p_invite_id IS NULL OR v_email IS NULL OR v_email = '' THEN
    RETURN FALSE;
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN
    IF auth.uid() IS NULL THEN
      RETURN FALSE;
    END IF;
    SELECT lower(trim(au.email)) INTO v_caller_email
    FROM auth.users au
    WHERE au.id = auth.uid();
    IF v_caller_email IS DISTINCT FROM v_email THEN
      RETURN FALSE;
    END IF;
  END IF;

  UPDATE public.admin_user_invites i
  SET activated_at = NOW()
  WHERE i.id = p_invite_id
    AND i.activated_at IS NULL
    AND lower(trim(i.email)) = v_email;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    UPDATE public.users u
    SET
      account_status = 'active',
      is_active = TRUE,
      updated_at = NOW()
    WHERE lower(trim(u.email)) = v_email
      AND u.account_status = 'invited';
  END IF;

  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_admin_user_invite_activated(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_admin_user_invite_activated(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_admin_user_invite_activated(UUID, TEXT) TO authenticated, service_role;

-- VOLATILE : la fonction clôture les invitations dont le compte est déjà actif.
CREATE OR REPLACE FUNCTION public.find_pending_admin_invite_by_email(p_email TEXT)
RETURNS JSON
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
  v_row public.admin_user_invites%ROWTYPE;
  v_status TEXT;
  v_can_see_phone BOOLEAN := auth.role() = 'service_role' OR auth.uid() IS NOT NULL;
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RETURN NULL;
  END IF;

  IF length(v_email) > 254 OR v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_row
  FROM public.admin_user_invites i
  WHERE lower(trim(i.email)) = v_email
    AND i.activated_at IS NULL
  ORDER BY i.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT lower(trim(u.account_status))
  INTO v_status
  FROM public.users u
  WHERE lower(trim(u.email)) = v_email
  LIMIT 1;

  IF v_status IS NOT NULL AND v_status <> 'invited' THEN
    UPDATE public.admin_user_invites i
    SET activated_at = COALESCE(i.activated_at, NOW())
    WHERE i.id = v_row.id
      AND i.activated_at IS NULL;
    RETURN NULL;
  END IF;

  RETURN json_build_object(
    'id', v_row.id,
    'phone_number', CASE WHEN v_can_see_phone THEN v_row.phone_number ELSE NULL END,
    'email', v_row.email,
    'user_role', v_row.user_role,
    'first_name', v_row.first_name,
    'last_name', v_row.last_name,
    'country_code', v_row.country_code,
    'otp_sent_at', v_row.otp_sent_at,
    'activated_at', v_row.activated_at,
    'created_at', v_row.created_at
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Demande de validation d'avantage : session obligatoire
--    (sans JWT, auth.uid() est NULL et la vérification d'identité était sautée)
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.request_benefit_redemption(
  TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM anon;

-- -----------------------------------------------------------------------------
-- 6. Suppression « orphelin » : pas soi-même, pas un admin (sauf super admin)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_delete_user_if_orphan(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_links INTEGER := 0;
  v_status TEXT;
  v_role TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT u.account_status, u.user_role INTO v_status, v_role
  FROM public.users u
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN_SELF';
  END IF;

  IF v_status = 'invited' THEN
    RETURN public.admin_cancel_pending_invite(p_user_id);
  END IF;

  IF v_role IN ('admin', 'super_admin') AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN_ADMIN';
  END IF;

  v_links := public._admin_user_linked_content_count(p_user_id);

  IF v_links > 0 THEN
    RAISE EXCEPTION 'LINKED_CONTENT';
  END IF;

  DELETE FROM auth.users au
  WHERE au.id = p_user_id;

  UPDATE public.users
  SET
    account_status = 'deleted',
    is_active = FALSE,
    email = CONCAT('deleted+', p_user_id::TEXT, '@theloop.invalid'),
    phone_number = NULL,
    updated_at = NOW()
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user_if_orphan(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_user_if_orphan(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_if_orphan(UUID) TO authenticated;
