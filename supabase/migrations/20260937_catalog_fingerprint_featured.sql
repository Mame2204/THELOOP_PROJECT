-- L’empreinte catalogue ignorait is_featured → le mobile ne resynchronisait pas
-- après « À la une » depuis admin-web (cache jusqu’à changement count/created_at).

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
  ),
  fe AS (
    SELECT coalesce(
      md5(
        string_agg(
          id::text || ':' || coalesce(featured_end_date::text, ''),
          '|'
          ORDER BY id
        )
      ),
      md5('')
    ) AS sig
    FROM public.events
    WHERE is_featured = true AND is_active = true AND content_status = 'published'
  ),
  fs AS (
    SELECT coalesce(
      md5(
        string_agg(
          e2.id::text || ':' || coalesce(e2.featured_end_date::text, ''),
          '|'
          ORDER BY e2.id
        )
      ),
      md5('')
    ) AS sig
    FROM public.establishments e2
    WHERE e2.is_featured = true
      AND e2.is_active = true
      AND e2.content_status = 'published'
      AND NOT (COALESCE(e2.category_slugs, ARRAY[]::text[]) @> ARRAY['tools']::text[])
  ),
  ft AS (
    SELECT coalesce(
      md5(
        string_agg(
          id::text || ':' || coalesce(featured_end_date::text, ''),
          '|'
          ORDER BY id
        )
      ),
      md5('')
    ) AS sig
    FROM public.tools
    WHERE is_featured = true AND is_active = true AND content_status = 'published'
  )
  SELECT
    'e:' || e.n || '/' || e.n_all || ':' || coalesce(e.rev_pub::text, '') || ':' || coalesce(e.rev::text, '')
    || ':f:' || fe.sig
    || '|s:' || s.n || '/' || s.n_all || ':' || coalesce(s.rev::text, '')
    || ':f:' || fs.sig
    || '|t:' || t.n || '/' || t.n_all || ':' || coalesce(t.rev::text, '')
    || ':f:' || ft.sig
  FROM e, s, t, fe, fs, ft;
$$;

COMMENT ON FUNCTION public.get_public_catalog_fingerprint() IS
  'Token catalogue : actifs, horodatages, signature à la une (events/spots/tools).';

GRANT EXECUTE ON FUNCTION public.get_public_catalog_fingerprint() TO anon, authenticated;
