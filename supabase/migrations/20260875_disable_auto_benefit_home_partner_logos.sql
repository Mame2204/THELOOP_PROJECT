-- THE LOOP — Accueil : désactiver logos partenaires auto (source=benefit)
-- Les logos Accueil restent uniquement curatés (source=manual) via Control Tower.

UPDATE public.home_partner_logos
SET
  is_active = FALSE,
  updated_at = NOW()
WHERE source = 'benefit'
  AND is_active = TRUE;

COMMENT ON COLUMN public.home_partner_logos.source IS
  'manual = curaté admin (seul affichage Accueil) ; benefit = legacy auto (désactivé).';
