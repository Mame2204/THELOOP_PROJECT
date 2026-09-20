import {
  fetchAppSetting,
  loadCachedJson,
  saveCachedJson,
  upsertAppSetting,
} from '@/lib/remote-settings-sync';
import { BENEFIT_KIND_LABELS, type BenefitKind } from '@/lib/benefit-catalog-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { asJson } from '@/lib/supabase-types';

export interface BenefitTypeDefinition {
  id: string;
  /** Identifiant technique stable (slug). */
  slug: string;
  label: string;
  description: string;
  /** Mécanique d'octroi sous-jacente. */
  mechanic: BenefitKind;
  defaultQuantity: number | null;
  defaultMaxUses: number | null;
  isActive: boolean;
  sortOrder: number;
  /** Types d'origine — ne peuvent pas être supprimés, seulement désactivés / renommés. */
  isBuiltIn: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BenefitTypesConfig {
  types: BenefitTypeDefinition[];
  updatedAt: string;
}

const STORAGE_KEY = 'loop_benefit_types_v1';
const REMOTE_KEY = 'benefit_types';

const BUILT_IN: Array<Omit<BenefitTypeDefinition, 'createdAt' | 'updatedAt'>> = [
  {
    id: 'bt-unlimited',
    slug: 'unlimited',
    label: BENEFIT_KIND_LABELS.unlimited,
    description: 'Avantage sans limite de quantité ni d\'utilisations.',
    mechanic: 'unlimited',
    defaultQuantity: null,
    defaultMaxUses: null,
    isActive: true,
    sortOrder: 10,
    isBuiltIn: true,
  },
  {
    id: 'bt-quantity',
    slug: 'quantity',
    label: BENEFIT_KIND_LABELS.quantity,
    description: 'Ex. 2 entrées, 1 cocktail — quantité fixe par octroi.',
    mechanic: 'quantity',
    defaultQuantity: 1,
    defaultMaxUses: null,
    isActive: true,
    sortOrder: 20,
    isBuiltIn: true,
  },
  {
    id: 'bt-usage-limit',
    slug: 'usage_limit',
    label: BENEFIT_KIND_LABELS.usage_limit,
    description: 'Ex. -20 % utilisable un nombre limité de fois.',
    mechanic: 'usage_limit',
    defaultQuantity: null,
    defaultMaxUses: 1,
    isActive: true,
    sortOrder: 30,
    isBuiltIn: true,
  },
];

function nowIso(): string {
  return new Date().toISOString();
}

function slugify(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40) || `type_${Date.now()}`;
}

function normalizeType(raw: Partial<BenefitTypeDefinition> & Pick<BenefitTypeDefinition, 'id' | 'label' | 'mechanic'>): BenefitTypeDefinition {
  const ts = nowIso();
  const mechanic: BenefitKind =
    raw.mechanic === 'quantity' || raw.mechanic === 'usage_limit' || raw.mechanic === 'unlimited'
      ? raw.mechanic
      : 'unlimited';
  return {
    id: raw.id,
    slug: (raw.slug ?? slugify(raw.label)).trim() || raw.id,
    label: raw.label.trim(),
    description: (raw.description ?? '').trim(),
    mechanic,
    defaultQuantity: mechanic === 'quantity' ? (raw.defaultQuantity ?? 1) : null,
    defaultMaxUses: mechanic === 'usage_limit' ? (raw.defaultMaxUses ?? 1) : null,
    isActive: raw.isActive !== false,
    sortOrder: Number(raw.sortOrder ?? 100),
    isBuiltIn: Boolean(raw.isBuiltIn),
    createdAt: raw.createdAt ?? ts,
    updatedAt: raw.updatedAt ?? ts,
  };
}

function seedConfig(): BenefitTypesConfig {
  const ts = nowIso();
  return {
    types: BUILT_IN.map((t) => normalizeType({ ...t, createdAt: ts, updatedAt: ts })),
    updatedAt: ts,
  };
}

function mergeWithBuiltIns(types: BenefitTypeDefinition[]): BenefitTypeDefinition[] {
  const byId = new Map(types.map((t) => [t.id, normalizeType(t)]));
  for (const builtIn of BUILT_IN) {
    if (!byId.has(builtIn.id)) {
      byId.set(builtIn.id, normalizeType({ ...builtIn, createdAt: nowIso(), updatedAt: nowIso() }));
    } else {
      const existing = byId.get(builtIn.id)!;
      byId.set(builtIn.id, {
        ...existing,
        isBuiltIn: true,
        mechanic: existing.mechanic || builtIn.mechanic,
      });
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'fr'));
}

async function persist(config: BenefitTypesConfig): Promise<BenefitTypesConfig> {
  const next: BenefitTypesConfig = {
    types: mergeWithBuiltIns(config.types),
    updatedAt: nowIso(),
  };
  await saveCachedJson(STORAGE_KEY, next);

  if (isSupabaseConfigured() && supabase) {
    const { error: rpcError } = await supabase.rpc('admin_set_app_setting', {
      p_key: REMOTE_KEY,
      p_value: asJson(next),
    });
    if (rpcError) {
      console.warn('[BenefitTypes] RPC:', rpcError.message);
      await upsertAppSetting(REMOTE_KEY, next);
    }
  } else {
    await upsertAppSetting(REMOTE_KEY, next);
  }

  return next;
}

async function loadConfig(): Promise<BenefitTypesConfig> {
  const remote = await fetchAppSetting<BenefitTypesConfig>(REMOTE_KEY);
  if (remote?.types && Array.isArray(remote.types)) {
    const merged = {
      types: mergeWithBuiltIns(remote.types),
      updatedAt: remote.updatedAt ?? nowIso(),
    };
    await saveCachedJson(STORAGE_KEY, merged);
    return merged;
  }

  const cached = await loadCachedJson<BenefitTypesConfig>(STORAGE_KEY);
  if (cached?.types?.length) {
    return { types: mergeWithBuiltIns(cached.types), updatedAt: cached.updatedAt ?? nowIso() };
  }

  return persist(seedConfig());
}

/** Types d'avantage en cache local — affichage immédiat sans fetch Supabase. */
export async function peekBenefitTypes(activeOnly = false): Promise<BenefitTypeDefinition[]> {
  const cached = await loadCachedJson<BenefitTypesConfig>(STORAGE_KEY);
  const types = cached?.types?.length ? mergeWithBuiltIns(cached.types) : seedConfig().types;
  return activeOnly ? types.filter((t) => t.isActive) : types;
}

export async function listBenefitTypes(activeOnly = false): Promise<BenefitTypeDefinition[]> {
  const config = await loadConfig();
  return activeOnly ? config.types.filter((t) => t.isActive) : config.types;
}

export async function getBenefitType(id: string): Promise<BenefitTypeDefinition | null> {
  const types = await listBenefitTypes(false);
  return types.find((t) => t.id === id) ?? null;
}

export async function findBenefitTypeByMechanic(mechanic: BenefitKind): Promise<BenefitTypeDefinition | null> {
  const types = await listBenefitTypes(true);
  return types.find((t) => t.mechanic === mechanic) ?? types[0] ?? null;
}

export async function createBenefitType(input: {
  label: string;
  description?: string;
  mechanic?: BenefitKind;
  defaultQuantity?: number | null;
  defaultMaxUses?: number | null;
}): Promise<BenefitTypeDefinition> {
  const label = input.label.trim();
  if (!label) throw new Error('Libellé requis');
  const config = await loadConfig();
  const ts = nowIso();
  const type = normalizeType({
    id: `bt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    slug: slugify(label),
    label,
    description: input.description ?? '',
    mechanic: input.mechanic ?? 'unlimited',
    defaultQuantity: input.defaultQuantity ?? null,
    defaultMaxUses: input.defaultMaxUses ?? null,
    isActive: true,
    sortOrder: (config.types.reduce((max, t) => Math.max(max, t.sortOrder), 0) || 0) + 10,
    isBuiltIn: false,
    createdAt: ts,
    updatedAt: ts,
  });
  await persist({ types: [...config.types, type], updatedAt: ts });
  return type;
}

export async function updateBenefitType(
  id: string,
  patch: Partial<Pick<BenefitTypeDefinition, 'label' | 'description' | 'mechanic' | 'defaultQuantity' | 'defaultMaxUses' | 'isActive' | 'sortOrder'>>,
): Promise<BenefitTypeDefinition | null> {
  const config = await loadConfig();
  const idx = config.types.findIndex((t) => t.id === id);
  if (idx < 0) return null;
  const current = config.types[idx];
  const next = normalizeType({
    ...current,
    ...patch,
    label: patch.label?.trim() || current.label,
    updatedAt: nowIso(),
  });
  config.types[idx] = next;
  await persist(config);
  return next;
}

export async function setBenefitTypeActive(id: string, isActive: boolean): Promise<BenefitTypeDefinition | null> {
  return updateBenefitType(id, { isActive });
}

export async function deleteBenefitType(id: string): Promise<boolean> {
  const config = await loadConfig();
  const target = config.types.find((t) => t.id === id);
  if (!target) return false;
  if (target.isBuiltIn) {
    await updateBenefitType(id, { isActive: false });
    return true;
  }
  await persist({
    types: config.types.filter((t) => t.id !== id),
    updatedAt: nowIso(),
  });
  return true;
}

export const BENEFIT_MECHANIC_OPTIONS: BenefitKind[] = ['unlimited', 'quantity', 'usage_limit'];
