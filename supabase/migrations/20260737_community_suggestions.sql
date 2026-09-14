-- THE LOOP — Suggestions communauté (idées, spots, événements à tester)

CREATE TABLE IF NOT EXISTS public.community_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_type TEXT NOT NULL
    CHECK (suggestion_type IN ('improvement', 'event', 'spot', 'tool', 'other')),
  title TEXT,
  place_name TEXT,
  description TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  country_code TEXT NOT NULL DEFAULT 'GN',
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed', 'done', 'dismissed')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_suggestions_status
  ON public.community_suggestions(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_suggestions_country
  ON public.community_suggestions(country_code, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_community_suggestions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_suggestions_updated_at ON public.community_suggestions;
CREATE TRIGGER trg_community_suggestions_updated_at
  BEFORE UPDATE ON public.community_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.set_community_suggestions_updated_at();

ALTER TABLE public.community_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone submit community suggestion" ON public.community_suggestions;
CREATE POLICY "Anyone submit community suggestion"
  ON public.community_suggestions FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'pending');

DROP POLICY IF EXISTS "Admin read community suggestions" ON public.community_suggestions;
CREATE POLICY "Admin read community suggestions"
  ON public.community_suggestions FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admin update community suggestions" ON public.community_suggestions;
CREATE POLICY "Admin update community suggestions"
  ON public.community_suggestions FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
