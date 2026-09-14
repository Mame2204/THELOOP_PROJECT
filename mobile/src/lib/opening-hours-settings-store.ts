import {
  fetchAppSetting,
  loadCachedJson,
  pickNewestByTimestamp,
  saveCachedJson,
  upsertAppSetting,
} from '@/lib/remote-settings-sync';
import { applyPreset, type HoursMode, type WeeklyHoursSlot } from '@/lib/opening-hours';

export type OpeningHoursPresetKey = 'tue_sun' | 'sat_only' | 'tue_sat_sun_split';

export interface OpeningHoursModeConfig {
  label: string;
  enabled: boolean;
}

export interface OpeningHoursPresetConfig {
  id: string;
  label: string;
  enabled: boolean;
  /** Plages horaires appliquées dans le formulaire spot (jours + heures). */
  slots: WeeklyHoursSlot[];
  /** Clé legacy — utilisée uniquement si slots est absent en base. */
  preset?: OpeningHoursPresetKey;
}

export interface OpeningHoursSettings {
  modes: Record<HoursMode, OpeningHoursModeConfig>;
  presets: OpeningHoursPresetConfig[];
  defaultOpenTime: string;
  defaultCloseTime: string;
  defaultSunOpenTime: string;
  defaultSunCloseTime: string;
  updatedAt: string;
}

const SETTINGS_KEY = 'opening_hours_config';
const CACHE_KEY = 'loop_opening_hours_settings_v1';

let memoryCache: OpeningHoursSettings | null = null;

export function defaultOpeningHoursSettings(): OpeningHoursSettings {
  return {
    modes: {
      always_open: { label: 'Toujours ouvert', enabled: true },
      by_appointment: { label: 'Sur RDV', enabled: true },
      weekly: { label: 'Plages horaires', enabled: true },
    },
    presets: [
      {
        id: 'tue_sun',
        label: 'Mar–Dim',
        preset: 'tue_sun',
        enabled: true,
        slots: applyPreset('tue_sun', '12:00', '23:00', '12:00', '20:00'),
      },
      {
        id: 'sat_only',
        label: 'Sam uniquement',
        preset: 'sat_only',
        enabled: true,
        slots: applyPreset('sat_only', '12:00', '23:00', '12:00', '20:00'),
      },
      {
        id: 'tue_sat_sun_split',
        label: 'Mar–Sam + Dim',
        preset: 'tue_sat_sun_split',
        enabled: true,
        slots: applyPreset('tue_sat_sun_split', '12:00', '23:00', '12:00', '20:00'),
      },
    ],
    defaultOpenTime: '12:00',
    defaultCloseTime: '23:00',
    defaultSunOpenTime: '12:00',
    defaultSunCloseTime: '20:00',
    updatedAt: new Date().toISOString(),
  };
}

function normalizePresetSlot(raw: Partial<WeeklyHoursSlot>, index: number): WeeklyHoursSlot {
  const days = Array.isArray(raw.days)
    ? raw.days.map(Number).filter((d) => d >= 1 && d <= 7)
    : [];
  return {
    id: raw.id?.trim() || `slot-${index}`,
    days: days.length ? [...new Set(days)].sort((a, b) => a - b) : [2, 3, 4, 5, 6, 7],
    openTime: raw.openTime?.trim() || '12:00',
    closeTime: raw.closeTime?.trim() || '23:00',
  };
}

function normalizePreset(
  raw: Partial<OpeningHoursPresetConfig>,
  index: number,
  defaults: OpeningHoursSettings,
): OpeningHoursPresetConfig {
  const draft: OpeningHoursPresetConfig = {
    id: raw.id?.trim() || `preset-${index}`,
    label: raw.label?.trim() || defaults.presets[index]?.label || 'Raccourci',
    enabled: raw.enabled !== false,
    preset: raw.preset,
    slots: Array.isArray(raw.slots) && raw.slots.length
      ? raw.slots.map(normalizePresetSlot)
      : [],
  };
  if (!draft.slots.length) {
    draft.slots = resolvePresetSlots(draft, defaults);
  }
  return draft;
}

function normalizeSettings(raw: Partial<OpeningHoursSettings> | null | undefined): OpeningHoursSettings {
  const defaults = defaultOpeningHoursSettings();
  if (!raw) return defaults;

  const partial: OpeningHoursSettings = {
    modes: {
      always_open: { ...defaults.modes.always_open, ...raw.modes?.always_open },
      by_appointment: { ...defaults.modes.by_appointment, ...raw.modes?.by_appointment },
      weekly: { ...defaults.modes.weekly, ...raw.modes?.weekly },
    },
    presets: defaults.presets,
    defaultOpenTime: raw.defaultOpenTime?.trim() || defaults.defaultOpenTime,
    defaultCloseTime: raw.defaultCloseTime?.trim() || defaults.defaultCloseTime,
    defaultSunOpenTime: raw.defaultSunOpenTime?.trim() || defaults.defaultSunOpenTime,
    defaultSunCloseTime: raw.defaultSunCloseTime?.trim() || defaults.defaultSunCloseTime,
    updatedAt: raw.updatedAt ?? defaults.updatedAt,
  };

  if (Array.isArray(raw.presets) && raw.presets.length) {
    partial.presets = raw.presets.map((p, i) => normalizePreset(p, i, partial));
  }

  return partial;
}

/** Résout les plages d'un raccourci (custom ou legacy). */
export function resolvePresetSlots(
  preset: Pick<OpeningHoursPresetConfig, 'preset' | 'slots'>,
  settings: Pick<OpeningHoursSettings, 'defaultOpenTime' | 'defaultCloseTime' | 'defaultSunOpenTime' | 'defaultSunCloseTime'>,
): WeeklyHoursSlot[] {
  if (preset.slots?.length) {
    return preset.slots.map((s, i) => normalizePresetSlot(s, i));
  }
  if (preset.preset) {
    return applyPreset(
      preset.preset,
      settings.defaultOpenTime,
      settings.defaultCloseTime,
      settings.defaultSunOpenTime,
      settings.defaultSunCloseTime,
    );
  }
  return applyPreset(
    'tue_sun',
    settings.defaultOpenTime,
    settings.defaultCloseTime,
    settings.defaultSunOpenTime,
    settings.defaultSunCloseTime,
  );
}

export function createEmptyPreset(settings: OpeningHoursSettings): OpeningHoursPresetConfig {
  return {
    id: `custom-${Date.now()}`,
    label: 'Nouveau raccourci',
    enabled: true,
    slots: [{
      id: 'main',
      days: [2, 3, 4, 5, 6, 7],
      openTime: settings.defaultOpenTime,
      closeTime: settings.defaultCloseTime,
    }],
  };
}

export function invalidateOpeningHoursSettingsCache(): void {
  memoryCache = null;
}

export async function getOpeningHoursSettings(): Promise<OpeningHoursSettings> {
  if (memoryCache) return memoryCache;
  const local = normalizeSettings(await loadCachedJson<OpeningHoursSettings>(CACHE_KEY));
  const remote = normalizeSettings(await fetchAppSetting<OpeningHoursSettings>(SETTINGS_KEY));
  const merged = pickNewestByTimestamp(local, remote);
  memoryCache = merged;
  await saveCachedJson(CACHE_KEY, merged);
  return merged;
}

export async function saveOpeningHoursSettings(
  patch: Partial<Omit<OpeningHoursSettings, 'updatedAt'>>,
): Promise<OpeningHoursSettings> {
  const current = await getOpeningHoursSettings();
  const next = normalizeSettings({
    ...current,
    ...patch,
    modes: { ...current.modes, ...patch.modes },
    presets: patch.presets ?? current.presets,
    updatedAt: new Date().toISOString(),
  });
  memoryCache = next;
  await saveCachedJson(CACHE_KEY, next);
  await upsertAppSetting(SETTINGS_KEY, next);
  return next;
}
