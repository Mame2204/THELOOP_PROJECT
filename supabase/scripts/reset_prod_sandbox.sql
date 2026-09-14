-- =============================================================================
-- THE LOOP — Sandbox prod vide (super_admin + Guinée + paramètres par défaut)
--
-- Exécuter dans Supabase SQL Editor, dans cet ordre :
--   A. supabase/migrations/20260747_guinea_locations.sql   (crée la table)
--   B. supabase/scripts/seed_guinea_locations.sql          (4549 quartiers)
--   C. supabase/scripts/promote_super_admin.sql            (votre compte super_admin)
--   D. supabase/scripts/purge_all_except_super_admin.sql   (tout vider sauf super_admin + guinea)
--   E. supabase/scripts/seed_platform_defaults.sql         (paramètres canoniques)
--
-- Ou en CLI : supabase\scripts\purge-sandbox.cmd --with-seed
--
-- ⚠️  Ne pas recopier l'existant : le seed fait DELETE + INSERT, pas de merge.
--
-- Résultat attendu :
--   - 1 user super_admin
--   - guinea_locations ≈ 4549 lignes
--   - app_settings = clés paramètres
--   - content_categories = catégories intégrées
--   - benefit_catalog / events / establishments = 0
-- =============================================================================

-- Contrôle rapide après les 4 scripts
SELECT
  (SELECT count(*) FROM auth.users) AS auth_users,
  (SELECT count(*) FROM public.users) AS public_users,
  (SELECT count(*) FROM public.guinea_locations) AS guinea_locations,
  (SELECT count(*) FROM public.locations) AS legacy_locations,
  (SELECT count(*) FROM public.events) AS events,
  (SELECT count(*) FROM public.establishments) AS establishments,
  (SELECT count(*) FROM public.benefit_catalog) AS benefit_catalog,
  (SELECT count(*) FROM public.content_categories) AS content_categories,
  (SELECT count(*) FROM public.app_settings) AS app_settings,
  (SELECT count(*) FROM public.admin_automation_jobs) AS automation_jobs,
  (SELECT count(*) FROM public.referral_settings) AS referral_settings,
  (SELECT count(*) FROM public.spot_star_settings) AS spot_star_settings,
  (SELECT count(*) FROM public.partner_milestone_rules) AS milestone_rules;

SELECT key, value FROM public.app_settings ORDER BY key;

SELECT kind, slug, label FROM public.content_categories ORDER BY kind, sort_order;

SELECT id, email, user_role FROM public.users;
