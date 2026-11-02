-- =============================================================================
-- 20261022 — Parcours sans compte (App Store 5.1.1(v))
-- =============================================================================
-- Apple exige que le guide (Agenda, Spots, Outils) soit consultable sans compte.
-- Depuis 20260870, le catalogue n'est lisible que par `authenticated`.
--
-- On rouvre en LECTURE SEULE, pour `anon`, uniquement :
--   • les fiches publiées et actives ;
--   • hors LoopX (is_loop_x = TRUE reste réservé Prime / admin) ;
--   • tant que l'interrupteur super admin `app_gates.guestBrowseEnabled` est ON
--     (absent = ON). OFF = le catalogue redevient fermé aux visiteurs.
--
-- Rien d'autre n'est ouvert : soumissions partenaires, utilisateurs, privilèges,
-- favoris, notifications et PASS restent réservés aux comptes.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.guest_browse_enabled()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT CASE jsonb_typeof(s.value -> 'guestBrowseEnabled')
        WHEN 'boolean' THEN (s.value ->> 'guestBrowseEnabled')::BOOLEAN
        ELSE NULL
      END
      FROM public.app_settings s
      WHERE s.key = 'app_gates'
    ),
    TRUE
  );
$$;

REVOKE ALL ON FUNCTION public.guest_browse_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_browse_enabled() TO anon, authenticated, service_role;

-- Helpers SECURITY DEFINER utilisés par les policies enfants (exclus de la liste anon en 20260955).
REVOKE ALL ON FUNCTION public.establishment_is_readable(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.establishment_is_readable(UUID) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tool_is_readable(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tool_is_readable(UUID) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Catalogue principal
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Guest read published events" ON public.events;
CREATE POLICY "Guest read published events"
  ON public.events FOR SELECT TO anon
  USING (
    public.guest_browse_enabled()
    AND COALESCE(is_loop_x, FALSE) = FALSE
    AND COALESCE(content_status, 'published') = 'published'
    AND COALESCE(is_active, TRUE) = TRUE
  );

DROP POLICY IF EXISTS "Guest read published establishments" ON public.establishments;
CREATE POLICY "Guest read published establishments"
  ON public.establishments FOR SELECT TO anon
  USING (
    public.guest_browse_enabled()
    AND COALESCE(content_status, 'published') = 'published'
    AND COALESCE(is_active, TRUE) = TRUE
  );

DROP POLICY IF EXISTS "Guest read published tools" ON public.tools;
CREATE POLICY "Guest read published tools"
  ON public.tools FOR SELECT TO anon
  USING (
    public.guest_browse_enabled()
    AND COALESCE(content_status, 'published') = 'published'
    AND COALESCE(is_active, TRUE) = TRUE
  );

-- -----------------------------------------------------------------------------
-- Tables enfants (photos, horaires, catégories) — parent lisible requis
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  IF to_regclass('public.event_categories') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Guest read categories for visible events" ON public.event_categories;
    CREATE POLICY "Guest read categories for visible events"
      ON public.event_categories FOR SELECT TO anon
      USING (public.guest_browse_enabled() AND public.event_is_readable(event_id));
  END IF;

  IF to_regclass('public.establishment_photos') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Guest read photos for visible establishments" ON public.establishment_photos;
    CREATE POLICY "Guest read photos for visible establishments"
      ON public.establishment_photos FOR SELECT TO anon
      USING (public.guest_browse_enabled() AND public.establishment_is_readable(establishment_id));
  END IF;

  IF to_regclass('public.establishment_schedules') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Guest read schedules for visible establishments" ON public.establishment_schedules;
    CREATE POLICY "Guest read schedules for visible establishments"
      ON public.establishment_schedules FOR SELECT TO anon
      USING (public.guest_browse_enabled() AND public.establishment_is_readable(establishment_id));
  END IF;

  IF to_regclass('public.establishment_categories') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Guest read categories for visible establishments" ON public.establishment_categories;
    CREATE POLICY "Guest read categories for visible establishments"
      ON public.establishment_categories FOR SELECT TO anon
      USING (public.guest_browse_enabled() AND public.establishment_is_readable(establishment_id));
  END IF;

  IF to_regclass('public.tool_photos') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Guest read photos for visible tools" ON public.tool_photos;
    CREATE POLICY "Guest read photos for visible tools"
      ON public.tool_photos FOR SELECT TO anon
      USING (public.guest_browse_enabled() AND public.tool_is_readable(tool_id));
  END IF;
END $$;
