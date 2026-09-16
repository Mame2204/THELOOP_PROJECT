-- Invitations par e-mail sans téléphone obligatoire (aligné users.phone_number nullable).

ALTER TABLE public.admin_user_invites
  ALTER COLUMN phone_number DROP NOT NULL;

UPDATE public.admin_user_invites
SET phone_number = NULL
WHERE phone_number IS NOT NULL
  AND trim(phone_number) IN ('', 'non_renseigne');

COMMENT ON COLUMN public.admin_user_invites.phone_number IS
  'Optionnel pour les invitations e-mail ; NULL si non renseigné.';
