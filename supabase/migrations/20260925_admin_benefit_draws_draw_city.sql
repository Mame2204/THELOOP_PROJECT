-- THE LOOP — Ville ciblée pour les tirages admin (filtre géo optionnel)

ALTER TABLE public.admin_benefit_draws
  ADD COLUMN IF NOT EXISTS draw_city TEXT;

COMMENT ON COLUMN public.admin_benefit_draws.draw_city IS
  'Ville/prefecture ciblée pour le tirage ; NULL = tout le pays.';
