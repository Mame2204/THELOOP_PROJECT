-- Extension jobs automatisation : fréquence annuelle + vœux anniversaire

ALTER TABLE public.admin_automation_jobs DROP CONSTRAINT IF EXISTS admin_automation_jobs_schedule_check;
ALTER TABLE public.admin_automation_jobs ADD CONSTRAINT admin_automation_jobs_schedule_check
  CHECK (schedule IN ('daily', 'monthly', 'yearly', 'on_signup', 'on_demand'));

ALTER TABLE public.admin_automation_jobs DROP CONSTRAINT IF EXISTS admin_automation_jobs_job_type_check;
ALTER TABLE public.admin_automation_jobs ADD CONSTRAINT admin_automation_jobs_job_type_check
  CHECK (job_type IN (
    'birthday_benefit',
    'birthday_greeting',
    'welcome_benefit',
    'member_of_month',
    'push_notification',
    'benefit_grant',
    'spot_stars'
  ));
