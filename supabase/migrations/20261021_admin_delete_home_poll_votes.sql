-- Suppression d’un sondage Accueil : les votes partent avec (ON DELETE CASCADE).
-- Sans politique DELETE, un admin authentifié ne peut pas effacer les lignes
-- de home_poll_votes avant la suppression du sondage.

DROP POLICY IF EXISTS "Admin delete home poll votes" ON public.home_poll_votes;

CREATE POLICY "Admin delete home poll votes"
  ON public.home_poll_votes FOR DELETE TO authenticated
  USING (public.is_admin());
