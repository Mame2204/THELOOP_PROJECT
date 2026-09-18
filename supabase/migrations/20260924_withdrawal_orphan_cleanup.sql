-- Nettoyage soumissions retrait orphelines (catalogue déjà supprimé, published_* = NULL)

DELETE FROM public.partner_event_submissions
WHERE status = 'withdrawal_requested'
  AND published_event_id IS NULL;

DELETE FROM public.partner_spot_submissions
WHERE status = 'withdrawal_requested'
  AND published_establishment_id IS NULL
  AND published_tool_id IS NULL;
