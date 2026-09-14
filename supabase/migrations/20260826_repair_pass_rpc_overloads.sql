-- Réparation : doublons upsert_user_pass_purchase (20260821 + 20260822 partiel)
-- À exécuter une fois si erreur « function name is not unique »

DROP FUNCTION IF EXISTS public.upsert_user_pass_purchase(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT
);
DROP FUNCTION IF EXISTS public.upsert_user_pass_purchase(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT,
  INTEGER, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ
);

-- Puis relancer le contenu complet de 20260822_user_pass_grants_pending.sql
