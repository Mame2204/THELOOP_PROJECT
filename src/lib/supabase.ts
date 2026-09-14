export { supabase, isSupabaseConfigured, validateSupabaseConnection } from '@/lib/supabaseClient';

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          email: string;
          phone_number: string | null;
          user_role: string;
          qr_code_token: string;
          password_hash: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          first_name: string;
          last_name: string;
          email: string;
          phone_number?: string | null;
          user_role?: string;
          qr_code_token: string;
          password_hash?: string;
        };
        Update: {
          first_name?: string;
          last_name?: string;
          email?: string;
          phone_number?: string | null;
          user_role?: string;
          qr_code_token?: string;
          is_active?: boolean;
          updated_at?: string;
        };
      };
    };
  };
};
