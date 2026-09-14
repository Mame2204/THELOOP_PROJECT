-- Compte partenaire outil test + contenus légaux éditables (CGU)

CREATE TABLE IF NOT EXISTS app_legal_content (
  key text PRIMARY KEY,
  title text NOT NULL,
  body text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_legal_content (key, title, body)
VALUES (
  'cgu',
  'Conditions générales d''utilisation',
  'En créant un compte, vous acceptez que vos données personnelles (nom, téléphone, e-mail, date de naissance) soient utilisées uniquement par THE LOOP pour la gestion de votre profil membre, vos favoris, notifications, PASS Prime et avantages. Vos informations ne sont pas revendues à des tiers. Vous pouvez demander la modification ou la suppression de vos données en contactant le service clientèle.'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_legal_content (key, title, body)
VALUES (
  'partner_terms',
  'Conditions partenaires',
  'THE LOOP se réserve le droit de retirer toute publication (événement, spot, outil) sans obligation de justification, notamment en cas de non-conformité, signalement ou décision éditoriale. Les partenaires sont informés que le contenu publié peut être désactivé à tout moment par l''équipe THE LOOP.'
)
ON CONFLICT (key) DO NOTHING;

-- Profil partenaire (nom établissement côté app)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS company TEXT,
  ADD COLUMN IF NOT EXISTS job_title TEXT;

-- Rôle partenaire outil (après création Auth : outil@theloop.gn / Loop1234!)
UPDATE public.users
SET user_role = 'tool_partner',
    phone_number = '+22462000005',
    company = 'Loop Tools GN',
    updated_at = CURRENT_TIMESTAMP
WHERE lower(email) = 'outil@theloop.gn';
