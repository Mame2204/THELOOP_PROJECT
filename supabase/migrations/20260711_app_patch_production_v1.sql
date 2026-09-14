-- =============================================================================
-- THE LOOP — Patch application (Production V1.0)
-- À exécuter APRÈS le script principal validé par la Data Analyst.
-- Ne recrée pas les tables : RLS, Auth sync, index uniquement.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Sync Supabase Auth → public.users (même UUID)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_name TEXT := COALESCE(NEW.raw_user_meta_data->>'first_name', '');
  v_last_name TEXT := COALESCE(NEW.raw_user_meta_data->>'last_name', '');
  v_phone TEXT := COALESCE(NULLIF(NEW.raw_user_meta_data->>'phone_number', ''), 'non_renseigne');
  v_user_role TEXT := COALESCE(NEW.raw_user_meta_data->>'user_role', 'member');
  v_qr_token TEXT := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'qr_code_token', ''),
    replace(gen_random_uuid()::text, '-', '')
  );
BEGIN
  INSERT INTO public.users (
    id, email, password_hash, phone_number,
    first_name, last_name, user_role, qr_code_token
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    'managed_by_supabase_auth',
    v_phone,
    v_first_name,
    v_last_name,
    v_user_role,
    v_qr_token
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    phone_number = EXCLUDED.phone_number,
    updated_at = CURRENT_TIMESTAMP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- 2. Helper rôle (users.user_role VARCHAR — pas de table profiles)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_user_role()
RETURNS VARCHAR
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_role FROM users WHERE id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- 3. RLS — users (lecture / mise à jour propre ligne)
-- -----------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own row" ON users;
CREATE POLICY "Users read own row"
  ON users FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Users update own row" ON users;
CREATE POLICY "Users update own row"
  ON users FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users read public directory" ON users;
CREATE POLICY "Users read public directory"
  ON users FOR SELECT TO authenticated
  USING (is_active = TRUE);

-- -----------------------------------------------------------------------------
-- 4. RLS — favorite_events & favorite_spots (schéma Production V1.0)
-- -----------------------------------------------------------------------------
ALTER TABLE favorite_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorite_spots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own favorite events" ON favorite_events;
DROP POLICY IF EXISTS "Users insert own favorite events" ON favorite_events;
DROP POLICY IF EXISTS "Users delete own favorite events" ON favorite_events;

CREATE POLICY "Users read own favorite events"
  ON favorite_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own favorite events"
  ON favorite_events FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND get_my_user_role() IN ('member', 'prime', 'partner')
  );

CREATE POLICY "Users delete own favorite events"
  ON favorite_events FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users read own favorite spots" ON favorite_spots;
DROP POLICY IF EXISTS "Users insert own favorite spots" ON favorite_spots;
DROP POLICY IF EXISTS "Users delete own favorite spots" ON favorite_spots;

CREATE POLICY "Users read own favorite spots"
  ON favorite_spots FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own favorite spots"
  ON favorite_spots FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND get_my_user_role() IN ('member', 'prime', 'partner')
  );

CREATE POLICY "Users delete own favorite spots"
  ON favorite_spots FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 5. Index performance favoris (si absents)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_favorite_events_user ON favorite_events(user_id);
CREATE INDEX IF NOT EXISTS idx_favorite_spots_user ON favorite_spots(user_id);
