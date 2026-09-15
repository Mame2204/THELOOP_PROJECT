import { supabase } from './supabase';

export type BenefitKind = 'unlimited' | 'quantity' | 'usage_limit';

export interface BenefitTypeDefinition {
  id: string;
  slug: string;
  label: string;
  description: string;
  mechanic: BenefitKind;
  defaultQuantity: number | null;
  defaultMaxUses: number | null;
  isActive: boolean;
  sortOrder: number;
  isBuiltIn: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BenefitTypesConfig {
  types: BenefitTypeDefinition[];
  updatedAt: string;
}

const REMOTE_KEY = 'benefit_types';

const BUILT_IN: Omit<BenefitTypeDefinition, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'bt-unlimited',
    slug: 'unlimited',
    label: 'Illimité',
    description: 'Sans limite de quantité ni d\'utilisations.',
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
    label: 'Quantité fixe',
    description: 'Ex. 2 entrées, 1 cocktail.',
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
    label: 'Utilisations limitées',
    description: 'Ex. -20 % utilisable N fois.',
    mechanic: 'usage_limit',
    defaultQuantity: null,
    defaultMaxUses: 1,
    isActive: true,
    sortOrder: 30,
    isBuiltIn: true,
  },
];

function nowIso() {
  return new Date().toISOString();
}

function slugify(label: string) {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40) || `type_${Date.now()}`;
}

function normalizeType(raw: Partial<BenefitTypeDefinition> & Pick<BenefitTypeDefinition, 'id' | 'label'>): BenefitTypeDefinition {
  const ts = nowIso();
  const mechanic: BenefitKind =
    raw.mechanic === 'quantity' || raw.mechanic === 'usage_limit' ? raw.mechanic : 'unlimited';
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

function mergeWithBuiltIns(types: BenefitTypeDefinition[]): BenefitTypeDefinition[] {
  const byId = new Map(types.map((t) => [t.id, normalizeType(t)]));
  for (const builtIn of BUILT_IN) {
    if (!byId.has(builtIn.id)) {
      byId.set(builtIn.id, normalizeType({ ...builtIn, createdAt: nowIso(), updatedAt: nowIso() }));
    } else {
      const existing = byId.get(builtIn.id)!;
      byId.set(builtIn.id, { ...existing, isBuiltIn: true });
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'fr'));
}

async function loadConfig(): Promise<BenefitTypesConfig> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', REMOTE_KEY).maybeSingle();
  if (data?.value && typeof data.value === 'object') {
    const raw = data.value as BenefitTypesConfig;
    if (Array.isArray(raw.types)) {
      return { types: mergeWithBuiltIns(raw.types), updatedAt: raw.updatedAt ?? nowIso() };
    }
  }
  const seed = { types: mergeWithBuiltIns([]), updatedAt: nowIso() };
  await persist(seed);
  return seed;
}

async function persist(config: BenefitTypesConfig): Promise<BenefitTypesConfig> {
  const next: BenefitTypesConfig = { types: mergeWithBuiltIns(config.types), updatedAt: nowIso() };
  const { error } = await supabase.from('app_settings').upsert({
    key: REMOTE_KEY,
    value: next,
    updated_at: next.updatedAt,
  });
  if (error) throw new Error(error.message);
  return next;
}

export async function listBenefitTypes(activeOnly = false): Promise<BenefitTypeDefinition[]> {
  const config = await loadConfig();
  return activeOnly ? config.types.filter((t) => t.isActive) : config.types;
}

export async function createBenefitType(input: {
  label: string;
  description?: string;
  mechanic?: BenefitKind;
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
  patch: Partial<Pick<BenefitTypeDefinition, 'label' | 'description' | 'isActive'>>,
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

export async function deleteBenefitType(id: string): Promise<boolean> {
  const config = await loadConfig();
  const target = config.types.find((t) => t.id === id);
  if (!target) return false;
  if (target.isBuiltIn) {
    await updateBenefitType(id, { isActive: false });
    return true;
  }
  await persist({ types: config.types.filter((t) => t.id !== id), updatedAt: nowIso() });
  return true;
}
