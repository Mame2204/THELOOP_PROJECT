-- =============================================================================
-- 20260934 — Fermer l'accès API à la fonction interne d'expiration
-- =============================================================================
-- La migration 20260933 isolait le corps de la tâche dans
-- expire_due_pass_grants_internal, protégée par un REVOKE ALL ... FROM PUBLIC.
-- Ce verrou est insuffisant sur Supabase : des privilèges par défaut accordent
-- explicitement EXECUTE à anon, authenticated et service_role sur toute nouvelle
-- fonction du schéma public. Retirer le droit de PUBLIC ne retire pas ces
-- octrois nominatifs, et la vérification a montré qu'un appelant anonyme pouvait
-- exécuter la tâche, contournant ainsi le contrôle d'appelant que la fonction
-- publique est censée imposer.
--
-- Le risque n'est pas une fuite de données mais une écriture non authentifiée :
-- un inconnu pouvait déclencher l'expiration des PASS, l'activation des PASS en
-- file et la rétrogradation des comptes.
--
-- Les trois rôles exposés par l'API perdent donc explicitement ce droit. Le
-- propriétaire de la base, sous lequel s'exécute pg_cron, le conserve : c'est
-- une propriété du propriétaire, aucun GRANT n'est nécessaire.
-- =============================================================================

REVOKE ALL ON FUNCTION public.expire_due_pass_grants_internal(INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;

-- Le serveur et la console admin passent par la fonction publique, qui conserve
-- son garde-fou et délègue. Ce droit-là reste inchangé.
GRANT EXECUTE ON FUNCTION public.expire_due_pass_grants(INTEGER)
  TO service_role, authenticated;

-- -----------------------------------------------------------------------------
-- Vérification, à lancer après la migration
-- -----------------------------------------------------------------------------
-- Doit ne renvoyer aucune ligne :
--   SELECT r.rolname
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) AS r(rolname)
--   WHERE n.nspname = 'public'
--     AND p.proname = 'expire_due_pass_grants_internal'
--     AND has_function_privilege(r.rolname, p.oid, 'EXECUTE');
