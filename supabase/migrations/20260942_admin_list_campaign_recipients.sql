-- Liste des destinataires d'une campagne push (contourne RLS user_notifications pour les admins).

CREATE OR REPLACE FUNCTION public.admin_list_campaign_recipients(
  p_campaign_id UUID,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  user_role TEXT,
  recipient_phone TEXT,
  sent_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
  v_offset INT := GREATEST(0, COALESCE(p_offset, 0));
  v_total BIGINT;
BEGIN
  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'Campagne invalide';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT COUNT(*)::BIGINT
  INTO v_total
  FROM public.user_notifications un
  WHERE un.campaign_id = p_campaign_id;

  RETURN QUERY
  SELECT
    un.user_id,
    u.email,
    u.first_name,
    u.last_name,
    u.user_role,
    un.recipient_phone,
    un.sent_at,
    v_total AS total_count
  FROM public.user_notifications un
  LEFT JOIN public.users u ON u.id = un.user_id
  WHERE un.campaign_id = p_campaign_id
  ORDER BY un.sent_at DESC NULLS LAST, un.user_id NULLS LAST
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_campaign_recipients(UUID, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_campaign_recipients(UUID, INT, INT) TO authenticated;

COMMENT ON FUNCTION public.admin_list_campaign_recipients IS
  'Console admin : destinataires inbox d''une campagne admin_push_campaigns (pagination).';
