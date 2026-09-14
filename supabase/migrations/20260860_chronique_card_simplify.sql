-- Chronique Accueil : carte éditoriale légère liée à un contenu catalogue

ALTER TABLE public.chronique_features
  ADD COLUMN IF NOT EXISTS target_type TEXT
    CHECK (target_type IS NULL OR target_type IN ('event', 'spot', 'tool')),
  ADD COLUMN IF NOT EXISTS target_id TEXT,
  ADD COLUMN IF NOT EXISTS target_slug TEXT,
  ADD COLUMN IF NOT EXISTS footnote TEXT;

COMMENT ON TABLE public.chronique_features IS
  'Chronique Accueil — carte éditoriale courte (titre, ambiance, lien spot/event/outil).';
COMMENT ON COLUMN public.chronique_features.click_count IS
  'Clics CTA carte Chronique (redirection fiche contenu).';
COMMENT ON COLUMN public.chronique_features.hook IS
  'Texte d’ambiance court (3–4 lignes) affiché sur la carte.';
COMMENT ON COLUMN public.chronique_features.period_label IS
  'Surtitre carte (ex. VOLUME 01 ou CHRONIQUE).';
COMMENT ON COLUMN public.chronique_features.footnote IS
  'Note de bas de carte (ex. accès réservé).';
COMMENT ON COLUMN public.chronique_features.target_type IS
  'Type de contenu lié (event | spot | tool).';
COMMENT ON COLUMN public.chronique_features.target_slug IS
  'Slug de navigation vers la fiche détail.';

-- Reprendre advice comme footnote si déjà renseigné
UPDATE public.chronique_features
SET footnote = advice
WHERE footnote IS NULL
  AND advice IS NOT NULL
  AND length(trim(advice)) > 0;
