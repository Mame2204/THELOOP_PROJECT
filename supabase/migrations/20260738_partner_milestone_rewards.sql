-- THE LOOP — Récompenses paliers partenaires (comptes / validations → à la une, push)

CREATE TABLE IF NOT EXISTS public.partner_milestone_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  metric_type TEXT NOT NULL
    CHECK (metric_type IN ('unique_members', 'validations')),
  threshold INTEGER NOT NULL CHECK (threshold > 0),
  reward_type TEXT NOT NULL
    CHECK (reward_type IN ('featured_week', 'push_once')),
  duration_days INTEGER NOT NULL DEFAULT 7 CHECK (duration_days > 0),
  validity_days INTEGER NOT NULL DEFAULT 90 CHECK (validity_days > 0),
  push_title TEXT,
  push_message TEXT,
  country_code CHAR(2) NOT NULL DEFAULT 'GN',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.partner_member_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_key TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  first_validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (partner_key, user_id)
);

CREATE INDEX IF NOT EXISTS idx_partner_member_attr_partner
  ON public.partner_member_attributions(partner_key);

CREATE TABLE IF NOT EXISTS public.partner_milestone_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.partner_milestone_rules(id) ON DELETE CASCADE,
  partner_key TEXT NOT NULL,
  partner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  partner_name TEXT NOT NULL,
  metric_type TEXT NOT NULL,
  metric_value INTEGER NOT NULL,
  reward_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'earned'
    CHECK (status IN ('earned', 'configured', 'active', 'used', 'expired')),
  content_kind TEXT CHECK (content_kind IN ('event', 'spot', 'tool')),
  content_id TEXT,
  content_title TEXT,
  duration_days INTEGER NOT NULL DEFAULT 7,
  validity_days INTEGER NOT NULL DEFAULT 90,
  push_title TEXT,
  push_message TEXT,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  selected_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  UNIQUE (partner_key, rule_id)
);

CREATE INDEX IF NOT EXISTS idx_partner_milestone_rewards_partner
  ON public.partner_milestone_rewards(partner_key, status);

CREATE OR REPLACE FUNCTION public.set_partner_milestone_rules_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partner_milestone_rules_updated_at ON public.partner_milestone_rules;
CREATE TRIGGER trg_partner_milestone_rules_updated_at
  BEFORE UPDATE ON public.partner_milestone_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_partner_milestone_rules_updated_at();

-- Règles exemple
INSERT INTO public.partner_milestone_rules (name, description, metric_type, threshold, reward_type, duration_days, push_title, push_message, sort_order)
VALUES
  (
    '50 membres validés',
    '50 comptes distincts ayant validé un avantage chez vous',
    'unique_members',
    50,
    'featured_week',
    7,
    NULL,
    NULL,
    1
  ),
  (
    '100 validations',
    '100 avantages validés via votre code partenaire',
    'validations',
    100,
    'push_once',
    7,
    'Coup de projecteur THE LOOP',
    'Découvrez notre partenaire — événement, spot ou outil mis en avant cette semaine.',
    2
  );

ALTER TABLE public.partner_milestone_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_member_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_milestone_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active milestone rules" ON public.partner_milestone_rules;
CREATE POLICY "Public read active milestone rules"
  ON public.partner_milestone_rules FOR SELECT TO anon, authenticated
  USING (is_active = TRUE);

DROP POLICY IF EXISTS "Admin manage milestone rules" ON public.partner_milestone_rules;
CREATE POLICY "Admin manage milestone rules"
  ON public.partner_milestone_rules FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Service insert member attributions" ON public.partner_member_attributions;
CREATE POLICY "Service insert member attributions"
  ON public.partner_member_attributions FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admin read member attributions" ON public.partner_member_attributions;
CREATE POLICY "Admin read member attributions"
  ON public.partner_member_attributions FOR SELECT TO authenticated
  USING (public.is_admin() OR TRUE);

DROP POLICY IF EXISTS "Partners read own rewards" ON public.partner_milestone_rewards;
CREATE POLICY "Partners read own rewards"
  ON public.partner_milestone_rewards FOR SELECT TO authenticated
  USING (partner_user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Service manage milestone rewards" ON public.partner_milestone_rewards;
CREATE POLICY "Service manage milestone rewards"
  ON public.partner_milestone_rewards FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Partners update own rewards" ON public.partner_milestone_rewards;
CREATE POLICY "Partners update own rewards"
  ON public.partner_milestone_rewards FOR UPDATE TO authenticated
  USING (partner_user_id = auth.uid() OR public.is_admin())
  WITH CHECK (partner_user_id = auth.uid() OR public.is_admin());
