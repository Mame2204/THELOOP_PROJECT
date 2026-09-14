-- THE LOOP — Diagnostic partenaire (LECTURE SEULE, pas de CREATE/ALTER)
-- Utilisez ce fichier si partner_benefit_offers_rpc_only.sql renvoie 42501.
-- Copier-coller chaque bloc séparément dans Supabase → SQL Editor.

-- A. Comptes partenaires
SELECT id, email, first_name, last_name, company, user_role, is_active,
       partner_can_manage_events, partner_can_manage_spots, partner_can_manage_tools
FROM public.users
WHERE user_role = 'partner'
ORDER BY company NULLS LAST, first_name;

-- B. Staff (master_id pour catalogue)
SELECT ps.id AS master_id, ps.user_id, u.email, u.company
FROM public.partner_staff ps
JOIN public.users u ON u.id = ps.user_id;

-- C. Soumissions spots approuvées
SELECT local_id, partner_user_id, partner_name, name, status, published_establishment_id, updated_at
FROM public.partner_spot_submissions
WHERE status = 'approved'
ORDER BY updated_at DESC
LIMIT 20;

-- D. Catalogue avantages (actifs et en validation)
SELECT local_id, title, is_active, offering_partners, updated_at
FROM public.benefit_catalog
ORDER BY updated_at DESC
LIMIT 30;

-- E. Notifications partenaires
SELECT n.id, n.user_id, u.email, u.company, n.title, n.audience, n.sent_at
FROM public.user_notifications n
LEFT JOIN public.users u ON u.id = n.user_id
WHERE u.user_role = 'partner' OR n.audience = 'partner'
ORDER BY n.sent_at DESC
LIMIT 30;

-- F. Contenus « à la une » (events, spots, outils)
SELECT 'event' AS kind, id, title AS name, is_featured, featured_end_date, organizer_id::text AS owner_id
FROM public.events
WHERE is_featured = true AND is_active = true
UNION ALL
SELECT 'spot', id, name, is_featured, featured_end_date, master_id::text
FROM public.establishments
WHERE is_featured = true AND is_active = true
UNION ALL
SELECT 'tool', id, name, is_featured, featured_end_date, master_id::text
FROM public.tools
WHERE is_featured = true AND is_active = true AND content_status = 'published';
