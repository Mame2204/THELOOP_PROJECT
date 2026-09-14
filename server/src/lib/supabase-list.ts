/** Taille de page par défaut pour toute liste Supabase. */
export const SUPABASE_LIST_PAGE_SIZE = 15;

export const PAYMENT_INTENT_COLUMNS = [
  'id',
  'user_id',
  'billing_period',
  'amount_gnf',
  'payer_phone',
  'payment_method',
  'local_pass_id',
  'merchant_reference',
  'djomy_transaction_id',
  'status',
  'fulfillment_status',
  'pass_grant_status',
  'djomy_paid_amount',
  'paid_at',
  'created_at',
  'updated_at',
  'djomy_status',
  'djomy_provider_reference',
  'last_checked_at',
  'last_webhook_event',
  'last_webhook_at',
].join(', ');
