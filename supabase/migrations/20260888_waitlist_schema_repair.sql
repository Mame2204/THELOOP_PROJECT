/**
 * Réparation si 20260887 a échoué sur une table waitlist déjà existante (sans colonne status).
 * Idempotent — safe à relancer.
 */
CREATE TABLE IF NOT EXISTS public.waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

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

ALTER TABLE public.waitlist ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.waitlist ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_status_check'
  ) THEN
    ALTER TABLE public.waitlist
      ADD CONSTRAINT waitlist_status_check
      CHECK (status IN ('pending', 'invited', 'activated', 'rejected'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_unique ON public.waitlist (lower(trim(email)));
CREATE INDEX IF NOT EXISTS waitlist_status_idx ON public.waitlist (status, created_at DESC);
