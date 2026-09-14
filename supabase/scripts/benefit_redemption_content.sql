-- THE LOOP — Colonnes contenu sur benefit_redemptions
-- =============================================================================
-- Erreur 42501 « must be owner of table benefit_redemptions » ?
--   → Exécutez UNIQUEMENT le BLOC 2 ci-dessous (fonction SECURITY DEFINER).
--   → Si échec : Supabase Dashboard → Database → Extensions / contact support,
--     ou laissez l'app mobile fonctionner sans ces colonnes (insert fallback actif).
-- =============================================================================

-- ── BLOC 1 — Diagnostic (optionnel) ─────────────────────────────────────────
SELECT
  current_user AS role_actuel,
  pg_get_userbyid(c.relowner) AS table_owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'benefit_redemptions';

-- ── BLOC 2 — Application (à exécuter seul si BLOC 1 montre un owner différent) ─
CREATE OR REPLACE FUNCTION public.apply_benefit_redemption_content_columns()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  ALTER TABLE public.benefit_redemptions
    ADD COLUMN IF NOT EXISTS content_id TEXT,
    ADD COLUMN IF NOT EXISTS content_type TEXT CHECK (content_type IS NULL OR content_type IN ('event', 'spot', 'tool')),
    ADD COLUMN IF NOT EXISTS content_title TEXT;

  CREATE INDEX IF NOT EXISTS idx_benefit_redemptions_content
    ON public.benefit_redemptions(content_id)
    WHERE content_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_benefit_redemption_content_columns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_benefit_redemption_content_columns() TO postgres, service_role, authenticated;

SELECT public.apply_benefit_redemption_content_columns();

DROP FUNCTION IF EXISTS public.apply_benefit_redemption_content_columns();
