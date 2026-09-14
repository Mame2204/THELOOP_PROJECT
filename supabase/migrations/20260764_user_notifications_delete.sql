-- Permettre aux utilisateurs de supprimer leurs propres notifications (inbox cloche)

DROP POLICY IF EXISTS "Users delete own notifications" ON public.user_notifications;
CREATE POLICY "Users delete own notifications"
  ON public.user_notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());
