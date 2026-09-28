-- 20260958 — PASS : intégrité de la vente (audit avant ouverture de l'achat)
--
--   1. fulfill_djomy_pass_payment : réservée au serveur de paiement. La migration
--      20260874 l'avait rouverte à tous les comptes connectés, et elle ne vérifie
--      pas l'appelant : un membre pouvait s'octroyer un PASS à vie. Elle devient
--      aussi sans effet sur un PASS déjà livré (plus d'écrasement actif → file).
--   2. fulfill_payment_intent : livraison atomique d'une commande payée. Verrou
--      sur la commande et sur le compte, calcul actif / file en SQL, écriture du
--      PASS et clôture de la commande dans la même transaction. Le webhook, le
--      polling de l'app et la tâche de réconciliation peuvent se croiser sans
--      doublon ni PASS repassé en file.
--   3. user_pass_grants, écritures depuis la session d'un membre (via les RPC
--      upsert_user_pass_purchase / upsert_user_pass_grant_admin /
--      bulk_update_user_pass_grants) :
--        - création limitée aux lignes « expired » (le gel de rôle ne crée rien
--          d'autre côté membre) ;
--        - une ligne « pending » (PASS payé en file) n'est plus modifiable ;
--        - période, libellé, catalogue, type, origine et paiement figés ;
--        - réactivation seulement depuis « suspended » / « revoked » non échu.
--      La tâche pg_cron active toute ligne « pending » : sans ce verrou, un membre
--      pouvait créer une ligne « pending » à vie et la faire activer.
--      Le parrainage (apply_referral_rewards_for) reste autorisé : sa ligne
--      referral_rewards, écrite dans la même transaction, en fait la preuve
--      (table en lecture seule pour les membres).
--      local_id est désormais toujours renseigné (= id à défaut) : l'app s'en
--      sert pour retrouver la ligne lors du gel de rôle.
--   4. Tâche d'expiration : le message n'invite à racheter un PASS que si
--      l'achat est ouvert.
--
-- Relançable. À appliquer après 20260956 et 20260957, puis redéployer le
-- serveur de paiement (il appelle fulfill_payment_intent).

-- -----------------------------------------------------------------------------
-- 1. fulfill_djomy_pass_payment : serveur uniquement, idempotente
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fulfill_djomy_pass_payment(
  p_user_id UUID,
  p_local_pass_id TEXT,
  p_pass_catalog_id TEXT,
  p_label TEXT,
  p_status TEXT,
  p_started_at TIMESTAMPTZ,
  p_expires_at TIMESTAMPTZ,
  p_amount_gnf INTEGER,
  p_payment_method TEXT,
  p_paid_at TIMESTAMPTZ,
  p_billing_period TEXT,
  p_scheduled_start_at TIMESTAMPTZ,
  p_promote_prime BOOLEAN,
  p_djomy_transaction_id TEXT,
  p_merchant_reference TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_current_role TEXT;
  v_local TEXT := NULLIF(trim(COALESCE(p_local_pass_id, '')), '');
BEGIN
  IF COALESCE(auth.role(), '') IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'forbidden: réservé au serveur de paiement' USING ERRCODE = '42501';
  END IF;

  IF v_local IS NULL THEN
    RAISE EXCEPTION 'local_pass_id requis';
  END IF;

  IF p_status NOT IN ('active', 'pending') THEN
    RAISE EXCEPTION 'Statut PASS invalide : %', p_status;
  END IF;

  SELECT g.id INTO v_id FROM public.user_pass_grants g WHERE g.local_id = v_local;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.user_pass_grants (
    user_id, pass_catalog_id, label, pass_kind, status,
    started_at, expires_at, granted_by, grant_note, local_id,
    amount_gnf, payment_method, paid_at, billing_period, scheduled_start_at,
    updated_at
  ) VALUES (
    p_user_id, p_pass_catalog_id, p_label, 'custom', p_status,
    p_started_at, p_expires_at, NULL,
    'djomy:' || COALESCE(p_djomy_transaction_id, '') || '|' || COALESCE(p_merchant_reference, ''),
    v_local,
    p_amount_gnf,
    NULLIF(trim(COALESCE(p_payment_method, '')), ''),
    p_paid_at,
    NULLIF(trim(COALESCE(p_billing_period, '')), ''),
    p_scheduled_start_at,
    NOW()
  )
  ON CONFLICT (local_id) WHERE local_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT g.id INTO v_id FROM public.user_pass_grants g WHERE g.local_id = v_local;
    RETURN v_id;
  END IF;

  IF p_promote_prime AND p_status = 'active' THEN
    SELECT user_role INTO v_current_role FROM public.users WHERE id = p_user_id LIMIT 1;
    IF v_current_role IS NOT NULL
       AND v_current_role NOT IN ('admin', 'super_admin', 'partner') THEN
      UPDATE public.users
      SET user_role = 'prime', prime_role_locked = FALSE, updated_at = NOW()
      WHERE id = p_user_id
        AND user_role NOT IN ('admin', 'super_admin', 'partner');
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_djomy_pass_payment(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fulfill_djomy_pass_payment(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_djomy_pass_payment(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT
) TO service_role;

-- -----------------------------------------------------------------------------
-- 2. Livraison atomique d'une commande payée
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._pass_period_end(p_period TEXT, p_from TIMESTAMPTZ)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_period
    WHEN 'monthly' THEN p_from + INTERVAL '1 month'
    WHEN 'quarterly' THEN p_from + INTERVAL '3 months'
    WHEN 'annual' THEN p_from + INTERVAL '1 year'
    WHEN 'lifetime' THEN NULL
    ELSE p_from + INTERVAL '1 month'
  END;
$$;

REVOKE ALL ON FUNCTION public._pass_period_end(TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._pass_period_end(TEXT, TIMESTAMPTZ) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.fulfill_payment_intent(
  p_intent_id UUID,
  p_transaction_id TEXT,
  p_paid_amount INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_intent public.payment_intents%ROWTYPE;
  v_grant public.user_pass_grants%ROWTYPE;
  v_active public.user_pass_grants%ROWTYPE;
  v_pending RECORD;
  v_status TEXT;
  v_expires TIMESTAMPTZ;
  v_scheduled TIMESTAMPTZ;
  v_cursor TIMESTAMPTZ;
  v_role TEXT;
  v_tx TEXT := NULLIF(trim(COALESCE(p_transaction_id, '')), '');
BEGIN
  IF COALESCE(auth.role(), '') IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'forbidden: réservé au serveur de paiement' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_intent FROM public.payment_intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'intent_not_found';
  END IF;

  IF v_intent.fulfillment_status = 'fulfilled' THEN
    SELECT * INTO v_grant FROM public.user_pass_grants WHERE local_id = v_intent.local_pass_id;
    RETURN jsonb_build_object(
      'already', TRUE,
      'pass_status', COALESCE(v_intent.pass_grant_status, v_grant.status),
      'expires_at', v_grant.expires_at,
      'scheduled_start_at', v_grant.scheduled_start_at
    );
  END IF;

  IF p_paid_amount IS NULL OR p_paid_amount < v_intent.amount_gnf THEN
    RAISE EXCEPTION 'amount_insufficient: % < %', p_paid_amount, v_intent.amount_gnf;
  END IF;

  -- Sérialise les achats d'un même compte (deux commandes payées en parallèle).
  PERFORM 1 FROM public.users WHERE id = v_intent.user_id FOR UPDATE;

  SELECT * INTO v_grant FROM public.user_pass_grants WHERE local_id = v_intent.local_pass_id;

  IF v_grant.id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.user_pass_grants g
      WHERE g.user_id = v_intent.user_id
        AND g.status = 'active'
        AND (
          g.expires_at IS NULL
          OR public.pass_grant_never_expires(
            g.pass_kind, g.label, g.payment_method, g.amount_gnf,
            g.frozen_pass_snapshot, g.pass_catalog_id, g.granted_by
          )
        )
    ) THEN
      RAISE EXCEPTION 'lifetime_active';
    END IF;

    SELECT * INTO v_active
    FROM public.user_pass_grants g
    WHERE g.user_id = v_intent.user_id
      AND g.status = 'active'
      AND g.expires_at > v_now
    ORDER BY g.expires_at DESC
    LIMIT 1;

    IF EXISTS (
      SELECT 1 FROM public.user_pass_grants g
      WHERE g.user_id = v_intent.user_id
        AND g.status = 'pending'
        AND g.billing_period = 'lifetime'
    ) THEN
      RAISE EXCEPTION 'lifetime_queued';
    END IF;

    IF v_active.id IS NULL THEN
      v_status := 'active';
      v_expires := public._pass_period_end(v_intent.billing_period, v_now);
      v_scheduled := NULL;
    ELSE
      -- Une commande payée n'est jamais refusée pour file pleine : elle se range.
      v_status := 'pending';
      v_expires := NULL;
      v_cursor := v_active.expires_at;
      FOR v_pending IN
        SELECT g.billing_period, g.scheduled_start_at
        FROM public.user_pass_grants g
        WHERE g.user_id = v_intent.user_id AND g.status = 'pending'
        ORDER BY COALESCE(g.paid_at, g.started_at) ASC
      LOOP
        v_cursor := public._pass_period_end(
          COALESCE(v_pending.billing_period, 'monthly'),
          GREATEST(v_cursor, COALESCE(v_pending.scheduled_start_at, v_cursor))
        );
      END LOOP;
      v_scheduled := v_cursor;
    END IF;

    INSERT INTO public.user_pass_grants (
      user_id, pass_catalog_id, label, pass_kind, status,
      started_at, expires_at, granted_by, grant_note, local_id,
      amount_gnf, payment_method, paid_at, billing_period, scheduled_start_at,
      updated_at
    ) VALUES (
      v_intent.user_id,
      'prime-' || v_intent.billing_period,
      CASE v_intent.billing_period
        WHEN 'monthly' THEN 'PASS mensuel'
        WHEN 'quarterly' THEN 'PASS trimestriel'
        WHEN 'annual' THEN 'PASS annuel'
        ELSE 'PASS à vie'
      END,
      'custom',
      v_status,
      v_now,
      v_expires,
      NULL,
      'djomy:' || COALESCE(v_tx, v_intent.djomy_transaction_id, '') || '|' || v_intent.merchant_reference,
      v_intent.local_pass_id,
      v_intent.amount_gnf,
      NULLIF(trim(COALESCE(v_intent.payment_method, '')), ''),
      v_now,
      v_intent.billing_period,
      v_scheduled,
      v_now
    )
    RETURNING * INTO v_grant;

    IF v_status = 'active' THEN
      SELECT user_role INTO v_role FROM public.users WHERE id = v_intent.user_id;
      IF v_role IS NOT NULL AND v_role NOT IN ('admin', 'super_admin', 'partner') THEN
        UPDATE public.users
        SET user_role = 'prime', prime_role_locked = FALSE, updated_at = v_now
        WHERE id = v_intent.user_id
          AND user_role NOT IN ('admin', 'super_admin', 'partner');
      END IF;
    END IF;
  END IF;

  UPDATE public.payment_intents
  SET status = 'paid',
      fulfillment_status = 'fulfilled',
      pass_grant_status = CASE WHEN v_grant.status IN ('active', 'pending') THEN v_grant.status ELSE 'active' END,
      djomy_transaction_id = COALESCE(v_tx, djomy_transaction_id),
      djomy_paid_amount = p_paid_amount,
      paid_at = COALESCE(paid_at, v_now),
      updated_at = v_now
  WHERE id = v_intent.id;

  RETURN jsonb_build_object(
    'already', FALSE,
    'pass_status', v_grant.status,
    'expires_at', v_grant.expires_at,
    'scheduled_start_at', v_grant.scheduled_start_at
  );
END;
$$;

COMMENT ON FUNCTION public.fulfill_payment_intent(UUID, TEXT, INTEGER) IS
  'Livraison atomique d''une commande PASS payée (serveur de paiement uniquement). '
  'Idempotente : un second appel renvoie already = true sans rien écrire.';

REVOKE ALL ON FUNCTION public.fulfill_payment_intent(UUID, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fulfill_payment_intent(UUID, TEXT, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_payment_intent(UUID, TEXT, INTEGER) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Écritures membre sur user_pass_grants
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_user_pass_grants_guard_self()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- L'app identifie un PASS par local_id, à défaut par id : les deux doivent
  -- coïncider pour que ses écritures retombent sur la ligne existante.
  IF TG_OP = 'INSERT' AND NEW.local_id IS NULL THEN
    NEW.local_id := NEW.id::text;
  END IF;

  IF COALESCE(auth.role(), '') <> 'authenticated' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Récompense parrainage écrite par apply_referral_rewards_for dans cette
  -- transaction ; elle part souvent de la session du filleul, pas du parrain.
  IF NEW.pass_kind = 'referral'
     AND NEW.pass_catalog_id = 'pass-parrainage-builtin'
     AND EXISTS (
       SELECT 1 FROM public.referral_rewards rr
       WHERE rr.referrer_user_id = NEW.user_id
         AND rr.created_at = NOW()
     )
  THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS DISTINCT FROM NEW.user_id
     OR (TG_OP = 'UPDATE' AND auth.uid() IS DISTINCT FROM OLD.user_id)
  THEN
    RAISE EXCEPTION 'forbidden: PASS d''un autre compte' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- INSERT … ON CONFLICT sur une ligne existante : la branche UPDATE applique les règles.
    IF NEW.local_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_pass_grants g WHERE g.local_id = NEW.local_id
    ) THEN
      RETURN NEW;
    END IF;

    IF NEW.status <> 'expired' THEN
      RAISE EXCEPTION 'forbidden: création de PASS réservée au serveur de paiement et à l''administration'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- PASS payé en file : seul le serveur (ou pg_cron) le fait avancer.
  IF OLD.status = 'pending' THEN
    RETURN OLD;
  END IF;

  NEW.user_id := OLD.user_id;
  NEW.local_id := OLD.local_id;
  NEW.pass_catalog_id := OLD.pass_catalog_id;
  NEW.label := OLD.label;
  NEW.billing_period := OLD.billing_period;
  NEW.granted_by := OLD.granted_by;
  NEW.grant_note := OLD.grant_note;
  NEW.started_at := OLD.started_at;
  NEW.scheduled_start_at := OLD.scheduled_start_at;
  NEW.amount_gnf := OLD.amount_gnf;
  NEW.payment_method := OLD.payment_method;
  NEW.paid_at := OLD.paid_at;

  IF NOT (OLD.pass_kind = 'intermediate' AND NEW.pass_kind = 'standard') THEN
    NEW.pass_kind := OLD.pass_kind;
  END IF;

  IF OLD.expires_at IS NOT NULL
     AND (NEW.expires_at IS NULL OR NEW.expires_at > OLD.expires_at)
  THEN
    NEW.expires_at := OLD.expires_at;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'active' THEN
      IF OLD.status NOT IN ('suspended', 'revoked')
         OR (OLD.expires_at IS NOT NULL AND OLD.expires_at <= NOW())
      THEN
        NEW.status := OLD.status;
      END IF;
    ELSIF NEW.status NOT IN ('suspended', 'revoked', 'expired') THEN
      NEW.status := OLD.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_user_pass_grants_guard_self() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_user_pass_grants_guard_self() FROM anon, authenticated;

UPDATE public.user_pass_grants SET local_id = id::text WHERE local_id IS NULL;

DROP TRIGGER IF EXISTS trg_user_pass_grants_guard_self ON public.user_pass_grants;
CREATE TRIGGER trg_user_pass_grants_guard_self
  BEFORE INSERT OR UPDATE ON public.user_pass_grants
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_user_pass_grants_guard_self();

-- -----------------------------------------------------------------------------
-- 4. Tâche d'expiration : pas d'invitation à racheter quand la vente est fermée
-- -----------------------------------------------------------------------------
-- Corps identique à 20260933, seul le message d'expiration dépend de
-- l'interrupteur « Achat PASS » (app_settings.app_gates.passPurchaseEnabled).

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
  v_purchase_open BOOLEAN := COALESCE((
    SELECT (s.value ->> 'passPurchaseEnabled')::BOOLEAN
    FROM public.app_settings s
    WHERE s.key = 'app_gates' AND jsonb_typeof(s.value) = 'object'
  ), FALSE);
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
      CASE WHEN v_purchase_open THEN
        'Votre abonnement est arrivé à échéance. Renouvelez-le depuis l''onglet '
          || 'Abonnement pour retrouver l''accès aux contenus et avantages Loop Prime.'
      ELSE
        'Votre PASS est arrivé à échéance : les contenus et avantages Loop Prime '
          || 'ne sont plus accessibles sur votre compte.'
      END,
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

REVOKE ALL ON FUNCTION public.expire_due_pass_grants_internal(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_due_pass_grants_internal(INTEGER) FROM anon, authenticated, service_role;
