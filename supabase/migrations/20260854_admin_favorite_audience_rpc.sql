-- Admin : ciblage campagnes « favoris par catégorie » (contourne RLS lecture favoris autrui)

CREATE OR REPLACE FUNCTION public.admin_users_with_favorite_categories(
  p_event_categories TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_spot_categories TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_tool_categories TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS TABLE(user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  RETURN QUERY
  SELECT DISTINCT u.id
  FROM public.users u
  WHERE u.is_active = TRUE
    AND u.user_role NOT IN ('admin', 'super_admin', 'partner', 'tool_partner')
    AND (
      (
        COALESCE(cardinality(p_event_categories), 0) > 0
        AND EXISTS (
          SELECT 1
          FROM public.favorite_events fe
          JOIN public.events e ON e.id = fe.event_id
          LEFT JOIN public.event_categories ec ON ec.id = e.category_id
          WHERE fe.user_id = u.id
            AND (
              ec.slug = ANY(p_event_categories)
              OR COALESCE(e.category_slugs, '{}'::TEXT[]) && p_event_categories
            )
        )
      )
      OR (
        COALESCE(cardinality(p_spot_categories), 0) > 0
        AND EXISTS (
          SELECT 1
          FROM public.favorite_spots fs
          JOIN public.establishments est ON est.id = fs.establishment_id
          LEFT JOIN public.establishment_categories esc ON esc.id = est.category_id
          WHERE fs.user_id = u.id
            AND (
              esc.slug = ANY(p_spot_categories)
              OR COALESCE(est.category_slugs, '{}'::TEXT[]) && p_spot_categories
            )
        )
      )
      OR (
        COALESCE(cardinality(p_tool_categories), 0) > 0
        AND EXISTS (
          SELECT 1
          FROM public.favorite_tools ft
          JOIN public.tools t ON t.id = ft.tool_id
          WHERE ft.user_id = u.id
            AND t.tool_category = ANY(p_tool_categories)
        )
      )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_users_with_favorite_categories(TEXT[], TEXT[], TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_users_with_favorite_categories(TEXT[], TEXT[], TEXT[]) TO authenticated;

COMMENT ON FUNCTION public.admin_users_with_favorite_categories IS
  'Liste les user_id ayant un favori dans au moins une catégorie sélectionnée (admin uniquement).';
