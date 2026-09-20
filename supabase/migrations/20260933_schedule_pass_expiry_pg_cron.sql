-- =============================================================================
-- 20260933 — Planifier l'expiration des PASS dans Postgres
-- =============================================================================
-- La migration 20260931 a bien déplacé la règle d'expiration côté base, mais son
-- déclenchement restait suspendu au serveur Node hébergé sur Render. Or l'offre
-- gratuite met le service en sommeil après quinze minutes d'inactivité : la
-- tâche ne s'exécutait donc pas de façon fiable, et un membre dont le PASS est
-- échu pouvait conserver son rôle « prime » indéfiniment.
--
-- On confie désormais le déclenchement à pg_cron, à l'intérieur de la base.
-- L'expiration devient ainsi indépendante de l'état du serveur.
--
-- Obstacle levé ici : expire_due_pass_grants() exige un appelant « service_role »
-- ou admin. Une tâche pg_cron s'exécute sans jeton JWT, auth.role() y est donc
-- nul et la fonction lèverait une exception. Plutôt que d'affaiblir ce contrôle,
-- le corps est déplacé dans une fonction interne qui n'est accessible à aucun
-- rôle exposé par l'API, et la fonction publique conserve son garde-fou puis
-- délègue. Les appels existants du serveur et de la console admin sont donc
-- inchangés.
--
-- Cohabitation : le serveur continue d'appeler expire_due_pass_grants() quand il
-- est éveillé. La fonction n'agit que sur les lignes échues, la double exécution
-- est donc sans effet — pg_cron garantit le traitement en base, le serveur y
-- ajoute les notifications push quand il tourne.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Corps de la tâche, sans contrôle d'appelant
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expire_due_pass_grants_internal(p_limit INTEGER DEFAULT 500)
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

COMMENT ON FUNCTION public.expire_due_pass_grants_internal(INTEGER) IS
  'Corps de la tâche d''expiration, sans contrôle d''appelant. Réservé à pg_cron '
  'et au propriétaire de la base : aucun rôle exposé par l''API ne peut l''exécuter.';

-- Aucun GRANT : ni anon, ni authenticated, ni service_role n'y ont accès.
-- Seul le propriétaire (postgres), sous lequel tourne pg_cron, peut l'appeler.
REVOKE ALL ON FUNCTION public.expire_due_pass_grants_internal(INTEGER) FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 2. La fonction publique garde son garde-fou et délègue
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expire_due_pass_grants(p_limit INTEGER DEFAULT 500)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden: tâche réservée au serveur'
      USING ERRCODE = '42501';
  END IF;

  RETURN public.expire_due_pass_grants_internal(p_limit);
END;
$$;

COMMENT ON FUNCTION public.expire_due_pass_grants(INTEGER) IS
  'Point d''entrée serveur et admin de la tâche d''expiration. Contrôle '
  'l''appelant puis délègue à expire_due_pass_grants_internal.';

REVOKE ALL ON FUNCTION public.expire_due_pass_grants(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_due_pass_grants(INTEGER) TO service_role, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Planification
-- -----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Rejouable : on retire la tâche existante avant de la replanifier.
DO $do$
BEGIN
  PERFORM cron.unschedule('theloop-expire-pass-grants');
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
$do$;

SELECT cron.schedule(
  'theloop-expire-pass-grants',
  '*/15 * * * *',
  $job$SELECT public.expire_due_pass_grants_internal(500)$job$
);

-- -----------------------------------------------------------------------------
-- Vérification, à lancer après la migration
-- -----------------------------------------------------------------------------
-- Tâche enregistrée et active :
--   SELECT jobid, schedule, command, active FROM cron.job
--   WHERE jobname = 'theloop-expire-pass-grants';
--
-- Historique des exécutions, une fois le premier quart d'heure écoulé :
--   SELECT status, return_message, start_time
--   FROM cron.job_run_details
--   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'theloop-expire-pass-grants')
--   ORDER BY start_time DESC LIMIT 5;
