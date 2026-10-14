-- =============================================================================
-- THE LOOP — Audit base avant validation stores & prod
-- Exécuter dans Supabase SQL Editor (prod ou staging miroir).
-- Lecture seule sauf sections commentées en bas (nettoyage manuel).
-- Doc : DocumentationsTheLoop/13-Audit-Base-Stores-Prod.md
-- =============================================================================

-- ─── 0. Vue d'ensemble (comptages) ───────────────────────────────────────────
SELECT '0_overview' AS section, metric, cnt FROM (
  SELECT 'auth.users' AS metric, count(*)::bigint AS cnt FROM auth.users
  UNION ALL SELECT 'public.users', count(*) FROM public.users
  UNION ALL SELECT 'users_active', count(*) FROM public.users WHERE COALESCE(is_active, true)
  UNION ALL SELECT 'events_published', count(*) FROM public.events
    WHERE content_status = 'published' AND COALESCE(is_active, true)
  UNION ALL SELECT 'establishments_published', count(*) FROM public.establishments
    WHERE content_status = 'published' AND COALESCE(is_active, true)
  UNION ALL SELECT 'tools_published', count(*) FROM public.tools
    WHERE content_status = 'published' AND COALESCE(is_active, true)
  UNION ALL SELECT 'benefit_catalog', count(*) FROM public.benefit_catalog
  UNION ALL SELECT 'benefit_catalog_active', count(*) FROM public.benefit_catalog WHERE is_active
  UNION ALL SELECT 'benefit_catalog_templates', count(*) FROM public.benefit_catalog
    WHERE COALESCE(is_template, false) OR (
      offering_partners::text LIKE '%__external__%' AND offering_partners::text NOT LIKE '%contentId%'
    )
  UNION ALL SELECT 'prime_benefit_grants', count(*) FROM public.prime_benefit_grants
  UNION ALL SELECT 'partner_benefit_offers', count(*) FROM public.partner_benefit_offers
  UNION ALL SELECT 'user_pass_grants', count(*) FROM public.user_pass_grants
  UNION ALL SELECT 'payment_intents', count(*) FROM public.payment_intents
  UNION ALL SELECT 'user_notifications_30d', count(*) FROM public.user_notifications
    WHERE sent_at > now() - interval '30 days'
  UNION ALL SELECT 'account_deletion_requests_open', count(*) FROM public.account_deletion_requests
    WHERE status IS DISTINCT FROM 'processed'
) t
ORDER BY metric;

-- ─── 1. Comptes à conserver pour review stores ─────────────────────────────
-- Remplacer les e-mails par vos comptes review réels avant envoi stores.
SELECT '1_users_review_candidates' AS section,
  u.id,
  u.email,
  u.user_role,
  u.company,
  u.phone_number,
  COALESCE(u.is_active, true) AS is_active,
  u.created_at
FROM public.users u
WHERE u.user_role IN ('super_admin', 'admin', 'member', 'prime', 'partner')
   OR u.email ILIKE '%review%'
   OR u.email ILIKE '%theloop%'
   OR u.email ILIKE '%membre%'
   OR u.email ILIKE '%prime%'
ORDER BY u.user_role, u.email;

-- Comptes sans auth (orphelins public.users)
SELECT '1_users_orphan_public' AS section, u.id, u.email, u.user_role
FROM public.users u
WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id);

-- Auth sans public.users
SELECT '1_users_orphan_auth' AS section, a.id, a.email
FROM auth.users a
WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = a.id);

-- ─── 2. Gates & paramètres (review = inscription OFF, PASS ON) ─────────────
SELECT '2_app_settings' AS section, key, value
FROM public.app_settings
WHERE key IN (
  'signupEnabled',
  'passPurchaseEnabled',
  'privilegesVisible',
  'prelaunchEnabled',
  'maintenanceEnabled',
  'passPurchaseEnabled_GN',
  'signupEnabled_GN'
)
   OR key LIKE 'role_benefit_entitlements%'
   OR key LIKE '%_GN'
ORDER BY key;

-- ─── 3. Contenu public (cible review : ~2 events, 2 spots, 2 tools propres) ─
SELECT '3_events' AS section, id, title, content_status, is_active, content_origin,
       country_code, start_date, organizer_id
FROM public.events
ORDER BY updated_at DESC NULLS LAST
LIMIT 30;

SELECT '3_establishments' AS section, id, name, content_status, is_active, content_origin,
       country_code, master_id
FROM public.establishments
WHERE NOT (category_slugs @> ARRAY['tools']::text[])
ORDER BY updated_at DESC NULLS LAST
LIMIT 30;

SELECT '3_tools' AS section, id, name, content_status, is_active, content_origin, country_code
FROM public.tools
ORDER BY updated_at DESC NULLS LAST
LIMIT 30;

-- Contenu publié sans pays
SELECT '3_content_missing_country' AS section, 'event' AS kind, id::text, title
FROM public.events WHERE content_status = 'published' AND (country_code IS NULL OR country_code = '')
UNION ALL
SELECT '3_content_missing_country', 'establishment', id::text, name
FROM public.establishments WHERE content_status = 'published' AND (country_code IS NULL OR country_code = '')
UNION ALL
SELECT '3_content_missing_country', 'tool', id::text, name
FROM public.tools WHERE content_status = 'published' AND (country_code IS NULL OR country_code = '');

-- ─── 4. Privilèges / catalogue ─────────────────────────────────────────────
SELECT '4_benefit_catalog' AS section,
  local_id,
  title,
  partner_name,
  is_active,
  COALESCE(is_template, false) AS is_template,
  template_local_id,
  jsonb_array_length(COALESCE(offering_partners, '[]'::jsonb)) AS nb_offrants,
  offering_partners,
  updated_at
FROM public.benefit_catalog
ORDER BY lower(title), is_template DESC, is_active DESC;

-- Doublons titre (plusieurs lignes actives)
SELECT '4_duplicate_active_titles' AS section, lower(trim(title)) AS title_key,
  count(*) FILTER (WHERE is_active) AS actifs,
  count(*) AS total,
  array_agg(local_id ORDER BY is_active DESC) AS local_ids
FROM public.benefit_catalog
GROUP BY lower(trim(title))
HAVING count(*) > 1
ORDER BY actifs DESC, title_key;

-- Octrois par catalogue
SELECT '4_grants_by_catalog' AS section,
  COALESCE(g.catalog_local_id, '(null)') AS catalog_local_id,
  count(*) AS grants,
  count(*) FILTER (WHERE g.status IN ('active', 'pending_validation')) AS actifs_ou_pending
FROM public.prime_benefit_grants g
GROUP BY g.catalog_local_id
ORDER BY grants DESC
LIMIT 40;

-- Offres partenaire en attente
SELECT '4_partner_offers_pending' AS section,
  catalog_local_id, catalog_title, partner_name, status, content_id, created_at
FROM public.partner_benefit_offers
WHERE status = 'pending'
ORDER BY created_at DESC;

-- ─── 5. PASS & paiements (NE PAS PURGER pour review / compta) ───────────────
SELECT '5_pass_grants_by_status' AS section, status, count(*)
FROM public.user_pass_grants
GROUP BY status
ORDER BY count DESC;

SELECT '5_payment_intents_recent' AS section,
  local_id, user_id, billing_period, amount_gnf, djomy_status, fulfillment_status, created_at
FROM public.payment_intents
ORDER BY created_at DESC
LIMIT 25;

-- Comptes Prime review : PASS actif ?
SELECT '5_prime_users_pass' AS section,
  u.email, u.user_role, g.label, g.status, g.expires_at, g.pass_kind
FROM public.users u
LEFT JOIN public.user_pass_grants g ON g.user_id = u.id AND g.status IN ('active', 'pending', 'suspended')
WHERE u.user_role IN ('prime', 'member')
ORDER BY u.email, g.created_at DESC;

-- Contrôle intégrité PASS (cf. 15-Lancement-Gates-Prod.md)
SELECT '5_pass_integrity' AS controle, resultat, attendu,
  CASE WHEN resultat = attendu THEN 'OK' ELSE 'À TRAITER' END AS verdict
FROM (
  SELECT 'PASS sans local_id' AS controle,
    (SELECT count(*)::text FROM public.user_pass_grants WHERE local_id IS NULL) AS resultat,
    '0' AS attendu
  UNION ALL
  SELECT 'PASS pending sans payment fulfilled',
    (SELECT count(*)::text FROM public.user_pass_grants g
     WHERE g.status = 'pending'
       AND NOT EXISTS (
         SELECT 1 FROM public.payment_intents p
         WHERE p.local_pass_id = g.local_id AND p.fulfillment_status = 'fulfilled'
       ))
) t;

-- ─── 6. Partenaires (tokens, staff, soumissions) ───────────────────────────
SELECT '6_partner_tokens' AS section, partner_name, user_id, is_active, created_at
FROM public.partner_tokens
ORDER BY partner_name
LIMIT 30;

SELECT '6_partner_submissions_pending' AS section, 'event' AS kind, local_id, partner_name, title, status
FROM public.partner_event_submissions WHERE status = 'pending'
UNION ALL
SELECT '6_partner_submissions_pending', 'spot', local_id, partner_name, name, status
FROM public.partner_spot_submissions WHERE status = 'pending'
ORDER BY kind, status;

-- ─── 7. Légal (stores) ─────────────────────────────────────────────────────
SELECT '7_legal_content' AS section, key, left(title, 80) AS title,
       length(body) AS body_len, updated_at
FROM public.app_legal_content
ORDER BY key;

-- ─── 8. Données bruyantes / test (candidats nettoyage manuel) ───────────────
SELECT '8_test_emails_users' AS section, id, email, user_role, created_at
FROM public.users
WHERE email ILIKE '%test%'
   OR email ILIKE '%demo%'
   OR email ILIKE '%cursor%'
   OR email ILIKE '%v8-pass%'
ORDER BY created_at DESC
LIMIT 50;

SELECT '8_invites_pending' AS section, count(*) FROM public.admin_user_invites
WHERE COALESCE(status, 'pending') NOT IN ('activated', 'cancelled', 'expired');

-- ─── 9. Demandes suppression compte (test V5 stores) ───────────────────────
SELECT '9_account_deletion' AS section, id, user_id, status, created_at, processed_at
FROM public.account_deletion_requests
ORDER BY created_at DESC
LIMIT 20;

-- =============================================================================
-- NETTOYAGE MANUEL (décommenter une section à la fois, après sauvegarde)
-- =============================================================================
-- A) Désactiver modèles catalogue doublons (après migration is_template) :
-- UPDATE public.benefit_catalog bc SET is_active = false, is_template = true, updated_at = now()
-- WHERE bc.is_template = true AND bc.is_active
--   AND EXISTS (
--     SELECT 1 FROM public.benefit_catalog dep
--     WHERE dep.local_id <> bc.local_id AND dep.is_active AND NOT dep.is_template
--       AND lower(trim(dep.title)) = lower(trim(bc.title))
--   );

-- B) Supprimer UNE ligne catalogue (remplacer LOCAL_ID) — voir doc § privilèges :
-- DELETE FROM public.partner_benefit_offers WHERE catalog_local_id = 'LOCAL_ID';
-- DELETE FROM public.prime_benefit_grants WHERE catalog_local_id = 'LOCAL_ID';
-- DELETE FROM public.benefit_catalog WHERE local_id = 'LOCAL_ID';

-- C) Reset sandbox complet (DESTRUCTIF — jamais sur prod review sans backup) :
-- Voir supabase/scripts/reset_prod_sandbox.sql + purge_all_except_super_admin.sql
