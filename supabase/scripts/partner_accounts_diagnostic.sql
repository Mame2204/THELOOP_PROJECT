-- Diagnostic partenaires THE LOOP (lecture seule + liens user_id si droits UPDATE)
-- À exécuter dans Supabase → SQL Editor
-- Cible : Aminata Kaba, Partenaire Partenaire (ou tout partenaire actif)

-- 1. Comptes partenaires
SELECT
  u.id,
  u.email,
  u.first_name,
  u.last_name,
  u.company,
  u.user_role,
  u.is_active,
  u.partner_can_manage_events,
  u.partner_can_manage_spots,
  u.partner_can_manage_tools
FROM public.users u
WHERE u.user_role = 'partner'
ORDER BY u.company NULLS LAST, u.first_name;

-- 2. Jetons SPOT (vide = normal si connexion e-mail / mot de passe uniquement)
SELECT
  pt.id,
  pt.partner_name,
  pt.token_code,
  pt.user_id,
  pt.status,
  pt.expires_at,
  u.email AS linked_email
FROM public.partner_tokens pt
LEFT JOIN public.users u ON u.id = pt.user_id
WHERE pt.status = 'active'
ORDER BY pt.partner_name;

-- 2b. Si section 2 vide : les partenaires se connectent via Auth (e-mail), pas via jeton SPOT.

-- 3. Lier automatiquement user_id manquant sur jeton (nom ≈ compte partenaire)
-- Décommenter si vous avez le droit UPDATE :
/*
UPDATE public.partner_tokens pt
SET user_id = u.id
FROM public.users u
WHERE pt.user_id IS NULL
  AND pt.status = 'active'
  AND u.user_role = 'partner'
  AND u.is_active = true
  AND (
    lower(trim(pt.partner_name)) = lower(trim(coalesce(u.company, '')))
    OR lower(trim(pt.partner_name)) = lower(trim(concat(u.first_name, ' ', u.last_name)))
    OR lower(trim(pt.partner_name)) = lower(trim(u.first_name || ' ' || coalesce(u.last_name, '')))
  );
*/

-- 4. Staff partenaire (requis pour catalogue / avantages)
SELECT ps.id AS master_id, ps.user_id, u.email, u.company
FROM public.partner_staff ps
JOIN public.users u ON u.id = ps.user_id
WHERE u.user_role = 'partner';

-- 5. Soumissions spots / outils (avec lien publication + à la une)
SELECT
  s.local_id,
  s.partner_user_id,
  s.partner_name,
  s.name,
  s.sub_category,
  s.status,
  s.published_establishment_id,
  s.published_tool_id,
  est.is_featured AS spot_a_la_une,
  est.master_id::text AS spot_master_id,
  t.name AS tool_published_name,
  t.developer AS tool_developer,
  t.is_featured AS tool_a_la_une,
  t.featured_end_date AS tool_featured_until,
  t.master_id::text AS tool_master_id
FROM public.partner_spot_submissions s
LEFT JOIN public.establishments est ON est.id = s.published_establishment_id
LEFT JOIN public.tools t ON t.id = s.published_tool_id
ORDER BY s.updated_at DESC
LIMIT 30;

-- 5b. Tous les outils publiés (même sans « à la une ») — explique section 9 vide pour les tools
SELECT
  t.id,
  t.name,
  t.developer,
  t.is_featured,
  t.featured_start_date,
  t.featured_end_date,
  t.is_active,
  t.content_status,
  t.master_id::text,
  ps.user_id::text AS partner_user_id,
  u.email AS partner_email,
  u.company AS partner_company
FROM public.tools t
LEFT JOIN public.partner_staff ps ON ps.id = t.master_id
LEFT JOIN public.users u ON u.id = ps.user_id
WHERE t.content_status = 'published'
  AND t.is_active = true
ORDER BY t.updated_at DESC;

-- 5c. Spots publiés SANS ligne partner_spot_submissions (créés admin / THE LOOP direct)
SELECT
  est.id,
  est.name,
  est.is_featured,
  est.featured_end_date,
  est.master_id::text,
  u.email AS owner_email,
  u.user_role AS owner_role,
  u.company AS owner_company,
  s.local_id AS submission_local_id
FROM public.establishments est
LEFT JOIN public.partner_staff ps ON ps.id = est.master_id
LEFT JOIN public.users u ON u.id = ps.user_id
LEFT JOIN public.partner_spot_submissions s ON s.published_establishment_id = est.id
WHERE est.is_active = true
  AND est.content_status = 'published'
  AND s.local_id IS NULL
ORDER BY est.name
LIMIT 30;

-- 6. Mot de passe auth partenaire : doit être Loop1234! (ou EXPO_PUBLIC_PARTNER_DEMO_PASSWORD)
-- Vérifier dans Supabase Auth → Users que chaque partenaire a un compte avec e-mail = users.email

-- 7. Avantages en attente (catalogue inactif = source SQL admin)
SELECT
  bc.local_id,
  bc.title,
  bc.is_active,
  bc.offering_partners,
  jsonb_array_length(COALESCE(bc.offering_partners, '[]'::jsonb)) AS nb_partenaires_lies,
  bc.updated_at
FROM public.benefit_catalog bc
WHERE bc.is_active = false
ORDER BY bc.updated_at DESC
LIMIT 20;

-- 7b. Notifications « Avantage à valider » (souvent 3 en IHM vs 1 ligne section 7)
SELECT
  n.id,
  n.user_id,
  n.recipient_phone,
  n.audience,
  u.email,
  u.company,
  n.title,
  left(n.message, 120) AS message_debut,
  n.sent_at
FROM public.user_notifications n
LEFT JOIN public.users u ON u.id = n.user_id
WHERE n.title IN ('Avantage à valider', 'Avantage à revalider')
   OR n.message LIKE '%[[loop-pbo:%'
ORDER BY n.sent_at DESC
LIMIT 30;

-- 8. Notifications partenaire (dernières 30)
-- user_id NULL = diffusion audience « partner » ou ciblage par recipient_phone uniquement
SELECT
  n.id,
  n.user_id,
  n.recipient_phone,
  n.audience,
  u.email,
  u.company,
  u.user_role,
  n.title,
  n.sent_at
FROM public.user_notifications n
LEFT JOIN public.users u ON u.id = n.user_id
WHERE u.user_role = 'partner'
   OR n.audience = 'partner'
   OR n.audience = 'individual'
ORDER BY n.sent_at DESC
LIMIT 30;

-- 8b. Notifications sans user_id
SELECT
  n.id,
  n.recipient_phone,
  n.audience,
  n.title,
  n.sent_at
FROM public.user_notifications n
WHERE n.user_id IS NULL
ORDER BY n.sent_at DESC
LIMIT 20;

-- 9. Contenus « à la une » en base (is_featured = true) — Supabase pur (8 lignes chez vous)
-- L'IHM admin peut afficher +1 via cache local non synchronisé (loop_admin_featured_spots).
SELECT 'event' AS kind, e.id, e.title AS name, e.is_featured, e.featured_end_date, e.organizer_id::text AS owner_id
FROM public.events e
WHERE e.is_featured = true AND e.is_active = true
UNION ALL
SELECT 'spot', est.id, est.name, est.is_featured, est.featured_end_date, est.master_id::text
FROM public.establishments est
WHERE est.is_featured = true AND est.is_active = true
UNION ALL
SELECT 'tool', t.id, t.name, t.is_featured, t.featured_end_date, t.master_id::text
FROM public.tools t
WHERE t.is_featured = true AND t.is_active = true AND t.content_status = 'published'
ORDER BY kind, name;

-- 9b. À la une avec fenêtre de dates encore valide (comme l'app mobile)
SELECT 'event' AS kind, e.id, e.title AS name, e.featured_end_date, e.organizer_id::text AS owner_id
FROM public.events e
WHERE e.is_featured = true AND e.is_active = true
  AND (e.featured_end_date IS NULL OR e.featured_end_date >= NOW())
UNION ALL
SELECT 'spot', est.id, est.name, est.featured_end_date, est.master_id::text
FROM public.establishments est
WHERE est.is_featured = true AND est.is_active = true
  AND (est.featured_end_date IS NULL OR est.featured_end_date >= NOW())
UNION ALL
SELECT 'tool', t.id, t.name, t.featured_end_date, t.master_id::text
FROM public.tools t
WHERE t.is_featured = true AND t.is_active = true AND t.content_status = 'published'
  AND (t.featured_end_date IS NULL OR t.featured_end_date >= NOW())
ORDER BY kind, name;

-- 9c. Spots publiés NON « à la une » en base — spot THE LOOP manquant section 9 probablement ici
SELECT
  est.id,
  est.name,
  est.is_featured,
  est.featured_end_date,
  est.master_id::text,
  u.email,
  u.user_role,
  u.company,
  CASE WHEN s.local_id IS NULL THEN 'admin_direct' ELSE 'partner_submission' END AS origine
FROM public.establishments est
LEFT JOIN public.partner_staff ps ON ps.id = est.master_id
LEFT JOIN public.users u ON u.id = ps.user_id
LEFT JOIN public.partner_spot_submissions s ON s.published_establishment_id = est.id
WHERE est.is_active = true AND est.content_status = 'published'
  AND COALESCE(est.is_featured, false) = false
ORDER BY est.name
LIMIT 30;
