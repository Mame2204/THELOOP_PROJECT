-- THE LOOP — Control Tower admin : statuts contenu, partenariats, push planifiés
-- Exécuter dans Supabase SQL Editor après 20260718

-- -----------------------------------------------------------------------------
-- 1. Statuts contenu (événements & spots)
-- -----------------------------------------------------------------------------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS content_status TEXT NOT NULL DEFAULT 'published'
    CHECK (content_status IN ('draft', 'published', 'deactivated'));

ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS content_status TEXT NOT NULL DEFAULT 'published'
    CHECK (content_status IN ('draft', 'published', 'deactivated')),
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS featured_end_date TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_events_content_status ON public.events(content_status);
CREATE INDEX IF NOT EXISTS idx_establishments_content_status ON public.establishments(content_status);
CREATE INDEX IF NOT EXISTS idx_establishments_featured ON public.establishments(is_featured) WHERE is_featured = TRUE;

-- -----------------------------------------------------------------------------
-- 2. Partenariats — statuts étendus + notes horodatées
-- -----------------------------------------------------------------------------
-- Statuts : pending, to_contact, in_discussion, approved, rejected
COMMENT ON COLUMN public.partnership_requests.status IS
  'pending | to_contact | in_discussion | approved | rejected';

CREATE TABLE IF NOT EXISTS public.partnership_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id UUID NOT NULL REFERENCES public.partnership_requests(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  author_name TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partnership_notes_request
  ON public.partnership_notes(partnership_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. Campagnes push admin (immédiat ou planifié)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_push_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'all',
  target_email TEXT,
  target_phone TEXT,
  favorite_event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  favorite_spot_id UUID REFERENCES public.establishments(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sent', 'cancelled')),
  recipient_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_push_scheduled
  ON public.admin_push_campaigns(status, scheduled_at)
  WHERE status = 'scheduled';

-- -----------------------------------------------------------------------------
-- 4. Invitations compte créées par admin
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_user_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  email TEXT,
  user_role TEXT NOT NULL DEFAULT 'member'
    CHECK (user_role IN ('member', 'prime', 'partner', 'admin')),
  first_name TEXT,
  last_name TEXT,
  otp_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_invites_phone ON public.admin_user_invites(phone_number);

-- -----------------------------------------------------------------------------
-- 5. Helper admin + RLS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.user_role IN ('admin', 'super_admin')
      AND u.is_active = TRUE
  );
$$;

ALTER TABLE public.partnership_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_push_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_user_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin read partnership notes" ON public.partnership_notes;
CREATE POLICY "Admin read partnership notes"
  ON public.partnership_notes FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admin insert partnership notes" ON public.partnership_notes;
CREATE POLICY "Admin insert partnership notes"
  ON public.partnership_notes FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin manage push campaigns" ON public.admin_push_campaigns;
CREATE POLICY "Admin manage push campaigns"
  ON public.admin_push_campaigns FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin manage user invites" ON public.admin_user_invites;
CREATE POLICY "Admin manage user invites"
  ON public.admin_user_invites FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin update partnership requests" ON public.partnership_requests;
CREATE POLICY "Admin update partnership requests"
  ON public.partnership_requests FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin read all partnership requests" ON public.partnership_requests;
CREATE POLICY "Admin read all partnership requests"
  ON public.partnership_requests FOR SELECT TO authenticated
  USING (public.is_admin() OR status = 'pending');

DROP POLICY IF EXISTS "Admin insert notifications" ON public.user_notifications;
CREATE POLICY "Admin insert notifications"
  ON public.user_notifications FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin update users" ON public.users;
CREATE POLICY "Admin update users"
  ON public.users FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin read all users" ON public.users;
CREATE POLICY "Admin read all users"
  ON public.users FOR SELECT TO authenticated
  USING (public.is_admin() OR id = auth.uid());

DROP POLICY IF EXISTS "Admin manage events" ON public.events;
CREATE POLICY "Admin manage events"
  ON public.events FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin manage establishments" ON public.establishments;
CREATE POLICY "Admin manage establishments"
  ON public.establishments FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
