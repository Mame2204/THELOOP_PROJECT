-- THE LOOP — Table jobs d'automatisation + seed par défaut (autonome si 20260734 non appliquée)

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

ALTER TABLE public.admin_automation_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_automation_jobs_admin_all ON public.admin_automation_jobs;
CREATE POLICY admin_automation_jobs_admin_all ON public.admin_automation_jobs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.user_role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.user_role IN ('admin', 'super_admin')
    )
  );

INSERT INTO public.admin_automation_jobs (
  id, name, job_type, status, schedule, country_code, city, payload
)
VALUES
  (
    'job-birthday-default',
    'Anniversaires — cadeaux ville',
    'birthday_benefit',
    'active',
    'daily',
    'GN',
    NULL,
    '{"benefitPurpose":"birthday","validityDays":30}'::jsonb
  ),
  (
    'job-welcome-default',
    'Bienvenue — avantage ville',
    'welcome_benefit',
    'active',
    'on_signup',
    'GN',
    NULL,
    '{"benefitPurpose":"welcome","validityDays":30,"welcomeMessage":"Bienvenue dans THE LOOP ! Découvre tes avantages selon ta ville."}'::jsonb
  ),
  (
    'job-member-month-default',
    'Membre du mois — récompense',
    'member_of_month',
    'active',
    'monthly',
    'GN',
    NULL,
    '{"benefitPurpose":"member_of_month","notifyAllMembers":true,"validityDays":30}'::jsonb
  ),
  (
    'job-spot-stars-default',
    'Étoiles spots — calcul quotidien',
    'spot_stars',
    'active',
    'daily',
    'GN',
    NULL,
    '{}'::jsonb
  )
ON CONFLICT (id) DO NOTHING;
