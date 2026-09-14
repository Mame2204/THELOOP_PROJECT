/**
 * Autorise l'enregistrement du parrainage côté membre authentifié.
 * Objectif: cohérence multi-appareils (plus de dépendance locale AsyncStorage).
 */

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own referral" ON public.referrals;
CREATE POLICY "Users insert own referral"
  ON public.referrals FOR INSERT TO authenticated
  WITH CHECK (
    referred_user_id = auth.uid()
    AND referrer_user_id <> auth.uid()
  );

