-- Notifications : historique pour comptes + téléphones (visiteurs)

ALTER TABLE public.user_notifications
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.user_notifications
  ADD COLUMN IF NOT EXISTS recipient_phone TEXT;

CREATE INDEX IF NOT EXISTS idx_user_notifications_phone
  ON public.user_notifications (recipient_phone, sent_at DESC)
  WHERE recipient_phone IS NOT NULL;

COMMENT ON COLUMN public.user_notifications.recipient_phone IS
  'Téléphone canonique pour destinataires sans compte (ou complément compte).';

-- Lecture par téléphone (visiteur identifié) via RPC
CREATE OR REPLACE FUNCTION public.list_notifications_for_phone(p_phone TEXT)
RETURNS SETOF public.user_notifications
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.user_notifications
  WHERE recipient_phone = regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g')
     OR (user_id IS NOT NULL AND user_id::text = 'phone:' || regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'))
  ORDER BY sent_at DESC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.list_notifications_for_phone(TEXT) TO anon, authenticated;
