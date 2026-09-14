-- Corrige les spots/outils créés par admin/super_admin étiquetés à tort « partner »
-- (master_id = partner_staff.id via ensure_partner_staff)

UPDATE public.establishments e
SET content_origin = 'admin'
WHERE COALESCE(e.content_origin, 'partner') = 'partner'
  AND EXISTS (
    SELECT 1
    FROM public.partner_staff ps
    JOIN public.users u ON u.id = ps.user_id
    WHERE ps.id = e.master_id
      AND u.user_role IN ('admin', 'super_admin')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.partner_spot_submissions s
    JOIN public.users pu ON pu.id = s.partner_user_id
    WHERE s.published_establishment_id = e.id
      AND COALESCE(pu.user_role, 'member') NOT IN ('admin', 'super_admin')
  );

UPDATE public.tools t
SET content_origin = 'admin'
WHERE COALESCE(t.content_origin, 'partner') = 'partner'
  AND EXISTS (
    SELECT 1
    FROM public.partner_staff ps
    JOIN public.users u ON u.id = ps.user_id
    WHERE ps.id = t.master_id
      AND u.user_role IN ('admin', 'super_admin')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.partner_spot_submissions s
    JOIN public.users pu ON pu.id = s.partner_user_id
    WHERE s.published_tool_id = t.id
      AND COALESCE(pu.user_role, 'member') NOT IN ('admin', 'super_admin')
  );

-- Spots/outils sans content_origin créés par l'équipe → admin
UPDATE public.establishments e
SET content_origin = 'admin'
WHERE COALESCE(NULLIF(trim(e.content_origin), ''), '') = ''
  AND EXISTS (
    SELECT 1
    FROM public.partner_staff ps
    JOIN public.users u ON u.id = ps.user_id
    WHERE ps.id = e.master_id
      AND u.user_role IN ('admin', 'super_admin')
  );

UPDATE public.tools t
SET content_origin = 'admin'
WHERE COALESCE(NULLIF(trim(t.content_origin), ''), '') = ''
  AND EXISTS (
    SELECT 1
    FROM public.partner_staff ps
    JOIN public.users u ON u.id = ps.user_id
    WHERE ps.id = t.master_id
      AND u.user_role IN ('admin', 'super_admin')
  );
