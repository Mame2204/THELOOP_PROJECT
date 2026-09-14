-- THE LOOP — Unicité du numéro de téléphone (membres)
-- Exécuter dans Supabase SQL Editor

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_number_unique
  ON public.users (phone_number)
  WHERE phone_number IS NOT NULL
    AND phone_number <> ''
    AND phone_number <> 'non_renseigne';
