-- Autorise les octrois automatiques par rôle « partner » (cible TOUS = membre + prime + partenaires)

ALTER TABLE public.prime_benefit_grants
  DROP CONSTRAINT IF EXISTS prime_benefit_grants_role_entitlement_check;

ALTER TABLE public.prime_benefit_grants
  ADD CONSTRAINT prime_benefit_grants_role_entitlement_check
  CHECK (role_entitlement IS NULL OR role_entitlement IN ('member', 'prime', 'partner', 'admin'));

COMMENT ON COLUMN public.prime_benefit_grants.role_entitlement IS
  'Origine rôle automatique : member, prime, partner ou admin. NULL = octroi manuel.';

-- Seed / clé pays : s’assurer que partner est présent dans le JSON (lecture tolérante côté app)
INSERT INTO public.app_settings (key, value)
VALUES (
  'role_benefit_entitlements_GN',
  '{"member":[],"prime":[],"partner":[],"admin":[],"updatedAt":"1970-01-01T00:00:00.000Z","updatedBy":null}'::jsonb
)
ON CONFLICT (key) DO UPDATE
SET value = CASE
  WHEN NOT (public.app_settings.value ? 'partner')
    THEN public.app_settings.value || '{"partner":[]}'::jsonb
  ELSE public.app_settings.value
END;
