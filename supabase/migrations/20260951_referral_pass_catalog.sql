-- PASS Parrainage (catalogue builtin) + octroi RPC aligné (pass_kind referral, dates au déclenchement)

UPDATE public.user_pass_grants
SET
  pass_catalog_id = 'pass-parrainage-builtin',
  pass_kind = 'referral',
  updated_at = NOW()
WHERE pass_catalog_id = 'referral'
   OR (
     pass_kind = 'bonus'
     AND (
       COALESCE(grant_note, '') ILIKE '%parrainage%'
       OR COALESCE(label, '') ILIKE '%parrainage%'
     )
   );

CREATE OR REPLACE FUNCTION public.apply_referral_rewards_for(p_referrer_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_role TEXT;
  v_locked BOOLEAN;
  v_per_reward INTEGER;
  v_reward_months INTEGER;
  v_max_year INTEGER;
  v_year INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
  v_ref_count INTEGER;
  v_months_already INTEGER;
  v_reward_rows INTEGER;
  v_earned INTEGER;
  v_new_rewards INTEGER;
  v_months INTEGER;
  v_started_at TIMESTAMPTZ := NOW();
  v_base_expires TIMESTAMPTZ;
  v_new_expires TIMESTAMPTZ;
  v_label TEXT;
  v_local_id TEXT;
  v_is_referred BOOLEAN;
  v_catalog_label TEXT := 'PASS Parrainage';
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF p_referrer_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.referrals r
    WHERE r.referrer_user_id = p_referrer_id
      AND r.referred_user_id = v_caller
  ) INTO v_is_referred;

  IF v_caller <> p_referrer_id
     AND NOT v_is_referred
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT u.user_role, COALESCE(u.prime_role_locked, FALSE)
  INTO v_role, v_locked
  FROM public.users u
  WHERE u.id = p_referrer_id
  LIMIT 1;

  IF v_role IS NULL THEN
    RETURN 0;
  END IF;

  IF v_role IN ('admin', 'super_admin', 'partner') THEN
    RETURN 0;
  END IF;

  IF v_locked THEN
    RETURN 0;
  END IF;

  SELECT
    s.referrals_per_reward,
    s.reward_months,
    s.max_reward_months_per_year
  INTO v_per_reward, v_reward_months, v_max_year
  FROM public.referral_settings s
  WHERE s.id = 1;

  IF v_per_reward IS NULL OR v_per_reward <= 0 OR v_reward_months IS NULL OR v_reward_months <= 0 THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_ref_count
  FROM public.referrals r
  WHERE r.referrer_user_id = p_referrer_id
    AND EXTRACT(YEAR FROM r.created_at) = v_year;

  SELECT
    COALESCE(SUM(rr.months_granted), 0)::INTEGER,
    COUNT(*)::INTEGER
  INTO v_months_already, v_reward_rows
  FROM public.referral_rewards rr
  WHERE rr.referrer_user_id = p_referrer_id
    AND rr.reward_year = v_year;

  IF v_months_already >= COALESCE(v_max_year, 5) THEN
    RETURN 0;
  END IF;

  v_earned := FLOOR(v_ref_count::NUMERIC / v_per_reward::NUMERIC)::INTEGER;
  v_new_rewards := v_earned - v_reward_rows;
  IF v_new_rewards <= 0 THEN
    RETURN 0;
  END IF;

  v_months := LEAST(v_reward_months * v_new_rewards, COALESCE(v_max_year, 5) - v_months_already);
  IF v_months <= 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO public.referral_rewards (
    referrer_user_id,
    reward_year,
    months_granted,
    referrals_count
  ) VALUES (
    p_referrer_id,
    v_year,
    v_months,
    v_ref_count
  );

  SELECT MAX(g.expires_at)
  INTO v_base_expires
  FROM public.user_pass_grants g
  WHERE g.user_id = p_referrer_id
    AND g.status = 'active'
    AND (g.expires_at IS NULL OR g.expires_at > NOW());

  IF v_base_expires IS NOT NULL AND v_base_expires > NOW() THEN
    v_new_expires := v_base_expires + make_interval(months => v_months);
  ELSE
    v_new_expires := v_started_at + make_interval(months => v_months);
  END IF;

  v_label := format('%s (%s mois offerts)', v_catalog_label, v_months);
  v_local_id := format('referral-%s-%s-%s', p_referrer_id, v_year, v_ref_count);

  INSERT INTO public.user_pass_grants (
    user_id,
    pass_catalog_id,
    label,
    pass_kind,
    status,
    started_at,
    expires_at,
    granted_by,
    grant_note,
    local_id,
    updated_at
  ) VALUES (
    p_referrer_id,
    'pass-parrainage-builtin',
    v_label,
    'referral',
    'active',
    v_started_at,
    v_new_expires,
    NULL,
    'Octroi parrainage automatique',
    v_local_id,
    NOW()
  )
  ON CONFLICT (local_id) WHERE local_id IS NOT NULL DO UPDATE SET
    pass_catalog_id = EXCLUDED.pass_catalog_id,
    pass_kind = EXCLUDED.pass_kind,
    label = EXCLUDED.label,
    status = 'active',
    started_at = EXCLUDED.started_at,
    expires_at = EXCLUDED.expires_at,
    grant_note = EXCLUDED.grant_note,
    updated_at = NOW();

  UPDATE public.users
  SET user_role = 'prime',
      prime_role_locked = FALSE,
      updated_at = NOW()
  WHERE id = p_referrer_id
    AND user_role NOT IN ('admin', 'super_admin', 'partner');

  INSERT INTO public.user_notifications (user_id, title, message, audience)
  VALUES (
    p_referrer_id,
    'Récompense parrainage',
    CASE
      WHEN v_months = 1 THEN 'Bravo ! Vous avez gagné 1 mois de Loop Prime grâce à vos filleuls.'
      ELSE format('Bravo ! Vous avez gagné %s mois de Loop Prime grâce à vos filleuls.', v_months)
    END,
    'individual'
  );

  RETURN v_months;
END;
$$;

COMMENT ON FUNCTION public.apply_referral_rewards_for(UUID) IS
  'Octroie PASS Parrainage (pass-parrainage-builtin) : début = NOW(), fin = début + mois gagnés (ou extension).';
