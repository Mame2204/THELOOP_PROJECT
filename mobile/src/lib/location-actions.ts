import type { HomeLocation } from '@/lib/demo-data';

export function normalizeExternalUrl(href: string | null | undefined): string {
  const trimmed = href?.trim() ?? '';
  if (!trimmed) return '';
  if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function getLocationShareText(location: HomeLocation): string {
  if (location.subCategory === 'tools') {
    const parts = [location.name];
    if (location.toolCategory) parts.push(location.toolCategory);
    if (location.developer) parts.push(`par ${location.developer}`);
    return parts.join(' · ');
  }
  return `${location.name} · ${location.district} · ${location.subtitle}`;
}

export interface LocationPrimaryAction {
  href: string;
  label: string;
  external: boolean;
}

export function getLocationPrimaryAction(location: HomeLocation): LocationPrimaryAction {
  if (location.subCategory === 'tools') {
    const href = normalizeExternalUrl(location.ctaUrl?.trim() || location.website?.trim() || '');
    if (!href) return { href: '', label: 'Découvrir', external: false };
    return {
      href,
      label: 'Découvrir',
      external: true,
    };
  }

  const cta = normalizeExternalUrl(location.ctaUrl);
  if (cta) {
    return {
      href: cta,
      label: location.ctaLabel?.trim() || 'Réserver / CTA',
      external: true,
    };
  }

  const website = normalizeExternalUrl(location.website);
  if (website) {
    return {
      href: website,
      label: location.ctaLabel?.trim() || 'Site web',
      external: true,
    };
  }

  return { href: '', label: location.ctaLabel?.trim() || 'Voir la fiche', external: false };
}

export function formatFavoriteCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace('.0', '')}k`;
  return count.toLocaleString('fr-FR');
}
