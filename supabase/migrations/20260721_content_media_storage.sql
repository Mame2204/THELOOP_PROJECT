-- THE LOOP — Bucket Supabase Storage pour images événements & spots

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'content-media',
  'content-media',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read content media" ON storage.objects;
CREATE POLICY "Public read content media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'content-media');

DROP POLICY IF EXISTS "Authenticated upload content media" ON storage.objects;
CREATE POLICY "Authenticated upload content media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'content-media');

DROP POLICY IF EXISTS "Authenticated update content media" ON storage.objects;
CREATE POLICY "Authenticated update content media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'content-media');

DROP POLICY IF EXISTS "Authenticated delete content media" ON storage.objects;
CREATE POLICY "Authenticated delete content media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'content-media');

-- Admin : gestion des photos établissement (couverture + galerie)
DROP POLICY IF EXISTS "Admin manage establishment photos" ON public.establishment_photos;
CREATE POLICY "Admin manage establishment photos"
  ON public.establishment_photos FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
