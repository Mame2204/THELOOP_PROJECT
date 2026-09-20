import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { asJson } from '@/lib/supabase-types';

export type PrelaunchMode = 'text' | 'countdown';

export interface PrelaunchGateConfig {
  enabled: boolean;
  mode: PrelaunchMode;
  title: string;
  message: string;
  countdownTo: string | null;
}

export interface MaintenanceGateConfig {
  enabled: boolean;
  title: string;
  message: string;
}

export interface AppGates {
  signupEnabled: boolean;
  /** Achat PASS / Djomy visible dans l’app. OFF par défaut — activable sans rebuild. */
  passPurchaseEnabled: boolean;
  prelaunch: PrelaunchGateConfig;
  maintenance: MaintenanceGateConfig;
}

const LOCAL_KEY = 'loop_app_gates_v1';
const REMOTE_KEY = 'app_gates';

export const DEFAULT_APP_GATES: AppGates = {
  /** Invite-only par défaut (lancement public / Dec). Activer via super admin si besoin. */
  signupEnabled: false,
  passPurchaseEnabled: false,
  prelaunch: {
    enabled: false,
    mode: 'text',
    title: 'Bientôt',
    message: 'THE LOOP ouvre bientôt. Revenez très vite.',
    countdownTo: null,
  },
  maintenance: {
    enabled: false,
    title: 'Maintenance',
    message: 'THE LOOP est temporairement indisponible. Merci de votre patience.',
  },
};

let cache: AppGates | null = null;

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeAppGates(raw: unknown): AppGates {
  if (!raw || typeof raw !== 'object') {
    return {
      ...DEFAULT_APP_GATES,
      prelaunch: { ...DEFAULT_APP_GATES.prelaunch },
      maintenance: { ...DEFAULT_APP_GATES.maintenance },
    };
  }
  const row = raw as Record<string, unknown>;
  const pre = (row.prelaunch && typeof row.prelaunch === 'object' ? row.prelaunch : {}) as Record<string, unknown>;
  const maint = (row.maintenance && typeof row.maintenance === 'object' ? row.maintenance : {}) as Record<string, unknown>;
  const mode = pre.mode === 'countdown' ? 'countdown' : 'text';
  return {
    signupEnabled: asBool(row.signupEnabled, DEFAULT_APP_GATES.signupEnabled),
    passPurchaseEnabled: asBool(row.passPurchaseEnabled, DEFAULT_APP_GATES.passPurchaseEnabled),
    prelaunch: {
      enabled: asBool(pre.enabled, DEFAULT_APP_GATES.prelaunch.enabled),
      mode,
      title: asString(pre.title, DEFAULT_APP_GATES.prelaunch.title),
      message: asString(pre.message, DEFAULT_APP_GATES.prelaunch.message),
      countdownTo:
        typeof pre.countdownTo === 'string' && pre.countdownTo.trim()
          ? pre.countdownTo.trim()
          : null,
    },
    maintenance: {
      enabled: asBool(maint.enabled, DEFAULT_APP_GATES.maintenance.enabled),
      title: asString(maint.title, DEFAULT_APP_GATES.maintenance.title),
      message: asString(maint.message, DEFAULT_APP_GATES.maintenance.message),
    },
  };
}

async function loadLocal(): Promise<AppGates> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY);
    if (!raw) return normalizeAppGates(null);
    return normalizeAppGates(JSON.parse(raw));
  } catch {
    return normalizeAppGates(null);
  }
}

async function saveLocal(gates: AppGates): Promise<void> {
  await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(gates));
}

async function persistRemote(gates: AppGates): Promise<{ synced: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { synced: true };
  }

  const { error: rpcError } = await supabase.rpc('admin_set_app_setting', {
    p_key: REMOTE_KEY,
    p_value: asJson(gates),
  });
  if (!rpcError) return { synced: true };

  const { error: upsertError } = await supabase.from('app_settings').upsert(
    {
      key: REMOTE_KEY,
      value: asJson(gates),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  );
  if (!upsertError) return { synced: true };

  const message = rpcError.message || upsertError.message;
  console.warn('[AppGates] Sync impossible:', message);
  return { synced: false, error: message };
}

export function invalidateAppGatesCache(): void {
  cache = null;
}

export async function getAppGates(options?: { force?: boolean }): Promise<AppGates> {
  if (!options?.force && cache) return cache;

  const local = await loadLocal();

  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', REMOTE_KEY)
      .maybeSingle();

    if (!error && data?.value != null) {
      cache = normalizeAppGates(data.value);
      await saveLocal(cache);
      return cache;
    }
    if (error) console.warn('[AppGates] Lecture:', error.message);
  }

  cache = local;
  return cache;
}

async function commitGates(next: AppGates): Promise<{ gates: AppGates; synced: boolean; error?: string }> {
  cache = next;
  await saveLocal(next);
  const remote = await persistRemote(next);
  return { gates: next, synced: remote.synced, error: remote.error };
}

export async function setSignupEnabled(enabled: boolean): Promise<{
  gates: AppGates;
  synced: boolean;
  error?: string;
}> {
  const current = await getAppGates();
  return commitGates({ ...current, signupEnabled: enabled });
}

export async function setPassPurchaseEnabled(enabled: boolean): Promise<{
  gates: AppGates;
  synced: boolean;
  error?: string;
}> {
  const current = await getAppGates();
  return commitGates({ ...current, passPurchaseEnabled: enabled });
}

export async function setPrelaunchGate(
  patch: Partial<PrelaunchGateConfig>,
): Promise<{ gates: AppGates; synced: boolean; error?: string }> {
  const current = await getAppGates();
  return commitGates({
    ...current,
    prelaunch: normalizeAppGates({
      ...current,
      prelaunch: { ...current.prelaunch, ...patch },
    }).prelaunch,
  });
}

export async function setMaintenanceGate(
  patch: Partial<MaintenanceGateConfig>,
): Promise<{ gates: AppGates; synced: boolean; error?: string }> {
  const current = await getAppGates();
  return commitGates({
    ...current,
    maintenance: normalizeAppGates({
      ...current,
      maintenance: { ...current.maintenance, ...patch },
    }).maintenance,
  });
}

/** Priorité : maintenance > avant-lancement. */
export type ActiveSystemGate = 'maintenance' | 'prelaunch' | null;

export function resolveActiveSystemGate(gates: AppGates): ActiveSystemGate {
  if (gates.maintenance.enabled) return 'maintenance';
  if (gates.prelaunch.enabled) return 'prelaunch';
  return null;
}
