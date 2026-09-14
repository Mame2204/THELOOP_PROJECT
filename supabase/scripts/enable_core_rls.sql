-- =============================================================================
-- THE LOOP — Activer le RLS de base (Production V1.0)
-- À exécuter si RLS désactivé partout (migrations pas encore appliquées).
-- Idempotent : peut être relancé sans erreur.
-- Dernière sync : 20260870_harden_core_rls.sql
-- =============================================================================

-- Helpers
CREATE OR REPLACE FUNCTION public.get_my_user_role()
RETURNS VARCHAR
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT user_role FROM public.users WHERE id = auth.uid(); $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.user_role IN ('admin', 'super_admin')
      AND u.is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_prime_member()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.user_role IN ('prime', 'admin', 'super_admin')
      AND u.is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_partner_user()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.user_role IN ('partner', 'tool_partner', 'admin', 'super_admin')
      AND u.is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.partner_owns_master_id(p_master_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p_master_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.partner_staff ps
    WHERE ps.id = p_master_id AND ps.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.partner_owns_content(p_master_id UUID, p_organizer_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.partner_owns_master_id(p_master_id)
    OR (p_organizer_id IS NOT NULL AND p_organizer_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.can_read_public_event(
  p_is_loop_x BOOLEAN, p_content_status TEXT, p_is_active BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(p_content_status, 'published') = 'published'
    AND COALESCE(p_is_active, TRUE) = TRUE
    AND (COALESCE(p_is_loop_x, FALSE) = FALSE OR public.is_prime_member() OR public.is_admin());
$$;

CREATE OR REPLACE FUNCTION public.can_read_public_catalog_row(
  p_content_status TEXT, p_is_active BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(p_content_status, 'published') = 'published'
    AND COALESCE(p_is_active, TRUE) = TRUE;
$$;

-- ── users ────────────────────────────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own row" ON public.users;
CREATE POLICY "Users read own row"
  ON public.users FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Users update own row" ON public.users;
CREATE POLICY "Users update own row"
  ON public.users FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users read public directory" ON public.users;
DROP POLICY IF EXISTS "Anon read active user names" ON public.users;
DROP POLICY IF EXISTS "Authenticated read partner directory" ON public.users;

DROP POLICY IF EXISTS "Admin read all users" ON public.users;
CREATE POLICY "Admin read all users"
  ON public.users FOR SELECT TO authenticated
  USING (public.is_admin() OR id = auth.uid());

DROP POLICY IF EXISTS "Admin update users" ON public.users;
CREATE POLICY "Admin update users"
  ON public.users FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── favoris ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.favorite_events') IS NOT NULL THEN
    ALTER TABLE public.favorite_events ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users read own favorite events" ON public.favorite_events;
    CREATE POLICY "Users read own favorite events" ON public.favorite_events
      FOR SELECT TO authenticated USING (user_id = auth.uid());
    DROP POLICY IF EXISTS "Users insert own favorite events" ON public.favorite_events;
    CREATE POLICY "Users insert own favorite events" ON public.favorite_events
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    DROP POLICY IF EXISTS "Users delete own favorite events" ON public.favorite_events;
    CREATE POLICY "Users delete own favorite events" ON public.favorite_events
      FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
  IF to_regclass('public.favorite_spots') IS NOT NULL THEN
    ALTER TABLE public.favorite_spots ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users read own favorite spots" ON public.favorite_spots;
    CREATE POLICY "Users read own favorite spots" ON public.favorite_spots
      FOR SELECT TO authenticated USING (user_id = auth.uid());
    DROP POLICY IF EXISTS "Users insert own favorite spots" ON public.favorite_spots;
    CREATE POLICY "Users insert own favorite spots" ON public.favorite_spots
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    DROP POLICY IF EXISTS "Users delete own favorite spots" ON public.favorite_spots;
    CREATE POLICY "Users delete own favorite spots" ON public.favorite_spots
      FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

-- ── catalogue public (lecture filtrée) ───────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.events') IS NOT NULL THEN
    ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public read events" ON public.events;
    DROP POLICY IF EXISTS "Public read published events" ON public.events;
    CREATE POLICY "Members read published events" ON public.events
      FOR SELECT TO authenticated
      USING (public.can_read_public_event(is_loop_x, content_status, is_active));
    DROP POLICY IF EXISTS "Partner read own events" ON public.events;
    CREATE POLICY "Partner read own events" ON public.events
      FOR SELECT TO authenticated
      USING (public.partner_owns_content(master_id, organizer_id));
    DROP POLICY IF EXISTS "Admin manage events" ON public.events;
    CREATE POLICY "Admin manage events" ON public.events
      FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
  IF to_regclass('public.establishments') IS NOT NULL THEN
    ALTER TABLE public.establishments ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public read active establishments" ON public.establishments;
    DROP POLICY IF EXISTS "Public read published establishments" ON public.establishments;
    CREATE POLICY "Members read published establishments" ON public.establishments
      FOR SELECT TO authenticated
      USING (public.can_read_public_catalog_row(content_status, is_active));
    DROP POLICY IF EXISTS "Partner read own establishments" ON public.establishments;
    CREATE POLICY "Partner read own establishments" ON public.establishments
      FOR SELECT TO authenticated
      USING (public.partner_owns_content(master_id, NULL));
    DROP POLICY IF EXISTS "Admin manage establishments" ON public.establishments;
    CREATE POLICY "Admin manage establishments" ON public.establishments
      FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
  IF to_regclass('public.tools') IS NOT NULL THEN
    ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public read active tools" ON public.tools;
    DROP POLICY IF EXISTS "Public read published tools" ON public.tools;
    CREATE POLICY "Members read published tools" ON public.tools
      FOR SELECT TO authenticated
      USING (public.can_read_public_catalog_row(content_status, is_active));
    DROP POLICY IF EXISTS "Partner read own tools" ON public.tools;
    CREATE POLICY "Partner read own tools" ON public.tools
      FOR SELECT TO authenticated
      USING (public.partner_owns_content(master_id, NULL));
    DROP POLICY IF EXISTS "Admin manage tools" ON public.tools;
    CREATE POLICY "Admin manage tools" ON public.tools
      FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

-- ── notifications (lecture propre user) ──────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.user_notifications') IS NOT NULL THEN
    ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users read own notifications" ON public.user_notifications;
    CREATE POLICY "Users read own notifications" ON public.user_notifications
      FOR SELECT TO authenticated USING (user_id = auth.uid());
    DROP POLICY IF EXISTS "Admin insert notifications" ON public.user_notifications;
    CREATE POLICY "Admin insert notifications" ON public.user_notifications
      FOR INSERT TO authenticated WITH CHECK (public.is_admin());
  END IF;
END $$;

-- ── contenus légaux ──────────────────────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.app_legal_content') IS NOT NULL THEN
    ALTER TABLE public.app_legal_content ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public read legal content" ON public.app_legal_content;
    CREATE POLICY "Public read legal content" ON public.app_legal_content
      FOR SELECT TO anon, authenticated USING (TRUE);
    DROP POLICY IF EXISTS "Admin manage legal content" ON public.app_legal_content;
    CREATE POLICY "Admin manage legal content" ON public.app_legal_content
      FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

-- Vérification
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND relname IN (
    'users', 'events', 'establishments', 'tools', 'app_legal_content',
    'favorite_events', 'favorite_spots', 'user_notifications', 'partner_tokens'
  )
ORDER BY relname;
