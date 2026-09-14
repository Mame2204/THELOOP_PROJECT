-- =============================================================================
-- THE LOOP — Diagnostic Supabase (RLS, users, auth)
-- Exécuter dans SQL Editor AVANT purge / activation RLS
-- =============================================================================

-- 1. Tables public sans RLS activé
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname AND p.schemaname = 'public') AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relrowsecurity ASC, c.relname;

-- 2. Comptes Auth (source de vérité connexion)
SELECT id, email, phone, created_at, last_sign_in_at
FROM auth.users
ORDER BY created_at;

-- 3. Comptes public.users (profil app)
SELECT id, email, user_role, phone_number, is_active, created_at
FROM public.users
ORDER BY created_at;

-- 4. Orphelins : dans Auth mais pas dans public.users
SELECT au.id, au.email, 'auth_only' AS issue
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL;

-- 5. Orphelins : dans public.users mais pas dans Auth
SELECT pu.id, pu.email, pu.user_role, 'public_only' AS issue
FROM public.users pu
LEFT JOIN auth.users au ON au.id = pu.id
WHERE au.id IS NULL;

-- 6. Localisations Guinée (référentiel admin)
SELECT
  CASE WHEN to_regclass('public.guinea_locations') IS NULL THEN 0
       ELSE (SELECT count(*) FROM public.guinea_locations)
  END AS guinea_locations_rows,
  (SELECT count(*) FROM public.locations) AS legacy_locations_rows;

-- 7. Fonctions sécurité (doivent exister si migrations appliquées)
SELECT proname AS function_name
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN ('is_admin', 'get_my_user_role', 'handle_new_auth_user')
ORDER BY proname;
