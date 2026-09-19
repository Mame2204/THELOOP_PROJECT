-- =============================================================================
-- 20260931 — Expiration des PASS côté serveur
-- =============================================================================
-- Jusqu'ici, l'échéance d'un abonnement n'était constatée que par le téléphone
-- du membre, dans synchronizeSubscriptionHistory. Un membre qui n'ouvre plus
-- l'application conserve donc indéfiniment en base un PASS « active » et le
-- rôle « prime », ce qui lui laisse l'accès au contenu Loop Prime via
-- is_prime_member() alors qu'il ne paie plus.
--
-- Cette migration déplace la règle côté base, en reproduisant exactement le
-- comportement du client pour que les deux ne se contredisent jamais :
--   1. les PASS actifs ou suspendus dont l'échéance est passée deviennent
--      « expired », sauf les PASS Heritage qui n'expirent jamais ;
--   2. si plus aucun PASS n'occupe le créneau Prime, le plus ancien PASS en
--      attente démarre, avec une échéance recalculée depuis sa périodicité ;
--   3. les comptes « prime » qui n'ont plus aucun PASS actif redescendent en
--      « member » ;
--   4. les membres concernés reçoivent une notification.
--
-- Prudence sur l'étape 3 : seuls les comptes possédant au moins une ligne dans
-- user_pass_grants sont concernés. Un compte passé en Prime à la main par
-- l'administration, sans octroi correspondant, n'est jamais rétrogradé.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. PASS perpétuels (Heritage) — miroir exact de isHeritagePass côté mobile
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pass_grant_never_expires(
  p_pass_kind TEXT,
  p_label TEXT,
  p_payment_method TEXT,
  p_amount_gnf INTEGER,
  p_frozen_pass_snapshot JSONB,
  p_pass_catalog_id TEXT,
  p_granted_by UUID
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    -- Un PASS gelé par bascule de rôle n'est jamais un Heritage.
    p_frozen_pass_snapshot IS NULL
    AND COALESCE(p_pass_catalog_id, '') !~* 'intermediaire'
    AND NOT (COALESCE(p_label, '') ~* 'interm[eé]diaire' AND p_granted_by IS NOT NULL)
    AND COALESCE(p_pass_kind, '') <> 'intermediate'
    -- Un PASS payé n'est jamais perpétuel.
    AND NULLIF(trim(COALESCE(p_payment_method, '')), '') IS NULL
    AND COALESCE(p_amount_gnf, 0) <= 0
    AND (
      COALESCE(p_pass_kind, '') IN ('heritage', 'bonus')
      OR COALESCE(p_label, '') ~* 'heritage'
      OR COALESCE(p_label, '') ~* 'affinit'
      OR (COALESCE(p_label, '') ~* 'bonus' AND COALESCE(p_label, '') ~* 'pass')
    );
$$;

COMMENT ON FUNCTION public.pass_grant_never_expires(
  TEXT, TEXT, TEXT, INTEGER, JSONB, TEXT, UUID
) IS
  'Vrai pour un PASS Heritage, qui ne doit jamais être expiré par date. '
  'Reproduit isHeritagePass du client mobile.';

-- -----------------------------------------------------------------------------
-- 2. La tâche d'expiration
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expire_due_pass_grants(p_limit INTEGER DEFAULT 500)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_expired INTEGER := 0;
  v_activated INTEGER := 0;
  v_demoted INTEGER := 0;
  v_expired_users UUID[] := ARRAY[]::UUID[];
  v_notified_users UUID[] := ARRAY[]::UUID[];
  r RECORD;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden: tâche réservée au serveur'
      USING ERRCODE = '42501';
  END IF;

  -- 1. Échéances dépassées ---------------------------------------------------
  WITH due AS (
    SELECT g.id
    FROM public.user_pass_grants g
    WHERE g.status IN ('active', 'suspended')
      AND g.expires_at IS NOT NULL
      AND g.expires_at <= v_now
      AND NOT public.pass_grant_never_expires(
        g.pass_kind, g.label, g.payment_method, g.amount_gnf,
        g.frozen_pass_snapshot, g.pass_catalog_id, g.granted_by
      )
    ORDER BY g.expires_at
    LIMIT p_limit
  ),
  updated AS (
    UPDATE public.user_pass_grants g
    SET status = 'expired', updated_at = v_now
    FROM due
    WHERE g.id = due.id
    RETURNING g.user_id
  )
  SELECT COUNT(*)::INTEGER, COALESCE(ARRAY_AGG(DISTINCT user_id), ARRAY[]::UUID[])
  INTO v_expired, v_expired_users
  FROM updated;

  -- 2. Démarrage du PASS suivant dans la file --------------------------------
  FOR r IN
    SELECT DISTINCT ON (p.user_id)
      p.id,
      p.user_id,
      COALESCE(NULLIF(trim(p.billing_period), ''), 'monthly') AS period
    FROM public.user_pass_grants p
    WHERE p.status = 'pending'
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_pass_grants h
        WHERE h.user_id = p.user_id
          AND h.status IN ('active', 'suspended')
          AND (h.expires_at IS NULL OR h.expires_at > v_now)
      )
    ORDER BY p.user_id, COALESCE(p.paid_at, p.started_at)
    LIMIT p_limit
  LOOP
    UPDATE public.user_pass_grants g
    SET status = 'active',
        started_at = v_now,
        expires_at = CASE r.period
          WHEN 'monthly' THEN v_now + INTERVAL '1 month'
          WHEN 'quarterly' THEN v_now + INTERVAL '3 months'
          WHEN 'annual' THEN v_now + INTERVAL '1 year'
          WHEN 'lifetime' THEN NULL
          ELSE v_now + INTERVAL '1 month'
        END,
        scheduled_start_at = NULL,
        pass_kind = CASE WHEN g.pass_kind = 'intermediate' THEN 'standard' ELSE g.pass_kind END,
        updated_at = v_now
    WHERE g.id = r.id;

    v_activated := v_activated + 1;
  END LOOP;

  -- 3. Retour au rôle « member » quand plus aucun PASS n'est actif -----------
  WITH demoted AS (
    UPDATE public.users u
    SET user_role = 'member', updated_at = v_now
    WHERE u.user_role = 'prime'
      AND EXISTS (
        SELECT 1 FROM public.user_pass_grants g WHERE g.user_id = u.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_pass_grants g
        WHERE g.user_id = u.id
          AND g.status = 'active'
          AND (g.expires_at IS NULL OR g.expires_at > v_now)
      )
    RETURNING u.id
  )
  SELECT COUNT(*)::INTEGER INTO v_demoted FROM demoted;

  -- 4. Information du membre --------------------------------------------------
  WITH concerned AS (
    SELECT DISTINCT e.id
    FROM unnest(v_expired_users) AS e(id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.user_pass_grants g
      WHERE g.user_id = e.id
        AND g.status = 'active'
        AND (g.expires_at IS NULL OR g.expires_at > v_now)
    )
  ),
  inserted AS (
    INSERT INTO public.user_notifications (user_id, title, message, audience, sent_at)
    SELECT
      c.id,
      'Votre PASS Loop Prime a expiré',
      'Votre abonnement est arrivé à échéance. Renouvelez-le depuis l''onglet '
        || 'Abonnement pour retrouver l''accès aux contenus et avantages Loop Prime.',
      'individual',
      v_now
    FROM concerned c
    RETURNING user_id
  )
  SELECT COALESCE(ARRAY_AGG(user_id), ARRAY[]::UUID[])
  INTO v_notified_users
  FROM inserted;

  RETURN jsonb_build_object(
    'ranAt', v_now,
    'expiredGrants', v_expired,
    'activatedGrants', v_activated,
    'demotedUsers', v_demoted,
    'notifiedUsers', COALESCE(array_length(v_notified_users, 1), 0),
    'notifiedUserIds', to_jsonb(v_notified_users)
  );
END;
$$;

COMMENT ON FUNCTION public.expire_due_pass_grants(INTEGER) IS
  'Tâche planifiée : expire les PASS échus, démarre le PASS suivant en file, '
  'rétrograde les comptes sans PASS actif et notifie les membres concernés.';

REVOKE ALL ON FUNCTION public.expire_due_pass_grants(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_due_pass_grants(INTEGER) TO service_role, authenticated;
