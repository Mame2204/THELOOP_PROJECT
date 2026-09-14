-- Jobs d'automatisation admin (bienvenue, anniversaire, membre du mois, etc.)
-- Sync mobile optionnelle — source de vérité locale AsyncStorage pour l'instant.

CREATE TABLE IF NOT EXISTS public.admin_automation_jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  job_type TEXT NOT NULL CHECK (job_type IN (
    'birthday_benefit', 'welcome_benefit', 'member_of_month',
    'push_notification', 'benefit_grant', 'spot_stars'
  )),
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'archived')),
  schedule TEXT NOT NULL DEFAULT 'daily' CHECK (schedule IN ('daily', 'monthly', 'on_signup', 'on_demand')),
  country_code CHAR(2) NOT NULL DEFAULT 'GN',
  city TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_run_at TIMESTAMPTZ,
  last_run_count INTEGER,
  last_run_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_automation_jobs_status
  ON public.admin_automation_jobs (status, country_code);

CREATE INDEX IF NOT EXISTS idx_admin_automation_jobs_type
  ON public.admin_automation_jobs (job_type);

COMMENT ON TABLE public.admin_automation_jobs IS
  'Jobs planifiés admin — matching ville compte / ville avantage catalogue.';

ALTER TABLE public.admin_automation_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_automation_jobs_admin_all ON public.admin_automation_jobs;
CREATE POLICY admin_automation_jobs_admin_all ON public.admin_automation_jobs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.user_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.user_role = 'admin'
    )
  );

-- Colonne benefit_purpose welcome sur catalogue (si absente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'benefit_catalog' AND column_name = 'benefit_purpose'
  ) THEN
    ALTER TABLE public.benefit_catalog ADD COLUMN benefit_purpose TEXT DEFAULT 'standard';
  END IF;
END $$;
