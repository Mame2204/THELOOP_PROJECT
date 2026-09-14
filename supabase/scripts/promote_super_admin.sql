-- Promouvoir votre compte en super_admin (permissions totales + gestion des autres admins)
-- Exécuter dans Supabase SQL Editor, puis se déconnecter / reconnecter dans l'app.
-- Adapter l'email si nécessaire.

UPDATE public.users
SET user_role = 'super_admin', updated_at = NOW()
WHERE lower(email) = 'admin@theloop.gn';

-- Vérification
SELECT id, email, user_role, is_active FROM public.users WHERE user_role IN ('admin', 'super_admin');