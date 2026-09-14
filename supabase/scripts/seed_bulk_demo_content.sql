-- =============================================================================
-- THE LOOP — Seed massif démo (un seul bloc SQL)
--
-- CE QUE VOUS SAISISSEZ :
--   • STORAGE_BASE dans le bloc DO (URL racine bucket Supabase public)
--   • E-mails, textes, slugs, local_id avantages, chemins images
--
-- CE QUE VOUS NE SAISISSEZ PAS :
--   • Aucun UUID — gen_random_uuid() + variables PL/pgSQL
--   • FK enchaînées : email → user → partner_staff → spot → event → avantage
--
-- HORAIRES SPOTS (comme l'app mobile) :
--   • opening_hours_label  → texte affiché (« Mar–Dim · 12:00–23:00 »)
--   • establishment_schedules → 7 lignes (day_of_week 1=Lun … 7=Dim)
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Helpers (exécutés avant le seed principal) ───────────────────────────

CREATE OR REPLACE FUNCTION pg_temp._seed_user_by_email(
  p_email TEXT, p_password TEXT, p_first_name TEXT, p_last_name TEXT,
  p_user_role TEXT, p_phone TEXT, p_birth_date DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.users WHERE lower(email) = lower(p_email);
  IF v_id IS NOT NULL THEN
    UPDATE public.users SET
      user_role = p_user_role, phone_number = p_phone,
      birth_date = COALESCE(p_birth_date, birth_date),
      city = COALESCE(city, 'Conakry'), country_code = COALESCE(country_code, 'GN'),
      updated_at = NOW()
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  v_id := gen_random_uuid();
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    lower(p_email), crypt(p_password, gen_salt('bf')), NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('first_name', p_first_name, 'last_name', p_last_name, 'user_role', p_user_role, 'phone_number', p_phone),
    NOW(), NOW(), '', '', '', ''
  );

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_id, jsonb_build_object('sub', v_id::text, 'email', lower(p_email)), 'email', v_id::text, NOW(), NOW(), NOW());

  INSERT INTO public.users (id, email, password_hash, phone_number, first_name, last_name, user_role, qr_code_token, country_code, city, birth_date, is_active)
  VALUES (v_id, lower(p_email), 'managed_by_supabase_auth', p_phone, p_first_name, p_last_name, p_user_role,
    'LOOP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)), 'GN', 'Conakry', p_birth_date, TRUE)
  ON CONFLICT (id) DO NOTHING;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp._seed_spot_hours(
  p_establishment_id UUID,
  p_label TEXT,
  p_open_days INT[],
  p_open_time TEXT,
  p_close_time TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.establishments SET opening_hours_label = p_label WHERE id = p_establishment_id;
  DELETE FROM public.establishment_schedules WHERE establishment_id = p_establishment_id;
  INSERT INTO public.establishment_schedules (establishment_id, day_of_week, opening_time, closing_time, is_closed)
  SELECT p_establishment_id, d,
    CASE WHEN d = ANY(p_open_days) THEN p_open_time ELSE '00:00' END,
    CASE WHEN d = ANY(p_open_days) THEN p_close_time ELSE '00:00' END,
    NOT (d = ANY(p_open_days))
  FROM generate_series(1, 7) AS d;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp._seed_photo_if_missing(p_establishment_id UUID, p_url TEXT, p_primary BOOLEAN)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.establishment_photos WHERE establishment_id = p_establishment_id AND photo_url = p_url) THEN
    INSERT INTO public.establishment_photos (establishment_id, photo_url, is_primary) VALUES (p_establishment_id, p_url, p_primary);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp._seed_tool_photo_if_missing(p_tool_id UUID, p_url TEXT, p_primary BOOLEAN)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tool_photos WHERE tool_id = p_tool_id AND photo_url = p_url) THEN
    INSERT INTO public.tool_photos (tool_id, photo_url, is_primary) VALUES (p_tool_id, p_url, p_primary);
  END IF;
END;
$$;

-- ─── Seed principal ─────────────────────────────────────────────────────────

DO $$
DECLARE
  STORAGE_BASE TEXT := 'https://VOTRE_PROJECT.supabase.co/storage/v1/object/public/VOTRE_BUCKET/';
  PWD TEXT := 'Loop1234!';

  v_member UUID;
  v_prime UUID;
  v_partner UUID;
  v_admin UUID;
  v_partner_staff UUID;

  v_loc_kaloum INT;
  v_loc_dixinn INT;

  v_spot_lavenue UUID;
  v_spot_sky UUID;
  v_tool_yango UUID;
BEGIN
  v_member  := pg_temp._seed_user_by_email('membre@theloop.gn', PWD, 'Mamadou', 'Camara', 'member', '+224620000001', DATE '1995-03-15');
  v_prime   := pg_temp._seed_user_by_email('prime@theloop.gn', PWD, 'Fatoumata', 'Bah', 'prime', '+224620000002', DATE '1992-08-22');
  v_partner := pg_temp._seed_user_by_email('contact@lavenue.gn', PWD, 'Ibrahima', 'Sylla', 'partner', '+224620000003', DATE '1988-11-05');
  v_admin   := pg_temp._seed_user_by_email('admin@theloop.gn', PWD, 'Admin', 'THE LOOP', 'admin', '+224620000004', NULL);

  v_partner_staff := public.ensure_partner_staff(v_partner);
  PERFORM public.ensure_partner_staff(v_admin);

  INSERT INTO public.content_categories (kind, slug, label, emoji, sort_order, is_builtin, is_active)
  VALUES
    ('event', 'soiree', 'Soirée', '🎉', 10, FALSE, TRUE),
    ('spot', 'rooftop', 'Rooftop', '🌆', 10, FALSE, TRUE)
  ON CONFLICT (kind, slug) DO UPDATE SET is_active = TRUE, updated_at = NOW();

  SELECT id INTO v_loc_kaloum FROM public.locations WHERE neighborhood_name ILIKE 'Kaloum' LIMIT 1;
  SELECT id INTO v_loc_dixinn FROM public.locations WHERE neighborhood_name ILIKE 'Dixinn' LIMIT 1;
  IF v_loc_kaloum IS NULL THEN
    INSERT INTO public.locations (neighborhood_name, city, country) VALUES ('Kaloum', 'Conakry', 'Guinée') RETURNING id INTO v_loc_kaloum;
  END IF;
  IF v_loc_dixinn IS NULL THEN
    INSERT INTO public.locations (neighborhood_name, city, country) VALUES ('Dixinn', 'Conakry', 'Guinée') RETURNING id INTO v_loc_dixinn;
  END IF;

  SELECT e.id INTO v_spot_lavenue FROM public.establishments e WHERE e.name = 'L''Avenue' AND e.master_id = v_partner_staff LIMIT 1;
  IF v_spot_lavenue IS NULL THEN
    INSERT INTO public.establishments (
      master_id, name, category_slugs, description, price_indicator, phone_contact,
      website_url, location_id, country_code, content_status, is_active, is_featured
    ) VALUES (
      v_partner_staff, 'L''Avenue', ARRAY['fine_dining', 'rooftop'],
      'Restaurant & lounge — cuisine fusion, terrasse Kaloum.', '€€€', '+224620000100',
      'https://lavenue.gn', v_loc_kaloum, 'GN', 'published', TRUE, TRUE
    ) RETURNING id INTO v_spot_lavenue;
  END IF;

  SELECT e.id INTO v_spot_sky FROM public.establishments e WHERE e.name = 'Sky Lounge' AND e.master_id = v_partner_staff LIMIT 1;
  IF v_spot_sky IS NULL THEN
    INSERT INTO public.establishments (
      master_id, name, category_slugs, description, price_indicator, phone_contact,
      website_url, location_id, country_code, content_status, is_active
    ) VALUES (
      v_partner_staff, 'Sky Lounge', ARRAY['bars_lounges', 'rooftop'],
      'Rooftop cocktails & vue mer.', '€€', '+224620000200',
      'https://skylounge.gn', v_loc_dixinn, 'GN', 'published', TRUE
    ) RETURNING id INTO v_spot_sky;
  END IF;

  PERFORM pg_temp._seed_photo_if_missing(v_spot_lavenue, STORAGE_BASE || 'spots/lavenue-cover.jpg', TRUE);
  PERFORM pg_temp._seed_photo_if_missing(v_spot_lavenue, STORAGE_BASE || 'spots/lavenue-galerie-1.jpg', FALSE);
  PERFORM pg_temp._seed_photo_if_missing(v_spot_sky, STORAGE_BASE || 'spots/skylounge-cover.jpg', TRUE);

  PERFORM pg_temp._seed_spot_hours(v_spot_lavenue, 'Mar–Dim · 12:00–23:00', ARRAY[2,3,4,5,6,7], '12:00', '23:00');
  PERFORM pg_temp._seed_spot_hours(v_spot_sky, 'Jeu–Dim · 18:00–02:00', ARRAY[4,5,6,7], '18:00', '02:00');

  IF NOT EXISTS (SELECT 1 FROM public.events WHERE title = 'Sunset Session — Kaloum') THEN
    INSERT INTO public.events (
      title, category_slugs, description, banner_url, gallery_images,
      organizer_id, master_id, organizer_name, is_external_location, establishment_id,
      location_id, start_date, end_date, is_free, ticket_price, country_code, content_status, content_origin, is_active
    ) VALUES (
      'Sunset Session — Kaloum', ARRAY['nightlife', 'soiree'],
      'DJ set au coucher du soleil.', STORAGE_BASE || 'events/sunset-cover.jpg',
      jsonb_build_array(STORAGE_BASE || 'events/sunset-1.jpg'),
      v_partner, v_partner, 'L''Avenue', FALSE, v_spot_lavenue, v_loc_kaloum,
      NOW() + INTERVAL '3 days', NOW() + INTERVAL '3 days' + INTERVAL '4 hours',
      FALSE, 150000, 'GN', 'published', 'admin', TRUE
    );
  END IF;

  INSERT INTO public.benefit_catalog (local_id, title, description, partner_name, default_validity_days, is_active, offering_partners, benefit_kind, max_uses_per_grant, country_code, city)
  VALUES (
    'benefit-lavenue-20', '-20 % sur l''addition', 'Réduction en semaine.', 'L''Avenue', 30, TRUE,
    jsonb_build_array(jsonb_build_object('partner_id', v_partner::text, 'display_name', 'L''Avenue', 'content_id', v_spot_lavenue::text, 'content_type', 'spot', 'content_title', 'L''Avenue')),
    'usage_limit', 1, 'GN', 'Conakry'
  ) ON CONFLICT (local_id) DO UPDATE SET offering_partners = EXCLUDED.offering_partners, updated_at = NOW();

  INSERT INTO public.user_pass_grants (user_id, pass_catalog_id, label, pass_kind, status, granted_by, local_id)
  VALUES (v_prime, 'pass-heritage-builtin', 'PASS Heritage', 'heritage', 'active', v_admin, 'seed-pass-heritage-001')
  ON CONFLICT (local_id) WHERE local_id IS NOT NULL DO UPDATE SET status = 'active', updated_at = NOW();

  UPDATE public.users SET user_role = 'prime' WHERE id = v_prime;
END $$;

COMMIT;

SELECT e.name, e.opening_hours_label, count(s.*) AS nb_lignes_schedules
FROM public.establishments e
LEFT JOIN public.establishment_schedules s ON s.establishment_id = e.id
WHERE e.opening_hours_label IS NOT NULL
GROUP BY e.id, e.name, e.opening_hours_label;
