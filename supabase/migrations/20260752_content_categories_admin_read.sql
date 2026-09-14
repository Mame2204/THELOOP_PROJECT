-- Admin : lire toutes les catégories (actives + désactivées) pour la console

DROP POLICY IF EXISTS "Admin read all content categories" ON public.content_categories;
CREATE POLICY "Admin read all content categories"
  ON public.content_categories FOR SELECT TO authenticated
  USING (public.is_admin());
