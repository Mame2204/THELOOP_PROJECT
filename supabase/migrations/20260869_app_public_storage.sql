-- THE LOOP — Bucket public pour pages statiques (confirmation e-mail, etc.)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'app-public',
  'app-public',
  true,
  1048576,
  ARRAY['text/html', 'text/plain', 'application/json']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read app public assets" ON storage.objects;
CREATE POLICY "Public read app public assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'app-public');

DROP POLICY IF EXISTS "Service role manage app public assets" ON storage.objects;
CREATE POLICY "Service role manage app public assets"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'app-public')
  WITH CHECK (bucket_id = 'app-public');
