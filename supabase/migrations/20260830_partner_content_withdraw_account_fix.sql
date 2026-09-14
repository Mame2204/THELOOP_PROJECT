-- Retrait soumissions partenaire après suppression admin + fix comptage suppression compte

-- Soumissions orphelines (catalogue supprimé, FK SET NULL) : masquées côté mobile aussi
COMMENT ON COLUMN public.partner_event_submissions.published_event_id IS
  'NULL si l''événement publié a été retiré du catalogue (ON DELETE SET NULL).';

-- Suppression compte : compter le contenu réel + soumissions (pas partner_benefit_offers inexistant)
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
    COALESCE((SELECT COUNT(*)::INTEGER FROM public.events WHERE organizer_id = p_user_id OR master_id = p_user_id OR partner_id = p_user_id), 0)
    + COALESCE((SELECT COUNT(*)::INTEGER FROM public.establishments WHERE master_id = p_user_id OR partner_id = p_user_id), 0)
    + COALESCE((SELECT COUNT(*)::INTEGER FROM public.tools WHERE master_id = p_user_id OR partner_id = p_user_id), 0)
    + COALESCE((
      SELECT COUNT(*)::INTEGER FROM public.partner_event_submissions
      WHERE (partner_user_id = p_user_id OR master_user_id = p_user_id)
        AND (
          status IN ('pending', 'draft', 'rejected')
          OR (status = 'approved' AND published_event_id IS NOT NULL)
        )
    ), 0)
    + COALESCE((
      SELECT COUNT(*)::INTEGER FROM public.partner_spot_submissions
      WHERE partner_user_id = p_user_id
        AND (
          status IN ('pending', 'draft', 'rejected')
          OR (status = 'approved' AND (published_establishment_id IS NOT NULL OR published_tool_id IS NOT NULL))
        )
    ), 0)
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
