-- =============================================================================
-- THE LOOP — Phase 2 : lecture publique du contenu + seed démo Production V1.0
-- À exécuter dans l'éditeur SQL Supabase (après le patch Production V1.0)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RLS — lecture publique du catalogue (anon + authenticated)
-- -----------------------------------------------------------------------------
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE establishment_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE establishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE establishment_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE establishment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_speakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE partnership_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read neighborhoods" ON locations;
CREATE POLICY "Public read neighborhoods" ON locations FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read event categories" ON event_categories;
CREATE POLICY "Public read event categories" ON event_categories FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read establishment categories" ON establishment_categories;
CREATE POLICY "Public read establishment categories" ON establishment_categories FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read events" ON events;
CREATE POLICY "Public read events" ON events FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read active establishments" ON establishments;
CREATE POLICY "Public read active establishments" ON establishments FOR SELECT TO anon, authenticated USING (is_active = TRUE);

DROP POLICY IF EXISTS "Public read establishment photos" ON establishment_photos;
CREATE POLICY "Public read establishment photos" ON establishment_photos FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read establishment schedules" ON establishment_schedules;
CREATE POLICY "Public read establishment schedules" ON establishment_schedules FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read event speakers" ON event_speakers;
CREATE POLICY "Public read event speakers" ON event_speakers FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read event schedules" ON event_schedules;
CREATE POLICY "Public read event schedules" ON event_schedules FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Anyone submit partnership request" ON partnership_requests;
CREATE POLICY "Anyone submit partnership request" ON partnership_requests
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'pending');

-- Organisateurs visibles sur les fiches événements (lecture anonyme)
DROP POLICY IF EXISTS "Anon read active user names" ON users;
CREATE POLICY "Anon read active user names"
  ON users FOR SELECT TO anon
  USING (is_active = TRUE);

-- -----------------------------------------------------------------------------
-- 2. SEED — quartiers & catégories (idempotent)
-- -----------------------------------------------------------------------------
INSERT INTO locations (neighborhood_name, city, country)
SELECT 'Kaloum', 'Conakry', 'Guinée'
WHERE NOT EXISTS (SELECT 1 FROM locations WHERE neighborhood_name = 'Kaloum');

INSERT INTO locations (neighborhood_name, city, country)
SELECT 'Dixinn', 'Conakry', 'Guinée'
WHERE NOT EXISTS (SELECT 1 FROM locations WHERE neighborhood_name = 'Dixinn');

INSERT INTO locations (neighborhood_name, city, country)
SELECT 'Corniche', 'Conakry', 'Guinée'
WHERE NOT EXISTS (SELECT 1 FROM locations WHERE neighborhood_name = 'Corniche');

INSERT INTO event_categories (name, slug)
SELECT 'Corporate', 'corporate'
WHERE NOT EXISTS (SELECT 1 FROM event_categories WHERE slug = 'corporate');

INSERT INTO event_categories (name, slug)
SELECT 'Nightlife', 'nightlife'
WHERE NOT EXISTS (SELECT 1 FROM event_categories WHERE slug = 'nightlife');

INSERT INTO event_categories (name, slug)
SELECT 'Art & Culture', 'art_culture'
WHERE NOT EXISTS (SELECT 1 FROM event_categories WHERE slug = 'art_culture');

INSERT INTO event_categories (name, slug)
SELECT 'Gastronomie', 'gastronomie'
WHERE NOT EXISTS (SELECT 1 FROM event_categories WHERE slug = 'gastronomie');

INSERT INTO establishment_categories (name, slug)
SELECT 'Fine Dining', 'fine_dining'
WHERE NOT EXISTS (SELECT 1 FROM establishment_categories WHERE slug = 'fine_dining');

INSERT INTO establishment_categories (name, slug)
SELECT 'Hôtels', 'hotels'
WHERE NOT EXISTS (SELECT 1 FROM establishment_categories WHERE slug = 'hotels');

INSERT INTO establishment_categories (name, slug)
SELECT 'Bars & Lounges', 'bars_lounges'
WHERE NOT EXISTS (SELECT 1 FROM establishment_categories WHERE slug = 'bars_lounges');

-- -----------------------------------------------------------------------------
-- 3. SEED — partner_staff (requis pour establishments.master_id)
-- -----------------------------------------------------------------------------
INSERT INTO partner_staff (user_id, staff_role)
SELECT u.id, 'master'
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM partner_staff)
LIMIT 1;

-- -----------------------------------------------------------------------------
-- 4. SEED — établissements (si table vide)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_staff UUID;
  v_kaloum INT;
  v_dixinn INT;
  v_corniche INT;
  v_fine_dining INT;
  v_hotels INT;
  v_bars INT;
  v_lavenue UUID;
  v_noom UUID;
  v_sky UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM establishments LIMIT 1) THEN
    RETURN;
  END IF;

  SELECT id INTO v_staff FROM partner_staff LIMIT 1;
  SELECT id INTO v_kaloum FROM locations WHERE neighborhood_name = 'Kaloum' LIMIT 1;
  SELECT id INTO v_dixinn FROM locations WHERE neighborhood_name = 'Dixinn' LIMIT 1;
  SELECT id INTO v_corniche FROM locations WHERE neighborhood_name = 'Corniche' LIMIT 1;
  SELECT id INTO v_fine_dining FROM establishment_categories WHERE slug = 'fine_dining' LIMIT 1;
  SELECT id INTO v_hotels FROM establishment_categories WHERE slug = 'hotels' LIMIT 1;
  SELECT id INTO v_bars FROM establishment_categories WHERE slug = 'bars_lounges' LIMIT 1;

  IF v_staff IS NULL THEN
    RAISE EXCEPTION 'Aucun utilisateur — créez un compte avant le seed Phase 2.';
  END IF;

  INSERT INTO establishments (master_id, name, category_id, description, price_indicator, phone_contact, action_link, location_id)
  VALUES (
    v_staff, 'L''Avenue', v_fine_dining,
    'L''adresse incontournable de la scène business conakryenne. Cuisine franco-africaine raffinée.',
    '€€€', '+224 622 00 00 00', NULL, v_kaloum
  ) RETURNING id INTO v_lavenue;

  INSERT INTO establishments (master_id, name, category_id, description, price_indicator, phone_contact, action_link, location_id)
  VALUES (
    v_staff, 'Hôtel Noom', v_hotels,
    'Hôtel 5 étoiles emblématique, conférences et séjours exécutifs.',
    '€€€', '+224 620 00 00 02', 'https://example.com', v_kaloum
  ) RETURNING id INTO v_noom;

  INSERT INTO establishments (master_id, name, category_id, description, price_indicator, phone_contact, action_link, location_id)
  VALUES (
    v_staff, 'Sky Lounge Kaloum', v_bars,
    'Bar lounge rooftop avec cocktails premium.',
    '€€', '+224 620 00 00 03', NULL, v_kaloum
  ) RETURNING id INTO v_sky;

  INSERT INTO establishment_photos (establishment_id, photo_url, is_primary) VALUES
    (v_lavenue, 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=900&q=80', TRUE),
    (v_lavenue, 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=900&q=80', FALSE),
    (v_noom, 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=900&q=80', TRUE),
    (v_sky, 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=900&q=80', TRUE);

  INSERT INTO establishment_schedules (establishment_id, day_of_week, opening_time, closing_time, is_closed) VALUES
    (v_lavenue, 1, '12:00', '00:00', FALSE),
    (v_lavenue, 6, '12:00', '00:00', FALSE),
    (v_noom, 1, '00:00', '23:59', FALSE),
    (v_sky, 5, '20:00', '04:00', FALSE);
END $$;

-- -----------------------------------------------------------------------------
-- 5. SEED — événements (si table vide)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_organizer UUID;
  v_kaloum INT;
  v_corporate INT;
  v_nightlife INT;
  v_art INT;
  v_gastro INT;
  v_noom UUID;
  v_lavenue UUID;
  v_evt_forum UUID;
  v_evt_nuit UUID;
  v_evt_vernissage UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM events LIMIT 1) THEN
    RETURN;
  END IF;

  SELECT id INTO v_organizer FROM users LIMIT 1;
  SELECT id INTO v_kaloum FROM locations WHERE neighborhood_name = 'Kaloum' LIMIT 1;
  SELECT id INTO v_corporate FROM event_categories WHERE slug = 'corporate' LIMIT 1;
  SELECT id INTO v_nightlife FROM event_categories WHERE slug = 'nightlife' LIMIT 1;
  SELECT id INTO v_art FROM event_categories WHERE slug = 'art_culture' LIMIT 1;
  SELECT id INTO v_gastro FROM event_categories WHERE slug = 'gastronomie' LIMIT 1;
  SELECT id INTO v_noom FROM establishments WHERE name = 'Hôtel Noom' LIMIT 1;
  SELECT id INTO v_lavenue FROM establishments WHERE name = 'L''Avenue' LIMIT 1;

  IF v_organizer IS NULL THEN
    RAISE EXCEPTION 'Aucun utilisateur — créez un compte avant le seed Phase 2.';
  END IF;

  INSERT INTO events (
    title, category_id, description, banner_url, organizer_id,
    is_external_location, establishment_id, custom_location_name, location_id,
    start_date, end_date, is_free, ticket_price, action_link,
    is_loop_x, is_featured, featured_end_date
  ) VALUES (
    'Forum Leaders & Finance — Édition Guinée 2025', v_corporate,
    'Rejoignez les décideurs de l''écosystème financier guinéen pour une soirée d''échanges haut niveau.',
    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80',
    v_organizer, FALSE, v_noom, NULL, v_kaloum,
    '2025-07-17 18:00:00+00', '2025-07-17 22:00:00+00', FALSE, 150000,
    'https://example.com/forum-leaders-finance', FALSE, TRUE, '2026-12-31 23:59:59+00'
  ) RETURNING id INTO v_evt_forum;

  INSERT INTO events (
    title, category_id, description, banner_url, organizer_id,
    is_external_location, establishment_id, custom_location_name, location_id,
    start_date, end_date, is_free, ticket_price, action_link,
    is_loop_x, is_featured
  ) VALUES (
    'Nuit Étoilée — Fally Ipupa', v_nightlife,
    'La plus grande soirée nightlife de l''été à Conakry.',
    'https://images.unsplash.com/photo-1571266028243-d220c702dbed?w=800&q=80',
    v_organizer, TRUE, NULL, 'Stade Général Lansana Conté', v_kaloum,
    '2026-08-15 22:00:00+00', '2026-08-16 04:00:00+00', FALSE, 200000, NULL, FALSE, FALSE
  ) RETURNING id INTO v_evt_nuit;

  INSERT INTO events (
    title, category_id, description, banner_url, organizer_id,
    is_external_location, establishment_id, custom_location_name, location_id,
    start_date, end_date, is_free, ticket_price, action_link,
    is_loop_x, is_featured
  ) VALUES (
    'Vernissage — Regards Croisés sur Conakry', v_art,
    'Une exposition photo célébrant la lumière et les visages de Conakry.',
    'https://images.unsplash.com/photo-1460661419015-442b140a9a91?w=800&q=80',
    v_organizer, TRUE, NULL, 'Centre Culturel Franco-Guinéen', v_kaloum,
    '2026-07-20 18:00:00+00', '2026-07-20 23:00:00+00', FALSE, 50000, NULL, FALSE, FALSE
  ) RETURNING id INTO v_evt_vernissage;

  INSERT INTO events (
    title, category_id, description, banner_url, organizer_id,
    is_external_location, establishment_id, custom_location_name, location_id,
    start_date, end_date, is_free, ticket_price, action_link,
    is_loop_x, is_featured
  ) VALUES (
    'Brunch d''Affaires Dominical — L''Avenue', v_gastro,
    'Brunch networking dominical pour entrepreneurs et cadres dirigeants.',
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
    v_organizer, FALSE, v_lavenue, NULL, v_kaloum,
    '2026-08-03 11:00:00+00', '2026-08-03 14:00:00+00', FALSE, 85000, NULL, FALSE, FALSE
  );

  INSERT INTO events (
    title, category_id, description, banner_url, organizer_id,
    is_external_location, establishment_id, custom_location_name, location_id,
    start_date, end_date, is_free, ticket_price, action_link,
    is_loop_x, is_featured
  ) VALUES (
    'Founders Dinner — Édition Privée', v_gastro,
    'Dîner exclusif réservé aux membres Loop Prime. Lieu révélé 24h avant.',
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
    v_organizer, TRUE, NULL, 'Lieu secret', v_kaloum,
    '2026-09-05 19:30:00+00', '2026-09-05 23:00:00+00', TRUE, NULL,
    'mailto:concierge@theloop.gn?subject=Founders%20Dinner', TRUE, FALSE
  );

  INSERT INTO event_schedules (event_id, time_label, activity_title, order_index) VALUES
    (v_evt_forum, '18h00', 'Accueil VIP', 1),
    (v_evt_forum, '18h30', 'Panels Experts', 2),
    (v_evt_forum, '20h30', 'Cocktail Networking', 3);

  INSERT INTO event_speakers (event_id, full_name, professional_title, company_name) VALUES
    (v_evt_forum, 'Mamadou Baldé', 'Directeur Général', 'Vista Bank Guinée'),
    (v_evt_forum, 'Aïssatou Diallo', 'Économiste Principale', 'BCRG');
END $$;
