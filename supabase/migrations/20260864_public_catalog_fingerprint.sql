-- THE LOOP — Empreinte légère du catalogue public (1 requête RPC, ~100 octets)
-- Permet aux apps mobile de détecter un changement cross-device sans re-télécharger tout le catalogue.
-- events / establishments : created_at (pas de updated_at en prod)
-- tools : updated_at

CREATE OR REPLACE FUNCTION public.get_public_catalog_fingerprint()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH e AS (
    SELECT count(*)::bigint AS n, max(created_at) AS rev
    FROM public.events
    WHERE is_active = true
      AND content_status = 'published'
  ),
  s AS (
    SELECT count(*)::bigint AS n, max(created_at) AS rev
    FROM public.establishments e2
    WHERE e2.is_active = true
      AND e2.content_status = 'published'
      AND NOT (COALESCE(e2.category_slugs, ARRAY[]::text[]) @> ARRAY['tools']::text[])
  ),
  t AS (
    SELECT count(*)::bigint AS n, max(COALESCE(updated_at, created_at)) AS rev
    FROM public.tools
    WHERE is_active = true
      AND content_status = 'published'
  )
  SELECT
    'e:' || e.n || ':' || coalesce(e.rev::text, '')
    || '|s:' || s.n || ':' || coalesce(s.rev::text, '')
    || '|t:' || t.n || ':' || coalesce(t.rev::text, '')
  FROM e, s, t;
$$;

COMMENT ON FUNCTION public.get_public_catalog_fingerprint() IS
  'Token compact count+horodatage pour sync catalogue mobile sans télécharger events/establishments/tools.';

GRANT EXECUTE ON FUNCTION public.get_public_catalog_fingerprint() TO anon, authenticated;
