-- THE LOOP — Comptes de test + jeton partenaire démo
-- Exécuter dans l'éditeur SQL Supabase après création des utilisateurs Auth.

-- -----------------------------------------------------------------------------
-- 1. Jeton partenaire démo (connexion code SPOT-DEMO-2026)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'partner_tokens') THEN
    INSERT INTO partner_tokens (partner_name, token_code, expires_at, status)
    VALUES ('L''Avenue', 'SPOT-DEMO-2026', '2027-12-31 23:59:59+00', 'active')
    ON CONFLICT (token_code) DO UPDATE SET
      status = 'active',
      expires_at = EXCLUDED.expires_at,
      updated_at = CURRENT_TIMESTAMP;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Rôles sur public.users (après création dans Authentication)
-- Créez d'abord dans Supabase → Authentication → Users :
--   membre@theloop.gn    / Loop1234!  (metadata: user_role=member)
--   prime@theloop.gn     / Loop1234!  (metadata: user_role=prime) — peut déjà exister
--   contact@lavenue.gn   / Loop1234!  (metadata: user_role=partner)
--   admin@theloop.gn     / Loop1234!  (metadata: user_role=admin)
-- -----------------------------------------------------------------------------

UPDATE users SET user_role = 'member', phone_number = '+22462000001', updated_at = CURRENT_TIMESTAMP
WHERE lower(email) = 'membre@theloop.gn';

UPDATE users SET user_role = 'prime', phone_number = '+22462000002', updated_at = CURRENT_TIMESTAMP
WHERE lower(email) = 'prime@theloop.gn';

UPDATE users SET user_role = 'partner', phone_number = '+22462000003', updated_at = CURRENT_TIMESTAMP
WHERE lower(email) = 'contact@lavenue.gn';

UPDATE users SET user_role = 'admin', phone_number = '+22462000004', updated_at = CURRENT_TIMESTAMP
WHERE lower(email) = 'admin@theloop.gn';

-- -----------------------------------------------------------------------------
-- 3. Admin : lecture des demandes partenariat (si table présente)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'partnership_requests') THEN
    ALTER TABLE partnership_requests ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Admin read partnership requests" ON partnership_requests;
    CREATE POLICY "Admin read partnership requests"
      ON partnership_requests FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.user_role IN ('admin', 'super_admin'))
      );
  END IF;
END $$;
