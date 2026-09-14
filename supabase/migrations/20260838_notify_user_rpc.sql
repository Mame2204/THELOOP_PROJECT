-- Notification membre : admin, soi-même, ou partenaire (validation avantage, etc.)

CREATE OR REPLACE FUNCTION public.notify_user(
  p_user_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_audience TEXT DEFAULT 'individual',
  p_recipient_phone TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requis';
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = auth.uid() LIMIT 1;

  IF NOT (
    public.is_admin()
    OR auth.uid() = p_user_id
    OR v_role IN ('partner', 'admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  INSERT INTO public.user_notifications (
    user_id,
    recipient_phone,
    title,
    message,
    audience,
    sent_at
  ) VALUES (
    p_user_id,
    NULLIF(trim(COALESCE(p_recipient_phone, '')), ''),
    COALESCE(NULLIF(trim(p_title), ''), 'Notification'),
    COALESCE(p_message, ''),
    COALESCE(NULLIF(trim(p_audience), ''), 'individual'),
    NOW()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_user(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_user(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.notify_user IS
  'Insère une notification pour un membre : admin, le membre lui-même, ou un compte partenaire.';
