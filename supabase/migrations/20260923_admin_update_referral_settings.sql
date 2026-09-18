-- RPC admin : mise à jour des paramètres parrainage (referral_settings)

CREATE OR REPLACE FUNCTION public.admin_update_referral_settings(
  p_referrals_per_reward INTEGER,
  p_reward_months INTEGER,
  p_max_reward_months_per_year INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.referral_settings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  IF p_referrals_per_reward IS NULL OR p_referrals_per_reward <= 0 THEN
    RAISE EXCEPTION 'invalid_referrals_per_reward';
  END IF;

  IF p_reward_months IS NULL OR p_reward_months <= 0 THEN
    RAISE EXCEPTION 'invalid_reward_months';
  END IF;

  IF p_max_reward_months_per_year IS NULL OR p_max_reward_months_per_year <= 0 THEN
    RAISE EXCEPTION 'invalid_max_reward_months_per_year';
  END IF;

  INSERT INTO public.referral_settings (
    id,
    referrals_per_reward,
    reward_months,
    max_reward_months_per_year,
    updated_at
  )
  VALUES (
    1,
    p_referrals_per_reward,
    p_reward_months,
    p_max_reward_months_per_year,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
    SET referrals_per_reward = EXCLUDED.referrals_per_reward,
        reward_months = EXCLUDED.reward_months,
        max_reward_months_per_year = EXCLUDED.max_reward_months_per_year,
        updated_at = NOW()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'referrals_per_reward', v_row.referrals_per_reward,
    'reward_months', v_row.reward_months,
    'max_reward_months_per_year', v_row.max_reward_months_per_year,
    'updated_at', v_row.updated_at
  );
END;
$$;

COMMENT ON FUNCTION public.admin_update_referral_settings(INTEGER, INTEGER, INTEGER) IS
  'Met à jour les paramètres parrainage (admin uniquement).';

REVOKE ALL ON FUNCTION public.admin_update_referral_settings(INTEGER, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_referral_settings(INTEGER, INTEGER, INTEGER) TO authenticated;
