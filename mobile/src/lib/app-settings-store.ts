import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export interface AppSettings {
  showCommunitySuggestion: boolean;
}

const DEFAULTS: AppSettings = {
  showCommunitySuggestion: true,
};

const LOCAL_KEY = 'loop_app_settings_v1';
const REMOTE_KEY = 'community_ui';

let cache: AppSettings | null = null;

async function loadLocal(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      showCommunitySuggestion:
        typeof parsed.showCommunitySuggestion === 'boolean'
          ? parsed.showCommunitySuggestion
          : DEFAULTS.showCommunitySuggestion,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

async function saveLocal(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(settings));
}

function mapRemoteValue(value: unknown): AppSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULTS };
  const row = value as { showSuggestionButton?: unknown };
  return {
    showCommunitySuggestion:
      typeof row.showSuggestionButton === 'boolean'
        ? row.showSuggestionButton
        : DEFAULTS.showCommunitySuggestion,
  };
}

export function invalidateAppSettingsCache(): void {
  cache = null;
}

export async function getAppSettings(): Promise<AppSettings> {
  if (cache) return cache;

  const local = await loadLocal();

  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', REMOTE_KEY)
      .maybeSingle();

    if (!error && data?.value != null) {
      cache = mapRemoteValue(data.value);
      await saveLocal(cache);
      return cache;
    }

    if (error) {
      console.warn('[AppSettings] Lecture community_ui:', error.message);
    }
  }

  cache = local;
  return cache;
}

export async function setShowCommunitySuggestion(enabled: boolean): Promise<{
  settings: AppSettings;
  synced: boolean;
  error?: string;
}> {
  const next: AppSettings = { showCommunitySuggestion: enabled };
  cache = next;
  await saveLocal(next);

  if (!isSupabaseConfigured() || !supabase) {
    return { settings: next, synced: true };
  }

  // 1) RPC admin (bypass RLS fragile sur upsert client)
  const { error: rpcError } = await supabase.rpc('admin_set_app_setting', {
    p_key: REMOTE_KEY,
    p_value: { showSuggestionButton: enabled },
  });

  if (!rpcError) {
    return { settings: next, synced: true };
  }

  // 2) Fallback upsert classique
  const { error: upsertError } = await supabase.from('app_settings').upsert(
    {
      key: REMOTE_KEY,
      value: { showSuggestionButton: enabled },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  );

  if (!upsertError) {
    return { settings: next, synced: true };
  }

  const message = rpcError.message || upsertError.message;
  console.warn('[AppSettings] Sync community_ui impossible:', message);
  // On conserve le réglage local / cache pour cette session.
  return {
    settings: next,
    synced: false,
    error: message,
  };
}
