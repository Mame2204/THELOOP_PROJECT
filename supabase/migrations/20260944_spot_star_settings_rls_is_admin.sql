-- Fix RLS spot_star_settings / tiers : super_admin pouvait pas enregistrer (policy limitée à user_role = 'admin')

DROP POLICY IF EXISTS "spot_star_settings_admin_write" ON public.spot_star_settings;
CREATE POLICY "spot_star_settings_admin_write" ON public.spot_star_settings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "spot_star_tiers_admin_write" ON public.spot_star_tiers;
CREATE POLICY "spot_star_tiers_admin_write" ON public.spot_star_tiers
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "spot_star_calc_runs_admin" ON public.spot_star_calc_runs;
CREATE POLICY "spot_star_calc_runs_admin" ON public.spot_star_calc_runs
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
