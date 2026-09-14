-- Modules Espace Pro activables par partenaire (événements / spots / outils).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS partner_can_manage_events BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS partner_can_manage_spots BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS partner_can_manage_tools BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.users.partner_can_manage_events IS 'Partenaire : soumission et gestion d''événements.';
COMMENT ON COLUMN public.users.partner_can_manage_spots IS 'Partenaire : soumission et gestion de spots.';
COMMENT ON COLUMN public.users.partner_can_manage_tools IS 'Partenaire : soumission et gestion d''outils.';

UPDATE public.users
SET
  partner_can_manage_events = TRUE,
  partner_can_manage_spots = TRUE,
  partner_can_manage_tools = TRUE
WHERE user_role IN ('partner', 'tool_partner');
