import AsyncStorage from '@react-native-async-storage/async-storage';
import { countryCacheKey, countryRemoteKey, resolveCountryCode } from '@/lib/country-settings-keys';
import { DEFAULT_COUNTRY_CODE, type CountryCode } from '@/lib/countries';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { asJson } from '@/lib/supabase-types';

export interface AccueilBlocksConfig {
  hero: boolean;
  poll: boolean;
  corner: boolean;
  chronique: boolean;
  walks: boolean;
  logos: boolean;
}

export interface CatalogTabBlocksConfig {
  hero: boolean;
  filters: boolean;
  /** Onglet visible dans la barre de navigation basse. */
  tabVisible: boolean;
}

export interface PartnerProBlocksConfig {
  content: boolean;
  benefits: boolean;
  featured: boolean;
  rewards: boolean;
  stats: boolean;
  /** Onglet Espace Pro visible pour les partenaires. */
  spaceVisible: boolean;
}

export interface AppSectionsConfig {
  accueil: AccueilBlocksConfig;
  agenda: CatalogTabBlocksConfig;
  spots: CatalogTabBlocksConfig;
  outils: CatalogTabBlocksConfig;
  partnerPro: PartnerProBlocksConfig;
}

const CACHE_BASE = 'loop_app_sections_v1';
const REMOTE_BASE = 'app_sections_ui';
const LEGACY_CACHE = 'loop_app_sections_v1';
const LEGACY_REMOTE = 'app_sections_ui';

export const DEFAULT_SECTIONS: AppSectionsConfig = {
  accueil: { hero: true, poll: true, corner: true, chronique: true, walks: true, logos: true },
  agenda: { hero: false, filters: true, tabVisible: true },
  spots: { hero: false, filters: true, tabVisible: true },
  outils: { hero: false, filters: true, tabVisible: true },
  partnerPro: { content: true, benefits: true, featured: true, rewards: true, stats: true, spaceVisible: true },
};

const cacheByCountry = new Map<string, AppSectionsConfig>();
const remoteRefreshByCountry = new Set<string>();

function sectionsEqual(a: AppSectionsConfig, b: AppSectionsConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function notifySectionsChanged(previous: AppSectionsConfig | undefined, next: AppSectionsConfig): Promise<void> {
  if (previous && sectionsEqual(previous, next)) return;
  const { emitHomeRefresh } = await import('@/lib/home-refresh');
  emitHomeRefresh('sections');
}

async function fetchAppSectionsRemote(
  cc: string,
  cache: string,
  remote: string,
  isLegacyGn: boolean,
  previous?: AppSectionsConfig,
): Promise<AppSectionsConfig | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', remote)
    .maybeSingle();
  if (!error && data?.value != null) {
    const merged = mergeSections(data.value);
    cacheByCountry.set(cc, merged);
    await AsyncStorage.setItem(cache, JSON.stringify(merged));
    await notifySectionsChanged(previous, merged);
    return merged;
  }
  if (isLegacyGn && remote.endsWith('_GN')) {
    const { data: legacy } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', LEGACY_REMOTE)
      .maybeSingle();
    if (legacy?.value != null) {
      const merged = mergeSections(legacy.value);
      cacheByCountry.set(cc, merged);
      await AsyncStorage.setItem(cache, JSON.stringify(merged));
      await supabase.from('app_settings').upsert({
        key: remote,
        value: asJson(merged),
        updated_at: new Date().toISOString(),
      });
      await notifySectionsChanged(previous, merged);
      return merged;
    }
  }
  return null;
}

function scheduleAppSectionsRemoteRefresh(
  cc: string,
  cache: string,
  remote: string,
  isLegacyGn: boolean,
  previous: AppSectionsConfig,
): void {
  if (remoteRefreshByCountry.has(cc)) return;
  remoteRefreshByCountry.add(cc);
  void fetchAppSectionsRemote(cc, cache, remote, isLegacyGn, previous).finally(() => {
    remoteRefreshByCountry.delete(cc);
  });
}

function keys(countryCode?: CountryCode) {
  const cc = resolveCountryCode(countryCode);
  return {
    cc,
    cache: countryCacheKey(CACHE_BASE, cc),
    remote: countryRemoteKey(REMOTE_BASE, cc),
    isLegacyGn: cc === DEFAULT_COUNTRY_CODE,
  };
}

function mergeSections(raw: unknown): AppSectionsConfig {
  const d = DEFAULT_SECTIONS;
  if (!raw || typeof raw !== 'object') {
    return {
      ...d,
      accueil: { ...d.accueil },
      agenda: { ...d.agenda },
      spots: { ...d.spots },
      outils: { ...d.outils },
      partnerPro: { ...d.partnerPro },
    };
  }
  const row = raw as Partial<AppSectionsConfig>;
  return {
    accueil: { ...d.accueil, ...(row.accueil ?? {}) },
    agenda: { ...d.agenda, ...(row.agenda ?? {}) },
    spots: { ...d.spots, ...(row.spots ?? {}) },
    outils: { ...d.outils, ...(row.outils ?? {}) },
    partnerPro: { ...d.partnerPro, ...(row.partnerPro ?? {}) },
  };
}

export function invalidateAppSectionsCache(countryCode?: CountryCode): void {
  if (countryCode) {
    cacheByCountry.delete(resolveCountryCode(countryCode));
    return;
  }
  cacheByCountry.clear();
}

async function migrateLegacyGn(cacheKey: string): Promise<AppSectionsConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(LEGACY_CACHE);
    if (!raw) return null;
    const merged = mergeSections(JSON.parse(raw));
    await AsyncStorage.setItem(cacheKey, JSON.stringify(merged));
    if (isSupabaseConfigured() && supabase) {
      await supabase.from('app_settings').upsert({
        key: countryRemoteKey(REMOTE_BASE, DEFAULT_COUNTRY_CODE),
        value: asJson(merged),
        updated_at: new Date().toISOString(),
      });
    }
    return merged;
  } catch {
    return null;
  }
}

export async function getAppSections(
  countryCode: CountryCode = DEFAULT_COUNTRY_CODE,
  options?: { force?: boolean },
): Promise<AppSectionsConfig> {
  const { cc, cache, remote, isLegacyGn } = keys(countryCode);
  if (!options?.force && cacheByCountry.has(cc)) {
    const cached = cacheByCountry.get(cc)!;
    scheduleAppSectionsRemoteRefresh(cc, cache, remote, isLegacyGn, cached);
    return cached;
  }

  let local = DEFAULT_SECTIONS;
  let hasDiskCache = false;
  try {
    const raw = await AsyncStorage.getItem(cache);
    if (raw) {
      local = mergeSections(JSON.parse(raw));
      hasDiskCache = true;
    } else if (isLegacyGn) {
      const migrated = await migrateLegacyGn(cache);
      if (migrated) {
        local = migrated;
        hasDiskCache = true;
      }
    }
  } catch {
    /* defaults */
  }

  cacheByCountry.set(cc, local);

  if (!options?.force && hasDiskCache) {
    scheduleAppSectionsRemoteRefresh(cc, cache, remote, isLegacyGn, local);
    return local;
  }

  if (isSupabaseConfigured() && supabase) {
    const remoteMerged = await fetchAppSectionsRemote(cc, cache, remote, isLegacyGn, local);
    if (remoteMerged) return remoteMerged;
  }

  return local;
}

export async function saveAppSections(
  countryCode: CountryCode,
  next: AppSectionsConfig,
): Promise<AppSectionsConfig> {
  const { cc, cache, remote } = keys(countryCode);
  cacheByCountry.set(cc, next);
  await AsyncStorage.setItem(cache, JSON.stringify(next));
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from('app_settings').upsert({
      key: remote,
      value: asJson(next),
      updated_at: new Date().toISOString(),
    });
    if (error) console.warn('[AppSections] upsert:', error.message);
  }
  const { emitHomeRefresh } = await import('@/lib/home-refresh');
  emitHomeRefresh('sections');
  return next;
}

export async function setAccueilBlock(
  countryCode: CountryCode,
  key: keyof AccueilBlocksConfig,
  enabled: boolean,
): Promise<AppSectionsConfig> {
  const current = await getAppSections(countryCode);
  return saveAppSections(countryCode, {
    ...current,
    accueil: { ...current.accueil, [key]: enabled },
  });
}

export async function setCatalogTabBlock(
  countryCode: CountryCode,
  tab: 'agenda' | 'spots' | 'outils',
  key: keyof CatalogTabBlocksConfig,
  enabled: boolean,
): Promise<AppSectionsConfig> {
  const current = await getAppSections(countryCode);
  return saveAppSections(countryCode, {
    ...current,
    [tab]: { ...current[tab], [key]: enabled },
  });
}

export async function setCatalogTabVisible(
  countryCode: CountryCode,
  tab: 'agenda' | 'spots' | 'outils',
  visible: boolean,
): Promise<AppSectionsConfig> {
  const current = await getAppSections(countryCode);
  return saveAppSections(countryCode, {
    ...current,
    [tab]: { ...current[tab], tabVisible: visible },
  });
}

export async function setPartnerProSpaceVisible(
  countryCode: CountryCode,
  visible: boolean,
): Promise<AppSectionsConfig> {
  const current = await getAppSections(countryCode);
  return saveAppSections(countryCode, {
    ...current,
    partnerPro: { ...current.partnerPro, spaceVisible: visible },
  });
}

export async function setPartnerProBlock(
  countryCode: CountryCode,
  key: keyof PartnerProBlocksConfig,
  enabled: boolean,
): Promise<AppSectionsConfig> {
  const current = await getAppSections(countryCode);
  return saveAppSections(countryCode, {
    ...current,
    partnerPro: { ...current.partnerPro, [key]: enabled },
  });
}
