-- THE LOOP — Mini-sondages Accueil (one-tap poll)

CREATE TABLE IF NOT EXISTS public.home_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  week_key TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  country_code TEXT NOT NULL DEFAULT 'GN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT home_polls_options_array CHECK (jsonb_typeof(options) = 'array'),
  CONSTRAINT home_polls_options_len CHECK (
    jsonb_array_length(options) BETWEEN 2 AND 4
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_home_polls_one_active
  ON public.home_polls (country_code)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.home_poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES public.home_polls(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT home_poll_votes_identity CHECK (user_id IS NOT NULL OR device_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_home_poll_votes_user
  ON public.home_poll_votes (poll_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_home_poll_votes_device
  ON public.home_poll_votes (poll_id, device_id)
  WHERE device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_home_poll_votes_poll
  ON public.home_poll_votes (poll_id);

ALTER TABLE public.home_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active home polls" ON public.home_polls;
CREATE POLICY "Public read active home polls"
  ON public.home_polls FOR SELECT TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Admin manage home polls" ON public.home_polls;
CREATE POLICY "Admin manage home polls"
  ON public.home_polls FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public read home poll votes" ON public.home_poll_votes;
CREATE POLICY "Public read home poll votes"
  ON public.home_poll_votes FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Anyone insert home poll vote" ON public.home_poll_votes;
CREATE POLICY "Anyone insert home poll vote"
  ON public.home_poll_votes FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Seed sondage de la semaine (si aucun actif)
INSERT INTO public.home_polls (question, options, week_key, is_active, country_code)
SELECT
  'Ce week-end, tu vises quoi ?',
  '[
    {"id":"terrace","label":"Terrasse"},
    {"id":"live","label":"Live"},
    {"id":"brunch","label":"Brunch"},
    {"id":"chill","label":"Chill"}
  ]'::jsonb,
  to_char(NOW(), 'IYYY-"W"IW'),
  true,
  'GN'
WHERE NOT EXISTS (
  SELECT 1 FROM public.home_polls WHERE is_active = true AND country_code = 'GN'
);
