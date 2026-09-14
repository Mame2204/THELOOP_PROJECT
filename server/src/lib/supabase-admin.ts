import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.js';

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

export interface PaymentIntentRow {
  id: string;
  user_id: string;
  billing_period: string;
  amount_gnf: number;
  payer_phone: string;
  payment_method: string;
  local_pass_id: string;
  merchant_reference: string;
  djomy_transaction_id: string | null;
  status: string;
  fulfillment_status: string;
  pass_grant_status: string | null;
  djomy_paid_amount: number | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  djomy_status?: string | null;
  djomy_provider_reference?: string | null;
  last_checked_at?: string | null;
  last_webhook_event?: string | null;
  last_webhook_at?: string | null;
}
