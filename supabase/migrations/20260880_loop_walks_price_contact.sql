-- THE LOOP — Parcours : tarif (gratuit / payant / THELOOP) + contact + durée optionnelle

ALTER TABLE public.loop_walks
  ADD COLUMN IF NOT EXISTS price_type TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS price_label TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_url TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loop_walks_price_type_check'
  ) THEN
    ALTER TABLE public.loop_walks
      ADD CONSTRAINT loop_walks_price_type_check
      CHECK (price_type IN ('free', 'paid', 'theloop'));
  END IF;
END $$;

-- 0 = durée non renseignée (ne plus forcer 60 min / « 1 h »)
ALTER TABLE public.loop_walks DROP CONSTRAINT IF EXISTS loop_walks_duration_minutes_check;
ALTER TABLE public.loop_walks
  ADD CONSTRAINT loop_walks_duration_minutes_check CHECK (duration_minutes >= 0);

COMMENT ON COLUMN public.loop_walks.price_type IS
  'free = gratuit ; paid = payant (price_label) ; theloop = accès THE LOOP / Prime';
COMMENT ON COLUMN public.loop_walks.price_label IS
  'Libellé tarif si payant (ex. 50 000 GNF)';
COMMENT ON COLUMN public.loop_walks.contact_phone IS
  'Téléphone contact optionnel pour le parcours';
COMMENT ON COLUMN public.loop_walks.contact_url IS
  'Lien contact optionnel (WhatsApp, site…)';
COMMENT ON COLUMN public.loop_walks.duration_minutes IS
  'Durée estimée en minutes ; 0 = non affichée';
