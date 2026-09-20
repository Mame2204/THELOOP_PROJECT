import type { Database, Json } from '@/types/database.types';
import type { supabase } from '@/lib/supabase';

export type DbTableName = keyof Database['public']['Tables'];
export type DbInsert<T extends DbTableName> = Database['public']['Tables'][T]['Insert'];
export type DbUpdate<T extends DbTableName> = Database['public']['Tables'][T]['Update'];

/** Convertit null en undefined (RPC Supabase typées : champs optionnels = undefined, pas null). */
export function undefinedIfNull<T>(value: T | null | undefined): NonNullable<T> | undefined {
  return value == null ? undefined : (value as NonNullable<T>);
}

/** Caste une valeur vers Json (colonnes JSONB, app_settings, payloads RPC). */
export function asJson(value: unknown): Json {
  return value as Json;
}

/** Insert typé lorsque la ligne est construite dynamiquement. */
export function asDbInsert<T extends DbTableName>(
  _table: T,
  row: DbInsert<T> | Record<string, unknown>,
): DbInsert<T> {
  return row as DbInsert<T>;
}

/** Update typé lorsque la patch est construite dynamiquement. */
export function asDbUpdate<T extends DbTableName>(
  _table: T,
  row: DbUpdate<T> | Record<string, unknown>,
): DbUpdate<T> {
  return row as DbUpdate<T>;
}

type SupabaseClient = NonNullable<typeof supabase>;

/** RPC absent des types générés ou args dynamiques — cast sûr via never. */
export function callRpc(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
) {
  return client.rpc(fn as never, args as never);
}
