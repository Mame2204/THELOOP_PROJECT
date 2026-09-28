-- Compte déjà « supprimé » via l’ancien admin_delete_user_if_orphan (e-mail factice mais prénom/nom restants).
-- Remplacer <USER_UUID> par l’id public.users, exécuter une fois en SQL Editor (service role / superuser).

-- SELECT id, email, first_name, last_name, phone_number, birth_date, city, account_status
-- FROM public.users WHERE id = '<USER_UUID>';

SELECT public._anonymize_user_data('<USER_UUID>'::uuid);

-- Si auth.users est déjà absent, _anonymize peut échouer sur auth : appliquer au minimum :
-- UPDATE public.users
-- SET first_name = 'Compte', last_name = 'supprimé', phone_number = NULL, birth_date = NULL,
--     city = NULL, job_title = NULL, account_status = 'deleted', is_active = FALSE
-- WHERE id = '<USER_UUID>';
