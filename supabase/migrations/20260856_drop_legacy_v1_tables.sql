-- THE LOOP — Suppression tables legacy Production V1.0 (optionnel, après purge sandbox)
--
-- Prérequis :
--   • purge_all_except_super_admin.sql déjà exécuté
--   • 20260855_user_notifications_campaign_id.sql appliquée (FK campaign_id → admin_push_campaigns)
--   • Vérifier count(*) = 0 sur chaque table ci-dessous
--
-- ⚠️  IRRÉVERSIBLE — sauvegardez avant.

DO $$
DECLARE
  v_legacy TEXT[] := ARRAY[
    'user_advantage_usages',
    'establishment_advantages',
    'advantages_catalog',
    'conditions_catalog',
    'user_subscriptions',
    'payments',
    'payment_products',
    'audit_logs',
    'audit_action_types',
    'user_clicks_tracking',
    'click_types',
    'notifications_campaigns',
    'notification_trigger_types',
    'admin_users'
  ];
  v_table TEXT;
  v_count BIGINT;
BEGIN
  FOREACH v_table IN ARRAY v_legacy
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      RAISE NOTICE 'Skip (absente) : %', v_table;
      CONTINUE;
    END IF;

    EXECUTE format('SELECT count(*) FROM public.%I', v_table) INTO v_count;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'Table public.% contient % ligne(s) — videz-la avant DROP.', v_table, v_count;
    END IF;
  END LOOP;

  RAISE NOTICE 'Toutes les tables legacy sont vides — suppression…';
END $$;

DROP TABLE IF EXISTS public.user_advantage_usages CASCADE;
DROP TABLE IF EXISTS public.establishment_advantages CASCADE;
DROP TABLE IF EXISTS public.advantages_catalog CASCADE;
DROP TABLE IF EXISTS public.conditions_catalog CASCADE;
DROP TABLE IF EXISTS public.user_subscriptions CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.payment_products CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.audit_action_types CASCADE;
DROP TABLE IF EXISTS public.user_clicks_tracking CASCADE;
DROP TABLE IF EXISTS public.click_types CASCADE;
DROP TABLE IF EXISTS public.notifications_campaigns CASCADE;
DROP TABLE IF EXISTS public.notification_trigger_types CASCADE;
DROP TABLE IF EXISTS public.admin_users CASCADE;
