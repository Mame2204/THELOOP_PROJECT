-- Statut compte utilisateur + suppression logique (super admin)

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active'
  CHECK (account_status IN ('active', 'suspended', 'archived', 'deleted'));

UPDATE public.users
SET account_status = 'suspended'
WHERE is_active = FALSE AND account_status = 'active';

COMMENT ON COLUMN public.users.account_status IS
  'active | suspended | archived | deleted — complète is_active pour les messages de connexion.';

CREATE OR REPLACE FUNCTION public.admin_delete_user_if_orphan(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_links INTEGER := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT
    COALESCE((SELECT COUNT(*)::INTEGER FROM public.events WHERE partner_id = p_user_id), 0)
    + COALESCE((SELECT COUNT(*)::INTEGER FROM public.establishments WHERE partner_id = p_user_id), 0)
    + COALESCE((SELECT COUNT(*)::INTEGER FROM public.tools WHERE partner_id = p_user_id), 0)
    + COALESCE((SELECT COUNT(*)::INTEGER FROM public.partner_benefit_offers WHERE partner_user_id = p_user_id), 0)
  INTO v_links;

  IF v_links > 0 THEN
    RAISE EXCEPTION 'LINKED_CONTENT';
  END IF;

  UPDATE public.users
  SET
    account_status = 'deleted',
    is_active = FALSE,
    email = CONCAT('deleted+', p_user_id::TEXT, '@theloop.invalid'),
    phone_number = NULL,
    updated_at = NOW()
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user_if_orphan(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_if_orphan(UUID) TO authenticated;
