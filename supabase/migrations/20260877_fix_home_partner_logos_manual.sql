-- THE LOOP — Logos Accueil : garantir source=manual pour les curatés admin
-- Ne touche pas is_active (sauf reactivation des seuls logos sans partner_key
-- qui étaient restés inactifs après la purge benefit).

ALTER TABLE public.home_partner_logos
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE public.home_partner_logos
  ADD COLUMN IF NOT EXISTS partner_key TEXT;

-- Marquer comme manuel tout logo qui n'est pas un auto-benefit
UPDATE public.home_partner_logos
SET
  source = 'manual',
  updated_at = NOW()
WHERE source IS DISTINCT FROM 'benefit'
   OR partner_key IS NULL;

-- Réactiver uniquement les logos curatés (pas de partner_key benefit) encore inactifs
UPDATE public.home_partner_logos
SET
  is_active = TRUE,
  updated_at = NOW()
WHERE is_active = FALSE
  AND (partner_key IS NULL OR btrim(partner_key) = '')
  AND source IS DISTINCT FROM 'benefit'
  AND logo_url IS NOT NULL
  AND btrim(logo_url) <> '';

-- Sécurité : garder les auto désactivés
UPDATE public.home_partner_logos
SET
  is_active = FALSE,
  updated_at = NOW()
WHERE source = 'benefit'
  AND is_active = TRUE;

COMMENT ON COLUMN public.home_partner_logos.source IS
  'manual = curaté admin (affichage Accueil) ; benefit = legacy auto (désactivé).';
