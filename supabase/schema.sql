-- ============================================================================
-- THE LOOP — Schéma PostgreSQL initial pour Supabase
-- Coller ce script dans l'éditeur SQL de Supabase
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── ENUMS ──────────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM (
  'USER_FREE',
  'USER_PRIME',
  'PARTNER',
  'ADMIN'
);

CREATE TYPE event_category AS ENUM (
  'corporate',
  'nightlife',
  'art_culture',
  'gastronomie'
);

CREATE TYPE event_visibility AS ENUM ('public', 'prime');
CREATE TYPE event_status AS ENUM ('draft', 'pending', 'published', 'rejected');
CREATE TYPE location_sub_category AS ENUM ('fine_dining', 'hotels', 'bars_lounges');
CREATE TYPE partner_token_status AS ENUM ('active', 'expired', 'revoked');
CREATE TYPE submission_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE handshake_status AS ENUM ('pending', 'accepted', 'declined');
CREATE TYPE message_channel_type AS ENUM ('private', 'concierge');

-- ─── USERS (extension de auth.users — table métier principale) ───────────────

CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone_number TEXT,
  user_role TEXT NOT NULL DEFAULT 'member',
  qr_code_token TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL DEFAULT 'managed_by_supabase_auth',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_user_role ON users(user_role);
CREATE INDEX idx_users_qr_code_token ON users(qr_code_token);

-- ─── PROFILES (legacy / extensions app — conservé pour compatibilité) ─────

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  role user_role NOT NULL DEFAULT 'USER_FREE',
  company TEXT,
  job_title TEXT,
  sector TEXT,
  phone TEXT,
  is_directory_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_directory ON profiles(is_directory_opt_in) WHERE is_directory_opt_in = TRUE;

-- Trigger : alimenter users (+ profil legacy) à l'inscription auth
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_first_name TEXT := COALESCE(NEW.raw_user_meta_data->>'first_name', '');
  v_last_name TEXT := COALESCE(NEW.raw_user_meta_data->>'last_name', '');
  v_phone TEXT := NULLIF(trim(NEW.raw_user_meta_data->>'phone_number'), '');
  v_user_role TEXT := COALESCE(NEW.raw_user_meta_data->>'user_role', 'member');
  v_qr_token TEXT := COALESCE(NEW.raw_user_meta_data->>'qr_code_token', encode(gen_random_bytes(16), 'hex'));
BEGIN
  INSERT INTO public.users (id, first_name, last_name, email, phone_number, user_role, qr_code_token, password_hash)
  VALUES (NEW.id, v_first_name, v_last_name, COALESCE(NEW.email, ''), v_phone, v_user_role, v_qr_token, 'managed_by_supabase_auth');

  INSERT INTO public.profiles (id, email, full_name, phone, role)
  VALUES (
    NEW.id,
    NEW.email,
    TRIM(v_first_name || ' ' || v_last_name),
    v_phone,
    'USER_FREE'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── LOCATIONS (Guide VIP) ──────────────────────────────────────────────────

CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  sub_category location_sub_category NOT NULL,
  address TEXT NOT NULL,
  phone TEXT,
  website TEXT,
  cover_image_url TEXT,
  is_vip BOOLEAN NOT NULL DEFAULT TRUE,
  click_count INTEGER NOT NULL DEFAULT 0 CHECK (click_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_locations_sub_category ON locations(sub_category);

-- ─── EVENTS ─────────────────────────────────────────────────────────────────

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  program TEXT,
  category event_category NOT NULL,
  visibility event_visibility NOT NULL DEFAULT 'public',
  status event_status NOT NULL DEFAULT 'draft',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  venue_name TEXT NOT NULL,
  venue_address TEXT,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  entry_price NUMERIC(12, 2),
  currency TEXT NOT NULL DEFAULT 'GNF',
  cover_image_url TEXT,
  partner_id UUID,
  click_count INTEGER NOT NULL DEFAULT 0 CHECK (click_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_category ON events(category);
CREATE INDEX idx_events_visibility ON events(visibility);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_starts_at ON events(starts_at);

-- ─── EVENT SPEAKERS ─────────────────────────────────────────────────────────

CREATE TABLE event_speakers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT,
  company TEXT,
  photo_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_event_speakers_event ON event_speakers(event_id);

-- ─── HERO BANNERS ───────────────────────────────────────────────────────────

CREATE TABLE hero_banners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_type TEXT NOT NULL CHECK (target_type IN ('event', 'location')),
  target_id UUID NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── PARTNER TOKENS ─────────────────────────────────────────────────────────

CREATE TABLE partner_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_name TEXT NOT NULL,
  token_code TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  status partner_token_status NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT token_code_format CHECK (token_code ~ '^SPOT-[A-Z0-9]{4}-\d{4}$')
);

CREATE INDEX idx_partner_tokens_code ON partner_tokens(token_code);
CREATE INDEX idx_partner_tokens_status ON partner_tokens(status);

-- ─── PARTNER EVENT SUBMISSIONS (Staging) ────────────────────────────────────

CREATE TABLE partner_event_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_token_id UUID NOT NULL REFERENCES partner_tokens(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category event_category NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  venue_name TEXT NOT NULL,
  speakers JSONB NOT NULL DEFAULT '[]'::JSONB,
  status submission_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_submissions_status ON partner_event_submissions(status);

-- ─── HANDSHAKE REQUESTS (Digital Handshake) ───────────────────────────────────

CREATE TABLE handshake_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status handshake_status NOT NULL DEFAULT 'pending',
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  CONSTRAINT no_self_handshake CHECK (requester_id <> recipient_id),
  CONSTRAINT unique_handshake_pair UNIQUE (requester_id, recipient_id)
);

CREATE INDEX idx_handshake_recipient ON handshake_requests(recipient_id, status);

-- ─── CONVERSATIONS & MESSAGES (Conciergerie Realtime) ───────────────────────

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_type message_channel_type NOT NULL,
  handshake_id UUID REFERENCES handshake_requests(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE conversation_participants (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) > 0),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);

-- ─── FAVORIS ────────────────────────────────────────────────────────────────

CREATE TABLE user_favorite_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_event_favorite UNIQUE (user_id, event_id)
);

CREATE INDEX idx_fav_events_user ON user_favorite_events(user_id);

CREATE TABLE user_favorite_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_location_favorite UNIQUE (user_id, location_id)
);

CREATE INDEX idx_fav_locations_user ON user_favorite_locations(user_id);

-- ─── ANALYTICS ──────────────────────────────────────────────────────────────

CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_analytics_type ON analytics_events(event_type, created_at);

-- ─── HELPER : rôle de l'utilisateur courant ───────────────────────────────────

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_speakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE hero_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_event_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE handshake_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_favorite_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_favorite_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE POLICY "Profiles are viewable by authenticated users"
  ON profiles FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id);

-- USERS
CREATE POLICY "Users are viewable by authenticated users"
  ON users FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "Users can update own row"
  ON users FOR UPDATE TO authenticated
  USING (auth.uid() = id);

-- LOCATIONS (lecture publique via anon key)
CREATE POLICY "Locations are publicly readable"
  ON locations FOR SELECT TO anon, authenticated
  USING (TRUE);

CREATE POLICY "Admins manage locations"
  ON locations FOR ALL TO authenticated
  USING (get_my_role() = 'ADMIN');

-- EVENTS
CREATE POLICY "Public events readable by everyone"
  ON events FOR SELECT TO anon, authenticated
  USING (
    status = 'published' AND (
      visibility = 'public'
      OR (visibility = 'prime' AND get_my_role() IN ('USER_PRIME', 'ADMIN'))
    )
  );

CREATE POLICY "Admins manage events"
  ON events FOR ALL TO authenticated
  USING (get_my_role() = 'ADMIN');

-- EVENT SPEAKERS
CREATE POLICY "Speakers readable with events"
  ON event_speakers FOR SELECT TO anon, authenticated
  USING (TRUE);

CREATE POLICY "Admins manage speakers"
  ON event_speakers FOR ALL TO authenticated
  USING (get_my_role() = 'ADMIN');

-- HERO BANNERS
CREATE POLICY "Active banners publicly readable"
  ON hero_banners FOR SELECT TO anon, authenticated
  USING (is_active = TRUE OR get_my_role() = 'ADMIN');

CREATE POLICY "Admins manage banners"
  ON hero_banners FOR ALL TO authenticated
  USING (get_my_role() = 'ADMIN');

-- PARTNER TOKENS (admin only, sauf validation token côté Edge Function)
CREATE POLICY "Admins manage partner tokens"
  ON partner_tokens FOR ALL TO authenticated
  USING (get_my_role() = 'ADMIN');

-- PARTNER SUBMISSIONS
CREATE POLICY "Partners can insert submissions"
  ON partner_event_submissions FOR INSERT TO authenticated
  WITH CHECK (TRUE);

CREATE POLICY "Admins manage submissions"
  ON partner_event_submissions FOR ALL TO authenticated
  USING (get_my_role() = 'ADMIN');

-- HANDSHAKE
CREATE POLICY "Users see own handshakes"
  ON handshake_requests FOR SELECT TO authenticated
  USING (auth.uid() IN (requester_id, recipient_id));

CREATE POLICY "VIP members create handshakes"
  ON handshake_requests FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() IN ('USER_PRIME', 'ADMIN')
    AND auth.uid() = requester_id
  );

CREATE POLICY "Recipients respond to handshakes"
  ON handshake_requests FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id);

-- MESSAGES (participants only)
CREATE POLICY "Participants read messages"
  ON messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Participants send messages"
  ON messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

-- ★ FAVORIS — RLS strict par utilisateur ★

CREATE POLICY "Users read own favorite events"
  ON user_favorite_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own favorite events"
  ON user_favorite_events FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND get_my_role() IN ('USER_FREE', 'USER_PRIME', 'PARTNER', 'ADMIN')
  );

CREATE POLICY "Users delete own favorite events"
  ON user_favorite_events FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users read own favorite locations"
  ON user_favorite_locations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own favorite locations"
  ON user_favorite_locations FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND get_my_role() IN ('USER_FREE', 'USER_PRIME', 'PARTNER', 'ADMIN')
  );

CREATE POLICY "Users delete own favorite locations"
  ON user_favorite_locations FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ANALYTICS
CREATE POLICY "Anyone can log analytics"
  ON analytics_events FOR INSERT TO anon, authenticated
  WITH CHECK (TRUE);

CREATE POLICY "Admins read analytics"
  ON analytics_events FOR SELECT TO authenticated
  USING (get_my_role() = 'ADMIN');

-- ─── REALTIME (activer sur Supabase Dashboard) ──────────────────────────────
-- ALTER PUBLICATION supabase_realtime ADD TABLE messages;
-- ALTER PUBLICATION supabase_realtime ADD TABLE handshake_requests;

-- ─── UPDATED_AT TRIGGER ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_locations_updated BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_events_updated BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_hero_updated BEFORE UPDATE ON hero_banners
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tokens_updated BEFORE UPDATE ON partner_tokens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_conversations_updated BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── PARTNERSHIP APPLICATIONS (Candidatures) ────────────────────────────────

CREATE TABLE partner_partnership_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  status submission_status NOT NULL DEFAULT 'pending',
  generated_token_code TEXT,
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partnership_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX idx_partnership_applications_status ON partner_partnership_applications(status);
CREATE INDEX idx_partnership_applications_created ON partner_partnership_applications(created_at DESC);

-- ─── PARTNER LOCATION SUBMISSIONS (Staging adresses) ────────────────────────

CREATE TABLE partner_location_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_token_id UUID NOT NULL REFERENCES partner_tokens(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  status submission_status NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  workspace_ref_id TEXT,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  published_location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_location_submissions_status ON partner_location_submissions(status);
CREATE INDEX idx_location_submissions_partner ON partner_location_submissions(partner_token_id);

-- Extension partner_event_submissions : lien vers event publié après approbation
ALTER TABLE partner_event_submissions
  ADD COLUMN IF NOT EXISTS published_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS workspace_ref_id TEXT;

ALTER TABLE partner_event_submissions
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS venue_address TEXT,
  ADD COLUMN IF NOT EXISTS entry_price NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS program TEXT;

-- ─── LOOP PRIME INVITATIONS ─────────────────────────────────────────────────

CREATE TYPE subscription_status AS ENUM ('none', 'pending', 'active', 'expired', 'suspended');
CREATE TYPE prime_invitation_status AS ENUM ('pending', 'activated', 'expired', 'suspended');

CREATE TABLE prime_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token_code TEXT NOT NULL UNIQUE,
  member_name TEXT NOT NULL,
  email TEXT,
  status prime_invitation_status NOT NULL DEFAULT 'pending',
  subscription_status subscription_status NOT NULL DEFAULT 'none',
  subscription_expires_at TIMESTAMPTZ,
  activated_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prime_invitations_token ON prime_invitations(token_code);
CREATE INDEX idx_prime_invitations_status ON prime_invitations(status);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status subscription_status NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS prime_invite_token TEXT;

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS visibility event_visibility NOT NULL DEFAULT 'public';

ALTER TABLE prime_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage Prime invitations"
  ON prime_invitations FOR ALL TO authenticated
  USING (get_my_role() = 'ADMIN')
  WITH CHECK (get_my_role() = 'ADMIN');

CREATE POLICY "Public validate pending invitation token"
  ON prime_invitations FOR SELECT TO anon, authenticated
  USING (status = 'pending');
