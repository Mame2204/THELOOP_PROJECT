/** Normalisation de noms partenaires — module sans dépendances pour éviter les cycles require. */

export function normalizePartnerName(name: string | null | undefined): string {
  return (name ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function partnerNamesMatch(a: string, b: string): boolean {
  const na = normalizePartnerName(a);
  const nb = normalizePartnerName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}
