-- THE LOOP — Les Singuliers : recentrage impact / œuvre (plus de biographie CV)

ALTER TABLE public.creator_corner_features
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS badge_tag TEXT,
  ADD COLUMN IF NOT EXISTS core_quote TEXT,
  ADD COLUMN IF NOT EXISTS impact_description TEXT,
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS related_target_type TEXT,
  ADD COLUMN IF NOT EXISTS related_target_id TEXT,
  ADD COLUMN IF NOT EXISTS related_target_slug TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'creator_corner_related_target_type_check'
  ) THEN
    ALTER TABLE public.creator_corner_features
      ADD CONSTRAINT creator_corner_related_target_type_check
      CHECK (
        related_target_type IS NULL
        OR related_target_type IN ('spot', 'event', 'tool')
      );
  END IF;
END $$;

-- Backfill depuis l’ancien modèle « portrait / parcours »
UPDATE public.creator_corner_features
SET
  impact_description = COALESCE(
    NULLIF(TRIM(impact_description), ''),
    NULLIF(TRIM(story), ''),
    NULLIF(TRIM(hook), ''),
    title
  ),
  badge_tag = COALESCE(
    NULLIF(TRIM(badge_tag), ''),
    NULLIF(TRIM(person_role), ''),
    'Singularité'
  ),
  category = COALESCE(
    NULLIF(TRIM(category), ''),
    'Impact local'
  ),
  media_url = COALESCE(
    NULLIF(TRIM(media_url), ''),
    NULLIF(TRIM(cover_image_url), ''),
    NULLIF(TRIM(portrait_url), '')
  ),
  core_quote = COALESCE(
    NULLIF(TRIM(core_quote), ''),
    NULLIF(TRIM(advice), '')
  ),
  -- hook reste NOT NULL : on le synchronise avec le badge (compat anciennes lectures)
  hook = COALESCE(
    NULLIF(TRIM(badge_tag), ''),
    NULLIF(TRIM(person_role), ''),
    NULLIF(TRIM(hook), ''),
    'Singularité'
  )
WHERE impact_description IS NULL
   OR badge_tag IS NULL
   OR media_url IS NULL
   OR category IS NULL;

COMMENT ON COLUMN public.creator_corner_features.person_name IS
  'Sujet mis en avant (personne, projet, collectif, lieu…) — pas une biographie.';
COMMENT ON COLUMN public.creator_corner_features.title IS
  'Titre de l’œuvre / de l’angle d’impact.';
COMMENT ON COLUMN public.creator_corner_features.category IS
  'Catégorie d’impact (Innovation, Culture & Mémoire, Savoir-faire, Stratégie & Impact…).';
COMMENT ON COLUMN public.creator_corner_features.badge_tag IS
  'Badge court qui résume l’essence de la démarche.';
COMMENT ON COLUMN public.creator_corner_features.core_quote IS
  'Citation ou phrase clé en exergue (optionnel).';
COMMENT ON COLUMN public.creator_corner_features.impact_description IS
  'Texte centré sur l’œuvre, l’action ou l’innovation — valeur ajoutée concrète.';
COMMENT ON COLUMN public.creator_corner_features.media_url IS
  'Visuel principal de l’œuvre / de l’action (pas un portrait CV).';
COMMENT ON COLUMN public.creator_corner_features.related_target_type IS
  'Lien optionnel vers un contenu app : spot | event | tool.';
COMMENT ON TABLE public.creator_corner_features IS
  'Les Singuliers — mise en avant d’un impact / d’une œuvre à Conakry (pas une bio).';
