/**
 * Liste d'attente landing + pré-création de comptes depuis l'admin.
 * Compatible table waitlist déjà existante (landing) : ALTER IF NOT EXISTS.
 */
CREATE TABLE IF NOT EXISTS public.waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Colonnes admin (no-op si déjà présentes)
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS country_code text DEFAULT 'GN';
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS invite_id uuid;
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS invited_at timestamptz;
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.waitlist SET status = 'pending' WHERE status IS NULL;
UPDATE public.waitlist SET metadata = '{}'::jsonb WHERE metadata IS NULL;
UPDATE public.waitlist SET updated_at = COALESCE(updated_at, created_at, now()) WHERE updated_at IS NULL;
UPDATE public.waitlist SET country_code = 'GN' WHERE country_code IS NULL;

ALTER TABLE public.waitlist ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.waitlist ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.waitlist ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;
ALTER TABLE public.waitlist ALTER COLUMN metadata SET NOT NULL;
ALTER TABLE public.waitlist ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.waitlist ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'waitlist_status_check'
      AND conrelid = 'public.waitlist'::regclass
  ) THEN
    ALTER TABLE public.waitlist
      ADD CONSTRAINT waitlist_status_check
      CHECK (status IN ('pending', 'invited', 'activated', 'rejected'));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.admin_user_invites') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'waitlist_invite_id_fkey'
         AND conrelid = 'public.waitlist'::regclass
     ) THEN
    ALTER TABLE public.waitlist
      ADD CONSTRAINT waitlist_invite_id_fkey
      FOREIGN KEY (invite_id) REFERENCES public.admin_user_invites(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_unique
  ON public.waitlist (lower(trim(email)));

CREATE INDEX IF NOT EXISTS waitlist_status_idx ON public.waitlist (status, created_at DESC);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "waitlist_anon_insert" ON public.waitlist;
CREATE POLICY "waitlist_anon_insert"
  ON public.waitlist FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "waitlist_admin_select" ON public.waitlist;
CREATE POLICY "waitlist_admin_select"
  ON public.waitlist FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "waitlist_admin_update" ON public.waitlist;
CREATE POLICY "waitlist_admin_update"
  ON public.waitlist FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "waitlist_admin_delete" ON public.waitlist;
CREATE POLICY "waitlist_admin_delete"
  ON public.waitlist FOR DELETE TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.waitlist IS
  'Inscriptions landing (liste d''attente). L''admin pré-crée les comptes via invitations.';
