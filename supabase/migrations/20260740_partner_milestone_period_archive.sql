-- THE LOOP — Paliers partenaires : période, archivage, récompenses par période

ALTER TABLE public.partner_milestone_rules
  ADD COLUMN IF NOT EXISTS period_months INTEGER NOT NULL DEFAULT 1
    CHECK (period_months IN (0, 1, 3, 6, 12)),
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.partner_milestone_rewards
  ADD COLUMN IF NOT EXISTS period_key TEXT NOT NULL DEFAULT 'all';

ALTER TABLE public.partner_milestone_rewards
  DROP CONSTRAINT IF EXISTS partner_milestone_rewards_partner_key_rule_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_milestone_rewards_period_unique
  ON public.partner_milestone_rewards(partner_key, rule_id, period_key);

-- Exemples alignés : 20 validations → à la une, 50 validations → push (cumul sur la période)
UPDATE public.partner_milestone_rules
SET
  name = '20 validations ce mois',
  description = '20 avantages validés via votre code sur le mois en cours → à la une 1 semaine',
  metric_type = 'validations',
  threshold = 20,
  reward_type = 'featured_week',
  period_months = 1,
  sort_order = 1
WHERE name = '50 membres validés';

UPDATE public.partner_milestone_rules
SET
  name = '50 validations ce mois',
  description = '50 validations cumulées sur le mois (20 + 30 de plus) → push notification',
  metric_type = 'validations',
  threshold = 50,
  reward_type = 'push_once',
  period_months = 1,
  sort_order = 2
WHERE name = '100 validations';
