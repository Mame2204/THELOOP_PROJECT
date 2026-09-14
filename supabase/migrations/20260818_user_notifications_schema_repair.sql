-- Réparation schéma user_notifications (table partielle sur certains projets Supabase)

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT 'individual',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recipient_phone TEXT
);

ALTER TABLE public.user_notifications
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';

ALTER TABLE public.user_notifications
  ADD COLUMN IF NOT EXISTS message TEXT NOT NULL DEFAULT '';

ALTER TABLE public.user_notifications
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'individual';

ALTER TABLE public.user_notifications
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.user_notifications
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

ALTER TABLE public.user_notifications
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.user_notifications
  ADD COLUMN IF NOT EXISTS recipient_phone TEXT;

-- Visiteurs / téléphone sans compte (20260814)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_notifications'
      AND column_name = 'user_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.user_notifications ALTER COLUMN user_id DROP NOT NULL;
  END IF;
EXCEPTION
  WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_notifications_user
  ON public.user_notifications (user_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_phone
  ON public.user_notifications (recipient_phone, sent_at DESC)
  WHERE recipient_phone IS NOT NULL;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON public.user_notifications;
CREATE POLICY "Users read own notifications"
  ON public.user_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own notifications read" ON public.user_notifications;
CREATE POLICY "Users update own notifications read"
  ON public.user_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admin insert notifications" ON public.user_notifications;
CREATE POLICY "Admin insert notifications"
  ON public.user_notifications FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users delete own notifications" ON public.user_notifications;
CREATE POLICY "Users delete own notifications"
  ON public.user_notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.user_notifications IS
  'Boîte de réception utilisateur (titre, message, audience, téléphone optionnel).';
