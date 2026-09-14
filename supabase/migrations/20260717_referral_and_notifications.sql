-- THE LOOP — Parrainage + notifications (paramètres modifiables)
-- Exécuter dans Supabase SQL Editor

-- -----------------------------------------------------------------------------
-- 1. Paramètres parrainage (modifiables sans redéploiement app)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referral_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  referrals_per_reward INTEGER NOT NULL DEFAULT 10 CHECK (referrals_per_reward > 0),
  reward_months INTEGER NOT NULL DEFAULT 1 CHECK (reward_months > 0),
  max_reward_months_per_year INTEGER NOT NULL DEFAULT 3 CHECK (max_reward_months_per_year > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.referral_settings (id, referrals_per_reward, reward_months, max_reward_months_per_year)
VALUES (1, 10, 1, 3)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Codes et filleuls
-- -----------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referral_code TEXT,
  ADD COLUMN IF NOT EXISTS referred_by_code TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE;

CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_unique
  ON public.users (referral_code)
  WHERE referral_code IS NOT NULL AND referral_code <> '';

CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reward_year INTEGER NOT NULL,
  months_granted INTEGER NOT NULL CHECK (months_granted > 0),
  referrals_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3. Notifications utilisateur (push / inbox)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'individual',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON public.user_notifications(user_id, sent_at DESC);

ALTER TABLE public.referral_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read referral settings" ON public.referral_settings;
CREATE POLICY "Public read referral settings"
  ON public.referral_settings FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Users read own notifications" ON public.user_notifications;
CREATE POLICY "Users read own notifications"
  ON public.user_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own notifications read" ON public.user_notifications;
CREATE POLICY "Users update own notifications read"
  ON public.user_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
