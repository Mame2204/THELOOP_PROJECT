-- THE LOOP — Empreinte catalogue : détecter aussi désactivation / changement de statut
-- Avant : count+max(created_at) des seuls actifs → désactiver A et publier B
-- avec le même count / created_at max ne déclenchait pas de resync.

CREATE OR REPLACE FUNCTION public.get_public_catalog_fingerprint()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH e AS (
    SELECT
      count(*) FILTER (WHERE is_active = true AND content_status = 'published')::bigint AS n,
      count(*)::bigint AS n_all,
      max(created_at) AS rev,
      max(CASE WHEN is_active = true AND content_status = 'published' THEN created_at END) AS rev_pub
    FROM public.events
  ),
  s AS (
    SELECT
      count(*) FILTER (
        WHERE e2.is_active = true
          AND e2.content_status = 'published'
          AND NOT (COALESCE(e2.category_slugs, ARRAY[]::text[]) @> ARRAY['tools']::text[])
      )::bigint AS n,
      count(*)::bigint AS n_all,
      max(e2.created_at) AS rev
    FROM public.establishments e2
    WHERE NOT (COALESCE(e2.category_slugs, ARRAY[]::text[]) @> ARRAY['tools']::text[])
  ),
  t AS (
    SELECT
      count(*) FILTER (WHERE is_active = true AND content_status = 'published')::bigint AS n,
      count(*)::bigint AS n_all,
      max(COALESCE(updated_at, created_at)) AS rev
    FROM public.tools
  )
  SELECT
    'e:' || e.n || '/' || e.n_all || ':' || coalesce(e.rev_pub::text, '') || ':' || coalesce(e.rev::text, '')
    || '|s:' || s.n || '/' || s.n_all || ':' || coalesce(s.rev::text, '')
    || '|t:' || t.n || '/' || t.n_all || ':' || coalesce(t.rev::text, '')
  FROM e, s, t;
$$;

COMMENT ON FUNCTION public.get_public_catalog_fingerprint() IS
  'Token catalogue : actifs + total (détecte désactivation) + horodatages.';

GRANT EXECUTE ON FUNCTION public.get_public_catalog_fingerprint() TO anon, authenticated;
