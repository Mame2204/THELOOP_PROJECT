/** Utilitaires de planification Corner / Sondage Accueil (dates optionnelles). */

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeIsoDate(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const dateOnly = trimmed.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateOnly) ? dateOnly : null;
}

export function isWithinAccueilPeriod(
  periodStart: string | null | undefined,
  periodEnd: string | null | undefined,
  today = todayIsoDate(),
): boolean {
  const start = normalizeIsoDate(periodStart ?? null);
  const end = normalizeIsoDate(periodEnd ?? null);
  if (start && start > today) return false;
  if (end && end < today) return false;
  return true;
}

export interface AccueilScheduledItem {
  id?: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  isActive?: boolean;
  /** Tie-breaker si plusieurs contenus sans date de début. */
  createdAt?: string | null;
}

export function pickCurrentAccueilItem<T extends AccueilScheduledItem>(
  items: T[],
  today = todayIsoDate(),
): T | null {
  const eligible = items.filter((item) => {
    if (item.isActive === false) return false;
    return isWithinAccueilPeriod(item.periodStart ?? null, item.periodEnd ?? null, today);
  });
  if (!eligible.length) return null;

  return [...eligible].sort((a, b) => {
    const aStart = normalizeIsoDate(a.periodStart ?? null) ?? '';
    const bStart = normalizeIsoDate(b.periodStart ?? null) ?? '';
    if (aStart !== bStart) return bStart.localeCompare(aStart);
    const aCreated = a.createdAt ?? '';
    const bCreated = b.createdAt ?? '';
    return bCreated.localeCompare(aCreated);
  })[0];
}

export function validateAccueilPeriodRange(
  periodStart: string | null | undefined,
  periodEnd: string | null | undefined,
): string | null {
  const start = normalizeIsoDate(periodStart ?? null);
  const end = normalizeIsoDate(periodEnd ?? null);
  if (start && end && end < start) {
    return 'La date de fin doit être postérieure ou égale à la date de début.';
  }
  return null;
}

export function validateUniquePeriodStart<T extends AccueilScheduledItem>(
  existing: T[],
  periodStart: string | null | undefined,
  excludeId?: string,
): string | null {
  const start = normalizeIsoDate(periodStart ?? null);
  if (!start) return null;
  const conflict = existing.find(
    (item) => item.id !== excludeId && normalizeIsoDate(item.periodStart ?? null) === start,
  );
  if (!conflict) return null;
  return `Un contenu existe déjà avec la date de début ${start} pour ce pays.`;
}
