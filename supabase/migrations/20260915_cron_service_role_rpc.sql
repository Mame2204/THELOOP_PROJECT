-- Permet au serveur paiement (service_role) d’exécuter la diffusion push planifiée.
GRANT EXECUTE ON FUNCTION public.admin_distribute_notifications(TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;
