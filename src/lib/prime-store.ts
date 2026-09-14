const STORAGE_KEY = 'loop_prime_store';
const LEGACY_STORAGE_KEY = 'loop_black_loop_store';
const STORE_CHANGED = 'loop-prime-store-changed';

/** Préparation migration Supabase — contacts répertoire Prime (sans messagerie in-app). */
export interface PrimeDirectoryContact {
  id: string;
  memberId: string;
  notedAt: string;
}

export interface PrimeStore {
  directoryContacts: PrimeDirectoryContact[];
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function defaultStore(): PrimeStore {
  return { directoryContacts: [] };
}

function migrateLegacyStore(): PrimeStore | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return defaultStore();
  } catch {
    return null;
  }
}

export function loadPrimeStore(): PrimeStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const migrated = migrateLegacyStore();
      const initial = migrated ?? defaultStore();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw) as Partial<PrimeStore>;
    return {
      directoryContacts: Array.isArray(parsed.directoryContacts) ? parsed.directoryContacts : [],
    };
  } catch {
    return defaultStore();
  }
}

export function savePrimeStore(store: PrimeStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(STORE_CHANGED));
}

export function addDirectoryContact(memberId: string): PrimeDirectoryContact {
  const store = loadPrimeStore();
  const existing = store.directoryContacts.find((c) => c.memberId === memberId);
  if (existing) return existing;

  const contact: PrimeDirectoryContact = {
    id: createId('pdc'),
    memberId,
    notedAt: new Date().toISOString(),
  };
  store.directoryContacts = [contact, ...store.directoryContacts];
  savePrimeStore(store);
  return contact;
}

export function isDirectoryContact(memberId: string): boolean {
  return loadPrimeStore().directoryContacts.some((c) => c.memberId === memberId);
}

export const PRIME_STORE_CHANGED = STORE_CHANGED;
