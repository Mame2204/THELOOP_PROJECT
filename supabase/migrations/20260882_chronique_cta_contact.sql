-- Fragment (chronique) : CTA Découvrir optionnel + contact téléphone / e-mail

ALTER TABLE public.chronique_features
  ADD COLUMN IF NOT EXISTS cta_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT;

COMMENT ON COLUMN public.chronique_features.cta_enabled IS
  'Si true : bouton Découvrir vers le contenu lié. Si false : bouton Contacter (tél. prioritaire, sinon e-mail).';
COMMENT ON COLUMN public.chronique_features.contact_phone IS
  'Numéro à appeler quand le CTA Découvrir est désactivé (prioritaire).';
COMMENT ON COLUMN public.chronique_features.contact_email IS
  'E-mail de contact si pas de numéro (CTA Découvrir désactivé).';
