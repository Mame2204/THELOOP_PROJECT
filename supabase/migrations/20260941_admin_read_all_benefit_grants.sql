-- Insights / suivi admin : restaurer la lecture de tous les octrois pour is_admin().
-- (20260730 n'avait laissé que user_id = auth.uid(), ce qui vide les KPI Insights sans RPC analytics.)

DROP POLICY IF EXISTS "Users read own benefit grants" ON public.prime_benefit_grants;

CREATE POLICY "Users read own benefit grants"
  ON public.prime_benefit_grants FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

COMMENT ON POLICY "Users read own benefit grants" ON public.prime_benefit_grants IS
  'Membre : ses octrois · Admin : tous (Insights, suivi, modération).';
