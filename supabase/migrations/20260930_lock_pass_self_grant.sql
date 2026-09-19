-- =============================================================================
-- 20260930 — Un membre ne peut plus s'offrir un PASS
-- =============================================================================
-- Vérifié en conditions réelles depuis une session membre ordinaire : deux
-- chemins permettaient d'obtenir un PASS actif, donc le rôle Prime, sans payer.
--
--   A. upsert_user_pass_grant_admin acceptait qu'un membre crée un octroi pour
--      lui-même dès qu'il fournissait une note d'octroi — le statut, l'échéance
--      et le libellé étant entièrement choisis par l'appelant.
--   B. bulk_update_user_pass_grants acceptait qu'un membre fasse passer ses
--      propres lignes de « pending » à « active », transformant une commande
--      jamais payée en abonnement valide.
--
-- Ces deux fonctions doivent rester ouvertes au membre, car l'application
-- effectue depuis sa propre session l'écriture technique du gel de rôle
-- (suspension du PASS quand l'administration le repasse en membre, puis
-- restauration quand elle le repasse en Prime). On conserve donc strictement
-- ces écritures-là, et rien d'autre.
--
-- Règle retenue pour un membre agissant sur son propre compte :
--   * il ne peut jamais déclarer un paiement (montant, moyen, date de paiement) ;
--   * il ne peut créer qu'une ligne « suspended » ou « expired », c'est-à-dire
--     sans valeur ;
--   * il ne peut réactiver qu'une ligne déjà existante, non expirée, et
--     seulement si l'administration lui a déjà attribué le rôle « prime » —
--     rôle devenu non modifiable depuis le client par la migration 20260928.
--
-- Correction annexe : trois surcharges de upsert_user_pass_grant_admin
-- coexistaient en base (15, 16 et 17 paramètres). PostgREST n'arrivait plus à
-- choisir et renvoyait « Could not choose the best candidate function », ce qui
-- empêchait la console d'administration d'octroyer le moindre PASS. On ne garde
-- que la signature complète.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Supprimer les surcharges obsolètes (source de l'ambiguïté PostgREST)
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.upsert_user_pass_grant_admin(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT,
  INTEGER, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ
);

DROP FUNCTION IF EXISTS public.upsert_user_pass_grant_admin(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT,
  INTEGER, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, JSONB
);

-- -----------------------------------------------------------------------------
-- 2. Signature unique, avec le garde-fou sur la branche « membre »
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_user_pass_grant_admin(
  p_user_id UUID,
  p_pass_catalog_id TEXT,
  p_label TEXT,
  p_pass_kind TEXT DEFAULT 'custom',
  p_status TEXT DEFAULT 'active',
  p_started_at TIMESTAMPTZ DEFAULT NOW(),
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_granted_by UUID DEFAULT NULL,
  p_grant_note TEXT DEFAULT NULL,
  p_local_id TEXT DEFAULT NULL,
  p_amount_gnf INTEGER DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_paid_at TIMESTAMPTZ DEFAULT NULL,
  p_billing_period TEXT DEFAULT NULL,
  p_scheduled_start_at TIMESTAMPTZ DEFAULT NULL,
  p_frozen_pass_snapshot JSONB DEFAULT NULL,
  p_role_freeze_intermediate_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_local TEXT := NULLIF(trim(COALESCE(p_local_id, '')), '');
  v_is_service BOOLEAN := COALESCE(auth.role(), '') = 'service_role';
  v_caller_role TEXT;
  v_row_exists BOOLEAN;
BEGIN
  IF p_status NOT IN ('active', 'pending', 'expired', 'revoked', 'suspended') THEN
    RAISE EXCEPTION 'Statut PASS invalide : %', p_status;
  END IF;

  IF v_local IS NULL THEN
    RAISE EXCEPTION 'local_id requis';
  END IF;

  IF v_is_service THEN
    NULL;

  ELSIF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';

  ELSIF public.is_admin() THEN
    NULL;

  ELSIF auth.uid() = p_user_id THEN
    -- Écriture technique du gel de rôle, depuis la session du membre concerné.
    IF COALESCE(p_amount_gnf, 0) <> 0
       OR p_paid_at IS NOT NULL
       OR NULLIF(trim(COALESCE(p_payment_method, '')), '') IS NOT NULL
    THEN
      RAISE EXCEPTION 'forbidden: un paiement ne peut pas être déclaré depuis le client'
        USING ERRCODE = '42501';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.user_pass_grants g WHERE g.local_id = v_local
    ) INTO v_row_exists;

    IF NOT v_row_exists AND p_status NOT IN ('suspended', 'expired') THEN
      RAISE EXCEPTION 'forbidden: création de PASS réservée à l''administration'
        USING ERRCODE = '42501';
    END IF;

    IF p_status = 'active' THEN
      SELECT u.user_role INTO v_caller_role
      FROM public.users u WHERE u.id = auth.uid();

      IF COALESCE(v_caller_role, 'member') <> 'prime' THEN
        RAISE EXCEPTION 'forbidden: activation de PASS réservée à l''administration'
          USING ERRCODE = '42501';
      END IF;

      IF p_expires_at IS NOT NULL AND p_expires_at <= NOW() THEN
        RAISE EXCEPTION 'forbidden: un PASS échu ne peut pas être réactivé'
          USING ERRCODE = '42501';
      END IF;
    END IF;

  ELSE
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  INSERT INTO public.user_pass_grants (
    user_id, pass_catalog_id, label, pass_kind, status,
    started_at, expires_at, granted_by, grant_note, local_id,
    amount_gnf, payment_method, paid_at, billing_period, scheduled_start_at,
    frozen_pass_snapshot, role_freeze_intermediate_id,
    updated_at
  ) VALUES (
    p_user_id, p_pass_catalog_id, p_label,
    COALESCE(NULLIF(trim(p_pass_kind), ''), 'custom'),
    p_status, p_started_at, p_expires_at, p_granted_by, p_grant_note, v_local,
    p_amount_gnf, NULLIF(trim(COALESCE(p_payment_method, '')), ''),
    p_paid_at, NULLIF(trim(COALESCE(p_billing_period, '')), ''),
    p_scheduled_start_at,
    p_frozen_pass_snapshot,
    NULLIF(trim(COALESCE(p_role_freeze_intermediate_id, '')), ''),
    NOW()
  )
  ON CONFLICT (local_id) WHERE local_id IS NOT NULL DO UPDATE SET
    pass_catalog_id = EXCLUDED.pass_catalog_id,
    label = EXCLUDED.label,
    pass_kind = EXCLUDED.pass_kind,
    status = EXCLUDED.status,
    started_at = EXCLUDED.started_at,
    expires_at = EXCLUDED.expires_at,
    granted_by = EXCLUDED.granted_by,
    grant_note = EXCLUDED.grant_note,
    amount_gnf = EXCLUDED.amount_gnf,
    payment_method = EXCLUDED.payment_method,
    paid_at = EXCLUDED.paid_at,
    billing_period = EXCLUDED.billing_period,
    scheduled_start_at = EXCLUDED.scheduled_start_at,
    frozen_pass_snapshot = EXCLUDED.frozen_pass_snapshot,
    role_freeze_intermediate_id = EXCLUDED.role_freeze_intermediate_id,
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_user_pass_grant_admin(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT,
  INTEGER, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, JSONB, TEXT
) IS
  'Octroi de PASS. Administration et service_role : plein pouvoir. Membre sur '
  'son propre compte : uniquement l''écriture technique du gel de rôle, sans '
  'déclaration de paiement et sans création de PASS actif.';

REVOKE ALL ON FUNCTION public.upsert_user_pass_grant_admin(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT,
  INTEGER, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, JSONB, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_user_pass_grant_admin(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT,
  INTEGER, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, JSONB, TEXT
) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Mise à jour en masse : plus de « pending » promu en « active »
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bulk_update_user_pass_grants(
  p_user_id UUID,
  p_new_status TEXT,
  p_match_statuses TEXT[],
  p_exclude_catalog_id TEXT DEFAULT NULL,
  p_only_catalog_id TEXT DEFAULT NULL,
  p_only_unexpired BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_is_service BOOLEAN := COALESCE(auth.role(), '') = 'service_role';
  v_caller_role TEXT;
BEGIN
  IF p_new_status NOT IN ('active', 'pending', 'expired', 'revoked', 'suspended') THEN
    RAISE EXCEPTION 'Statut cible invalide : %', p_new_status;
  END IF;

  IF v_is_service THEN
    NULL;

  ELSIF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';

  ELSIF public.is_admin() THEN
    NULL;

  ELSIF auth.uid() = p_user_id THEN
    -- Seule la restauration d'un PASS gelé est permise au membre lui-même.
    IF p_new_status = 'pending' THEN
      RAISE EXCEPTION 'forbidden: statut « pending » réservé au serveur de paiement'
        USING ERRCODE = '42501';
    END IF;

    IF p_new_status = 'active' THEN
      IF p_match_statuses IS NULL
         OR NOT (p_match_statuses <@ ARRAY['suspended', 'revoked']::TEXT[])
      THEN
        RAISE EXCEPTION
          'forbidden: seuls des PASS suspendus peuvent être réactivés depuis le client'
          USING ERRCODE = '42501';
      END IF;

      IF NOT COALESCE(p_only_unexpired, FALSE) THEN
        RAISE EXCEPTION 'forbidden: réactivation limitée aux PASS non échus'
          USING ERRCODE = '42501';
      END IF;

      SELECT u.user_role INTO v_caller_role
      FROM public.users u WHERE u.id = auth.uid();

      IF COALESCE(v_caller_role, 'member') <> 'prime' THEN
        RAISE EXCEPTION 'forbidden: activation de PASS réservée à l''administration'
          USING ERRCODE = '42501';
      END IF;
    END IF;

  ELSE
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  UPDATE public.user_pass_grants g
  SET status = p_new_status, updated_at = NOW()
  WHERE g.user_id = p_user_id
    AND g.status = ANY (p_match_statuses)
    AND (p_exclude_catalog_id IS NULL OR g.pass_catalog_id <> p_exclude_catalog_id)
    AND (p_only_catalog_id IS NULL OR g.pass_catalog_id = p_only_catalog_id)
    AND (
      NOT p_only_unexpired
      OR g.expires_at IS NULL
      OR g.expires_at > NOW()
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.bulk_update_user_pass_grants(
  UUID, TEXT, TEXT[], TEXT, TEXT, BOOLEAN
) IS
  'Mise à jour groupée des statuts PASS. Un membre ne peut agir que sur ses '
  'propres lignes, sans jamais promouvoir une commande « pending » en « active ».';

REVOKE ALL ON FUNCTION public.bulk_update_user_pass_grants(
  UUID, TEXT, TEXT[], TEXT, TEXT, BOOLEAN
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.bulk_update_user_pass_grants(
  UUID, TEXT, TEXT[], TEXT, TEXT, BOOLEAN
) TO authenticated, service_role;
