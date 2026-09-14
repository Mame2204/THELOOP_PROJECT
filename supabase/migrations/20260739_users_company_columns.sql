-- Correctif : colonnes company / job_title sur users (si migration 35 partiellement appliquée)

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS company TEXT,
  ADD COLUMN IF NOT EXISTS job_title TEXT;

UPDATE public.users
SET user_role = 'tool_partner',
    phone_number = COALESCE(NULLIF(trim(phone_number), ''), '+22462000005'),
    company = COALESCE(company, 'Loop Tools GN'),
    updated_at = CURRENT_TIMESTAMP
WHERE lower(email) = 'outil@theloop.gn';
