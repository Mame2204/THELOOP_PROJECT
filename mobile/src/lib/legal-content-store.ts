import AsyncStorage from '@react-native-async-storage/async-storage';
import { hydrateScoped, peekScoped, scopedStorageKey } from '@/lib/swr-cache';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type LegalContentKey =
  | 'cgu'
  | 'partner_terms'
  | 'mentions_legales'
  | 'privacy_policy'
  | 'conditions_pass_prime'
  | 'politique_cookies';

const LOCAL_KEY = 'loop_legal_content_v2';

export interface LegalContent {
  key: LegalContentKey;
  title: string;
  body: string;
  updatedAt: string;
}

const PLACEHOLDER: Record<LegalContentKey, Pick<LegalContent, 'title' | 'body'>> = {
  cgu: {
    title: 'Conditions générales d\'utilisation',
    body: 'Contenu indisponible. Contactez THE LOOP.',
  },
  partner_terms: {
    title: 'Conditions partenaires',
    body: 'Contenu indisponible. Contactez THE LOOP.',
  },
  mentions_legales: {
    title: 'Mentions légales',
    body: 'Éditeur, hébergeur et coordonnées — contenu à compléter par THE LOOP.',
  },
  privacy_policy: {
    title: 'Politique de confidentialité',
    body: 'Informations sur la collecte, l\'utilisation et la protection de vos données personnelles — contenu à compléter par THE LOOP.',
  },
  conditions_pass_prime: {
    title: 'Conditions du PASS Prime',
    body: 'Contenu indisponible. Contactez THE LOOP.',
  },
  politique_cookies: {
    title: 'Politique de cookies',
    body: 'Contenu indisponible. Contactez THE LOOP.',
  },
};

async function loadLocal(): Promise<Partial<Record<LegalContentKey, LegalContent>>> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<Record<LegalContentKey, LegalContent>>;
  } catch {
    return {};
  }
}

async function saveLocal(all: Partial<Record<LegalContentKey, LegalContent>>): Promise<void> {
  await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(all));
}

function legalDiskKey(key: LegalContentKey): string {
  return scopedStorageKey('loop_legal', key);
}

async function fetchLegalRemote(key: LegalContentKey): Promise<LegalContent | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data } = await supabase.from('app_legal_content').select('key,title,body,updated_at').eq('key', key).maybeSingle();
  if (!data) return null;
  return {
    key,
    title: String(data.title),
    body: String(data.body),
    updatedAt: String(data.updated_at),
  };
}

/** Contenu légal immédiat depuis le cache. */
export async function peekLegalContent(key: LegalContentKey): Promise<LegalContent | null> {
  const cached = await peekScoped<LegalContent>(key, legalDiskKey(key));
  if (cached) return cached;
  const local = await loadLocal();
  return local[key] ?? null;
}

export async function getLegalContent(key: LegalContentKey, options?: { force?: boolean }): Promise<LegalContent> {
  if (!options?.force) {
    const cached = await peekLegalContent(key);
    if (cached) return cached;
  }

  const remote = await fetchLegalRemote(key);
  if (remote) {
    const local = await loadLocal();
    local[key] = remote;
    await saveLocal(local);
    await hydrateScoped(key, legalDiskKey(key), remote);
    return remote;
  }

  const local = await loadLocal();
  if (local[key]) return local[key]!;

  return {
    key,
    ...PLACEHOLDER[key],
    updatedAt: new Date(0).toISOString(),
  };
}

export async function updateLegalContent(key: LegalContentKey, patch: { title?: string; body: string }): Promise<LegalContent> {
  const now = new Date().toISOString();
  const current = await getLegalContent(key);
  const next: LegalContent = {
    ...current,
    title: patch.title?.trim() || current.title,
    body: patch.body.trim(),
    updatedAt: now,
  };

  const local = await loadLocal();
  local[key] = next;
  await saveLocal(local);
  await hydrateScoped(key, legalDiskKey(key), next);

  if (isSupabaseConfigured() && supabase) {
    await supabase.from('app_legal_content').upsert({
      key,
      title: next.title,
      body: next.body,
      updated_at: now,
    });
  }

  return next;
}

export const PARTNER_PUBLICATION_NOTICE =
  'THE LOOP peut retirer une publication (événement, spot ou outil) à tout moment, sans obligation de justification.';
